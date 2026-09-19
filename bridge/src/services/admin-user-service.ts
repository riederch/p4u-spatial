import { join } from "node:path";
import { BridgeError, assertOrThrow } from "../errors.js";
import { AtomicJsonStore } from "../storage/atomic-json-store.js";
import { newId, nowIso } from "../util.js";

export interface AdminUserRecord {
  userId: string;
  username: string;
  displayName: string;
  role: "admin";
  status: "active" | "disabled";
  createdAt: string;
  updatedAt: string;
}

interface State { users: AdminUserRecord[] }

export class AdminUserService {
  private readonly store: AtomicJsonStore<State>;
  constructor(stateDir: string) {
    this.store = new AtomicJsonStore(join(stateDir, "admin-users.json"), () => ({ users: [] }));
  }

  async list(): Promise<AdminUserRecord[]> { return (await this.store.read()).users; }

  async get(userId: string): Promise<AdminUserRecord | null> {
    return (await this.store.read()).users.find((u) => u.userId === userId) ?? null;
  }

  async create(username: string, displayName?: string): Promise<AdminUserRecord> {
    const normalized = username.trim().toLowerCase();
    assertOrThrow(/^[a-z0-9._-]{3,64}$/.test(normalized), 400, "USERNAME_INVALID", "username must be 3 to 64 characters using letters, numbers, dot, underscore or hyphen.");
    const display = (displayName?.trim() || username.trim()).slice(0, 120);
    return this.store.mutate((state) => {
      assertOrThrow(!state.users.some((u) => u.username === normalized), 409, "USERNAME_EXISTS", "username already exists.");
      const now = nowIso();
      const user: AdminUserRecord = { userId: newId(), username: normalized, displayName: display, role: "admin", status: "active", createdAt: now, updatedAt: now };
      state.users.push(user);
      return user;
    });
  }

  async update(userId: string, input: { displayName?: string; status?: "active" | "disabled" }): Promise<AdminUserRecord> {
    return this.store.mutate((state) => {
      const user = state.users.find((u) => u.userId === userId);
      if (!user) throw new BridgeError(404, "USER_NOT_FOUND", "User not found.");
      if (typeof input.displayName === "string") {
        const name = input.displayName.trim();
        assertOrThrow(name.length > 0 && name.length <= 120, 400, "USER_NAME_INVALID", "displayName must contain 1 to 120 characters.");
        user.displayName = name;
      }
      if (input.status) user.status = input.status;
      user.updatedAt = nowIso();
      return user;
    });
  }
}
