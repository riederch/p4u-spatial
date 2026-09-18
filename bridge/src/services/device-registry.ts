import { join } from "node:path";
import { BridgeError } from "../errors.js";
import type { DeviceDescriptor, DeviceRecord, DeviceScope, DeviceStatus } from "../domain.js";
import { DEFAULT_DEVICE_SCOPES } from "../domain.js";
import { AtomicJsonStore } from "../storage/atomic-json-store.js";
import { nowIso } from "../util.js";

interface DeviceState {
  devices: DeviceRecord[];
}

export class DeviceRegistry {
  private readonly store: AtomicJsonStore<DeviceState>;

  constructor(stateDir: string) {
    this.store = new AtomicJsonStore(join(stateDir, "devices.json"), () => ({ devices: [] }));
  }

  async list(): Promise<DeviceRecord[]> {
    return (await this.store.read()).devices;
  }

  async get(deviceId: string): Promise<DeviceRecord | null> {
    return (await this.store.read()).devices.find((d) => d.deviceId === deviceId) ?? null;
  }

  async authorize(descriptor: DeviceDescriptor, scopes: DeviceScope[] = DEFAULT_DEVICE_SCOPES): Promise<DeviceRecord> {
    return this.store.mutate((state) => {
      const existing = state.devices.find((d) => d.deviceId === descriptor.deviceId);
      if (existing?.status === "revoked") {
        throw new BridgeError(409, "DEVICE_ID_REVOKED", "A revoked device ID cannot be re-authorized; pair with a new device identity.");
      }

      const record: DeviceRecord = {
        ...descriptor,
        status: "authorized",
        scopes: [...scopes],
        pairedAt: existing?.pairedAt ?? nowIso(),
        lastSeenAt: nowIso(),
      };

      if (existing) Object.assign(existing, record);
      else state.devices.push(record);
      return record;
    });
  }

  async setStatus(deviceId: string, status: DeviceStatus): Promise<DeviceRecord> {
    return this.store.mutate((state) => {
      const device = state.devices.find((d) => d.deviceId === deviceId);
      if (!device) throw new BridgeError(404, "DEVICE_NOT_FOUND", "Device not found.");
      device.status = status;
      return device;
    });
  }

  async touch(deviceId: string): Promise<void> {
    await this.store.mutate((state) => {
      const device = state.devices.find((d) => d.deviceId === deviceId);
      if (device) device.lastSeenAt = nowIso();
    });
  }
}
