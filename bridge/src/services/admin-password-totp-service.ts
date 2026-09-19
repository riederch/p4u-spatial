import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { join } from "node:path";
import { BridgeError, assertOrThrow } from "../errors.js";
import { AtomicJsonStore } from "../storage/atomic-json-store.js";
import { nowIso, randomSecret } from "../util.js";

interface CredentialRecord {
  userId: string;
  passwordSalt: string;
  passwordHash: string;
  totpSecret: string;
  enabledAt: string;
}

interface PendingSetup {
  setupId: string;
  userId: string;
  passwordSalt: string;
  passwordHash: string;
  totpSecret: string;
  expiresAt: string;
}

interface State {
  credentials: CredentialRecord[];
  pending: PendingSetup[];
}

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(input: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of input) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

function base32Decode(input: string): Buffer {
  let bits = 0;
  let value = 0;
  const output: number[] = [];
  for (const raw of input.toUpperCase().replace(/=+$/g, "")) {
    const index = BASE32_ALPHABET.indexOf(raw);
    if (index < 0) throw new Error("Invalid base32");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(output);
}

function passwordHash(password: string, salt: Buffer): Buffer {
  return scryptSync(password, salt, 32);
}

function totp(secret: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const digest = createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary = ((digest[offset]! & 0x7f) << 24)
    | ((digest[offset + 1]! & 0xff) << 16)
    | ((digest[offset + 2]! & 0xff) << 8)
    | (digest[offset + 3]! & 0xff);
  return String(binary % 1_000_000).padStart(6, "0");
}

function verifyTotp(secret: string, code: string, nowMs = Date.now()): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  const current = Math.floor(nowMs / 30_000);
  for (const delta of [-1, 0, 1]) {
    const expected = Buffer.from(totp(secret, current + delta));
    const supplied = Buffer.from(code);
    if (expected.length === supplied.length && timingSafeEqual(expected, supplied)) return true;
  }
  return false;
}

export class AdminPasswordTotpService {
  private readonly store: AtomicJsonStore<State>;

  constructor(stateDir: string) {
    this.store = new AtomicJsonStore(join(stateDir, "admin-password-totp.json"), () => ({
      credentials: [],
      pending: [],
    }));
  }

  async enabled(userId: string): Promise<boolean> {
    return (await this.store.read()).credentials.some((item) => item.userId === userId);
  }

  async beginSetup(userId: string, username: string, password: string) {
    assertOrThrow(password.length >= 12 && password.length <= 256, 400, "PASSWORD_INVALID", "Password must contain 12 to 256 characters.");
    const salt = randomBytes(16);
    const secret = base32Encode(randomBytes(20));
    const setupId = randomSecret();
    const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
    const hash = passwordHash(password, salt).toString("base64url");

    await this.store.mutate((state) => {
      this.cleanup(state);
      state.pending = state.pending.filter((item) => item.userId !== userId);
      state.pending.push({
        setupId,
        userId,
        passwordSalt: salt.toString("base64url"),
        passwordHash: hash,
        totpSecret: secret,
        expiresAt,
      });
    });

    const label = encodeURIComponent(`P4U Spatial:${username}`);
    const issuer = encodeURIComponent("P4U Spatial");
    return {
      setupId,
      secret,
      otpauthUri: `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`,
      expiresAt,
    };
  }

  async confirmSetup(setupId: string, code: string): Promise<void> {
    await this.store.mutate((state) => {
      this.cleanup(state);
      const index = state.pending.findIndex((item) => item.setupId === setupId);
      if (index < 0) throw new BridgeError(400, "TOTP_SETUP_INVALID", "TOTP setup is missing or expired.");
      const pending = state.pending[index]!;
      assertOrThrow(verifyTotp(pending.totpSecret, code), 400, "TOTP_INVALID", "TOTP code is invalid.");

      const record: CredentialRecord = {
        userId: pending.userId,
        passwordSalt: pending.passwordSalt,
        passwordHash: pending.passwordHash,
        totpSecret: pending.totpSecret,
        enabledAt: nowIso(),
      };
      const existing = state.credentials.findIndex((item) => item.userId === pending.userId);
      if (existing >= 0) state.credentials[existing] = record;
      else state.credentials.push(record);
      state.pending.splice(index, 1);
    });
  }

  async verify(userId: string, password: string, code: string): Promise<boolean> {
    const record = (await this.store.read()).credentials.find((item) => item.userId === userId);
    if (!record) return false;
    const salt = Buffer.from(record.passwordSalt, "base64url");
    const expected = Buffer.from(record.passwordHash, "base64url");
    const actual = passwordHash(password, salt);
    const passwordOk = actual.length === expected.length && timingSafeEqual(actual, expected);
    return passwordOk && verifyTotp(record.totpSecret, code);
  }

  async disable(userId: string): Promise<void> {
    await this.store.mutate((state) => {
      state.credentials = state.credentials.filter((item) => item.userId !== userId);
      state.pending = state.pending.filter((item) => item.userId !== userId);
    });
  }

  private cleanup(state: State): void {
    const now = Date.now();
    state.pending = state.pending.filter((item) => Date.parse(item.expiresAt) > now);
  }
}
