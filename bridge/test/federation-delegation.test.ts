import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  FederationDelegationService,
  type SubjectTokenProvider,
} from "../src/services/federation-delegation-service.js";
import { FederationService } from "../src/services/federation-service.js";

const SOURCE_ID = "00000000-0000-7000-8000-000000000321";
const INSTANCE_ID = "00000000-0000-7000-8000-000000000654";
const roots: string[] = [];
const servers: Server[] = [];

async function listen(
  handler: (request: IncomingMessage, response: ServerResponse) => void | Promise<void>,
): Promise<{ server: Server; url: string }> {
  const server = createServer((request, response) => {
    Promise.resolve(handler(request, response)).catch((error) => {
      response.statusCode = 500;
      response.end(String(error));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("missing server address");
  return { server, url: `http://127.0.0.1:${address.port}` };
}

async function close(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  const index = servers.indexOf(server);
  if (index >= 0) servers.splice(index, 1);
}

async function body(request: IncomingMessage): Promise<string> {
  let raw = "";
  for await (const chunk of request) raw += String(chunk);
  return raw;
}

afterEach(async () => {
  while (servers.length) await close(servers[0]!);
  while (roots.length) await rm(roots.pop()!, { recursive: true, force: true });
});

describe("FederationDelegationService", () => {
  it("performs Authorization Code + PKCE without exposing tokens to the client flow", async () => {
    const requests: URLSearchParams[] = [];
    const oauth = await listen(async (request, response) => {
      if (request.method !== "POST" || request.url !== "/token") {
        response.statusCode = 404;
        response.end();
        return;
      }
      const form = new URLSearchParams(await body(request));
      requests.push(form);
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({
        access_token: "pkce-access",
        refresh_token: "pkce-refresh",
        token_type: "Bearer",
        expires_in: 3600,
      }));
    });

    const root = await mkdtemp(join(tmpdir(), "p4u-delegation-pkce-"));
    roots.push(root);
    const service = new FederationDelegationService(root, {
      routeId: "upstream",
      method: "authorization-code-pkce",
      authorizationUrl: "https://identity.example/authorize",
      tokenUrl: `${oauth.url}/token`,
      clientId: "p4u-bridge",
      scopes: "openid spatial",
    });

    const started = await service.beginAuthorization("user-a", "https://bridge.test");
    const target = new URL(started.authorizationUrl);
    expect(target.origin + target.pathname).toBe("https://identity.example/authorize");
    expect(target.searchParams.get("response_type")).toBe("code");
    expect(target.searchParams.get("client_id")).toBe("p4u-bridge");
    expect(target.searchParams.get("code_challenge_method")).toBe("S256");
    expect(target.searchParams.get("code_challenge")).toBeTruthy();
    expect(target.searchParams.get("state")).toBeTruthy();
    expect(target.searchParams.get("scope")).toBe("openid spatial");

    await service.completeAuthorization(target.searchParams.get("state")!, "authorization-code");
    expect(requests).toHaveLength(1);
    expect(requests[0]!.get("grant_type")).toBe("authorization_code");
    expect(requests[0]!.get("code")).toBe("authorization-code");
    expect(requests[0]!.get("code_verifier")).toBeTruthy();
    expect(requests[0]!.get("redirect_uri")).toBe("https://bridge.test/federation/v1/authorization/callback");

    expect(await service.status("user-a")).toMatchObject({
      routeId: "upstream",
      method: "authorization-code-pkce",
      authorized: true,
      refreshable: true,
    });
    expect(await service.accessToken("user-a")).toBe("pkce-access");

    await expect(
      service.completeAuthorization(target.searchParams.get("state")!, "replayed-code"),
    ).rejects.toMatchObject({ code: "FEDERATION_OAUTH_STATE_INVALID", statusCode: 400 });

    await service.revoke("user-a");
    expect(await service.status("user-a")).toMatchObject({ authorized: false });
  });

  it("performs RFC 8693 style token exchange through a SubjectTokenProvider", async () => {
    const requests: URLSearchParams[] = [];
    const oauth = await listen(async (request, response) => {
      const form = new URLSearchParams(await body(request));
      requests.push(form);
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({
        access_token: `upstream-${form.get("subject_token")}`,
        token_type: "Bearer",
        expires_in: 3600,
      }));
    });

    const root = await mkdtemp(join(tmpdir(), "p4u-delegation-exchange-"));
    roots.push(root);
    const provider: SubjectTokenProvider = {
      async subjectToken(localUserId) {
        return {
          token: `subject-${localUserId}`,
          tokenType: "urn:ietf:params:oauth:token-type:jwt",
        };
      },
    };
    const service = new FederationDelegationService(root, {
      routeId: "upstream",
      method: "token-exchange",
      tokenUrl: oauth.url,
      clientId: "p4u-bridge",
      audience: "spatial-upstream",
    }, provider);

    await service.establishTokenExchange("user-a");
    expect(requests).toHaveLength(1);
    expect(requests[0]!.get("grant_type")).toBe("urn:ietf:params:oauth:grant-type:token-exchange");
    expect(requests[0]!.get("subject_token")).toBe("subject-user-a");
    expect(requests[0]!.get("subject_token_type")).toBe("urn:ietf:params:oauth:token-type:jwt");
    expect(requests[0]!.get("audience")).toBe("spatial-upstream");
    expect(await service.accessToken("user-a")).toBe("upstream-subject-user-a");
  });

  it("partitions delegated federation caches by local user", async () => {
    const oauth = await listen(async (request, response) => {
      const form = new URLSearchParams(await body(request));
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({
        access_token: `access-${form.get("subject_token")}`,
        token_type: "Bearer",
        expires_in: 3600,
      }));
    });
    const upstream = await listen(async (request, response) => {
      const authorization = request.headers.authorization ?? "";
      response.setHeader("content-type", "application/json");
      if (request.url === "/.well-known/open-spatial-interop") {
        response.end(JSON.stringify({ instanceId: INSTANCE_ID }));
        return;
      }
      if (request.url === "/spatial/v1/sources") {
        response.end(JSON.stringify({
          sources: [{
            sourceId: SOURCE_ID,
            title: `View for ${authorization}`,
            capabilities: ["spatial.read"],
            route: { routeId: "direct", kind: "direct" },
            links: [],
          }],
        }));
        return;
      }
      response.statusCode = 404;
      response.end(JSON.stringify({ error: { code: "NOT_FOUND", message: "not found" } }));
    });

    const root = await mkdtemp(join(tmpdir(), "p4u-delegation-cache-"));
    roots.push(root);
    const provider: SubjectTokenProvider = {
      async subjectToken(localUserId) {
        return {
          token: localUserId,
          tokenType: "urn:ietf:params:oauth:token-type:jwt",
        };
      },
    };
    const delegation = new FederationDelegationService(root, {
      routeId: "relay",
      method: "token-exchange",
      tokenUrl: oauth.url,
      clientId: "p4u-bridge",
    }, provider);
    const federation = new FederationService(root, {
      upstreamUrl: upstream.url,
      routeId: "relay",
      accessMode: "delegated-user",
      retryBaseSeconds: 1,
      retryMaxSeconds: 4,
      relayRetentionSeconds: 60,
    }, delegation);

    const userA = await federation.listSources("https://bridge.test", "user-a");
    expect(userA[0]).toMatchObject({
      sourceId: SOURCE_ID,
      title: "View for Bearer access-user-a",
      route: {
        accessMode: "delegated-user",
        delegation: { method: "token-exchange" },
      },
    });

    await close(upstream.server);

    const cachedA = await federation.listSources("https://bridge.test", "user-a");
    expect(cachedA[0]).toMatchObject({ title: "View for Bearer access-user-a" });

    await expect(
      federation.listSources("https://bridge.test", "user-b"),
    ).rejects.toMatchObject({ code: "UPSTREAM_UNAVAILABLE", statusCode: 503 });
  });
});
