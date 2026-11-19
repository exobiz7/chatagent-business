# ChatAgent Business v1.1 — B-S6G-5F Consent UI Security Preparation

Date: 2026-11-05 KST
Decision: **PREVIEW-ONLY SECURITY PREPARATION PASS / OAUTH EXTERNAL ENABLEMENT NOT AUTHORIZED / CUTOVER NO-GO**.

## Source-first preflight

- Canonical Mac Studio project: `/Volumes/SSD 4T/z_proj/proj04_chatagent/chatagent_business`, branch `feat/business-v1.1-bs3-runtime-routing`.
- Start HEAD and upstream: `831b6996c2b78305cf8127416c831a5522727df2`, clean.
- Existing Business v1.0 operator RUNNING/healthy PID 13607 and server 31850 /health, tunnel 51950 /healthz and /readyz all HTTP 200. No production process/config change.
- User explicitly canceled the unsaved Supabase OAuth Server toggle. Independent subsequent GET-only live Supabase Auth check shows **OIDC Discovery 200 / OAuth Authorization Server Discovery 404**, consistent with not having enabled OAuth Server. This GET result does not independently prove dashboard toggle state; no activation was performed.
- New Business v1.1 Production Supabase ref is `hjgerbyofaxyfqdckret`. The one-time release-org ADMIN bootstrap already exists; no additional user, role, importer or data migration was created.

## New isolated consent design assets

1. `scripts/business/v1.1/bs6g5f-consent-policy.mjs`: pure fail-closed validation of an explicitly registered UUID client ID, exact trusted HTTPS redirect URI, nonempty authorization ID, bounded allowed scopes (current proposed `openid email profile`) and callback origin/path.
2. `scripts/business/v1.1/bs6g5f-consent-flow.mjs`: **non-executing future candidate** for existing-user Auth, requires release-org ACTIVE ADMIN via `bc_schema_status`, validates OAuth authorization details against exact client/redirect/scopes and calls approve/deny only after an explicit UI decision; enforces returned redirect URI. It is **not wired into the preview** and no external OAuth request has been made. Approved scopes may need revisiting once the exact Business client specification is known; do not silently widen.
3. `scripts/business/v1.1/bs6g5f-consent-preview-server.mjs`: **local loopback-only** GET static preview; binds `127.0.0.1` only, accepts one explicit `--local-preview-port` argument, has no deployment/export switch. Preview is unconditionally `PREVIEW_ONLY`; the HTML password field and login/approve/deny controls are disabled and no server-side login, OAuth grant, signup or mutation route exists.
4. `scripts/business/v1.1/bs6g5f-consent-browser.js` and `bs6g5f-consent-style.css`: static presentation from same local origin, no inline browser script or stylesheet, no external CDN. No personal user identifiers or tokens are rendered. The browser runtime refuses anything other than `PREVIEW_ONLY`.
5. The server serves the already package-pinned `@supabase/supabase-js` 2.117.2 UMD dependency from local installed `node_modules` via `/assets/vendor/supabase.js`. **No font or JavaScript binary was committed**; the vendor is runtime self-hosted, not requested from `esm.sh` or a CDN.
6. Strict headers: `default-src 'none'`, `script-src 'self'`, `style-src 'self'`, `connect-src 'none'`, `form-action 'none'`, `frame-ancestors 'none'`, `base-uri 'none'`, `no-store`, `nosniff`, `referrer-policy: no-referrer`.

## Actual local verification and negative tests

- Started the preview server on a randomly selected **loopback** listener via test harness; GET `/oauth/consent`, `/assets/config.json`, `/assets/app.js`, `/assets/style.css`, `/assets/vendor/supabase.js` and `/healthz` all returned HTTP 200 with no-store and CSP. The server was closed in finally. No public hostname/tunnel was created.
- The view has **no signup control**, no external CDN, no inline JS and no enabled login/approval controls. Unknown or action URLs and POST attempts return 404.
- `scripts/business/v1.1/bs6g5f-consent-security-test.mjs` asserts negative rejection for wrong OAuth client UUID, substituted redirect, missing/out-of-scope/duplicate scopes, missing owner allowlist, bad authorization ID, wrong callback origin/path, missing callback result, non-ADMIN member and anonymous user. Positive tests use synthetic objects only (never Production account data).
- Existing Production OAuth Discovery GET remains 404; the local preview has no power to enable it.
- Test coverage integrated in `npm run test:business:bs6g5f` and the full/hosted CI entrypoints; CI does not invoke Production Auth login or consent.

## Important remaining security and product gaps

- **This is NOT a working OAuth consent screen.** It deliberately does not authenticate or grant access, and must not be treated as a remotely publishable service. Before release, wire the approved flow to a separately reviewed, strictly scoped browser app with appropriate session storage, CSRF/PKCE handling, exact allowed client and callback registration, and integration tests against an enabled OAuth Server. User-consent redirects and sign-in were NOT exercised.
- Supabase `Site URL` is configured under global Auth URL Configuration; setting it to a new Staging HTTPS URL may change default redirect behavior for existing applications. Independently audit impact before changing it. Do not leave `http://localhost:3000` for an Internet OAuth flow.
- `Authorization Path` should remain a separately served, approved path such as `/oauth/consent`. The actual origin must be an authorized HTTPS site and cannot be inferred from an unstarted loopback listener.
- Keep `Allow Dynamic OAuth Apps` **OFF** until the Business client registration method and redirect URI validation policy are explicitly chosen. Static/manual client registration is a distinct option but must be verified for the ChatGPT integration.
- A confirmed Business-account ChatGPT staging app identity and owner authorization, separate public ingress, exact client_id, redirect URI(s), and final runtime operator/Keychain secret custody remain absent.
- No production v1.0 service modifications, Supabase OAuth toggles, OAuth app registration, public tunnel, deploy, paid action, Final SQLite export/import, privileged importer, PR Ready/merge or release tag were performed.

## Source basis

Supabase OAuth 2.1 Server getting started:
https://supabase.com/docs/guides/auth/oauth-server/getting-started

Supabase OAuth flow details:
https://supabase.com/docs/guides/auth/oauth-server/oauth-flows

Supabase MCP Authentication and registration:
https://supabase.com/docs/guides/auth/oauth-server/mcp-authentication

## Decision and next unit

B-S6G-5F pre-publication security preparation PASS. **External OAuth Discovery remains blocked**, and Production Target remains 7/11 PASS. `authenticatedReadbackPlan` is still PENDING for an actual connected Business workspace app. `runtimeSecretCustody`, `migrationAdmin` and `importerPrivilegeIsolation` remain PENDING. B-S6 Production Cutover is NO-GO.

**Next B-S6G-5G:** obtain and verify an owner-approved HTTPS Staging origin + exact OAuth client identity/redirect contract; review global Site URL effects; finish the actual (not preview) browser authorization/consent implementation and independent staging acceptance BEFORE modifying the Production Supabase OAuth Server toggle or registering a new Business workspace app.

## 7. Regressions and independent local completion

- Mac Studio full release-host CI: **PASS (96.83 seconds)**, including pre-existing Business/Personal contracts and new B-S6G-5F preview/policy tests.
- Mac Studio hosted-mode CI: **PASS (78.99 seconds)**, including no-signup and failed-client/redirect/scopes/ADMIN contracts.
- Independent real Production DB read-only checks: exactly one release-org, one ACTIVE ADMIN, zero logical projects/tasks; privileged import function absent.
- Live Supabase OAuth Authorization Server discovery remained **HTTP 404** following the canceled UI action; no new client was registered.
- GitHub exact HEAD CI is a separate required check after commit push; local success alone cannot establish remote release readiness.
- Public repository exact change-file allowlist / token pattern scan PASS. No Owner password, Auth JWT, user UUID/email, refresh token, Keychain secret, service_role key, native binary or raw SQL receipt will be committed.
