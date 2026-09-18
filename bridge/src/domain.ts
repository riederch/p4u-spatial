export type DeviceStatus = "pending-pairing" | "authorized" | "disabled" | "revoked";

export type DeviceScope =
  | "display:read"
  | "scan:write"
  | "observation:write"
  | "task:read"
  | "task:answer";

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
  "display:read",
  "scan:write",
  "observation:write",
  "task:read",
  "task:answer",
];
