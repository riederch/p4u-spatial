import { join } from "node:path";
import { BridgeError, assertOrThrow } from "../errors.js";
import { AtomicJsonStore } from "../storage/atomic-json-store.js";
import { nowIso } from "../util.js";

type Channel = "stable" | "beta";
type Platform = "android-pico";

export interface XrAppReleaseDescriptor {
  releaseId: string;
  version: string;
  versionCode: number;
  channel: Channel;
  platform: Platform;
  mandatory: boolean;
  releaseNotes?: string;
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
  publishedAt: string;
}

interface ReleaseState {
  releases: Record<string, XrAppReleaseDescriptor>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function requiredString(value: unknown, name: string): string {
  assertOrThrow(typeof value === "string" && value.length > 0, 400, "XR_APP_RELEASE_INVALID", `${name} is required.`);
  return value;
}

function requiredHexSha256(value: unknown, name: string): string {
  const text = requiredString(value, name);
  assertOrThrow(/^[a-fA-F0-9]{64}$/.test(text), 400, "XR_APP_RELEASE_INVALID", `${name} must be a 64-character SHA-256 hex digest.`);
  return text.toLowerCase();
}

function validateUrl(value: unknown): string {
  const href = requiredString(value, "package.href");
  let parsed: URL;
  try {
    parsed = new URL(href);
  } catch {
    throw new BridgeError(400, "XR_APP_RELEASE_INVALID", "package.href must be an absolute URL.");
  }
  assertOrThrow(parsed.protocol === "https:" || parsed.protocol === "http:", 400, "XR_APP_RELEASE_INVALID", "package.href must use HTTP(S).");
  assertOrThrow(!parsed.username && !parsed.password, 400, "XR_APP_RELEASE_INVALID", "package.href must not embed credentials.");
  return href;
}

function semverLike(value: unknown): string {
  const version = requiredString(value, "version");
  assertOrThrow(/^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?$/.test(version), 400, "XR_APP_RELEASE_INVALID", "version must be semantic-version-like.");
  return version;
}

// ADR: docs/adr/app/0023-xr-application-update-trust.md — release metadata is Bridge-owned, while APK signing trust remains external and pinned by the client.
export class XrAppReleaseService {
  private readonly store: AtomicJsonStore<ReleaseState>;

  constructor(stateDir: string) {
    this.store = new AtomicJsonStore(join(stateDir, "xr-app-releases.json"), () => ({ releases: {} }));
  }

  private parse(raw: unknown): XrAppReleaseDescriptor {
    assertOrThrow(isRecord(raw), 400, "XR_APP_RELEASE_INVALID", "Release descriptor JSON object required.");
    assertOrThrow(isRecord(raw.compatibility), 400, "XR_APP_RELEASE_INVALID", "compatibility is required.");
    assertOrThrow(isRecord(raw.package), 400, "XR_APP_RELEASE_INVALID", "package is required.");

    const channel = raw.channel;
    assertOrThrow(channel === "stable" || channel === "beta", 400, "XR_APP_RELEASE_INVALID", "channel must be stable or beta.");
    assertOrThrow(raw.platform === "android-pico", 400, "XR_APP_RELEASE_INVALID", "platform must be android-pico.");
    assertOrThrow(Number.isInteger(raw.versionCode) && (raw.versionCode as number) > 0, 400, "XR_APP_RELEASE_INVALID", "versionCode must be a positive integer.");
    assertOrThrow(typeof raw.mandatory === "boolean", 400, "XR_APP_RELEASE_INVALID", "mandatory must be boolean.");
    assertOrThrow(Number.isInteger(raw.package.size) && (raw.package.size as number) > 0, 400, "XR_APP_RELEASE_INVALID", "package.size must be a positive integer.");

    const descriptor: XrAppReleaseDescriptor = {
      releaseId: requiredString(raw.releaseId, "releaseId"),
      version: semverLike(raw.version),
      versionCode: raw.versionCode as number,
      channel,
      platform: "android-pico",
      mandatory: raw.mandatory,
      compatibility: {
        core: requiredString(raw.compatibility.core, "compatibility.core"),
        xr: requiredString(raw.compatibility.xr, "compatibility.xr"),
      },
      package: {
        href: validateUrl(raw.package.href),
        size: raw.package.size as number,
        sha256: requiredHexSha256(raw.package.sha256, "package.sha256"),
        signingCertificateSha256: requiredHexSha256(raw.package.signingCertificateSha256, "package.signingCertificateSha256"),
      },
      publishedAt: typeof raw.publishedAt === "string" && raw.publishedAt.length > 0 ? raw.publishedAt : nowIso(),
    };

    if (typeof raw.releaseNotes === "string") descriptor.releaseNotes = raw.releaseNotes;
    if (typeof raw.compatibility.spatial === "string" && raw.compatibility.spatial.length > 0) descriptor.compatibility.spatial = raw.compatibility.spatial;
    return descriptor;
  }

  async publish(raw: unknown): Promise<XrAppReleaseDescriptor> {
    const descriptor = this.parse(raw);
    return this.store.mutate((state) => {
      const existing = state.releases[descriptor.releaseId];
      if (existing && JSON.stringify(existing) !== JSON.stringify(descriptor)) {
        throw new BridgeError(409, "XR_APP_RELEASE_ID_CONFLICT", "releaseId already exists with different content.");
      }
      for (const release of Object.values(state.releases)) {
        if (
          release.channel === descriptor.channel
          && release.platform === descriptor.platform
          && release.versionCode === descriptor.versionCode
          && release.releaseId !== descriptor.releaseId
        ) {
          throw new BridgeError(409, "XR_APP_VERSION_CODE_CONFLICT", "versionCode already exists in this channel/platform.");
        }
      }
      state.releases[descriptor.releaseId] = descriptor;
      return descriptor;
    });
  }

  async get(releaseId: string): Promise<XrAppReleaseDescriptor> {
    const release = (await this.store.read()).releases[releaseId];
    if (!release) throw new BridgeError(404, "XR_APP_RELEASE_NOT_FOUND", "XR application release not found.");
    return release;
  }

  async latest(channel: string | undefined, platform: string | undefined): Promise<XrAppReleaseDescriptor> {
    const effectiveChannel = channel ?? "stable";
    const effectivePlatform = platform ?? "android-pico";
    assertOrThrow(effectiveChannel === "stable" || effectiveChannel === "beta", 400, "XR_APP_RELEASE_INVALID", "channel must be stable or beta.");
    assertOrThrow(effectivePlatform === "android-pico", 400, "XR_APP_RELEASE_INVALID", "platform must be android-pico.");

    const releases = Object.values((await this.store.read()).releases)
      .filter((release) => release.channel === effectiveChannel && release.platform === effectivePlatform)
      .sort((a, b) => b.versionCode - a.versionCode);

    const release = releases[0];
    if (!release) throw new BridgeError(404, "XR_APP_RELEASE_NOT_FOUND", "No XR application release is published for this channel/platform.");
    return release;
  }
}
