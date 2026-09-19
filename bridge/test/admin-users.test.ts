import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AdminUserService } from "../src/services/admin-user-service.js";
import { DeviceRegistry } from "../src/services/device-registry.js";

describe("admin users and device assignments", () => {
  it("supports multiple headsets per user and unassigned pool devices", async () => {
    const root = await mkdtemp(join(tmpdir(), "p4u-users-"));
    const users = new AdminUserService(root);
    const devices = new DeviceRegistry(root);

    const christoph = await users.create("christoph", "Christoph");
    const second = await users.create("technik", "Technik");
    expect((await users.list()).map((user) => user.username)).toEqual(["christoph", "technik"]);

    const firstHeadset = await devices.authorize({
      deviceId: "pico-a", name: "PICO A", platform: "android-pico", model: "PICO 4 Ultra", capabilities: [],
    });
    const secondHeadset = await devices.authorize({
      deviceId: "pico-b", name: "PICO B", platform: "android-pico", model: "PICO 4 Ultra", capabilities: [],
    });
    const poolHeadset = await devices.authorize({
      deviceId: "pico-pool", name: "Pool", platform: "android-pico", model: "PICO 4 Ultra", capabilities: [],
    });

    await devices.assignUser(firstHeadset.deviceId, christoph.userId);
    await devices.assignUser(secondHeadset.deviceId, christoph.userId);

    expect((await devices.get("pico-a"))?.assignedUserId).toBe(christoph.userId);
    expect((await devices.get("pico-b"))?.assignedUserId).toBe(christoph.userId);
    expect((await devices.get(poolHeadset.deviceId))?.assignedUserId).toBeUndefined();

    await devices.assignUser(secondHeadset.deviceId, undefined);
    expect((await devices.get("pico-b"))?.assignedUserId).toBeUndefined();

    const disabled = await users.update(second.userId, { status: "disabled" });
    expect(disabled.status).toBe("disabled");
  });

  it("normalizes usernames and rejects duplicates", async () => {
    const root = await mkdtemp(join(tmpdir(), "p4u-users-"));
    const users = new AdminUserService(root);
    const first = await users.create("Christoph", "Christoph");
    expect(first.username).toBe("christoph");
    await expect(users.create("christoph", "Other")).rejects.toMatchObject({ code: "USERNAME_EXISTS" });
  });
});
