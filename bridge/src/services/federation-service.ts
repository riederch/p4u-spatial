import { join } from "node:path";
import { BridgeError, assertOrThrow } from "../errors.js";
import { AtomicJsonStore } from "../storage/atomic-json-store.js";
import { nowIso, sha256, stableStringify } from "../util.js";

type JsonObject = Record<string, unknown>;
interface CachedValue {
  value: unknown;
  retrievedAt: string;
}

interface RelayEntry {
  sourceId: string;
  operationId: string;
  operation: JsonObject;
  requestHash: string;
  status: JsonObject;
  updatedAt: string;
}

interface FederationState {
  upstreamInstanceId?: string;
  sources: Record<string, CachedValue>;
  reads: Record<string, CachedValue>;
  relays: Record<string, RelayEntry>;
}

export interface FederationConfig {
  upstreamUrl: string;
  routeId: string;
  accessMode: "anonymous" | "service";
  token?: string;
}

export interface FederatedReadResult {
  body: unknown;
  deliveryMode: "live" | "cache";
  freshness: "current" | "stale";
  revision?: string;
}

function isRecord(value: unknown): value is JsonObject {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function requiredString(value: unknown, name: string): string {
  assertOrThrow(typeof value === "string" && value.length > 0, 400, "OPERATION_INVALID", `${name} is required.`);
  return value;
}

function relayKey(sourceId: string, operationId: string): string {
  return `${sourceId}\u0000${operationId}`;
}

function requestHash(operation: JsonObject): string {
  return sha256(Buffer.from(stableStringify(operation)));
}

export class FederationService {
  private readonly store: AtomicJsonStore<FederationState>;
  private gate: Promise<void> = Promise.resolve();

  constructor(
    stateDir: string,
    private readonly config: FederationConfig,
  ) {
    this.store = new AtomicJsonStore(join(stateDir, "federation.json"), () => ({
      sources: {},
      reads: {},
      relays: {},
    }));
  }

  private async withGate<T>(fn: () => Promise<T>): Promise<T> {
    let release!: () => void;
    const next = new Promise<void>((resolve) => { release = resolve; });
    const previous = this.gate;
    this.gate = previous.then(() => next);
    await previous;
    try {
      return await fn();
    } finally {
      release();
    }
  }

  private headers(json = true): HeadersInit {
    const headers: Record<string, string> = {};
    if (json) headers["content-type"] = "application/json";
    if (this.config.token) headers.authorization = `Bearer ${this.config.token}`;
    return headers;
  }

  private url(path: string): string {
    return `${this.config.upstreamUrl.replace(/\/$/, "")}${path}`;
  }

  private async jsonRequest(path: string, init?: RequestInit): Promise<{ body: unknown; response: Response }> {
    let response: Response;
    try {
      response = await fetch(this.url(path), {
        ...init,
        headers: {
          ...this.headers(init?.body !== undefined),
          ...(init?.headers ?? {}),
        },
      });
    } catch (error) {
      throw new BridgeError(503, "UPSTREAM_UNAVAILABLE", `Federation upstream unavailable: ${String((error as Error).message)}`);
    }

    let body: unknown = null;
    const text = await response.text();
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        throw new BridgeError(502, "UPSTREAM_INVALID_RESPONSE", "Federation upstream returned invalid JSON.");
      }
    }

    if (!response.ok) {
      const upstreamError = isRecord(body) && isRecord(body.error) ? body.error : undefined;
      const code = upstreamError && typeof upstreamError.code === "string" ? upstreamError.code : "UPSTREAM_ERROR";
      const message = upstreamError && typeof upstreamError.message === "string"
        ? upstreamError.message
        : `Federation upstream returned HTTP ${response.status}.`;
      throw new BridgeError(response.status >= 500 ? 503 : response.status, code, message);
    }
    return { body, response };
  }

  private async upstreamInstanceId(): Promise<string> {
    const state = await this.store.read();
    if (state.upstreamInstanceId) return state.upstreamInstanceId;

    const { body } = await this.jsonRequest("/.well-known/open-spatial-interop", { method: "GET" });
    assertOrThrow(isRecord(body) && typeof body.instanceId === "string", 502, "UPSTREAM_INVALID_RESPONSE", "Upstream discovery has no instanceId.");
    await this.store.mutate((next) => {
      next.upstreamInstanceId = body.instanceId as string;
    });
    return body.instanceId;
  }

  private transformSource(source: JsonObject, live: boolean, retrievedAt: string, baseUrl: string): JsonObject {
    const sourceId = requiredString(source.sourceId, "sourceId");
    const capabilities = Array.isArray(source.capabilities)
      ? source.capabilities.filter((value): value is string => typeof value === "string" && value !== "spatial.snapshots")
      : ["spatial.read"];

    if (!capabilities.includes("spatial.read")) capabilities.push("spatial.read");
    if (!capabilities.includes("federation.read")) capabilities.push("federation.read");
    if (!capabilities.includes("federation.cache")) capabilities.push("federation.cache");
    if (!capabilities.includes("federation.durable-relay")) capabilities.push("federation.durable-relay");

    return {
      ...source,
      route: {
        routeId: this.config.routeId,
        kind: "federated",
        upstreamInstanceId: (source.route && isRecord(source.route) && typeof source.route.upstreamInstanceId === "string")
          ? source.route.upstreamInstanceId
          : undefined,
        accessMode: this.config.accessMode,
      },
      delivery: live
        ? { mode: "live", freshness: "current", observedAt: nowIso() }
        : { mode: "cache", freshness: "stale", retrievedAt },
      capabilities,
      links: [
        { rel: "self", href: `${baseUrl}/spatial/v1/sources/${encodeURIComponent(sourceId)}` },
        { rel: "collections", href: `${baseUrl}/spatial/v1/sources/${encodeURIComponent(sourceId)}/collections` },
        { rel: "operations", href: `${baseUrl}/spatial/v1/operations` },
      ],
    };
  }

  private async liveSources(baseUrl: string): Promise<JsonObject[]> {
    const upstreamInstanceId = await this.upstreamInstanceId();
    const { body } = await this.jsonRequest("/spatial/v1/sources", { method: "GET" });
    assertOrThrow(isRecord(body) && Array.isArray(body.sources), 502, "UPSTREAM_INVALID_RESPONSE", "Upstream sources response is invalid.");

    const retrievedAt = nowIso();
    const sources: JsonObject[] = [];
    await this.store.mutate((state) => {
      state.upstreamInstanceId = upstreamInstanceId;
      for (const candidate of body.sources as unknown[]) {
        if (!isRecord(candidate) || typeof candidate.sourceId !== "string") continue;
        const transformed = this.transformSource(candidate, true, retrievedAt, baseUrl);
        const route = transformed.route as JsonObject;
        route.upstreamInstanceId = upstreamInstanceId;
        state.sources[candidate.sourceId] = { value: transformed, retrievedAt };
        sources.push(transformed);
      }
    });
    return sources;
  }

  async listSources(baseUrl: string): Promise<JsonObject[]> {
    try {
      return await this.liveSources(baseUrl);
    } catch (error) {
      if (!(error instanceof BridgeError) || error.statusCode < 500) throw error;
      const state = await this.store.read();
      return Object.values(state.sources).map(({ value, retrievedAt }) => {
        if (!isRecord(value)) return {};
        const transformed = this.transformSource(value, false, retrievedAt, baseUrl);
        const route = transformed.route as JsonObject;
        if (state.upstreamInstanceId) route.upstreamInstanceId = state.upstreamInstanceId;
        return transformed;
      });
    }
  }

  async getSource(sourceId: string, baseUrl: string): Promise<JsonObject> {
    const sources = await this.listSources(baseUrl);
    const source = sources.find((candidate) => candidate.sourceId === sourceId);
    if (!source) throw new BridgeError(404, "SOURCE_NOT_FOUND", "Spatial source not found.");
    return source;
  }

  private readCacheKey(sourceId: string, suffix: string): string {
    return `${sourceId}\u0000${suffix}`;
  }

  async read(sourceId: string, suffix: string): Promise<FederatedReadResult> {
    const path = `/spatial/v1/sources/${encodeURIComponent(sourceId)}${suffix}`;
    const key = this.readCacheKey(sourceId, suffix);
    try {
      const { body, response } = await this.jsonRequest(path, { method: "GET" });
      const retrievedAt = nowIso();
      await this.store.mutate((state) => {
        state.reads[key] = { value: body, retrievedAt };
      });
      const revision = response.headers.get("x-p4u-revision") ?? response.headers.get("etag")?.replace(/^"|"$/g, "");
      return {
        body,
        deliveryMode: "live",
        freshness: "current",
        ...(revision ? { revision } : {}),
      };
    } catch (error) {
      if (!(error instanceof BridgeError) || error.statusCode < 500) throw error;
      const cached = (await this.store.read()).reads[key];
      if (!cached) throw error;
      return {
        body: cached.value,
        deliveryMode: "cache",
        freshness: "stale",
      };
    }
  }

  private relayDurable(operation: JsonObject, sourceId: string, operationId: string): JsonObject {
    return {
      operationId,
      sourceId,
      state: "relay-durable",
      updatedAt: nowIso(),
      relay: {
        routeId: this.config.routeId,
        accessMode: this.config.accessMode,
      },
    };
  }

  private isTerminal(body: unknown): body is JsonObject {
    return isRecord(body)
      && (body.state === "source-committed" || body.state === "conflict" || body.state === "rejected");
  }

  private async tryDeliver(entry: RelayEntry): Promise<JsonObject> {
    try {
      const { body } = await this.jsonRequest("/spatial/v1/operations", {
        method: "POST",
        body: JSON.stringify(entry.operation),
      });
      if (this.isTerminal(body)) {
        entry.status = body;
      } else {
        entry.status = this.relayDurable(entry.operation, entry.sourceId, entry.operationId);
      }
    } catch (error) {
      if (error instanceof BridgeError && error.statusCode < 500) {
        entry.status = {
          operationId: entry.operationId,
          sourceId: entry.sourceId,
          state: "rejected",
          updatedAt: nowIso(),
          error: { code: error.code, message: error.message },
        };
      } else {
        entry.status = this.relayDurable(entry.operation, entry.sourceId, entry.operationId);
      }
    }
    entry.updatedAt = nowIso();
    await this.store.mutate((state) => {
      state.relays[relayKey(entry.sourceId, entry.operationId)] = entry;
    });
    return entry.status;
  }

  async submitOperation(raw: unknown, baseUrl: string): Promise<JsonObject> {
    assertOrThrow(isRecord(raw), 400, "OPERATION_INVALID", "Operation JSON object required.");
    assertOrThrow(isRecord(raw.target), 400, "OPERATION_INVALID", "operation.target is required.");
    const sourceId = requiredString(raw.target.sourceId, "target.sourceId");
    const operationId = requiredString(raw.operationId, "operationId");
    await this.getSource(sourceId, baseUrl);

    return this.withGate(async () => {
      const key = relayKey(sourceId, operationId);
      const hash = requestHash(raw);
      const state = await this.store.read();
      const existing = state.relays[key];
      if (existing) {
        if (existing.requestHash !== hash) {
          throw new BridgeError(409, "OPERATION_ID_CONFLICT", "operationId already exists with different logical content.");
        }
        if (this.isTerminal(existing.status)) return existing.status;
        return this.tryDeliver(existing);
      }

      const entry: RelayEntry = {
        sourceId,
        operationId,
        operation: raw,
        requestHash: hash,
        status: this.relayDurable(raw, sourceId, operationId),
        updatedAt: nowIso(),
      };
      await this.store.mutate((next) => {
        next.relays[key] = entry;
      });

      return this.tryDeliver(entry);
    });
  }

  async getOperation(operationId: string): Promise<JsonObject> {
    return this.withGate(async () => {
      const state = await this.store.read();
      const matches = Object.values(state.relays).filter((entry) => entry.operationId === operationId);
      if (matches.length === 0) throw new BridgeError(404, "OPERATION_NOT_FOUND", "Federated operation not found.");
      if (matches.length > 1) throw new BridgeError(409, "OPERATION_ID_AMBIGUOUS", "operationId exists for more than one source.");
      const entry = matches[0]!;
      if (this.isTerminal(entry.status)) return entry.status;
      return this.tryDeliver(entry);
    });
  }

  async retryPending(): Promise<{ attempted: number; terminal: number }> {
    return this.withGate(async () => {
      const state = await this.store.read();
      let attempted = 0;
      let terminal = 0;
      for (const entry of Object.values(state.relays)) {
        if (this.isTerminal(entry.status)) continue;
        attempted += 1;
        const status = await this.tryDeliver(entry);
        if (this.isTerminal(status)) terminal += 1;
      }
      return { attempted, terminal };
    });
  }
}
