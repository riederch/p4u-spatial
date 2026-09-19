import { join } from "node:path";
import { AtomicJsonStore } from "../storage/atomic-json-store.js";
import { newId } from "../util.js";

interface InstanceState {
  instanceId?: string;
  name?: string;
}

export interface InstanceIdentity {
  instanceId: string;
  name: string;
}

export class InstanceIdentityService {
  private readonly store: AtomicJsonStore<InstanceState>;

  constructor(stateDir: string) {
    this.store = new AtomicJsonStore(join(stateDir, "instance.json"), () => ({}));
  }

  async get(): Promise<string> {
    return (await this.getInfo()).instanceId;
  }

  async getInfo(defaultName = "P4U Spatial Bridge"): Promise<InstanceIdentity> {
    return this.store.mutate((state) => {
      state.instanceId ??= newId();
      state.name ??= defaultName;
      return { instanceId: state.instanceId, name: state.name };
    });
  }

  async setName(name: string): Promise<InstanceIdentity> {
    const normalized = name.trim();
    if (!normalized) throw new Error("Bridge name must not be empty");
    if (normalized.length > 120) throw new Error("Bridge name must not exceed 120 characters");
    return this.store.mutate((state) => {
      state.instanceId ??= newId();
      state.name = normalized;
      return { instanceId: state.instanceId, name: state.name };
    });
  }
}
