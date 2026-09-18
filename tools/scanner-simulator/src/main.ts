import { createHash, randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const bridge = (process.env.P4U_BRIDGE_URL ?? "http://127.0.0.1:8787").replace(/\/$/, "");
const adminKey = process.env.P4U_ADMIN_KEY;
const sessionFile = process.env.P4U_SIM_SESSION ?? ".p4u-sim-session.json";

interface SessionFile {
  deviceId: string;
  accessToken: string;
  refreshToken: string;
}

function hash(data: string | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

async function jsonRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${bridge}${path}`, init);
  const body = await response.json() as unknown;
  if (!response.ok) throw new Error(`${response.status}: ${JSON.stringify(body)}`);
  return body as T;
}

async function pair(): Promise<void> {
  if (!adminKey) throw new Error("P4U_ADMIN_KEY is required for simulator-assisted pairing.");

  const qr = await jsonRequest<{ pairingId: string; secret: string }>("/api/v1/admin/pairings", {
    method: "POST",
    headers: { "x-p4u-admin-key": adminKey },
  });

  const deviceId = randomUUID();
  const claim = await jsonRequest<{ claimId: string }>("/api/v1/pairing/claim", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      pairingId: qr.pairingId,
      secret: qr.secret,
      device: {
        deviceId,
        name: "Scanner Simulator",
        platform: "simulator",
        model: "software",
        runtime: "none",
        appVersion: "0.1.0",
        capabilities: ["head-pose"],
      },
    }),
  });

  await jsonRequest(`/api/v1/admin/pairing-claims/${claim.claimId}/authorize`, {
    method: "POST",
    headers: { "x-p4u-admin-key": adminKey },
  });

  const result = await jsonRequest<{
    status: "authorized";
    session: { accessToken: string; refreshToken: string };
  }>(`/api/v1/pairing/claims/${claim.claimId}`);

  await writeFile(sessionFile, `${JSON.stringify({
    deviceId,
    accessToken: result.session.accessToken,
    refreshToken: result.session.refreshToken,
  }, null, 2)}\n`);
  console.log(`paired ${deviceId}; session written to ${sessionFile}`);
}

async function loadSession(): Promise<SessionFile> {
  return JSON.parse(await readFile(sessionFile, "utf8")) as SessionFile;
}

async function device(): Promise<void> {
  const session = await loadSession();
  console.log(JSON.stringify(await jsonRequest("/api/v1/device", {
    headers: { authorization: `Bearer ${session.accessToken}` },
  }), null, 2));
}

async function uploadDemo(): Promise<void> {
  const session = await loadSession();
  const scanId = randomUUID();
  const trajectory = [
    { t: 0, position: [0, 0, 0] },
    { t: 1, position: [1.2, 0.1, 0] },
    { t: 2, position: [2.5, 0.2, -0.1] },
  ].map((row) => JSON.stringify(row)).join("\n") + "\n";
  const trajectoryHash = hash(trajectory);

  const manifest = {
    schemaVersion: "1.0",
    scanId,
    device: { deviceId: session.deviceId, platform: "simulator", model: "software", appVersion: "0.1.0" },
    mode: "site",
    createdAt: new Date().toISOString(),
    coordinateFrame: `scan:${scanId}`,
    capabilities: ["head-pose"],
    files: [{ path: "trajectory.jsonl", sha256: trajectoryHash, mediaType: "application/x-ndjson" }],
  };

  const auth = { authorization: `Bearer ${session.accessToken}` };

  console.log(await jsonRequest(`/api/v1/scans/${scanId}/manifest`, {
    method: "PUT",
    headers: { ...auth, "content-type": "application/json" },
    body: JSON.stringify(manifest),
  }));

  console.log(await jsonRequest(`/api/v1/scans/${scanId}/files/trajectory.jsonl`, {
    method: "PUT",
    headers: { ...auth, "content-type": "application/octet-stream", "x-content-sha256": trajectoryHash },
    body: trajectory,
  }));

  console.log(await jsonRequest(`/api/v1/scans/${scanId}/commit`, { method: "POST", headers: auth }));
}

switch (process.argv[2]) {
  case "pair": await pair(); break;
  case "device": await device(); break;
  case "upload-demo": await uploadDemo(); break;
  default:
    console.error("usage: scanner-simulator <pair|device|upload-demo>");
    process.exitCode = 2;
}
