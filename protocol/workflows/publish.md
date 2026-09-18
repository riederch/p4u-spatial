# Publish Workflow v0.1

Publish is a client workflow that bridges local/application-owned data into an authoritative Spatial Content Provider.

It is deliberately NOT a new network contract and NOT an implicit App Sync feature.

## Boundary

Before publication, imported or locally created MultiGIS data is application workspace state.

It may be backed up/synchronized through App Sync but is not automatically a Spatial Source visible to other clients.

```text
Local / App-Sync Workspace
          |
          | explicit Publish
          v
Spatial Content Provider
          |
          v
authoritative source/object identities
```

App Sync never publishes provider data merely by storing it.

## v0.1 destination

v0.1 publishes into an existing writable Spatial Source/collection.

Creating a brand-new provider source is provider-specific and outside v0.1.

Possible destinations include a Fire Content Provider or a Git/RCHKB adapter that explicitly permits writes/proposals.

## Local identity

Local workspace IDs are application identities.

They MUST NOT be presented as protocol `sourceId` values before publication.

Publication records the mapping:

```text
localObjectId
      ->
(sourceId, objectId)
```

returned by the authoritative provider.

## Publish job

A client SHOULD persist an account-scoped publish job containing:

- stable publishId,
- immutable/frozen input revision,
- target source/collection,
- per-object Spatial operationId,
- artifact upload IDs where needed,
- local-to-published identity mapping,
- state/error/conflict information.

Because the job is normal application state, App Sync may back it up and make it available on another device.

The Account Provider does not execute the publish job.

## Recommended order

For a local dataset containing binary attachments and relations:

```text
1. freeze local input revision
2. verify destination route/capabilities
3. upload/commit required artifacts
4. create ordinary objects/features
5. record authoritative object IDs/revisions
6. rewrite local relation endpoints through the mapping
7. create relation objects
8. mark publish job complete
```

This order avoids publishing relations to not-yet-known server-assigned object IDs.

## Idempotency

Every published Spatial object uses a stable client-generated `operationId`.

Retries, route failover or another device continuing the job MUST reuse the same operation IDs.

Source-wide Spatial idempotency therefore prevents duplicate objects after lost responses or multi-device continuation.

Artifact uploads similarly reuse their stable upload IDs.

## Partial publication

v0.1 does not promise a distributed rollback.

If 70 of 100 objects are committed and connectivity is lost, the publish job is `partial`.

The client resumes only the unfinished logical operations using the already assigned IDs.

Already source-committed objects are not recreated.

## Multi-device continuation

Another device may continue a synchronized publish job if it has:

- the required local/app-synced payloads/blobs,
- authorization to the destination Spatial route,
- the original operation/upload IDs.

The Account Provider itself is not automatically an executor.

## After publication

Publishing is copy/promotion, not continuous synchronization.

After success:

```text
local workspace object
and
published Spatial object
```

are independent unless a future explicit linked-publication/synchronization profile is enabled.

v0.1 MUST NOT silently propagate later edits or deletes in either direction.

The publish record retains the mapping so the user can explicitly navigate to or manage the published copy.

## Re-publish/update

Automatic re-publish is outside v0.1.

An explicit future workflow may update a known published object using its current authoritative revision.

Until then, a second publish action is treated as a new user decision and MUST NOT silently overwrite the first publication.

## Relations

A local relation between two local objects is published only after both endpoint mappings are known.

Example:

```text
local:asset-1 -> (WWG, asset:4711)
local:room-2  -> (RCHKB, room:hgb:2:14)

local relation
    ↓ rewrite refs
WWG relation assertion or another chosen relation authority
```

The user/workflow must select a relation-authority source that permits relation writes.

## Provider outbox

If a Publish step cannot be delivered immediately, its Spatial operations may live in the normal Provider Outbox and be backed up through App Sync.

Publish does not define a second outbox mechanism.

## Portable backup

An unfinished publish job, its identity mapping and uncommitted provider operations are backup-relevant state and SHOULD be included in Portable Backup.

## Security

Publish never transfers Account Provider credentials to a Spatial Provider or vice versa.

Each destination route is authorized independently through Core authentication.
