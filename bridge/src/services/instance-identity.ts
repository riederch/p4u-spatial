import { join } from "node:path";
import { AtomicJsonStore } from "../storage/atomic-json-store.js";
import { newId } from "../util.js";

interface InstanceState {
  instanceId?: string;
}

export class InstanceIdentityService {
  private readonly store: AtomicJsonStore<InstanceState>;

  constructor(stateDir: string) {
    this.store = new AtomicJsonStore(join(stateDir, "instance.json"), () => ({}));
  }

  async get(): Promise<string> {
    const current = await this.store.read();
    if (current.instanceId) return current.instanceId;

    return this.store.mutate((state) => {
      state.instanceId ??= newId();
      return state.instanceId;
    });
  }
}
