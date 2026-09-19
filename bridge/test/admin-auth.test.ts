import { createHmac } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AdminPasswordTotpService } from "../src/services/admin-password-totp-service.js";
import { AdminSessionService } from "../src/services/admin-session-service.js";

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function decodeBase32(input: string): Buffer {
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of input) {
    const index = alphabet.indexOf(char);
    if (index < 0) throw new Error("invalid base32");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function currentTotp(secret: string): string {
  const step = Math.floor(Date.now() / 30_000);
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const digest = createHmac("sha1", decodeBase32(secret)).update(counter).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary = ((digest[offset]! & 0x7f) << 24)
    | ((digest[offset + 1]! & 0xff) << 16)
    | ((digest[offset + 2]! & 0xff) << 8)
    | (digest[offset + 3]! & 0xff);
  return String(binary % 1_000_000).padStart(6, "0");
}

describe("administrator authentication", () => {
  it("issues user-bound sessions with independent CSRF verification", async () => {
    const root = await mkdtemp(join(tmpdir(), "p4u-admin-session-"));
    const sessions = new AdminSessionService(root);
    const issued = await sessions.issue("user-1");

    expect(await sessions.userId(issued.token)).toBe("user-1");
    expect(await sessions.verifyCsrf(issued.token, issued.csrfToken)).toBe(true);
    expect(await sessions.verifyCsrf(issued.token, "wrong")).toBe(false);

    await sessions.revokeUser("user-1");
    expect(await sessions.userId(issued.token)).toBeNull();
  });

  it("requires password and TOTP together and deletes fallback credentials when disabled", async () => {
    const root = await mkdtemp(join(tmpdir(), "p4u-admin-password-"));
    const fallback = new AdminPasswordTotpService(root);
    const setup = await fallback.beginSetup("user-1", "christoph", "correct horse battery staple");
    const code = currentTotp(setup.secret);

    await fallback.confirmSetup(setup.setupId, code);
    expect(await fallback.enabled("user-1")).toBe(true);
    expect(await fallback.verify("user-1", "correct horse battery staple", code)).toBe(true);
    expect(await fallback.verify("user-1", "wrong password", code)).toBe(false);
    expect(await fallback.verify("user-1", "correct horse battery staple", "000000")).toBe(false);

    await fallback.disable("user-1");
    expect(await fallback.enabled("user-1")).toBe(false);
    expect(await fallback.verify("user-1", "correct horse battery staple", code)).toBe(false);
  });
});
