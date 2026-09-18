import { join } from "node:path";
import { BridgeError, assertOrThrow } from "../errors.js";
import type { RepositoryProvider } from "../repository/provider.js";
import { AtomicJsonStore } from "../storage/atomic-json-store.js";
import { newId, nowIso, sha256, stableStringify } from "../util.js";

export type SpatialWriteAction = "create" | "update" | "delete";
type SpatialItem = Record<string, unknown>;

interface SpatialWriteOperation {
  operationId: string;
  target: { sourceId: string; collectionId: string; objectId?: string };
  action: SpatialWriteAction;
  baseRevision?: string | null;
  payload?: unknown;
}

interface ConflictDescriptor {
  type: "revision-mismatch" | "object-exists" | "object-missing";
  baseRevision?: string;
  currentRevision?: string;
  currentObject?: SpatialItem;
}

interface OperationStatus {
  operationId: string;
  sourceId: string;
  state: "source-committed" | "conflict" | "rejected";
  updatedAt: string;
  result?: {
    collectionId: string;
    objectId: string;
    revision: string;
    sourceRevision: string;
    committedAt: string;
  };
  conflict?: ConflictDescriptor;
  error?: { code: string; message: string };
}

interface PreparedOperation {
  operation: SpatialWriteOperation;
  requestHash: string;
  expectedCollectionSha256: string;
  nextCollectionSha256: string;
  contentBase64: string;
  objectId: string;
  objectRevision: string;
}

interface LedgerEntry {
  operation: SpatialWriteOperation;
  requestHash: string;
  prepared?: PreparedOperation;
  status?: OperationStatus;
}

interface OperationLedger {
  entries: Record<string, LedgerEntry>;
}

interface CollectionDefinition {
  id: string;
  fileName: string;
}

interface LoadedCollection {
  definition: CollectionDefinition;
  path: string;
  data: Uint8Array;
  items: SpatialItem[];
}

const COLLECTIONS: readonly CollectionDefinition[] = [
  { id: "buildings", fileName: "buildings.jsonl" },
  { id: "floors", fileName: "floors.jsonl" },
  { id: "rooms", fileName: "rooms.jsonl" },
  { id: "assets", fileName: "assets.jsonl" },
  { id: "landmarks", fileName: "landmarks.jsonl" },
  { id: "relations", fileName: "relations.jsonl" },
];

function isRecord(value: unknown): value is SpatialItem {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function itemId(item: SpatialItem): string | null {
  for (const key of ["objectId", "id", "relationId"]) {
    const value = item[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return null;
}

function itemRevision(item: SpatialItem): string {
  return `sha256:${sha256(Buffer.from(stableStringify(item)))}`;
}

function parseJsonl(data: Uint8Array, path: string): SpatialItem[] {
  const items: SpatialItem[] = [];
  for (const [index, rawLine] of Buffer.from(data).toString("utf8").split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (!line) continue;
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      throw new BridgeError(500, "SPATIAL_MODEL_INVALID", `Invalid JSON in ${path} at line ${index + 1}.`);
    }
    if (!isRecord(value) || !itemId(value)) {
      throw new BridgeError(500, "SPATIAL_MODEL_INVALID", `Invalid spatial item in ${path} at line ${index + 1}.`);
    }
    items.push(value);
  }
  return items;
}

function serializeJsonl(items: readonly SpatialItem[]): Uint8Array {
  return Buffer.from(items.length ? `${items.map((item) => JSON.stringify(item)).join("\n")}\n` : "");
}

function operationKey(sourceId: string, operationId: string): string {
  return `${sourceId}\u0000${operationId}`;
}

function logicalHash(operation: SpatialWriteOperation): string {
  return sha256(Buffer.from(stableStringify(operation)));
}

function conflictStatus(operation: SpatialWriteOperation, conflict: ConflictDescriptor): OperationStatus {
  return {
    operationId: operation.operationId,
    sourceId: operation.target.sourceId,
    state: "conflict",
    updatedAt: nowIso(),
    conflict,
  };
}

function rejectedStatus(operation: SpatialWriteOperation, code: string, message: string): OperationStatus {
  return {
    operationId: operation.operationId,
    sourceId: operation.target.sourceId,
    state: "rejected",
    updatedAt: nowIso(),
    error: { code, message },
  };
}

function requiredString(value: unknown, name: string): string {
  assertOrThrow(typeof value === "string" && value.length > 0, 400, "OPERATION_INVALID", `${name} is required.`);
  return value;
}

export class SpatialWriteService {
  private readonly ledger: AtomicJsonStore<OperationLedger>;
  private gate: Promise<void> = Promise.resolve();

  constructor(
    stateDir: string,
    private readonly repository: RepositoryProvider,
    private readonly spatialRoot: string,
    private readonly sourceId: () => Promise<string>,
  ) {
    this.ledger = new AtomicJsonStore(join(stateDir, "spatial-operations.json"), () => ({ entries: {} }));
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

  private async loadCollection(collectionId: string): Promise<LoadedCollection> {
    const definition = COLLECTIONS.find((item) => item.id === collectionId);
    if (!definition) throw new BridgeError(404, "COLLECTION_NOT_FOUND", "Spatial collection not found.");
    const path = `${this.spatialRoot}/model/${definition.fileName}`;
    const data = await this.repository.readFile(path) ?? new Uint8Array();
    return { definition, path, data, items: parseJsonl(data, path) };
  }

  private async sourceRevision(): Promise<string> {
    const parts: string[] = [];
    for (const definition of COLLECTIONS) {
      const path = `${this.spatialRoot}/model/${definition.fileName}`;
      const data = await this.repository.readFile(path);
      if (data) parts.push(`${definition.id}\nsha256:${sha256(data)}`);
    }
    return `sha256:${sha256(Buffer.from(parts.join("\n")))}`;
  }

  private async prepare(operation: SpatialWriteOperation): Promise<PreparedOperation | OperationStatus> {
    const collection = await this.loadCollection(operation.target.collectionId);
    const targetId = operation.target.objectId;
    const existingIndex = targetId
      ? collection.items.findIndex((item) => itemId(item) === targetId)
      : -1;
    const existing = existingIndex >= 0 ? collection.items[existingIndex] : undefined;
    const nextItems = collection.items.map((item) => ({ ...item }));
    let authoritativeId: string;

    if (operation.action === "create") {
      assertOrThrow(isRecord(operation.payload), 400, "OPERATION_INVALID", "Create payload must be a JSON object.");
      authoritativeId = targetId ?? itemId(operation.payload) ?? newId();
      const conflicting = nextItems.find((item) => itemId(item) === authoritativeId);
      if (conflicting) {
        return conflictStatus(operation, {
          type: "object-exists",
          currentRevision: itemRevision(conflicting),
          currentObject: conflicting,
        });
      }
      const created = { ...operation.payload };
      const payloadId = itemId(created);
      if (payloadId && payloadId !== authoritativeId) {
        return rejectedStatus(operation, "OPERATION_INVALID", "Create payload ID must match target.objectId.");
      }
      if (!payloadId) {
        if (collection.definition.id === "relations") created.relationId = authoritativeId;
        else created.objectId = authoritativeId;
      }
      nextItems.push(created);
    } else {
      assertOrThrow(targetId, 400, "OPERATION_INVALID", `${operation.action} requires target.objectId.`);
      authoritativeId = targetId;
      if (!existing) return conflictStatus(operation, { type: "object-missing" });

      const currentRevision = itemRevision(existing);
      if (operation.baseRevision !== currentRevision) {
        const conflict: ConflictDescriptor = {
          type: "revision-mismatch",
          currentRevision,
          currentObject: existing,
        };
        if (typeof operation.baseRevision === "string") conflict.baseRevision = operation.baseRevision;
        return conflictStatus(operation, conflict);
      }

      if (operation.action === "update") {
        assertOrThrow(isRecord(operation.payload), 400, "OPERATION_INVALID", "Update payload must be a JSON object.");
        const updated = { ...operation.payload };
        const payloadId = itemId(updated);
        if (payloadId && payloadId !== authoritativeId) {
          return rejectedStatus(operation, "OPERATION_INVALID", "Update payload ID must match target.objectId.");
        }
        if (!payloadId) {
          if (collection.definition.id === "relations") updated.relationId = authoritativeId;
          else updated.objectId = authoritativeId;
        }
        nextItems[existingIndex] = updated;
      } else {
        nextItems.splice(existingIndex, 1);
      }
    }

    const content = serializeJsonl(nextItems);
    const nextObject = nextItems.find((item) => itemId(item) === authoritativeId);
    return {
      operation,
      requestHash: logicalHash(operation),
      expectedCollectionSha256: sha256(collection.data),
      nextCollectionSha256: sha256(content),
      contentBase64: Buffer.from(content).toString("base64"),
      objectId: authoritativeId,
      objectRevision: nextObject
        ? itemRevision(nextObject)
        : `sha256:${sha256(Buffer.from(`deleted:${authoritativeId}`))}`,
    };
  }

  private async saveEntry(key: string, entry: LedgerEntry): Promise<void> {
    await this.ledger.mutate((state) => {
      state.entries[key] = entry;
    });
  }

  private async finalizeCommitted(entry: LedgerEntry, prepared: PreparedOperation): Promise<OperationStatus> {
    const committedAt = nowIso();
    const status: OperationStatus = {
      operationId: prepared.operation.operationId,
      sourceId: prepared.operation.target.sourceId,
      state: "source-committed",
      updatedAt: committedAt,
      result: {
        collectionId: prepared.operation.target.collectionId,
        objectId: prepared.objectId,
        revision: prepared.objectRevision,
        sourceRevision: await this.sourceRevision(),
        committedAt,
      },
    };
    entry.status = status;
    delete entry.prepared;
    await this.saveEntry(operationKey(status.sourceId, status.operationId), entry);
    return status;
  }

  private async commit(entry: LedgerEntry, prepared: PreparedOperation): Promise<OperationStatus> {
    const collection = await this.loadCollection(prepared.operation.target.collectionId);
    const currentHash = sha256(collection.data);

    // Crash recovery: the repository commit may have succeeded before the terminal
    // ledger state was persisted. Detect the exact prepared bytes and finalize.
    if (currentHash === prepared.nextCollectionSha256) {
      return this.finalizeCommitted(entry, prepared);
    }

    if (currentHash !== prepared.expectedCollectionSha256) {
      const reprepared = await this.prepare(prepared.operation);
      if (!("contentBase64" in reprepared)) {
        entry.status = reprepared;
        delete entry.prepared;
        await this.saveEntry(operationKey(reprepared.sourceId, reprepared.operationId), entry);
        return reprepared;
      }
      entry.prepared = reprepared;
      await this.saveEntry(operationKey(entry.operation.target.sourceId, entry.operation.operationId), entry);
      return this.commit(entry, reprepared);
    }

    try {
      await this.repository.commitFiles([{
        path: collection.path,
        content: Buffer.from(prepared.contentBase64, "base64"),
        expectedSha256: prepared.expectedCollectionSha256,
      }], `p4u-spatial: ${prepared.operation.action} ${prepared.objectId}`);
    } catch (error) {
      if (error instanceof BridgeError && error.code === "REPOSITORY_CONFLICT") {
        const reprepared = await this.prepare(prepared.operation);
        if (!("contentBase64" in reprepared)) {
          entry.status = reprepared;
          delete entry.prepared;
          await this.saveEntry(operationKey(reprepared.sourceId, reprepared.operationId), entry);
          return reprepared;
        }
        entry.prepared = reprepared;
        await this.saveEntry(operationKey(entry.operation.target.sourceId, entry.operation.operationId), entry);
        return this.commit(entry, reprepared);
      }
      throw error;
    }

    return this.finalizeCommitted(entry, prepared);
  }

  private parse(raw: unknown): SpatialWriteOperation {
    assertOrThrow(isRecord(raw), 400, "OPERATION_INVALID", "Operation JSON object required.");
    assertOrThrow(isRecord(raw.target), 400, "OPERATION_INVALID", "operation.target is required.");
    const action = raw.action;
    assertOrThrow(action === "create" || action === "update" || action === "delete", 400, "OPERATION_INVALID", "action must be create, update or delete.");

    const operation: SpatialWriteOperation = {
      operationId: requiredString(raw.operationId, "operationId"),
      target: {
        sourceId: requiredString(raw.target.sourceId, "target.sourceId"),
        collectionId: requiredString(raw.target.collectionId, "target.collectionId"),
      },
      action,
    };
    if (typeof raw.target.objectId === "string" && raw.target.objectId.length > 0) operation.target.objectId = raw.target.objectId;
    if (raw.baseRevision === null || typeof raw.baseRevision === "string") operation.baseRevision = raw.baseRevision;
    if ("baseRevision" in raw && raw.baseRevision !== null && typeof raw.baseRevision !== "string") {
      throw new BridgeError(400, "OPERATION_INVALID", "baseRevision must be a string or null.");
    }
    if ("payload" in raw) operation.payload = raw.payload;

    if (action === "create") {
      assertOrThrow("baseRevision" in operation && operation.baseRevision === null, 400, "OPERATION_INVALID", "Create requires baseRevision=null.");
      assertOrThrow("payload" in operation, 400, "OPERATION_INVALID", "Create requires payload.");
    } else {
      assertOrThrow(typeof operation.target.objectId === "string", 400, "OPERATION_INVALID", `${action} requires target.objectId.`);
      assertOrThrow(typeof operation.baseRevision === "string", 400, "OPERATION_INVALID", `${action} requires baseRevision.`);
      if (action === "update") assertOrThrow("payload" in operation, 400, "OPERATION_INVALID", "Update requires payload.");
      if (action === "delete" && "payload" in operation) throw new BridgeError(400, "OPERATION_INVALID", "Delete must not include payload.");
    }
    return operation;
  }

  async submit(raw: unknown): Promise<OperationStatus> {
    return this.withGate(async () => {
      const operation = this.parse(raw);
      const authoritativeSourceId = await this.sourceId();
      if (operation.target.sourceId !== authoritativeSourceId) throw new BridgeError(404, "SOURCE_NOT_FOUND", "Spatial source not found.");

      const key = operationKey(operation.target.sourceId, operation.operationId);
      const hash = logicalHash(operation);
      const existing = (await this.ledger.read()).entries[key];
      if (existing) {
        if (existing.requestHash !== hash) throw new BridgeError(409, "OPERATION_ID_CONFLICT", "operationId already exists with different logical content.");
        if (existing.status) return existing.status;
        assertOrThrow(existing.prepared, 500, "OPERATION_LEDGER_INVALID", "Prepared operation is incomplete.");
        return this.commit(existing, existing.prepared);
      }

      const prepared = await this.prepare(operation);
      const entry: LedgerEntry = { operation, requestHash: hash };
      if ("contentBase64" in prepared) entry.prepared = prepared;
      else entry.status = prepared;
      await this.saveEntry(key, entry);
      if (entry.status) return entry.status;
      return this.commit(entry, entry.prepared!);
    });
  }

  async get(operationId: string): Promise<OperationStatus> {
    const sourceId = await this.sourceId();
    const key = operationKey(sourceId, operationId);
    const entry = (await this.ledger.read()).entries[key];
    if (!entry) throw new BridgeError(404, "OPERATION_NOT_FOUND", "Spatial operation not found.");
    if (entry.status) return entry.status;
    return this.withGate(async () => {
      const latest = (await this.ledger.read()).entries[key];
      if (!latest) throw new BridgeError(404, "OPERATION_NOT_FOUND", "Spatial operation not found.");
      if (latest.status) return latest.status;
      assertOrThrow(latest.prepared, 500, "OPERATION_LEDGER_INVALID", "Prepared operation is incomplete.");
      return this.commit(latest, latest.prepared);
    });
  }
}
