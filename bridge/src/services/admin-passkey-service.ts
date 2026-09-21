import { join } from "node:path";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
  type WebAuthnCredential,
} from "@simplewebauthn/server";
import { BridgeError, assertOrThrow } from "../errors.js";
import { AtomicJsonStore } from "../storage/atomic-json-store.js";
import type { AdminUserRecord } from "./admin-user-service.js";
import { nowIso, randomSecret } from "../util.js";

interface PasskeyRecord {
  id: string;
  userId: string;
  publicKey: string;
  counter: number;
  transports?: string[];
  createdAt: string;
  name?: string;
}

interface CeremonyRecord {
  id: string;
  kind: "registration" | "authentication";
  challenge: string;
  expiresAt: string;
  userId?: string;
}

interface State {
  passkeys: PasskeyRecord[];
  ceremonies: CeremonyRecord[];
}

// ADR: docs/adr/bridge/0025-admin-authentication-and-bootstrap.md — passkeys are a permanent per-admin login method with user verification.
export class AdminPasskeyService {
  private readonly store: AtomicJsonStore<State>;

  constructor(
    stateDir: string,
    private readonly rpID: string,
    private readonly expectedOrigin: string,
  ) {
    this.store = new AtomicJsonStore(join(stateDir, "admin-passkeys.json"), () => ({
      passkeys: [],
      ceremonies: [],
    }));
  }

  async configured(userId?: string): Promise<boolean> {
    const passkeys = (await this.store.read()).passkeys;
    return userId ? passkeys.some((passkey) => passkey.userId === userId) : passkeys.length > 0;
  }

  async registrationOptions(user: AdminUserRecord) {
    const state = await this.store.read();
    const options = await generateRegistrationOptions({
      rpName: "P4U Spatial Bridge",
      rpID: this.rpID,
      userID: Buffer.from(user.userId),
      userName: user.username,
      userDisplayName: user.displayName,
      attestationType: "none",
      excludeCredentials: state.passkeys.map((passkey) => ({
        id: passkey.id,
        transports: passkey.transports as any,
      })),
      authenticatorSelection: {
        residentKey: "required",
        userVerification: "required",
      },
    });

    const ceremonyId = randomSecret();
    const expiresAt = new Date(Date.now() + 300_000).toISOString();
    await this.store.mutate((current) => {
      this.cleanup(current);
      current.ceremonies.push({
        id: ceremonyId,
        kind: "registration",
        challenge: options.challenge,
        expiresAt,
        userId: user.userId,
      });
    });
    return { ceremonyId, options };
  }

  async verifyRegistration(ceremonyId: string, response: RegistrationResponseJSON, name?: string) {
    const ceremony = await this.consume(ceremonyId, "registration");
    assertOrThrow(ceremony.userId, 400, "PASSKEY_CEREMONY_INVALID", "Registration ceremony has no user.");

    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: ceremony.challenge,
      expectedOrigin: this.expectedOrigin,
      expectedRPID: this.rpID,
      requireUserVerification: true,
    });
    assertOrThrow(
      verification.verified && verification.registrationInfo,
      400,
      "PASSKEY_REGISTRATION_FAILED",
      "Passkey registration failed.",
    );

    const credential = verification.registrationInfo.credential;
    const transports = credential.transports as string[] | undefined;
    const record: PasskeyRecord = {
      id: credential.id,
      userId: ceremony.userId,
      publicKey: Buffer.from(credential.publicKey).toString("base64url"),
      counter: credential.counter,
      createdAt: nowIso(),
      ...(transports ? { transports } : {}),
      ...(name?.trim() ? { name: name.trim().slice(0, 120) } : {}),
    };

    await this.store.mutate((state) => {
      const old = state.passkeys.find((passkey) => passkey.id === record.id);
      if (old) {
        assertOrThrow(old.userId === record.userId, 409, "PASSKEY_ALREADY_ASSIGNED", "Passkey belongs to another user.");
        Object.assign(old, record);
      } else {
        state.passkeys.push(record);
      }
    });
    return record;
  }

  async authenticationOptions() {
    const state = await this.store.read();
    assertOrThrow(state.passkeys.length > 0, 409, "PASSKEY_NOT_CONFIGURED", "No administrator passkey registered.");
    const options = await generateAuthenticationOptions({
      rpID: this.rpID,
      userVerification: "required",
      allowCredentials: state.passkeys.map((passkey) => ({
        id: passkey.id,
        transports: passkey.transports as any,
      })),
    });
    const ceremonyId = randomSecret();
    const expiresAt = new Date(Date.now() + 300_000).toISOString();
    await this.store.mutate((current) => {
      this.cleanup(current);
      current.ceremonies.push({
        id: ceremonyId,
        kind: "authentication",
        challenge: options.challenge,
        expiresAt,
      });
    });
    return { ceremonyId, options };
  }

  async verifyAuthentication(ceremonyId: string, response: AuthenticationResponseJSON): Promise<{ userId: string }> {
    const ceremony = await this.consume(ceremonyId, "authentication");
    const state = await this.store.read();
    const passkey = state.passkeys.find((item) => item.id === response.id);
    assertOrThrow(passkey, 401, "PASSKEY_UNKNOWN", "Passkey is not registered.");

    const credential: WebAuthnCredential = {
      id: passkey.id,
      publicKey: new Uint8Array(Buffer.from(passkey.publicKey, "base64url")),
      counter: passkey.counter,
      transports: passkey.transports as any,
    };
    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: ceremony.challenge,
      expectedOrigin: this.expectedOrigin,
      expectedRPID: this.rpID,
      credential,
      requireUserVerification: true,
    });
    assertOrThrow(verification.verified, 401, "PASSKEY_AUTHENTICATION_FAILED", "Passkey authentication failed.");

    await this.store.mutate((current) => {
      const stored = current.passkeys.find((item) => item.id === passkey.id);
      if (stored) stored.counter = verification.authenticationInfo.newCounter;
    });
    return { userId: passkey.userId };
  }

  async listPasskeys(userId: string) {
    return (await this.store.read()).passkeys
      .filter((passkey) => passkey.userId === userId)
      .map(({ publicKey: _publicKey, userId: _userId, ...passkey }) => passkey);
  }

  async renamePasskey(userId: string, id: string, name: string) {
    const normalized = name.trim();
    assertOrThrow(
      normalized.length > 0 && normalized.length <= 120,
      400,
      "PASSKEY_NAME_INVALID",
      "Passkey name must contain 1 to 120 characters.",
    );
    return this.store.mutate((state) => {
      const passkey = state.passkeys.find((item) => item.id === id && item.userId === userId);
      if (!passkey) throw new BridgeError(404, "PASSKEY_NOT_FOUND", "Passkey not found.");
      passkey.name = normalized;
      return { id: passkey.id, name: passkey.name, createdAt: passkey.createdAt };
    });
  }

  async removePasskey(userId: string, id: string, allowLast: boolean) {
    return this.store.mutate((state) => {
      const own = state.passkeys.filter((item) => item.userId === userId);
      assertOrThrow(allowLast || own.length > 1, 409, "LAST_PASSKEY", "The last passkey cannot be removed without another login method.");
      const index = state.passkeys.findIndex((item) => item.id === id && item.userId === userId);
      if (index < 0) throw new BridgeError(404, "PASSKEY_NOT_FOUND", "Passkey not found.");
      const [removed] = state.passkeys.splice(index, 1);
      return { id: removed!.id, name: removed!.name };
    });
  }

  private async consume(id: string, kind: CeremonyRecord["kind"]) {
    return this.store.mutate((state) => {
      this.cleanup(state);
      const index = state.ceremonies.findIndex((item) => item.id === id && item.kind === kind);
      if (index < 0) throw new BridgeError(400, "PASSKEY_CEREMONY_INVALID", "Passkey ceremony is missing or expired.");
      return state.ceremonies.splice(index, 1)[0]!;
    });
  }

  private cleanup(state: State): void {
    const now = Date.now();
    state.ceremonies = state.ceremonies.filter((item) => Date.parse(item.expiresAt) > now);
  }
}
