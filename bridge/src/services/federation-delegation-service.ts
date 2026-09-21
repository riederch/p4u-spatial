import { createHash, randomBytes } from "node:crypto";
import { join } from "node:path";
import { BridgeError, assertOrThrow } from "../errors.js";
import { AtomicJsonStore } from "../storage/atomic-json-store.js";
import { nowIso } from "../util.js";

export type FederationDelegationMethod = "authorization-code-pkce" | "token-exchange";

export interface SubjectToken {
  token: string;
  tokenType: string;
}

export interface SubjectTokenProvider {
  subjectToken(localUserId: string): Promise<SubjectToken>;
}

export interface FederationDelegationConfig {
  routeId: string;
  method: FederationDelegationMethod;
  tokenUrl: string;
  clientId: string;
  clientSecret?: string;
  authorizationUrl?: string;
  scopes?: string;
  audience?: string;
}

interface StoredCredential {
  accessToken: string;
  refreshToken?: string;
  tokenType: string;
  expiresAt?: string;
  scope?: string;
  updatedAt: string;
}

interface PendingAuthorization {
  localUserId: string;
  verifier: string;
  redirectUri: string;
  createdAt: string;
  expiresAt: string;
}

interface DelegationState {
  credentials: Record<string, StoredCredential>;
  pending: Record<string, PendingAuthorization>;
}

interface OAuthTokenResponse {
  access_token?: unknown;
  refresh_token?: unknown;
  token_type?: unknown;
  expires_in?: unknown;
  scope?: unknown;
}

const PENDING_TTL_MS = 10 * 60 * 1000;

function base64Url(data: Uint8Array): string {
  return Buffer.from(data).toString("base64url");
}

function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

function credentialKey(routeId: string, localUserId: string): string {
  return `${routeId}\u0000${localUserId}`;
}

// ADR: docs/adr/contracts/0028-delegated-user-federation-methods.md — delegated OAuth credentials stay server-side per route and local user.
export class FederationDelegationService {
  private readonly store: AtomicJsonStore<DelegationState>;

  constructor(
    stateDir: string,
    private readonly config: FederationDelegationConfig,
    private readonly subjectTokenProvider?: SubjectTokenProvider,
  ) {
    this.store = new AtomicJsonStore(join(stateDir, "federation-delegation.json"), () => ({
      credentials: {},
      pending: {},
    }));
  }

  method(): FederationDelegationMethod {
    return this.config.method;
  }

  private key(localUserId: string): string {
    assertOrThrow(localUserId.length > 0, 403, "FEDERATION_USER_REQUIRED", "Delegated federation requires a local user assignment.");
    return credentialKey(this.config.routeId, localUserId);
  }

  async status(localUserId: string): Promise<{
    routeId: string;
    method: FederationDelegationMethod;
    authorized: boolean;
    expiresAt?: string;
    refreshable: boolean;
  }> {
    const credential = (await this.store.read()).credentials[this.key(localUserId)];
    const authorized = !!credential && (!credential.expiresAt || Date.parse(credential.expiresAt) > Date.now());
    return {
      routeId: this.config.routeId,
      method: this.config.method,
      authorized,
      ...(credential?.expiresAt ? { expiresAt: credential.expiresAt } : {}),
      refreshable: !!credential?.refreshToken || this.config.method === "token-exchange",
    };
  }

  async beginAuthorization(localUserId: string, publicBaseUrl: string): Promise<{
    routeId: string;
    method: "authorization-code-pkce";
    authorizationUrl: string;
    expiresAt: string;
  }> {
    if (this.config.method !== "authorization-code-pkce") {
      throw new BridgeError(409, "FEDERATION_DELEGATION_METHOD_MISMATCH", "This route uses token exchange, not interactive authorization.");
    }
    assertOrThrow(this.config.authorizationUrl, 503, "FEDERATION_OAUTH_NOT_CONFIGURED", "OAuth authorization endpoint is not configured.");

    const state = base64Url(randomBytes(32));
    const verifier = base64Url(randomBytes(48));
    const redirectUri = `${publicBaseUrl.replace(/\/$/, "")}/federation/v1/authorization/callback`;
    const expiresAt = new Date(Date.now() + PENDING_TTL_MS).toISOString();

    await this.store.mutate((store) => {
      const now = Date.now();
      for (const [key, pending] of Object.entries(store.pending)) {
        if (Date.parse(pending.expiresAt) <= now) delete store.pending[key];
      }
      store.pending[state] = {
        localUserId,
        verifier,
        redirectUri,
        createdAt: nowIso(),
        expiresAt,
      };
    });

    const target = new URL(this.config.authorizationUrl);
    target.searchParams.set("response_type", "code");
    target.searchParams.set("client_id", this.config.clientId);
    target.searchParams.set("redirect_uri", redirectUri);
    target.searchParams.set("state", state);
    target.searchParams.set("code_challenge", pkceChallenge(verifier));
    target.searchParams.set("code_challenge_method", "S256");
    if (this.config.scopes) target.searchParams.set("scope", this.config.scopes);
    if (this.config.audience) target.searchParams.set("audience", this.config.audience);

    return {
      routeId: this.config.routeId,
      method: "authorization-code-pkce",
      authorizationUrl: target.toString(),
      expiresAt,
    };
  }

  async completeAuthorization(state: string, code: string): Promise<{ localUserId: string; authorized: true }> {
    if (this.config.method !== "authorization-code-pkce") {
      throw new BridgeError(409, "FEDERATION_DELEGATION_METHOD_MISMATCH", "This route does not use interactive authorization.");
    }
    assertOrThrow(state.length > 0 && code.length > 0, 400, "FEDERATION_OAUTH_CALLBACK_INVALID", "OAuth state and code are required.");

    let pending: PendingAuthorization | undefined;
    await this.store.mutate((store) => {
      pending = store.pending[state];
      if (pending) delete store.pending[state];
    });
    if (!pending || Date.parse(pending.expiresAt) <= Date.now()) {
      throw new BridgeError(400, "FEDERATION_OAUTH_STATE_INVALID", "OAuth state is invalid, expired or already used.");
    }

    const form = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: pending.redirectUri,
      client_id: this.config.clientId,
      code_verifier: pending.verifier,
    });
    const token = await this.tokenRequest(form);
    await this.saveCredential(pending.localUserId, token);
    return { localUserId: pending.localUserId, authorized: true };
  }

  async establishTokenExchange(localUserId: string): Promise<void> {
    if (this.config.method !== "token-exchange") {
      throw new BridgeError(409, "FEDERATION_DELEGATION_METHOD_MISMATCH", "This route uses Authorization Code + PKCE.");
    }
    await this.exchange(localUserId);
  }

  async accessToken(localUserId: string): Promise<string> {
    const key = this.key(localUserId);
    const credential = (await this.store.read()).credentials[key];
    if (credential && (!credential.expiresAt || Date.parse(credential.expiresAt) > Date.now() + 60_000)) {
      return credential.accessToken;
    }

    if (credential?.refreshToken) {
      try {
        const refreshed = await this.refresh(credential.refreshToken);
        await this.saveCredential(localUserId, refreshed, credential.refreshToken);
        return (await this.store.read()).credentials[key]!.accessToken;
      } catch (error) {
        if (!(error instanceof BridgeError) || error.statusCode >= 500) throw error;
        await this.revoke(localUserId);
      }
    }

    if (this.config.method === "token-exchange") {
      await this.exchange(localUserId);
      return (await this.store.read()).credentials[key]!.accessToken;
    }

    throw new BridgeError(401, "FEDERATION_AUTHORIZATION_REQUIRED", "This user has not authorized the delegated federation route.");
  }

  async revoke(localUserId: string): Promise<void> {
    const key = this.key(localUserId);
    await this.store.mutate((store) => {
      delete store.credentials[key];
      for (const [state, pending] of Object.entries(store.pending)) {
        if (pending.localUserId === localUserId) delete store.pending[state];
      }
    });
  }

  private async refresh(refreshToken: string): Promise<OAuthTokenResponse> {
    const form = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: this.config.clientId,
    });
    return this.tokenRequest(form);
  }

  private async exchange(localUserId: string): Promise<void> {
    if (!this.subjectTokenProvider) {
      throw new BridgeError(
        503,
        "FEDERATION_SUBJECT_TOKEN_UNAVAILABLE",
        "Token Exchange is configured but no SubjectTokenProvider is available.",
      );
    }
    const subject = await this.subjectTokenProvider.subjectToken(localUserId);
    assertOrThrow(subject.token.length > 0 && subject.tokenType.length > 0, 503, "FEDERATION_SUBJECT_TOKEN_UNAVAILABLE", "Subject token provider returned an invalid token.");

    const form = new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
      subject_token: subject.token,
      subject_token_type: subject.tokenType,
      requested_token_type: "urn:ietf:params:oauth:token-type:access_token",
      client_id: this.config.clientId,
    });
    if (this.config.scopes) form.set("scope", this.config.scopes);
    if (this.config.audience) form.set("audience", this.config.audience);

    const token = await this.tokenRequest(form);
    await this.saveCredential(localUserId, token);
  }

  private async tokenRequest(form: URLSearchParams): Promise<OAuthTokenResponse> {
    const headers: Record<string, string> = {
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
    };
    if (this.config.clientSecret) {
      headers.authorization = `Basic ${Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString("base64")}`;
    }

    let response: Response;
    try {
      response = await fetch(this.config.tokenUrl, {
        method: "POST",
        headers,
        body: form.toString(),
      });
    } catch (error) {
      throw new BridgeError(503, "FEDERATION_OAUTH_UNAVAILABLE", `OAuth token endpoint unavailable: ${String((error as Error).message)}`);
    }

    let body: OAuthTokenResponse & { error?: unknown; error_description?: unknown };
    try {
      body = await response.json() as OAuthTokenResponse & { error?: unknown; error_description?: unknown };
    } catch {
      throw new BridgeError(502, "FEDERATION_OAUTH_INVALID_RESPONSE", "OAuth token endpoint returned invalid JSON.");
    }

    if (!response.ok) {
      const message = typeof body.error_description === "string"
        ? body.error_description
        : typeof body.error === "string"
          ? body.error
          : `OAuth token endpoint returned HTTP ${response.status}.`;
      throw new BridgeError(response.status >= 500 ? 503 : 401, "FEDERATION_OAUTH_FAILED", message);
    }

    assertOrThrow(typeof body.access_token === "string" && body.access_token.length > 0, 502, "FEDERATION_OAUTH_INVALID_RESPONSE", "OAuth response has no access_token.");
    return body;
  }

  private async saveCredential(localUserId: string, token: OAuthTokenResponse, previousRefreshToken?: string): Promise<void> {
    assertOrThrow(typeof token.access_token === "string" && token.access_token.length > 0, 502, "FEDERATION_OAUTH_INVALID_RESPONSE", "OAuth response has no access_token.");
    const now = Date.now();
    const expiresIn = typeof token.expires_in === "number" && Number.isFinite(token.expires_in) && token.expires_in > 0
      ? token.expires_in
      : undefined;
    const credential: StoredCredential = {
      accessToken: token.access_token,
      tokenType: typeof token.token_type === "string" && token.token_type.length > 0 ? token.token_type : "Bearer",
      ...(typeof token.refresh_token === "string" && token.refresh_token.length > 0
        ? { refreshToken: token.refresh_token }
        : previousRefreshToken
          ? { refreshToken: previousRefreshToken }
          : {}),
      ...(expiresIn ? { expiresAt: new Date(now + expiresIn * 1000).toISOString() } : {}),
      ...(typeof token.scope === "string" ? { scope: token.scope } : {}),
      updatedAt: nowIso(),
    };
    await this.store.mutate((store) => {
      store.credentials[this.key(localUserId)] = credential;
    });
  }
}
