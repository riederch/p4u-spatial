# P4U Spatial Entwicklungsfortschritt

## Metadaten

| Feld | Wert |
| --- | --- |
| Standdatum | 2026-09-19 |
| Analysierter Branch | `main` |
| Analysierter Commit | `fe8ebb8d930a5da53549a77b41a95c04e0ab68fb` |
| Was dieses Dokument ist | Eine **Momentaufnahme** des aktuellen Entwicklungsstands, kein Journal. Es beantwortet „was ist gebaut und wie weit“; Architekturbegründungen gehören in `docs/architecture.md` und die ADRs, der zeitliche Verlauf in Git. |
| Hinweis | Prozentwerte sind grobe technische Reifegradschätzungen aus vorhandenem Code, Tests, Protokollverträgen, Deployment-Artefakten und noch fehlenden Produktpfaden. Dokumentierte Verträge zählen nicht als implementiert, solange kein entsprechender ausführbarer Pfad vorhanden ist. |

## Gesamtstatus

- Geschätzter Gesamtfortschritt: ca. **64 %**.
- Der stärkste Teil ist derzeit die **P4U Spatial Bridge**: Core-Discovery, Pairing, Device-/Session-Verwaltung, Spatial Read/Write, Git-/Filesystem-Repository-Provider, Federation, dauerhafte XR-Scan-Uploads, Kandidaten-Review und bestätigte Promotion sind als ausführbarer TypeScript-Pfad vorhanden.
- Der **PICO-Scanner** ist ein reales Android-Projekt und nicht mehr nur eine Spezifikation. Update-Discovery/-Verifikation, Bridge-Discovery, Pairing-/Session-Bausteine, sicherer Credential-Speicher, dauerhafte Scan-Outbox, Upload-Wiederaufnahme, Capture-Package-Helfer und deterministische Candidate-Derivation liegen im Repository. Die eigentliche MR-/OpenXR-Capture-Oberfläche und der durchgängige produktive Scan-Workflow auf echter PICO-Hardware fehlen noch.
- Die **XR-Portabilitätsgrenze** ist architektonisch klar definiert: OpenXR zuerst, Vendor-Fallbacks hinter Adaptern, Capability-Checks statt Modellchecks. Eine vollständige ausführbare OpenXR-/PICO-Adapterimplementierung ist im aktuellen Scanner jedoch noch nicht vorhanden.
- Das **Open Interoperability Protocol** ist als pre-1.0-Vertragsfamilie weit ausgebaut: Core, Spatial, Federation, XR, App Sync, Tiles, Portable Backup und Git-Repository-Profil besitzen Dokumentation und JSON-Schemas. Die P4U-Referenzimplementierung deckt vor allem Core + Spatial + Federation + XR ab; App Sync und Tiles sind überwiegend Vertrag/Conformance, nicht vollständiger Produktpfad dieser Anwendung.
- Die **XR-Capture-Pipeline** trennt immutable Rohdaten, Derived Candidates, Review und kanonische Spatial Writes. Kandidaten müssen Provenance und Confidence behalten; Review allein mutiert keine kanonischen Daten. Die Bridge besitzt dafür persistente Review-Daten und einen Preview/Confirm-Promotion-Pfad.
- Scan-Ingestion ist gegen unbegrenzte Staging-Daten gehärtet: Datei-, Einzelgrößen- und Gesamtgrößenlimits sind konfigurierbar; unvollständiges Staging kann nach Retention bereinigt werden, ohne committed Raw Scans oder die Headset-Outbox zu löschen.
- **Offline-Verhalten** ist als Semantik getrennt: Cache ist rekonstruierbar, Outbox ist Primärdatenhaltung bis zur dauerhaften Bestätigung, State enthält Sync-Metadaten, Credentials gehören in Secure Storage. Die Android-Outbox implementiert diesen Grundsatz bereits, die vollständige Offline-UX noch nicht.
- **Installation und Update auf der Brille** sind als XR-App-Lifecycle definiert: initiale signierte APK-Installation ist vom Pairing getrennt; spätere Updates werden über einen entdeckten `xr-app`-Vertrag gefunden, nach `versionCode`, Größe, SHA-256 und Android-Signer geprüft und anschließend über den Android/PICO-Installer angewendet. Ein plattformneutraler Updater-Referenzpfad und Android-Referenzklassen sind vorhanden.
- Die **Home-Assistant-App 0.0.1** ist als Multi-Arch-Image veröffentlicht. Der reale P4U-Bridge-Prozess ersetzt den früheren Bootstrap. Ein bestätigter Smoke-Test auf der Zielinstallation ist im Repository weiterhin nicht nachgewiesen; die Release-Dokumentation weist ausdrücklich darauf hin.
- Repository-Zugriff ist abstrahiert: Filesystem ist der deterministische Referenz-Backendpfad, GitHub und Gitea laufen über denselben generischen Git-Remote-Provider. Headsets erhalten keine Repository-Credentials.
- RCHKB bleibt ein **Profil über dem generischen Repository-Provider** und nicht Teil des offenen Protokolls. Direkte Writes auf die abgeleitete RCHKB-Spatial-Projektion sind standardmäßig deaktiviert, damit die kanonische Wissensbasis nicht umgangen wird.
- Sicherheitsgrenzen sind weitgehend festgelegt: Bridge als Trust Authority, kurzlebiges Pairing, Core-kompatible Bearer-Sessions, Revocation/Disable, Scopes, serverseitige Repository-Credentials, Signer-Verifikation für APKs und keine Vendor-ID als kanonische Spatial-ID. Produktive Härtung, echte Gerätevalidierung und vollständige Key-/Keystore-Lifecycle-Tests bleiben offen.
- Verifikationsstand: Das Repository enthält Typecheck-, Schema- und Vitest-Prüfungen sowie Bridge-, Federation-, Git-, RCHKB-, Scan-Limit-, Candidate-Review-, XR-App-Release- und Updater-Tests. Die GitHub-CI ist derzeit nur per `workflow_dispatch` auslösbar; für den analysierten Commit ist über den Connector kein frischer Workflow-Lauf nachgewiesen.

## Fortschrittsübersicht

### Programme und deploybare Anwendungen

Diese Teile sind eigenständige Programme, installierbare Anwendungen oder betreibbare Dienste.

| Programm / Anwendung | Wofür ist das da? | Fortschritt | Status | Nachgewiesener Stand | Verbleibende Lücken |
| --- | --- | ---: | --- | --- | --- |
| P4U Spatial Scanner | Android-/XR-Anwendung auf dem Headset für Aufnahme, Offline-Outbox, Sync und Darstellung. | 48 % | Teilweise implementiert | Buildbares Android-Projekt; Bridge- und Update-Discovery, Pairing-/Session-Klassen, Secure Session Store, dauerhafte Scan-Outbox, Resume-Upload, Capture-Package- und Candidate-Helfer sind vorhanden. | Echte MR/OpenXR-Capture-Oberfläche, Runtime-Sensoranbindung, durchgängige Scan-UX, Darstellung kanonischer Spatial-Daten und Hardwarevalidierung auf PICO 4 Ultra. |
| P4U Spatial Bridge | Eigenständig betreibbarer Node-Dienst und Trust-/Sync-/Repository-Grenze zwischen XR-Geräten und Spatial-Quellen. | 88 % | Weitgehend implementiert | Core/XR Discovery, Pairing, Sessions, Device Registry, Spatial Read/Write, Federation, Git-/Filesystem-Provider, XR-Scan-Ingestion, Limits/Retention, Candidate Review und bestätigte Promotion sind als Dienste und HTTP-Pfade vorhanden. | Betriebs-Härtung, vollständige Admin-/Management-UI, breitere Auth-Provider, produktive Observability und reale Langzeit-/Hardwaretests. |
| P4U Spatial HA App | Installierbares Home-Assistant-Paket der Bridge mit persistenter Datenhaltung. | 72 % | In Arbeit | Version 0.0.1 ist veröffentlicht, Multi-Arch-Image und Releaseworkflow sind definiert; Bridge läuft als App-Prozess mit persistentem `/data`. | Bestätigter Smoke-Test auf der Zielinstallation, reale Updatevalidierung, Bedien-/Admin-Flächen und Betriebsbeobachtung. |
| Scanner Simulator | Eigenständiges Entwicklungswerkzeug zum Ausüben von Bridge-Pfaden ohne XR-Hardware. | 78 % | Nutzbar | Pairing, Device-Abfrage und Demo-Upload können zentrale Bridge-Pfade ohne Brille ausüben. | Breitere Simulation echter Capture-Pakete, Offline-/Retry-Fehlerbilder und Candidate-/Promotion-Flows. |

### Bibliotheken und interne Komponenten

Diese Teile werden von Programmen verwendet oder bilden wiederverwendbare interne Schichten. Sie sind keine eigenständigen Protokollstandards.

| Bibliothek / Komponente | Fortschritt | Status | Nachgewiesener Stand | Verbleibende Lücken |
| --- | ---: | --- | --- | --- |
| Repository Providers | 86 % | Weitgehend implementiert | Filesystem-Referenzprovider und generischer Git-Remote-Provider; GitHub/Gitea teilen denselben Pfad; RCHKB-Profil mit standardmäßig read-only Spatial-Projektion. | Weitere Providerprofile, robustere Fehler-/Recovery-Szenarien und breitere produktive Repository-Validierung. |
| XR Updater Reference | 76 % | Implementierter Referenzbaustein | Plattformneutraler Zustandsautomat für Check → Download → Size/SHA-256 → Signer-Verifikation → Install → Restart-Verifikation; eigener Workspace mit Tests. | End-to-End-Nachweis auf realer PICO-Hardware und produktiver Releasekanal mit langfristigem Signing-Key-Betrieb. |
| XR Spatial Adapter | 22 % | Konzipiert / begonnen | Capability-Modell und OpenXR-first-Regeln sind dokumentiert; Vendor-IDs bleiben Bindings statt Canonical IDs. | Konkrete OpenXR-Laufzeit, PICO-Adapter, Scene/Mesh/Anchor-Capture, Capability-Probing und Tests auf Hardware. |
| XR Capture + Candidate Pipeline | 70 % | In Arbeit | Immutable Raw Capture, scan-lokale Frames, Evidence-Provenance, deterministische Candidate-IDs, Review sowie Preview/Confirm-Promotion sind vorhanden. | Reale Sensor-/Scene-Daten, geometrische Ableitung, UI-Review und belastbare Promotion in echte produktive Quellen. |
| Offline Storage / Sync | 58 % | Teilweise implementiert | Cache/Outbox/State/Secure-Grenzen sind definiert; Scanner besitzt eine dauerhafte Scan-Outbox und Resume-Upload. | Vollständige Offline-UX, Display-Cache, Retry-Backoff, Crash-/Power-Loss-Tests und Beobachtungs-Outbox. |
| AI-/Agent-Assistenz | 42 % | Optional / teilweise | Candidate-Ableitung und Review-Grenze sind so gebaut, dass AI nicht nötig ist; Provenance/Confidence und explizite Promotion sind festgelegt. | Reale optionale VLM/LLM-Adapter, Vergleich mit deterministischen Verfahren und produktive Review-UX. |

### Protokolle, Profile und Standards

Hier stehen offene Verträge sowie externe Normen und Konventionen. Bei externen Standards bezeichnet der Stand den **Integrationsgrad in P4U Spatial**, nicht die Reife des Standards selbst.

| Protokoll / Standard | Typ | Stand | Nachgewiesener Einsatz | Verbleibende Lücken |
| --- | --- | --- | --- | --- |
| Core Contract v0.1 | P4U-Vertrag | In Arbeit | Discovery, stabile Instance Identity, Core Principal, gemeinsame Auth-/Scope-Grenze und Fehlerhülle sind spezifiziert; Bridge besitzt ausführbare Referenzpfade. | Breitere unabhängige Implementierungen und vollständige Conformance-Automatisierung. |
| Spatial Read/Write v0.1 | P4U-Vertrag | Weitgehend implementiert | Source-/Route-Trennung, Access Views, Snapshots, revisionsgebundene Writes, Konflikte, Relations und Artifacts sind definiert; Bridge implementiert Read/Write gegen Repository-Provider. | Mehr reale Provider, breite Geo-/3D-Interoperabilität und vollständige externe Conformance. |
| Federation v0.1 | P4U-Vertrag | Weitgehend implementiert | Upstream-`sourceId` bleibt erhalten; Delivery Provenance, Cache und durable relay mit operationId-Erhalt sind implementiert und getestet. | Delegated-user-Flows, mehrere produktive Upstreams und Langzeitbetrieb. |
| XR Profile v0.1 | P4U-Vertrag | In Arbeit | Pairing, Device Descriptor, Scan/Observation/Task-Verträge, Bridge API, Capture Package, Candidate Review und App Lifecycle sind definiert; Bridge implementiert zentrale XR-Pfade. | Vollständiger Hardwareclient, MR-Capture und unabhängige XR-Implementierung. |
| XR App Lifecycle v0.1 | P4U-Profil | In Arbeit | Signed APK Bootstrap, Release Discovery, VersionCode-, Size-, Digest- und Signer-Prüfung sowie interaktiver Android-Installer sind spezifiziert und referenziert implementiert. | Produktiver Signier-/Releasekanal, unattended/MDM-Varianten und Realgerät-End-to-End-Test. |
| App Sync | P4U-Vertrag | Vertrag vorhanden | Eigenständiger Core-abhängiger Vertrag und Schemas sind vorhanden; klare Trennung zu Spatial ist festgelegt. | Vollständige P4U-Laufzeitimplementierung und unabhängige Client/Server-Conformance. |
| Tiles / Offline Tiles | P4U-Vertrag | Vertrag vorhanden | Contract-/Conformance-Grundlage für Tiles und Offline-Pläne ist vorhanden. | Referenzdienst, Clientintegration und große reale Datensätze. |
| Conformance Suites | P4U-Konformitätsprofile | In Arbeit | Getrennte Suites für Core, Spatial Read/Write, Artifacts, Relations, Tiles, App Sync, Federation, XR, Git Repository und Publish; Schema-Referenzprüfung und mehrere ausführbare Bridge-Tests. | Vollständiger maschineller Runner mit semantischer JSON-Schema-Validierung und unabhängigen Implementierungen als Gegenprobe. |
| OpenXR 1.1 | Externer XR-Standard | Normative Portabilitätsgrenze; Implementierung begonnen | Architektur und Capability-Modell legen OpenXR als bevorzugte Runtime-Grenze fest. | Vollständiger Adapter und reale PICO-4-Ultra-Laufzeitvalidierung. |
| OGC GeoPose 1.0 / LTP-ENU | Externer Geospatial-Standard | Architekturgrundlage | Earth-referenced Pose und site-lokale East-North-Up-Konvention sind in der Spatial-/Site-Mapping-Architektur vorgesehen. | Durchgängige Laufzeitumsetzung und reale Registrierungsdaten. |
| ISO 19111 / WKT2 / EPSG | Externe CRS-Standards | Architekturgrundlage | CRS-Identität und Transformationen müssen explizit bleiben; registrierte EPSG-IDs und WKT2 sind vorgesehen. | Breitere Import-/Export- und Transformationsimplementierung. |
| glTF 2.0 / GLB | Externer 3D-Standard | Teilweise integriert | Bevorzugtes Format für portable Render-/Mesh-Artefakte und im Capture-Package vorgesehen. | Reale Mesh-Exports aus XR-Runtimes und durchgängiger Viewerpfad. |
| CityGML 3.0 / CityJSON 2.x | Externe Gebäudestandards | Semantische Referenz | Gebäude- und Built-Environment-Semantik soll kompatibel bleiben, ohne das interne Modell daran zu binden. | Konkrete Import-/Exportpfade und Mapping-Tests. |
| IndoorGML 2.0 | Externer Indoor-Standard | Semantische Referenz | Konzepte für Innenraumzellen, Konnektivität und Navigation sind als Ergänzung zur Geometrie vorgesehen. | Konkrete Topologie-/Navigationsimplementierung. |
| GeoJSON RFC 7946 | Externer Geodatenstandard | Teilweise integriert | Vorgesehen für leichte 2D-Geodaten und Footprints; nicht als Format für hochpräzise lokale 3D-Scans. | Breitere reale Spatial-Import-/Exportpfade. |
| OGC 3D Tiles 1.1 | Externer 3D-Geospatial-Standard | Vorgesehen | Als optionaler zukünftiger Pfad für große geospatiale 3D-Daten dokumentiert. | Referenzdienst, Streaming und Clientintegration. |
| JSON Schema 2020-12 | Externer Schema-Standard | Aktiv eingesetzt | Versionierte JSON-Schemas liegen unter `protocol/schemas/`; lokale Referenzen werden maschinell geprüft. | Vollständige semantische Schema-Validierung im Conformance Runner. |
| UUID RFC 9562 / RFC 3339 / ISO 8601 | Externe Identitäts-/Zeitkonventionen | Aktiv eingesetzt / vorgeschrieben | UUIDv7 wird für neue zeitgeordnete technische IDs bevorzugt; Zeitstempel müssen explizite Offsets tragen. | Durchgängige Konformitätsprüfung über alle Implementierungen. |

## P4U Spatial Scanner

- Das Repository enthält unter `clients/pico-scanner/` ein echtes Android-Projekt.
- Der aktuelle UI-Pfad konzentriert sich noch auf Bridge-/Update-Konfiguration und Updateprüfung; die eigentliche Scan-Oberfläche ist noch kein fertiger Produktpfad.
- Pairing, Bridge Discovery, Authenticated Bridge Client, Device Identity, Secure Session Store, Scan Outbox, Outbox Uploader, Capture Package und Candidate Derivation liegen als getrennte Bausteine vor.
- Die Outbox behandelt noch nicht bestätigte Captures als Primärdaten und löscht sie erst nach erfolgreichem dauerhaften Commit.
- Capture Packages unterstützen scan-lokale Frames, Trajektorien, Capture Intent und Anchor-Bindings; Vendor-Anker werden nicht als kanonische Objektidentität verwendet.
- Der nächste Reifegrad hängt nicht an weiterer Protokolldokumentation, sondern an realer XR-Capture-Integration, Bedienpfad und Hardwarevalidierung.

## XR Spatial Adapter

- Die Architektur fordert eine capability-driven OpenXR-Grenze.
- OpenXR core und portable Extensions sind bevorzugt; PICO-spezifische APIs dürfen nur hinter Adapter-/Binding-Schichten liegen.
- Runtime Capabilities, Protocol Capabilities und Authorization Scopes sind getrennte Kategorien.
- Ein vollständiger ausführbarer Adapter, der Scene Capture, Mesh, Anchors, Tracking und weitere PICO-4-Ultra-Fähigkeiten normalisiert, ist im analysierten Stand noch nicht vorhanden.
- Dieser Bereich ist daher deutlich weniger weit als Bridge und Protokoll.

## P4U Spatial Bridge

- Die Bridge ist die Trust Authority für XR-Geräte und hält Repository-/Federation-Credentials serverseitig.
- Pairing, Session Refresh/Logout, Device Registry und revocation-fähige Autorisierung sind implementiert.
- Spatial Read und Spatial Write laufen gegen eine Repository-Provider-Abstraktion.
- Federation hält Source Authority und Route auseinander; Upstream-`sourceId` und `operationId` werden bewahrt.
- XR-Scans werden als dreistufige, idempotente Transaktion angenommen: Manifest, Files, Commit.
- Upload-Limits und Staging-Retention schützen die persistente Zustandsfläche; Cleanup betrifft nur unvollständiges Staging.
- Candidate Review ist persistent. Accepted/edited Candidates können einen Spatial-Operation-Draft erzeugen; Promotion verwendet Preview + `confirmationToken` und anschließend den normalen idempotenten Spatial-Write-Pfad.
- Direkte Candidate-Promotion ist für read-only Quellen wie das Standard-RCHKB-Profil nicht verfügbar.

## P4U Spatial HA App

- `p4u_spatial/` enthält die Home-Assistant-App.
- Version `0.0.1` ist als Multi-Arch-Image veröffentlicht.
- Persistenter Zustand und Repositorydaten liegen unter Home-Assistant-App-Storage.
- Veröffentlichung ist bewusst vom normalen `main`-Entwicklungsfluss getrennt und wird über `ha-release` bzw. manuelles Dispatch gesteuert.
- Das Repository dokumentiert aktuell noch keinen erfolgreichen Smoke-Test der Zielinstallation; damit ist die reale Installations-/Startvalidierung offen.

## Repository Providers

- Das Filesystem-Backend ist die deterministische Referenz.
- GitHub und Gitea werden über denselben generischen Git-Remote-Provider behandelt; das offene Spatial-Protokoll hängt nicht an deren REST-APIs.
- Clone/Refresh, lokale Commits und non-force Pushes gehören zum Providerpfad.
- Headsets kennen weder Git-URL-Credentials noch Provider-Tokens.
- RCHKB wird als Repository-Profil abgebildet. Die lokale Spatial-Projektion bleibt standardmäßig nicht direkt schreibbar, damit die kanonische RCHKB-Wissenspflege Autorität behält.

## Open Interoperability Protocol

- Der Maschinen-Identifier lautet aktuell `open-spatial-interop`; der Vertragsstand ist draft/pre-1.0.
- Core ist die gemeinsame Discovery-/Identity-/Auth-Grenze.
- Spatial modelliert Source Authority unabhängig von Route/Transport.
- Federation vermittelt Routen, Cache und optional durable relay, ohne selbst Quelle zu werden.
- XR ergänzt geräte- und capture-spezifische Profile.
- App Sync bleibt von Spatial unabhängig und darf nicht implizit publizieren.
- Repository-Layouts sind Backendprofile, kein Protokollerfordernis.
- Committed Spatial Artifacts sind immutable.
- Die hohe Dokumentations- und Schemaabdeckung ist kein Ersatz für unabhängige Implementierungen; diese bleiben ein wichtiger fehlender Reifegradnachweis.

## Installation und Update des XR-Clients

- Die Erstinstallation erfolgt über eine vertrauenswürdig bezogene, signierte APK und ist ausdrücklich vom Bridge-Pairing getrennt.
- Nach der Installation wird die Bridge konfiguriert/gefunden und erst danach die Geräteautorisierung per QR-Pairing aufgebaut.
- Updates werden über den entdeckten `xr-app`-Vertrag bezogen.
- Vor Installation werden Plattform, `versionCode`, Paketgröße, SHA-256 und Android-Signing-Identität geprüft.
- Ein Update darf Outbox, Pairing-Identität, Refresh Credentials und andere Primärdaten nicht löschen.
- Wenn PICO/Android keine unbeaufsichtigte Installation zulässt, ist `user-action-required` ein gültiger normaler Zustand und kein Fehler.
- Erfolg gilt erst nach Neustart und Bestätigung des installierten `versionCode`.
- Ein echter End-to-End-Nachweis dieses Ablaufs auf der Zielbrille fehlt im analysierten Repository-Stand.

## Conformance und Tests

- `npm run check` kombiniert TypeScript-Typecheck, Schema-Referenzprüfung und Vitest.
- Bridge-Tests decken unter anderem E2E, Federation, Git Remote, RCHKB-Profil/-Integration, Scan-Limits, Candidate Review und XR-App-Releases ab.
- Der Updater-Referenzworkspace besitzt eigene Tests.
- `conformance/` trennt Suites nach Contract/Profile statt einen monolithischen „alles kompatibel“-Schalter zu verwenden.
- Die aktuelle Conformance-Beschreibung nennt Core, Spatial Read/Write, Artifacts, Relations, Tiles, App Sync, Federation, XR, Git Repository und Publish.
- Vollständige semantische JSON-Schema-Validierung und ein unabhängiger umfassender Conformance-Runner sind noch nicht fertig.
- Reale PICO-Hardwaremessung ist durch Hosttests oder Simulatoren nicht ersetzt.

## Architekturentscheidungen und ADRs

- Die zentrale Systemgrenze ist stabil: **XR Headset → Scanner Core → OpenXR-first Adapter → P4U Spatial Bridge → Repository Provider/Federation**.
- Rohdaten, kanonisches Spatial-Modell und Displayprojektion sind getrennte Ebenen.
- Raw Evidence wird nicht stillschweigend überschrieben; Displaydaten sind generiert und rekonstruierbar.
- Canonical Spatial IDs sind vendor-neutral. PICO-/Runtime-Anker bleiben Bindings/Provenance.
- Source Authority und Transport Route sind getrennt; Federation darf keine neue Autorität erfinden.
- Headset Cache ist disponibel, Outbox dagegen bis zum Acknowledgement dauerhaft.
- AI/VLM/LLM ist optional. Grundfunktionen wie Capture-Persistenz, Pairing, Sync, Koordinatentransformation, Schema-Validierung und strukturierte Darstellung müssen deterministisch funktionieren.
- Koordinatenrahmen und Unsicherheit müssen explizit bleiben. Site-Mapping darf Long-Range-Drift nicht als exakte globale Pose behandeln.
- Installation/Update und Geräte-Pairing sind getrennte Trust-Flows.
- RCHKB-spezifische Pfade oder privates Sitewissen dürfen nicht in das öffentliche Repository eingebaut werden.

## Pflegeanweisung für Aktualisierungen

Wenn der Auftrag „aktualisiere progress.md“ lautet, diese Datei anhand des aktuellen Repository-Stands aktualisieren:

1. Branch, Commit, vorhandenen Code, Tests, Protokollschemas, Deployment-Dateien und offene Platzhalter direkt prüfen.
2. Dokumentation und ADRs nur ergänzend verwenden; ein Vertrag gilt erst als implementiert, wenn ein entsprechender ausführbarer Pfad oder belastbarer Test vorhanden ist.
3. Bestehende Struktur, Reihenfolge und kurze Form beibehalten; Prozentwerte nur bei nachvollziehbarer Änderung des tatsächlichen Reifegrads anpassen.
4. Die Datei beschreibt ausschließlich den absoluten Zustand am analysierten Commit. Keine Änderungschronik und keine Formulierungen wie „seit der letzten Aktualisierung“ aufnehmen.
5. Keine Arbeitsplanung, Prioritätenliste oder „nächsten Schritte“ in diese Datei schreiben. `progress.md` beschreibt Zustand und Lücken, nicht die Reihenfolge zukünftiger Arbeit.
6. Bestehende Aussagen durch den aktuellen Zustand ersetzen; Git-Historie und Commits bilden den zeitlichen Verlauf.
7. Offene Lücken und Risiken als gegenwärtige Eigenschaften benennen, nicht als Arbeitsauftrag formulieren.
8. Die Fortschrittsübersicht dauerhaft in drei getrennten Tabellen führen: **Programme und deploybare Anwendungen**, **Bibliotheken und interne Komponenten** sowie **Protokolle, Profile und Standards**. Einträge nicht zwischen diesen Kategorien vermischen.
9. Zwischen **konzipiert**, **dokumentiert**, **teilweise implementiert**, **weitgehend implementiert** und **praktisch auf realer Hardware nachgewiesen** klar unterscheiden.
10. Hardwarevalidierung niemals aus Simulator-, Hosttest- oder Dokumentationsstatus ableiten.
11. Site-spezifische oder private RCHKB-Inhalte dürfen nicht in `progress.md` aufgenommen werden; nur die generische Integrationsgrenze beschreiben.
12. Bei einem reinen Auftrag zur Aktualisierung von `progress.md` ausschließlich diese Datei verändern.
