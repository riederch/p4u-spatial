import { join } from "node:path";
import { AtomicJsonStore } from "../storage/atomic-json-store.js";
import { randomSecret, sha256 } from "../util.js";

interface SessionRecord {
  userId: string;
  tokenHash: string;
  csrfHash: string;
  expiresAt: string;
}

interface State { sessions: SessionRecord[] }

export interface AdminSession {
  userId: string;
  token: string;
  csrfToken: string;
  expiresAt: string;
}

// ADR: docs/adr/bridge/0025-admin-authentication-and-bootstrap.md — administrator browser login creates server-side session and CSRF-bound state.
export class AdminSessionService {
  private readonly store: AtomicJsonStore<State>;

  constructor(stateDir: string, private readonly ttlMs = 8 * 60 * 60 * 1000) {
    this.store = new AtomicJsonStore(join(stateDir, "admin-sessions.json"), () => ({ sessions: [] }));
  }

  async issue(userId: string): Promise<AdminSession> {
    const token = randomSecret();
    const csrfToken = randomSecret();
    const expiresAt = new Date(Date.now() + this.ttlMs).toISOString();
    await this.store.mutate((state) => {
      this.cleanup(state);
      state.sessions.push({
        userId,
        tokenHash: sha256(token),
        csrfHash: sha256(csrfToken),
        expiresAt,
      });
    });
    return { userId, token, csrfToken, expiresAt };
  }

  async userId(token: string): Promise<string | null> {
    const tokenHash = sha256(token);
    const state = await this.store.read();
    const session = state.sessions.find((item) => item.tokenHash === tokenHash && Date.parse(item.expiresAt) > Date.now());
    return session?.userId ?? null;
  }

  async verifyCsrf(token: string, csrfToken: string): Promise<boolean> {
    const tokenHash = sha256(token);
    const csrfHash = sha256(csrfToken);
    const state = await this.store.read();
    return state.sessions.some((item) =>
      item.tokenHash === tokenHash
      && item.csrfHash === csrfHash
      && Date.parse(item.expiresAt) > Date.now()
    );
  }

  async revoke(token: string): Promise<void> {
    const tokenHash = sha256(token);
    await this.store.mutate((state) => {
      this.cleanup(state);
      state.sessions = state.sessions.filter((item) => item.tokenHash !== tokenHash);
    });
  }

  async revokeUser(userId: string): Promise<void> {
    await this.store.mutate((state) => {
      this.cleanup(state);
      state.sessions = state.sessions.filter((item) => item.userId !== userId);
    });
  }

  private cleanup(state: State): void {
    const now = Date.now();
    state.sessions = state.sessions.filter((item) => Date.parse(item.expiresAt) > now);
  }
}
