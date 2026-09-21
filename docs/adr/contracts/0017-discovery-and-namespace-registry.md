# ADR 0017: Discovery Identifier and Machine Namespace Registry

Status: accepted

## Decision

The draft protocol family keeps the human-readable name **Open Interoperability Protocol** and uses the machine discovery identifier:

```text
open-spatial-interop
```

Discovery is served at:

```text
/.well-known/open-spatial-interop
```

Canonical contract keys are lower-case kebab-case.

Capabilities and scopes use contract-prefixed dot namespaces such as:

```text
spatial.read
spatial.artifacts.read
federation.durable-relay
app-sync.write
xr.scan.write
```

## Consequences

Implementations have one deterministic discovery location during the draft v0.1 period.

App Sync remains semantically independent of Spatial despite participating in the same interoperability family.

The machine identifier is not tied to P4U/PICO and can survive later extraction of the protocol into a separate repository.

Legacy P4U XR scopes remain accepted as compatibility aliases but are not canonical protocol names.
