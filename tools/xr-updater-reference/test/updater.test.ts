import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  XrApplicationUpdater,
  type InstalledApp,
  type ReleaseDescriptor,
  type UpdateState,
} from "../src/updater.js";

const apk = new TextEncoder().encode("signed-pico-apk-fixture");
const signer = "b".repeat(64);

function descriptor(): ReleaseDescriptor {
  return {
    releaseId: "scanner-2",
    version: "1.1.0",
    versionCode: 2,
    channel: "stable",
    platform: "android-pico",
    mandatory: false,
    compatibility: { core: "0.1", xr: "0.1", spatial: "0.1" },
    package: {
      href: "https://bridge.test/xr-app/v1/releases/scanner-2/package",
      size: apk.byteLength,
      sha256: createHash("sha256").update(apk).digest("hex"),
      signingCertificateSha256: signer,
    },
  };
}

const installed: InstalledApp = {
  version: "1.0.0",
  versionCode: 1,
  signingCertificateSha256: signer,
};

describe("XR updater reference", () => {
  it("checks, verifies, installs and confirms an update without losing durable state", async () => {
    let state: UpdateState | null = null;
    const release = descriptor();
    const updater = new XrApplicationUpdater(
      { latest: async () => release, download: async () => apk },
      { signingCertificateSha256: async () => signer },
      { install: async () => "user-action-required" },
      { read: async () => state, write: async (next) => { state = next; } },
      { supports: () => true },
    );

    expect(await updater.check(installed, "stable")).toMatchObject({ kind: "update-available", release });
    const prepared = await updater.prepare(installed, release);
    expect(prepared.apk).toEqual(apk);
    expect(state).toMatchObject({ phase: "ready-to-install", downloadedBytes: apk.byteLength });

    expect(await updater.install(installed, release, prepared.apk)).toMatchObject({
      phase: "awaiting-restart",
      errorCode: "USER_ACTION_REQUIRED",
    });

    expect(await updater.confirmStarted({ ...installed, version: "1.1.0", versionCode: 2 }, release)).toMatchObject({
      phase: "complete",
      installedVersionCode: 2,
    });
  });

  it("rejects a package with a different signing identity", async () => {
    let state: UpdateState | null = null;
    const release = descriptor();
    const updater = new XrApplicationUpdater(
      { latest: async () => release, download: async () => apk },
      { signingCertificateSha256: async () => "c".repeat(64) },
      { install: async () => "installed" },
      { read: async () => state, write: async (next) => { state = next; } },
      { supports: () => true },
    );

    await expect(updater.prepare(installed, release)).rejects.toThrow(/signing certificate/);
    expect(state).toMatchObject({ phase: "failed", errorCode: "UPDATE_PREPARATION_FAILED" });
  });

  it("does not offer an older or equal versionCode", async () => {
    let state: UpdateState | null = null;
    const release = { ...descriptor(), versionCode: 1 };
    const updater = new XrApplicationUpdater(
      { latest: async () => release, download: async () => apk },
      { signingCertificateSha256: async () => signer },
      { install: async () => "installed" },
      { read: async () => state, write: async (next) => { state = next; } },
      { supports: () => true },
    );

    expect(await updater.check(installed, "stable")).toEqual({ kind: "up-to-date" });
    expect(state).toMatchObject({ phase: "idle", installedVersionCode: 1 });
  });
});
