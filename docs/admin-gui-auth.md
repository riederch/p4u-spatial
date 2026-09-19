# Admin GUI authentication

The P4U Bridge admin web interface uses WebAuthn/passkeys. The browser-facing administration plane shares the Bridge HTTP listener with the API; a second management port is not required.

## Configuration

Set both values:

```text
P4U_ADMIN_WEBAUTHN_RP_ID=p4u.example.at
P4U_ADMIN_WEBAUTHN_ORIGIN=https://p4u.example.at
```

For a Cloudflare Tunnel deployment, use the public HTTPS hostname as the WebAuthn origin and its registrable/appropriate hostname as the RP ID. Do not configure the RP ID as an internal IP, Docker name or changing tunnel URL.

## Bootstrap

The first administrator passkey is a privileged bootstrap operation and requires the existing `X-P4U-Admin-Key`. There is no unauthenticated first-user registration path.

After at least one passkey exists, additional passkeys require an authenticated passkey admin session. The admin key remains available for machine/API administration and recovery; it is not the intended browser GUI login mechanism.

## Endpoints

- `GET /api/v1/admin-auth/status`
- `POST /api/v1/admin-auth/register/options`
- `POST /api/v1/admin-auth/register/verify`
- `POST /api/v1/admin-auth/login/options`
- `POST /api/v1/admin-auth/login/verify`

The login verification creates a short-lived admin session plus a separate CSRF token. The eventual web GUI must keep the session in a Secure, HttpOnly, SameSite cookie and use the CSRF token for state-changing requests. Raw passkey credentials/private keys are never stored by the Bridge; only the WebAuthn public credential and counter are persisted.

## Cloudflare

Publishing the single Bridge port through Cloudflare Tunnel is compatible with this model. WebAuthn verification is bound to the configured public HTTPS origin, while device/API authentication remains independent.

Cloudflare Access may additionally protect browser administration, but interactive Access authentication must not be placed indiscriminately in front of headset/device API routes unless those routes have a non-interactive service-token design.

## Credential management UX

The admin GUI has a dedicated `/admin/credentials` page. Credential management is always available there and is independent of any reminder banner.

An administrator may register multiple passkeys. Each passkey can have a human-readable name, can be renamed, and can be removed. The last remaining passkey cannot be removed while passkey authentication is the only configured login path, preventing accidental lockout.

Credential-management API:

- `GET /api/v1/admin-auth/passkeys`
- `PUT /api/v1/admin-auth/passkeys/{passkeyId}`
- `DELETE /api/v1/admin-auth/passkeys/{passkeyId}`
- the existing registration endpoints add further passkeys when an authenticated admin session is present.

The planned authentication modes are:

1. passkey only; or
2. password + TOTP.

Both may be enabled concurrently. Password without TOTP is not a supported administrator login mode.

When both modes are enabled, the GUI may show a small friendly reminder suggesting passkey-only mode. The reminder only links to `/admin/credentials`; it never changes credentials directly. Closing it stores only a cosmetic browser cookie such as `p4u_passkey_only_reminder_dismissed=1`. The cookie does not alter authentication state, and the credential page remains permanently accessible through normal settings navigation.
