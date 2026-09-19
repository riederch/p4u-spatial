# Admin GUI authentication

The P4U Bridge serves its administrator web interface on the same HTTP listener as the API. A second management port is not required.

## Authentication model

Each administrator has a persistent user identity.

A user may enable either or both of these independent login methods:

1. **Passkey** — WebAuthn login without password or OTP.
2. **Username + password + TOTP** — password alone is never a valid administrator login.

Multiple passkeys may be registered for the same administrator. Passkeys are bound to the administrator's stable user ID, not to the username.

If both methods are enabled, both remain valid in parallel until the administrator explicitly disables password + TOTP.

## First-run bootstrap

A fresh Bridge installation enters setup mode when no usable administrator login exists.

The Bridge generates a short-lived one-time setup proof and prints it to the process log. The administrator opens `/admin`, enters that proof, creates the initial administrator identity, and configures at least one permanent login method.

The setup proof is consumed once a permanent login method is configured. A permanent deployment-level `P4U_ADMIN_KEY` is not required by the target first-run flow.

`X-P4U-Admin-Key` may still exist as a technical compatibility/recovery mechanism when explicitly configured; it is not the normal browser login path.

## Browser session and CSRF

A successful browser login creates a server-side administrator session.

The browser receives:

- `p4u_admin_session` — `Secure`, `HttpOnly`, `SameSite=Strict`;
- `p4u_admin_csrf` — `Secure`, `SameSite=Strict`, readable by the GUI so it can send `X-P4U-CSRF` on state-changing requests.

State-changing administrator requests authenticated through the browser session require a valid CSRF token. Disabling an administrator revokes that user's active administrator sessions.

## Passkeys

The Bridge stores only WebAuthn public credential material and counters. Private passkey keys never leave the authenticator.

An administrator may register multiple passkeys. Each passkey can be named, renamed and removed. The final passkey may only be removed when another valid login method remains, currently password + TOTP.

## Password + TOTP

Password + TOTP is an optional full alternative to passkey login. Username, password and a current TOTP code are all required; password-only login is never accepted. Enrollment becomes active only after a valid TOTP confirmation.

## Credential-management UX

`/admin/credentials` is always available to an authenticated administrator.

When both passkey and password + TOTP are active for the current user, the dashboard may show a small reminder suggesting passkey-only mode. The reminder only links to `/admin/credentials`, never changes credentials directly, and can be dismissed with the cosmetic cookie `p4u_passkey_only_reminder_dismissed=1`.

## WebAuthn origin and Bridge configuration

WebAuthn is bound to a stable RP ID and origin. For a Cloudflare Tunnel deployment, the public HTTPS hostname is the normal WebAuthn origin. Internal IP addresses, Docker names and temporary tunnel hostnames are unsuitable as long-lived WebAuthn origins.

The RP ID and origin are operator-facing Bridge settings and are persisted through the Bridge configuration store. Environment variables remain migration/bootstrap compatibility only and must not become a parallel functional configuration model.

## Relevant endpoints

Setup: `GET /api/v1/setup/status`, `POST /api/v1/setup/admin`.

Login/session: `GET /api/v1/admin-auth/status`, `GET /api/v1/admin-auth/me`, `POST /api/v1/admin-auth/login/options`, `POST /api/v1/admin-auth/login/verify`, `POST /api/v1/admin-auth/password-totp/login`, `POST /api/v1/admin-auth/logout`.

Credential management: `POST /api/v1/admin-auth/register/options`, `POST /api/v1/admin-auth/register/verify`, `GET /api/v1/admin-auth/passkeys`, `PUT /api/v1/admin-auth/passkeys/{passkeyId}`, `DELETE /api/v1/admin-auth/passkeys/{passkeyId}`, `POST /api/v1/admin-auth/password-totp/setup`, `POST /api/v1/admin-auth/password-totp/setup/confirm`, `DELETE /api/v1/admin-auth/password-totp`.

## Remaining product-level work

The authentication backend and credential GUI are implemented. Full multi-user administration and user-to-device assignment still need their final operator-facing GUI workflows even though the backing APIs/data model exist.
