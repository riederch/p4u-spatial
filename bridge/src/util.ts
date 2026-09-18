import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { dirname, resolve, sep } from "node:path";
import { mkdir, rename, writeFile } from "node:fs/promises";

export function newId(): string {
  const bytes = randomBytes(16);
  let timestamp = BigInt(Date.now());
  for (let index = 5; index >= 0; index -= 1) {
    bytes[index] = Number(timestamp & 0xffn);
    timestamp >>= 8n;
  }
  bytes[6] = (bytes[6]! & 0x0f) | 0x70;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;

  const hex = bytes.toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}

export function randomSecret(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256(data: string | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

export function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`);
  return `{${entries.join(",")}}`;
}

export function normalizeRelativePath(input: string): string {
  const value = input.replaceAll("\\", "/").replace(/^\/+/, "");
  const parts = value.split("/").filter(Boolean);
  if (parts.length === 0 || parts.some((part) => part === "." || part === "..")) throw new Error("invalid relative path");
  return parts.join("/");
}

export function resolveBelow(root: string, relativePath: string): string {
  const normalized = normalizeRelativePath(relativePath);
  const absoluteRoot = resolve(root);
  const target = resolve(absoluteRoot, ...normalized.split("/"));
  if (target !== absoluteRoot && !target.startsWith(`${absoluteRoot}${sep}`)) throw new Error("path escapes root");
  return target;
}

export async function atomicWrite(path: string, data: string | Uint8Array): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.tmp-${randomUUID()}`;
  await writeFile(temp, data);
  await rename(temp, path);
}

export function nowIso(): string {
  return new Date().toISOString();
}
