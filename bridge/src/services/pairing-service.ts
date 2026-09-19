import { join } from "node:path";
import { BridgeError, assertOrThrow } from "../errors.js";
import type { DeviceDescriptor } from "../domain.js";
import { AtomicJsonStore } from "../storage/atomic-json-store.js";
import { newId, randomSecret, safeEqual, sha256 } from "../util.js";
import type { IssuedSession } from "./session-service.js";

type PairingState = "open" | "claimed" | "authorized" | "rejected" | "expired";

interface PairingRecord {
  pairingId: string;
  secretHash: string;
  expiresAt: string;
  state: PairingState;
  claimId?: string;
  descriptor?: DeviceDescriptor;
  bootstrap?: IssuedSession;
}

interface PairingStore {
  pairings: PairingRecord[];
}

export interface PairingQrPayload {
  version: 1;
  bridge: string;
  addresses: {
    localUrl?: string;
    publicUrl?: string;
  };
  pairingId: string;
  secret: string;
  expiresAt: string;
}

export class PairingService {
  private readonly store: AtomicJsonStore<PairingStore>;

  constructor(stateDir: string, private readonly ttlSeconds: number) {
    this.store = new AtomicJsonStore(join(stateDir, "pairings.json"), () => ({ pairings: [] }));
  }

  async create(bridge: string, addresses: { localUrl?: string; publicUrl?: string } = {}): Promise<PairingQrPayload> {
    const pairingId = newId();
    const secret = randomSecret();
    const expiresAt = new Date(Date.now() + this.ttlSeconds * 1000).toISOString();

    await this.store.mutate((state) => {
      state.pairings.push({
        pairingId,
        secretHash: sha256(secret),
        expiresAt,
        state: "open",
      });
    });

    return { version: 1, bridge, addresses, pairingId, secret, expiresAt };
  }

  async claim(pairingId: string, secret: string, descriptor: DeviceDescriptor): Promise<string> {
    return this.store.mutate((state) => {
      const pairing = state.pairings.find((p) => p.pairingId === pairingId);
      assertOrThrow(pairing, 404, "PAIRING_EXPIRED", "Pairing request not found.");

      if (Date.parse(pairing.expiresAt) <= Date.now()) {
        pairing.state = "expired";
        throw new BridgeError(410, "PAIRING_EXPIRED", "Pairing request has expired.");
      }
      if (pairing.state !== "open") {
        throw new BridgeError(409, "PAIRING_ALREADY_USED", "Pairing secret has already been consumed.");
      }
      if (!safeEqual(pairing.secretHash, sha256(secret))) {
        throw new BridgeError(401, "PAIRING_INVALID_SECRET", "Pairing secret is invalid.");
      }

      const claimId = newId();
      pairing.state = "claimed";
      pairing.claimId = claimId;
      pairing.descriptor = descriptor;
      return claimId;
    });
  }

  async getClaim(claimId: string): Promise<PairingRecord> {
    const pairing = (await this.store.read()).pairings.find((p) => p.claimId === claimId);
    if (!pairing) throw new BridgeError(404, "PAIRING_EXPIRED", "Pairing claim not found.");
    return pairing;
  }

  async listPending(): Promise<Array<{ claimId: string; pairingId: string; expiresAt: string; descriptor: DeviceDescriptor }>> {
    const now = Date.now();
    return (await this.store.read()).pairings
      .filter((pairing) => pairing.state === "claimed" && pairing.claimId && pairing.descriptor && Date.parse(pairing.expiresAt) > now)
      .map((pairing) => ({
        claimId: pairing.claimId!,
        pairingId: pairing.pairingId,
        expiresAt: pairing.expiresAt,
        descriptor: pairing.descriptor!,
      }));
  }

  async pendingDescriptor(claimId: string): Promise<DeviceDescriptor> {
    const pairing = await this.getClaim(claimId);
    if (pairing.state !== "claimed" || !pairing.descriptor) {
      throw new BridgeError(409, "PAIRING_NOT_PENDING", "Pairing claim is not awaiting authorization.");
    }
    return pairing.descriptor;
  }

  async authorize(claimId: string, bootstrap: IssuedSession): Promise<void> {
    await this.store.mutate((state) => {
      const pairing = state.pairings.find((p) => p.claimId === claimId);
      if (!pairing || pairing.state !== "claimed") {
        throw new BridgeError(409, "PAIRING_NOT_PENDING", "Pairing claim is not awaiting authorization.");
      }
      pairing.state = "authorized";
      pairing.bootstrap = bootstrap;
    });
  }

  async reject(claimId: string): Promise<void> {
    await this.store.mutate((state) => {
      const pairing = state.pairings.find((p) => p.claimId === claimId);
      if (!pairing || pairing.state !== "claimed") {
        throw new BridgeError(409, "PAIRING_NOT_PENDING", "Pairing claim is not awaiting authorization.");
      }
      pairing.state = "rejected";
    });
  }
}
