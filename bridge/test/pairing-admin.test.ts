import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PairingService } from "../src/services/pairing-service.js";

describe("pairing claim administration", () => {
  it("lists pending claims without exposing secrets or bootstrap credentials", async () => {
    const root = await mkdtemp(join(tmpdir(), "p4u-pairing-"));
    const pairings = new PairingService(root, 300);
    const qr = await pairings.create("https://bridge.test");
    const descriptor = {
      deviceId: "pico-1",
      name: "PICO Test",
      platform: "android-pico",
      model: "PICO 4 Ultra",
      capabilities: [],
    };
    const claimId = await pairings.claim(qr.pairingId, qr.secret, descriptor);

    const pending = await pairings.listPending();
    expect(pending).toEqual([{
      claimId,
      pairingId: qr.pairingId,
      expiresAt: qr.expiresAt,
      descriptor,
    }]);
    expect(JSON.stringify(pending)).not.toContain(qr.secret);
    expect(JSON.stringify(pending)).not.toContain("secretHash");
    expect(JSON.stringify(pending)).not.toContain("bootstrap");
  });
});
