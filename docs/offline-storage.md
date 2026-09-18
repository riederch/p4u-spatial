# Headset Offline Storage

Local headset storage is divided by semantics, not merely by file type.

```text
app storage
├── cache/
│   └── display/
│       ├── current/
│       └── previous/
├── outbox/
│   └── <scan-id>/
├── state/
└── secure credentials
```

## Cache

Cache contains server-derived, reconstructable display data.

- disposable,
- versioned by display revision,
- safe to rebuild,
- keep at least current revision,
- keeping one previous known-good revision is recommended for rollback.

The UI should expose when cached data is stale/offline.

## Outbox

Outbox contains primary data not yet durably acknowledged by the bridge.

- never evicted by cache cleanup,
- retry-safe,
- each item uses a stable scan/observation ID,
- content is hashed,
- deletion is allowed only after successful durable bridge acknowledgment.

## State

Contains non-secret synchronization metadata such as:

- current display revision,
- pending item status,
- last successful sync,
- retry metadata.

## Credentials

Long-lived device credentials and refresh credentials are stored in secure platform storage, not plain application files.

## Offline behavior

When the bridge is unavailable:

- display cached data,
- continue captures where device capability allows,
- persist new captures to the outbox,
- synchronize later without creating duplicates.

The UI should clearly show offline/stale state and the number of pending outbox items.
