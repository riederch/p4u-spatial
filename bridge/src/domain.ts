export type DeviceStatus = "pending-pairing" | "authorized" | "disabled" | "revoked";

export type CanonicalDeviceScope =
  | "spatial.read"
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
  status: DeviceStatus;
  scopes: DeviceScope[];
  pairedAt: string;
  lastSeenAt?: string;
}

export interface ScanFile {
  path: string;
  sha256: string;
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
