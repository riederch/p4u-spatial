export type DeviceStatus = "pending-pairing" | "authorized" | "disabled" | "revoked";

export type CanonicalDeviceScope =
  | "spatial.read"
  | "spatial.create"
  | "spatial.update"
  | "spatial.delete"
  | "xr.display.read"
  | "xr.scan.write"
  | "xr.observation.write"
  | "xr.task.read"
  | "xr.task.answer";

export type LegacyDeviceScope =
  | "display:read"
  | "scan:write"
  | "observation:write"
  | "task:read"
  | "task:answer";

export type DeviceScope = CanonicalDeviceScope | LegacyDeviceScope;

export const CANONICAL_DEVICE_SCOPES: readonly CanonicalDeviceScope[] = [
  "spatial.read",
  "spatial.create",
  "spatial.update",
  "spatial.delete",
  "xr.display.read",
  "xr.scan.write",
  "xr.observation.write",
  "xr.task.read",
  "xr.task.answer",
];

export const LEGACY_DEVICE_SCOPES: readonly LegacyDeviceScope[] = [
  "display:read",
  "scan:write",
  "observation:write",
  "task:read",
  "task:answer",
];

const DEVICE_SCOPE_SET = new Set<string>([
  ...CANONICAL_DEVICE_SCOPES,
  ...LEGACY_DEVICE_SCOPES,
]);

export function isDeviceScope(value: unknown): value is DeviceScope {
  return typeof value === "string" && DEVICE_SCOPE_SET.has(value);
}

const LEGACY_SCOPE_MAP: Record<LegacyDeviceScope, CanonicalDeviceScope> = {
  "display:read": "xr.display.read",
  "scan:write": "xr.scan.write",
  "observation:write": "xr.observation.write",
  "task:read": "xr.task.read",
  "task:answer": "xr.task.answer",
};

export function canonicalDeviceScope(scope: DeviceScope): CanonicalDeviceScope {
  return scope in LEGACY_SCOPE_MAP
    ? LEGACY_SCOPE_MAP[scope as LegacyDeviceScope]
    : scope as CanonicalDeviceScope;
}

export function canonicalDeviceScopes(scopes: readonly DeviceScope[]): CanonicalDeviceScope[] {
  return [...new Set(scopes.map(canonicalDeviceScope))];
}

export function hasDeviceScope(scopes: readonly DeviceScope[], required: DeviceScope): boolean {
  const canonicalRequired = canonicalDeviceScope(required);
  return scopes.some((scope) => canonicalDeviceScope(scope) === canonicalRequired);
}

export interface DeviceDescriptor {
  deviceId: string;
  name?: string;
  platform: string;
  model: string;
  runtime?: string;
  appVersion?: string;
  capabilities: string[];
  publicKey?: string;
}

export interface DeviceRecord extends DeviceDescriptor {
  globalName?: string;
  status: DeviceStatus;
  scopes: DeviceScope[];
  pairedAt: string;
  lastSeenAt?: string;
}

export interface ScanFile {
  path: string;
  sha256: string;
  size?: number;
  mediaType?: string;
}

export interface ScanManifest {
  schemaVersion: "1.0";
  scanId: string;
  device: {
    deviceId: string;
    platform: string;
    model: string;
    runtime?: string;
    appVersion?: string;
  };
  mode: "indoor" | "site" | "registration" | "drift-test";
  createdAt: string;
  coordinateFrame?: string;
  capabilities?: string[];
  capture?: {
    purpose: "room-survey" | "building-survey" | "asset-registration" | "registration" | "drift-test" | "free-capture";
    precision: "relative-only" | "local-metric" | "registered";
    subject?: { sourceId: string; objectId: string };
    runtimeCapabilities?: string[];
    registration?: {
      sourceId: string;
      method: "anchor" | "landmarks" | "manual" | "external";
      confidence?: number;
    };
  };
  files: ScanFile[];
}

export const DEFAULT_DEVICE_SCOPES: DeviceScope[] = [
  "spatial.read",
  "xr.display.read",
  "xr.scan.write",
  "xr.observation.write",
  "xr.task.read",
  "xr.task.answer",
];
