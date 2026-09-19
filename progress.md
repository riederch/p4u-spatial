# P4U Spatial Entwicklungsfortschritt

## Metadaten

| Feld | Wert |
| --- | --- |
| Standdatum | 2026-09-19 |
| Analysierter Branch | `main` / Review-Closeout |
| Basis-Commit vor Closeout | `b092548cec4c599b81c77b45e720d82292b18fc4` |
| Zweck | Aktuelle Momentaufnahme nach dem Pre-Praxistest-Review. Architekturentscheidungen stehen in ADRs; offene Hardwarevalidierung ist in `docs/review-closeout-2026-09-19.md` festgehalten. |

## Gesamtstatus

- Die Bridge ist buildbar, CI-validiert und besitzt Core/XR-Discovery, Pairing, Device-/Session-Verwaltung, Spatial Read/Write, Federation, Repository-Provider, Scan-Ingestion, Candidate Review und bestätigte Promotion.
- Die Administratoroberfläche ist auf dem Bridge-Port verfügbar. First-run-Setup, persistente Bridge-Konfiguration, Passkeys, Username + Password + TOTP, CSRF und browsergebundene Admin-Sessions sind implementiert.
- Die funktionale Bridge-Konfiguration ist Bridge-eigener persistenter Zustand. Die Home-Assistant-App enthält keine parallele funktionale Optionsstruktur mehr (`options: {}`, `schema: {}`).
- Der PICO-Scanner ist ein buildbares Android-Projekt. Multi-Bridge-Profile, Discovery, Local/Public-Routing, Pairing, Secure Session Store, Outbox, synthetischer Testscan-Upload und App-Updatepfad sind verdrahtet.
- Die GitHub-CI läuft auf Pull Requests und `main` und prüft TypeScript/Schemas/Tests, PICO-Debug-APK und HA-Container-Build.
- Node-Abhängigkeiten sind durch ein committed `package-lock.json` reproduzierbar.
- Der PICO-Build verwendet den committed Gradle Wrapper 9.7.1.

## Was für den ersten Praxistest bereits vorhanden ist

### Bridge / Backend

- ein Bridge-Port für UI und API;
- First-run-Setup mit einmaligem Setup-Code;
- persistente operator-facing Bridge-Konfiguration;
- mehrere Administrator-Benutzer im Backend;
- mehrere Passkeys je Benutzer;
- Passkey-only oder Username + Password + TOTP als unabhängige Loginwege;
- optionale `assignedUserId`-Zuordnung von Geräten;
- mehrere Geräte pro Benutzer möglich;
- Poolgeräte ohne Benutzerzuordnung möglich;
- Pairing-Claims, explizite Freigabe und revokierbare Device-Sessions;
- persistente Scan-Outbox-Verarbeitung und idempotenter Commitpfad.

### PICO / Android

- lokaler Brillenname;
- mehrere benannte Bridge-Profile;
- Local/Public-Adressen pro Bridge;
- `instanceId`-Validierung vor Vertrauen in alternative Adressen;
- local-first/public-fallback;
- QR-Pairing-Payload-Verarbeitung und Session-Bootstrap;
- sicherer Refresh-Credential-Speicher pro Bridge-Profil;
- synthetischer Testscan über echte Outbox und authentifizierten Upload;
- Debug-Build erlaubt LAN-HTTP; Release bleibt cleartext-disabled;
- Update-Discovery, Download, Size/SHA-256-/Signer-Prüfung und interaktiver Installer.

## Noch nicht als fertig zu markieren

### Hardwareabhängig

- echte Installation/Sideload auf PICO 4 Ultra;
- Pairing auf realer PICO-Hardware;
- Netzwerkwechsel local/public auf realer Infrastruktur;
- Session-/Outbox-Recovery nach App-/Geräteneustart;
- realer APK-Updatezyklus auf der PICO;
- OpenXR-Capability-Probing;
- echte Scene-/Mesh-/Anchor-/Tracking-Daten;
- Langzeit-, Crash- und Power-Loss-Tests.

Diese Punkte bleiben ausdrücklich **pending**, bis sie auf realer Hardware validiert wurden.

### Produkt-UX

- produktive MR/OpenXR-Capture-Oberfläche;
- vollständige GUI für mehrere Admin-Benutzer;
- vollständige GUI für Geräte↔Benutzer-Zuordnung;
- reichere Offline-/Retry-UX und Display-Cache.

## Verifikation

- `npm run check` wird in CI ausgeführt.
- PICO `:app:assembleDebug` wird in CI ausgeführt.
- Der HA-Container wird in CI gebaut.
- PRs werden erst nach grüner CI gemergt.
- `ha-release` bleibt vom normalen `main`-Entwicklungsfluss getrennt und wird nicht automatisch vorgezogen.

Siehe auch `docs/review-closeout-2026-09-19.md`.
