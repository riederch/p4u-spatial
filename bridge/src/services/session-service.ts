import { join } from "node:path";
import { BridgeError } from "../errors.js";
import { AtomicJsonStore } from "../storage/atomic-json-store.js";
import { newId, randomSecret, sha256 } from "../util.js";

interface SessionRecord {
  sessionId: string;
  deviceId: string;
  accessHash: string;
  refreshHash: string;
  accessExpiresAt: string;
  refreshExpiresAt: string;
  revoked: boolean;
}

interface SessionState {
  sessions: SessionRecord[];
}

export interface IssuedSession {
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: string;
  refreshExpiresAt: string;
}

export class SessionService {
  private readonly store: AtomicJsonStore<SessionState>;

  constructor(
    stateDir: string,
    private readonly accessTtlSeconds: number,
    private readonly refreshTtlSeconds: number,
  ) {
    this.store = new AtomicJsonStore(join(stateDir, "sessions.json"), () => ({ sessions: [] }));
  }

  async issue(deviceId: string): Promise<IssuedSession> {
    const accessToken = randomSecret();
    const refreshToken = randomSecret();
    const accessExpiresAt = new Date(Date.now() + this.accessTtlSeconds * 1000).toISOString();
    const refreshExpiresAt = new Date(Date.now() + this.refreshTtlSeconds * 1000).toISOString();

    await this.store.mutate((state) => {
      state.sessions.push({
        sessionId: newId(),
        deviceId,
        accessHash: sha256(accessToken),
        refreshHash: sha256(refreshToken),
        accessExpiresAt,
        refreshExpiresAt,
        revoked: false,
      });
    });

    return { accessToken, refreshToken, accessExpiresAt, refreshExpiresAt };
  }

  async verifyAccess(accessToken: string): Promise<string> {
    const hash = sha256(accessToken);
    const state = await this.store.read();
    const session = state.sessions.find((s) => !s.revoked && s.accessHash === hash);
    if (!session || Date.parse(session.accessExpiresAt) <= Date.now()) {
      throw new BridgeError(401, "SESSION_EXPIRED", "Session is invalid or expired.");
    }
    return session.deviceId;
  }

  async refresh(refreshToken: string): Promise<{ deviceId: string; session: IssuedSession }> {
    const hash = sha256(refreshToken);
    let deviceId = "";

    await this.store.mutate((state) => {
      const old = state.sessions.find((s) => !s.revoked && s.refreshHash === hash);
      if (!old || Date.parse(old.refreshExpiresAt) <= Date.now()) {
        throw new BridgeError(401, "SESSION_EXPIRED", "Refresh credential is invalid or expired.");
      }
      old.revoked = true;
      deviceId = old.deviceId;
    });

    return { deviceId, session: await this.issue(deviceId) };
  }

  async revokeDevice(deviceId: string): Promise<void> {
    await this.store.mutate((state) => {
      for (const session of state.sessions) {
        if (session.deviceId === deviceId) session.revoked = true;
      }
    });
  }

  async logout(accessToken: string): Promise<void> {
    const hash = sha256(accessToken);
    await this.store.mutate((state) => {
      const session = state.sessions.find((s) => s.accessHash === hash);
      if (session) session.revoked = true;
    });
  }
}
