# Agent Rules

These rules apply to the whole repository.

## Scope

P4U Spatial is public software. Do not add private site data, credentials, real repository tokens, or RCHKB-specific knowledge to this repository.

## Open interoperability protocol invariants

- Core, Spatial and App Sync are implementation-neutral contracts.
- Spatial and App Sync both depend on Core but must not depend on each other.
- Authentication belongs to Core; contract-specific authorization is expressed with scopes and resource permissions.
- A spatial source is an authority; a route is only a transport path.
- Federation must preserve upstream `sourceId`.
- Multiple routes with the same `sourceId` represent one source, not duplicate sources.
- Route preference must never be interpreted as data authority.
- Provider and client caches are never canonical.
- Different route/principal access views must not be silently merged.
- Account Providers must not copy external provider data as a second canonical source.
- App Sync may carry opaque application payloads, including GeoJSON or pending provider operations, without becoming a Spatial Provider.
- Repository layout is a backend profile, not a protocol requirement.
- Portable backup is independent from Spatial and App Sync network availability.

## Architecture invariants

- The canonical protocol is headset-vendor-neutral.
- OpenXR is the preferred XR portability boundary.
- Vendor-specific APIs and identifiers stay behind adapter/binding layers.
- Prefer capability checks over hard-coded headset model checks.
- Headsets never receive Gitea or GitHub credentials.
- Pairing and device authorization are handled by the bridge.
- Gitea and GitHub are equal repository providers behind one interface.
- Raw scanner data, canonical model data and display data are separate layers.
- Raw data is preserved and must not be silently rewritten.
- Display data is generated and may be rebuilt.
- Headset cache is disposable; headset outbox is durable until acknowledged.
- Spatial uncertainty, provenance and coordinate-frame transforms must be explicit.
- Site-specific paths must be configurable. Never hard-code RCHKB paths.

## AI independence

AI/LLM/VLM processing is optional and must never be required for a fundamental workflow.

The following must remain deterministic and usable without an AI model:
- capture and raw-data persistence,
- device pairing and authorization,
- cache and durable outbox,
- upload/sync/retry/idempotency,
- coordinate conversion and rigid transforms,
- control-point registration,
- known marker/landmark bindings,
- schema validation,
- canonical data read/write,
- display generation where the input is already structured.

AI may assist with semantic recognition, classification, deduplication, conflict resolution, inferred relationships and user-facing suggestions. AI-derived changes must preserve provenance and confidence and must not silently replace source evidence.

## Standards

Prefer the standards documented in `docs/standards.md`. Do not replace a standard representation with a proprietary one without an ADR explaining why.
