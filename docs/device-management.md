# Device Management

The Bridge / Home Assistant add-on is the trust authority for XR devices.

## Device information

The management UI should expose, where available:

- device name,
- platform and model,
- authorization state,
- online/offline or last seen,
- pairing time,
- application version,
- reported capabilities,
- granted scopes,
- active sessions,
- upload/scan history,
- optional site/project assignment.

## Device actions

### Disable

Temporary suspension.

- device identity is retained,
- API access is blocked while disabled,
- device can later be enabled again.

### Revoke

Permanent invalidation of the current authorization.

- all active access sessions are invalidated,
- refresh credentials become invalid,
- every subsequent API request from the old authorization is rejected,
- the headset returns to pairing state,
- reconnecting requires a new QR pairing.

A revoked credential must not become valid again by simply re-enabling a record.

### Delete

Deleting a management record is conceptually separate from revocation. Where audit history matters, revoke first and retain an audit event even if the visible device record is later removed.

## Local headset data after revocation

On `DEVICE_REVOKED` the client must clear bridge session credentials and leave the authorized application state.

Display cache is reconstructable and may be purged or rendered inaccessible according to deployment policy.

Unsent outbox data requires an explicit policy because it may contain source evidence not yet persisted by the bridge. It must not be silently destroyed merely as a generic cache cleanup operation.

## Local storage security

Secrets belong in platform secure storage / Android Keystore equivalents.

Where practical, cached building/site data should be encrypted at rest so possession of the headset does not directly expose spatial data.

A device that is offline cannot be remotely erased; revocation takes effect at the next bridge interaction.
