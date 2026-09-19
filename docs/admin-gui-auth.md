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
