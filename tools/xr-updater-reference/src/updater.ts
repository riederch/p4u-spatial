import { createHash } from "node:crypto";

export type UpdateChannel = "stable" | "beta";
export type UpdatePhase =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "verifying-digest"
  | "verifying-signature"
  | "ready-to-install"
  | "installing"
  | "awaiting-restart"
  | "complete"
  | "failed";

export interface ReleaseDescriptor {
  releaseId: string;
  version: string;
  versionCode: number;
  channel: UpdateChannel;
  platform: "android-pico";
  mandatory: boolean;
  compatibility: {
    core: string;
    xr: string;
    spatial?: string;
  };
  package: {
    href: string;
    size: number;
    sha256: string;
    signingCertificateSha256: string;
  };
}

export interface InstalledApp {
  version: string;
  versionCode: number;
  signingCertificateSha256: string;
}

export interface UpdateState {
  phase: UpdatePhase;
  channel: UpdateChannel;
  installedVersionCode: number;
  targetReleaseId?: string;
  targetVersionCode?: number;
  downloadedBytes?: number;
  errorCode?: string;
  errorMessage?: string;
}

export interface ReleaseClient {
  latest(channel: UpdateChannel): Promise<ReleaseDescriptor>;
  download(release: ReleaseDescriptor): Promise<Uint8Array>;
}

export interface SigningVerifier {
  signingCertificateSha256(apk: Uint8Array): Promise<string>;
}

export interface PackageInstaller {
  install(apk: Uint8Array): Promise<"installed" | "user-action-required">;
}

export interface UpdateStateStore {
  read(): Promise<UpdateState | null>;
  write(state: UpdateState): Promise<void>;
}

export interface CompatibilityPolicy {
  supports(release: ReleaseDescriptor): boolean;
}

export interface UpdateCheckResult {
  kind: "up-to-date" | "update-available";
  release?: ReleaseDescriptor;
}

function normalizeFingerprint(value: string): string {
  return value.replace(/:/g, "").toLowerCase();
}

function digest(apk: Uint8Array): string {
  return createHash("sha256").update(apk).digest("hex");
}

// ADR: docs/adr/app/0023-xr-application-update-trust.md — updates require version, compatibility, digest and signing-identity verification before installation.
// ADR: docs/adr/app/0023-xr-application-update-trust.md — updates require version, compatibility, digest and signing-identity verification before installation.
export class XrApplicationUpdater {
  constructor(
    private readonly releases: ReleaseClient,
    private readonly signing: SigningVerifier,
    private readonly installer: PackageInstaller,
    private readonly stateStore: UpdateStateStore,
    private readonly compatibility: CompatibilityPolicy,
  ) {}

  private async persist(state: UpdateState): Promise<void> {
    await this.stateStore.write(state);
  }

  private failed(base: UpdateState, code: string, message: string): UpdateState {
    return { ...base, phase: "failed", errorCode: code, errorMessage: message };
  }

  async check(installed: InstalledApp, channel: UpdateChannel): Promise<UpdateCheckResult> {
    let state: UpdateState = {
      phase: "checking",
      channel,
      installedVersionCode: installed.versionCode,
    };
    await this.persist(state);

    try {
      const release = await this.releases.latest(channel);
      if (release.versionCode <= installed.versionCode) {
        await this.persist({ ...state, phase: "idle" });
        return { kind: "up-to-date" };
      }
      if (!this.compatibility.supports(release)) {
        state = this.failed(state, "INCOMPATIBLE_RELEASE", "Release protocol requirements are not supported.");
        await this.persist(state);
        throw new Error(state.errorMessage);
      }
      await this.persist({
        ...state,
        phase: "available",
        targetReleaseId: release.releaseId,
        targetVersionCode: release.versionCode,
      });
      return { kind: "update-available", release };
    } catch (error) {
      if (state.phase !== "failed") {
        state = this.failed(state, "UPDATE_CHECK_FAILED", String((error as Error).message));
        await this.persist(state);
      }
      throw error;
    }
  }

  async prepare(installed: InstalledApp, release: ReleaseDescriptor): Promise<{ apk: Uint8Array; userActionMayBeRequired: true }> {
    let state: UpdateState = {
      phase: "downloading",
      channel: release.channel,
      installedVersionCode: installed.versionCode,
      targetReleaseId: release.releaseId,
      targetVersionCode: release.versionCode,
    };
    await this.persist(state);

    try {
      if (release.versionCode <= installed.versionCode) {
        throw new Error("Release versionCode is not newer than the installed application.");
      }
      if (!this.compatibility.supports(release)) {
        throw new Error("Release protocol requirements are not supported.");
      }

      const apk = await this.releases.download(release);
      state = { ...state, phase: "verifying-digest", downloadedBytes: apk.byteLength };
      await this.persist(state);

      if (apk.byteLength !== release.package.size) {
        throw new Error(`Package size mismatch: expected ${release.package.size}, received ${apk.byteLength}.`);
      }
      if (digest(apk) !== release.package.sha256.toLowerCase()) {
        throw new Error("Package SHA-256 mismatch.");
      }

      state = { ...state, phase: "verifying-signature" };
      await this.persist(state);
      const actualSigner = normalizeFingerprint(await this.signing.signingCertificateSha256(apk));
      const expectedSigner = normalizeFingerprint(release.package.signingCertificateSha256);
      const installedSigner = normalizeFingerprint(installed.signingCertificateSha256);
      if (actualSigner !== expectedSigner) throw new Error("APK signing certificate does not match release metadata.");
      if (actualSigner !== installedSigner) throw new Error("APK signing certificate does not match installed application.");

      state = { ...state, phase: "ready-to-install" };
      await this.persist(state);
      return { apk, userActionMayBeRequired: true };
    } catch (error) {
      const failed = this.failed(state, "UPDATE_PREPARATION_FAILED", String((error as Error).message));
      await this.persist(failed);
      throw error;
    }
  }

  async install(installed: InstalledApp, release: ReleaseDescriptor, apk: Uint8Array): Promise<UpdateState> {
    let state: UpdateState = {
      phase: "installing",
      channel: release.channel,
      installedVersionCode: installed.versionCode,
      targetReleaseId: release.releaseId,
      targetVersionCode: release.versionCode,
      downloadedBytes: apk.byteLength,
    };
    await this.persist(state);

    try {
      const outcome = await this.installer.install(apk);
      state = {
        ...state,
        phase: "awaiting-restart",
        ...(outcome === "user-action-required" ? { errorCode: "USER_ACTION_REQUIRED", errorMessage: "Android/PICO requires user or administrator confirmation." } : {}),
      };
      await this.persist(state);
      return state;
    } catch (error) {
      state = this.failed(state, "INSTALL_FAILED", String((error as Error).message));
      await this.persist(state);
      throw error;
    }
  }

  async confirmStarted(installedAfterRestart: InstalledApp, release: ReleaseDescriptor): Promise<UpdateState> {
    const current = await this.stateStore.read();
    const base: UpdateState = current ?? {
      phase: "awaiting-restart",
      channel: release.channel,
      installedVersionCode: installedAfterRestart.versionCode,
      targetReleaseId: release.releaseId,
      targetVersionCode: release.versionCode,
    };

    if (installedAfterRestart.versionCode !== release.versionCode) {
      const failed = this.failed(base, "INSTALLED_VERSION_MISMATCH", `Expected versionCode ${release.versionCode}, found ${installedAfterRestart.versionCode}.`);
      await this.persist(failed);
      return failed;
    }

    const complete: UpdateState = {
      phase: "complete",
      channel: release.channel,
      installedVersionCode: installedAfterRestart.versionCode,
      targetReleaseId: release.releaseId,
      targetVersionCode: release.versionCode,
    };
    await this.persist(complete);
    return complete;
  }
}
