import { createServer, type Server } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FederationService } from "../src/services/federation-service.js";

const SOURCE_ID = "00000000-0000-7000-8000-000000000123";
const INSTANCE_ID = "00000000-0000-7000-8000-000000000456";
const roots: string[] = [];
const servers: Server[] = [];

async function listen(port = 0, terminal = true): Promise<{ server: Server; port: number }> {
  const server = createServer(async (request, response) => {
    const path = request.url ?? "/";
    response.setHeader("content-type", "application/json");

    if (request.method === "GET" && path === "/.well-known/open-spatial-interop") {
      response.end(JSON.stringify({ instanceId: INSTANCE_ID }));
      return;
    }
    if (request.method === "GET" && path === "/spatial/v1/sources") {
      response.end(JSON.stringify({
        sources: [{
          sourceId: SOURCE_ID,
          title: "Upstream",
          sourceRevision: "upstream-r1",
          route: { routeId: "direct", kind: "direct" },
          access: { viewRevision: "view-r1" },
          delivery: { mode: "live", freshness: "current" },
          capabilities: ["spatial.read", "spatial.create", "spatial.update", "spatial.delete"],
          links: [],
        }],
      }));
      return;
    }
    if (request.method === "GET" && path === `/spatial/v1/sources/${SOURCE_ID}/collections/assets/items/asset%3A1`) {
      response.setHeader("x-p4u-revision", "asset-r1");
      response.end(JSON.stringify({ objectId: "asset:1", name: "Pump" }));
      return;
    }
    if (request.method === "POST" && path === "/spatial/v1/operations") {
      let raw = "";
      for await (const chunk of request) raw += String(chunk);
      const operation = JSON.parse(raw) as { operationId: string };
      if (terminal) {
        response.end(JSON.stringify({
          operationId: operation.operationId,
          sourceId: SOURCE_ID,
          state: "source-committed",
          updatedAt: new Date().toISOString(),
          result: { objectId: "asset:2" },
        }));
      } else {
        response.statusCode = 503;
        response.end(JSON.stringify({ error: { code: "UPSTREAM_UNAVAILABLE", message: "offline" } }));
      }
      return;
    }

    response.statusCode = 404;
    response.end(JSON.stringify({ error: { code: "NOT_FOUND", message: "not found" } }));
  });

  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("missing server address");
  return { server, port: address.port };
}

async function close(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  const index = servers.indexOf(server);
  if (index >= 0) servers.splice(index, 1);
}

afterEach(async () => {
  while (servers.length) await close(servers[0]!);
  while (roots.length) await rm(roots.pop()!, { recursive: true, force: true });
});

describe("FederationService", () => {
  it("preserves source identity, serves stale cache and retains relay state across restart", async () => {
    const stateDir = await mkdtemp(join(tmpdir(), "p4u-federation-"));
    roots.push(stateDir);
    const first = await listen();

    const service = new FederationService(stateDir, {
      upstreamUrl: `http://127.0.0.1:${first.port}`,
      routeId: "relay",
      accessMode: "service",
      token: "server-only-token",
    });

    const sources = await service.listSources("https://relay.test");
    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatchObject({
      sourceId: SOURCE_ID,
      route: {
        routeId: "relay",
        kind: "federated",
        upstreamInstanceId: INSTANCE_ID,
        accessMode: "service",
      },
    });

    const live = await service.read(SOURCE_ID, "/collections/assets/items/asset%3A1");
    expect(live).toMatchObject({ deliveryMode: "live", freshness: "current", revision: "asset-r1" });

    await close(first.server);

    const cached = await service.read(SOURCE_ID, "/collections/assets/items/asset%3A1");
    expect(cached).toMatchObject({ deliveryMode: "cache", freshness: "stale" });

    const operation = {
      operationId: "00000000-0000-7000-8000-000000000789",
      target: { sourceId: SOURCE_ID, collectionId: "assets", objectId: "asset:2" },
      action: "create",
      baseRevision: null,
      payload: { objectId: "asset:2", name: "Valve" },
    };
    const durable = await service.submitOperation(operation, "https://relay.test");
    expect(durable).toMatchObject({
      operationId: operation.operationId,
      sourceId: SOURCE_ID,
      state: "relay-durable",
    });

    const restarted = new FederationService(stateDir, {
      upstreamUrl: `http://127.0.0.1:${first.port}`,
      routeId: "relay",
      accessMode: "service",
      token: "server-only-token",
    });
    expect(await restarted.getOperation(operation.operationId)).toMatchObject({ state: "relay-durable" });

    const second = await listen(first.port);
    const retry = await restarted.retryPending();
    expect(retry).toEqual({ attempted: 1, terminal: 1 });
    expect(await restarted.getOperation(operation.operationId)).toMatchObject({
      state: "source-committed",
      sourceId: SOURCE_ID,
      operationId: operation.operationId,
    });
    await close(second.server);
  });
});
