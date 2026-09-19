import { join } from "node:path";
import { BridgeError, assertOrThrow } from "../errors.js";
import { AtomicJsonStore } from "../storage/atomic-json-store.js";
import { nowIso, randomSecret, safeEqual } from "../util.js";

interface State {
  proof?: string;
  createdAt?: string;
  consumedAt?: string;
}

export class SetupBootstrapService {
  private readonly store: AtomicJsonStore<State>;

  constructor(stateDir: string) {
    this.store = new AtomicJsonStore(join(stateDir, "setup-bootstrap.json"), () => ({}));
  }

  async ensure(): Promise<{ proof: string; createdAt: string; consumed: boolean }> {
    return this.store.mutate((state) => {
      if (!state.proof) {
        state.proof = randomSecret();
        state.createdAt = nowIso();
      }
      return {
        proof: state.proof,
        createdAt: state.createdAt ?? nowIso(),
        consumed: !!state.consumedAt,
      };
    });
  }

  async status(): Promise<{ available: boolean; createdAt?: string }> {
    const state = await this.store.read();
    return {
      available: !!state.proof && !state.consumedAt,
      ...(state.createdAt ? { createdAt: state.createdAt } : {}),
    };
  }

  async verify(proof: string): Promise<void> {
    const state = await this.store.read();
    assertOrThrow(state.proof && !state.consumedAt, 409, "SETUP_COMPLETE", "First-run setup is already complete.");
    if (!safeEqual(state.proof, proof)) throw new BridgeError(401, "SETUP_PROOF_INVALID", "Invalid first-run setup code.");
  }

  async consume(): Promise<void> {
    await this.store.mutate((state) => {
      if (state.proof && !state.consumedAt) state.consumedAt = nowIso();
    });
  }
}
