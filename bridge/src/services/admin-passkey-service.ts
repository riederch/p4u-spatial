import { join } from "node:path";
import { generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse, type AuthenticationResponseJSON, type RegistrationResponseJSON, type WebAuthnCredential } from "@simplewebauthn/server";
import { BridgeError, assertOrThrow } from "../errors.js";
import { AtomicJsonStore } from "../storage/atomic-json-store.js";
import { nowIso, randomSecret, sha256 } from "../util.js";

interface PasskeyRecord { id: string; publicKey: string; counter: number; transports?: string[]; createdAt: string; name?: string }
interface CeremonyRecord { id: string; kind: "registration" | "authentication"; challenge: string; expiresAt: string }
interface AdminSessionRecord { tokenHash: string; csrfHash: string; expiresAt: string }
interface State { passkeys: PasskeyRecord[]; ceremonies: CeremonyRecord[]; sessions: AdminSessionRecord[] }
export interface AdminSession { token: string; csrfToken: string; expiresAt: string }

export class AdminPasskeyService {
  private readonly store: AtomicJsonStore<State>;
  constructor(stateDir: string, private readonly rpID: string, private readonly expectedOrigin: string) {
    this.store = new AtomicJsonStore(join(stateDir, "admin-passkeys.json"), () => ({ passkeys: [], ceremonies: [], sessions: [] }));
  }
  async configured() { return (await this.store.read()).passkeys.length > 0; }
  async registrationOptions() {
    const state = await this.store.read();
    const options = await generateRegistrationOptions({
      rpName: "P4U Spatial Bridge", rpID: this.rpID, userID: Buffer.from("p4u-admin"), userName: "admin",
      attestationType: "none", userDisplayName: "P4U Administrator",
      excludeCredentials: state.passkeys.map(p => ({ id: p.id, transports: p.transports as any })),
      authenticatorSelection: { residentKey: "required", userVerification: "required" },
    });
    const ceremonyId = randomSecret(); const expiresAt = new Date(Date.now() + 300000).toISOString();
    await this.store.mutate(s => { this.cleanup(s); s.ceremonies.push({ id: ceremonyId, kind: "registration", challenge: options.challenge, expiresAt }); });
    return { ceremonyId, options };
  }
  async verifyRegistration(ceremonyId: string, response: RegistrationResponseJSON, name?: string) {
    const ceremony = await this.consume(ceremonyId, "registration");
    const v = await verifyRegistrationResponse({ response, expectedChallenge: ceremony.challenge, expectedOrigin: this.expectedOrigin, expectedRPID: this.rpID, requireUserVerification: true });
    assertOrThrow(v.verified && v.registrationInfo, 400, "PASSKEY_REGISTRATION_FAILED", "Passkey registration failed.");
    const c = v.registrationInfo.credential;
    const record: PasskeyRecord = { id: c.id, publicKey: Buffer.from(c.publicKey).toString("base64url"), counter: c.counter, transports: c.transports as string[] | undefined, createdAt: nowIso(), ...(name?.trim() ? { name: name.trim().slice(0,120) } : {}) };
    await this.store.mutate(s => { const old=s.passkeys.find(p=>p.id===record.id); if(old) Object.assign(old,record); else s.passkeys.push(record); });
    return record;
  }
  async authenticationOptions() {
    const state=await this.store.read(); assertOrThrow(state.passkeys.length>0,409,"PASSKEY_NOT_CONFIGURED","No administrator passkey registered.");
    const options=await generateAuthenticationOptions({ rpID:this.rpID,userVerification:"required",allowCredentials:state.passkeys.map(p=>({id:p.id,transports:p.transports as any})) });
    const ceremonyId=randomSecret(); const expiresAt=new Date(Date.now()+300000).toISOString();
    await this.store.mutate(s=>{this.cleanup(s);s.ceremonies.push({id:ceremonyId,kind:"authentication",challenge:options.challenge,expiresAt});});
    return {ceremonyId,options};
  }
  async verifyAuthentication(ceremonyId:string,response:AuthenticationResponseJSON):Promise<AdminSession>{
    const ceremony=await this.consume(ceremonyId,"authentication"); const state=await this.store.read(); const p=state.passkeys.find(x=>x.id===response.id);
    assertOrThrow(p,401,"PASSKEY_UNKNOWN","Passkey is not registered.");
    const credential:WebAuthnCredential={id:p.id,publicKey:new Uint8Array(Buffer.from(p.publicKey,"base64url")),counter:p.counter,transports:p.transports as any};
    const v=await verifyAuthenticationResponse({response,expectedChallenge:ceremony.challenge,expectedOrigin:this.expectedOrigin,expectedRPID:this.rpID,credential,requireUserVerification:true});
    assertOrThrow(v.verified,401,"PASSKEY_AUTHENTICATION_FAILED","Passkey authentication failed.");
    const token=randomSecret(),csrfToken=randomSecret(),expiresAt=new Date(Date.now()+8*3600000).toISOString();
    await this.store.mutate(s=>{this.cleanup(s);const stored=s.passkeys.find(x=>x.id===p.id);if(stored)stored.counter=v.authenticationInfo.newCounter;s.sessions.push({tokenHash:sha256(token),csrfHash:sha256(csrfToken),expiresAt});});
    return {token,csrfToken,expiresAt};
  }
  async verifySession(token:string){const h=sha256(token),s=await this.store.read();return s.sessions.some(x=>x.tokenHash===h&&Date.parse(x.expiresAt)>Date.now());}
  async listPasskeys(){return (await this.store.read()).passkeys.map(({publicKey:_publicKey,...p})=>p);}
  async renamePasskey(id:string,name:string){
    const normalized=name.trim(); assertOrThrow(normalized.length>0&&normalized.length<=120,400,"PASSKEY_NAME_INVALID","Passkey name must contain 1 to 120 characters.");
    return this.store.mutate(s=>{const p=s.passkeys.find(x=>x.id===id);if(!p)throw new BridgeError(404,"PASSKEY_NOT_FOUND","Passkey not found.");p.name=normalized;return {id:p.id,name:p.name,createdAt:p.createdAt};});
  }
  async removePasskey(id:string){
    return this.store.mutate(s=>{assertOrThrow(s.passkeys.length>1,409,"LAST_PASSKEY","The last administrator passkey cannot be removed.");const i=s.passkeys.findIndex(x=>x.id===id);if(i<0)throw new BridgeError(404,"PASSKEY_NOT_FOUND","Passkey not found.");const [removed]=s.passkeys.splice(i,1);return {id:removed!.id,name:removed!.name};});
  }
  async verifyCsrf(token:string,csrf:string){const a=sha256(token),b=sha256(csrf),s=await this.store.read();return s.sessions.some(x=>x.tokenHash===a&&x.csrfHash===b&&Date.parse(x.expiresAt)>Date.now());}
  private async consume(id:string,kind:CeremonyRecord["kind"]){return this.store.mutate(s=>{this.cleanup(s);const i=s.ceremonies.findIndex(x=>x.id===id&&x.kind===kind);if(i<0)throw new BridgeError(400,"PASSKEY_CEREMONY_INVALID","Passkey ceremony is missing or expired.");return s.ceremonies.splice(i,1)[0]!;});}
  private cleanup(s:State){const n=Date.now();s.ceremonies=s.ceremonies.filter(x=>Date.parse(x.expiresAt)>n);s.sessions=s.sessions.filter(x=>Date.parse(x.expiresAt)>n);}
}
