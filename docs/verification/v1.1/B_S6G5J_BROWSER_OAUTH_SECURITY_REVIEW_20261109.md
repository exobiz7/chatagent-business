# B-S6G-5J — Browser CSP, Auth Site URL and MCP Token Resource Boundary

Date: 2026-11-09 KST
Decision: **REAL-CHROME STATIC CONSENT CSP PASS / OFFLINE RESOURCE TOKEN ADMISSION CONTRACT PASS / REAL SUPABASE OAUTH AND BUSINESS CALLBACK NOT PROVEN / B-S6 CUTOVER NO-GO**.

## Source authority

- Mac Studio canonical repo: `/Volumes/SSD 4T/z_proj/proj04_chatagent/chatagent_business`, branch `feat/business-v1.1-bs3-runtime-routing`, opening HEAD/upstream `398d8bc188d70fd1645025a5fb210598e38da170`.
- Existing v1.0 operator is RUNNING/healthy, original PID 13607, server `31850/health` and tunnel `51950/healthz`, `51950/readyz` all HTTP 200 at onboarding.
- Supabase Business v1.1 Auth project `hjgerbyofaxyfqdckret` still ACTIVE_HEALTHY. Read-only discovery: OIDC metadata HTTP 200; OAuth Authorization Server metadata HTTP 404.
- Netlify dedicated Free staging consent site: `chatagent-business-v11-consent-staging`, ready published deploy `6aed3d71a3bf94cd4310cd9e`. No site changes or redeployments in B-S6G-5J.

## Real-browser Netlify injection and CSP result

- `scripts/business/v1.1/bs6g5j-browser-csp-audit.mjs` invoked the installed **Google Chrome** headless with a fresh temporary profile, loopback-only browser debugging connection, and opened the public HTTPS `/oauth/consent`.
- DOM showed the Netlify-injected `/.netlify/scripts/hud?variant=public` script element. Chrome emitted an enforced `script-src-elem` CSP violation and a console message that the HUD script was refused by `script-src 'none'`.
- Chrome's performance resource list included the attempted HUD URL even though no successful `Network.responseReceived` for that script was observed. The first test incorrectly treated the request attempt as successful load and failed; this was corrected using both CDP Network response evidence and CSP violation. Final verdict `PASS_CHROME_ISOLATED_REAL_BROWSER_CSP_DENIAL`, rechecked 2026-11-09.
- Three disabled buttons, two disabled inputs, disabled fieldset, and no form. No Supabase browser network activity, no actual login, grant, OAuth authorization, popup, external registration or data change.
- The provider injects markup absent from source. This is a **real browser PASS for the static preview only**. A real functional consent page will require a fresh browser, CSP/script/SRI review; do not weaken `script-src` to permit the provider HUD.
- The verification tool uses only a disposable Chrome profile; no existing user's business browser session, passwords, cookies or local secrets were accessed.

## MCP token and issuer resource boundary

- Existing B-S6G-5D one-tool fixture explicitly verifies `audience:'authenticated'` against Supabase JWT, whereas its protected-resource metadata points to the MCP `/mcp` resource. The former is a valid *local Auth canary* but is not proof that a live ChatGPT OAuth token is tied to the exact MCP resource (RFC 8707 resource indicator / RFC 9728 metadata).
- `bs6g5j-oauth-token-admission.mjs` is a separate, **offline-only candidate guard** using `jose.jwtVerify`, with exact issuer, expected MCP audience, verified JWT signature/expiry, exact resource claim, exact OAuth client_id, authenticated role, nonanonymous subject and required scopes. It is **not wired into v1.0, v1.1 Gateway, Supabase Auth or any publicly hosted runtime**.
- `bs6g5j-oauth-token-admission-test.mjs` uses synthetic in-memory ephemeral RSA fixtures and rejects malformed issuer/signature, expired JWT, generic `aud=authenticated`, wrong resource claim, client ID or scope, unauthenticated/anonymous user and incomplete configuration.
- This proposed guard **intentionally demands both exact audience and resource claim**. Actual Supabase-issued OAuth tokens may not contain either in this form. Do not roll out the guard or assume a custom Auth hook can solve this until the issuer's actual OAuth resource propagation and signed-token claims are independently demonstrated and accepted against the current ChatGPT Business integration specification.
- Approval is blocked for external OAuth E2E until the issuer exposes valid authorization-server discovery, the gateway's resource audience binding is implemented/reviewed, and a real OAuth code+PKCE/consent read-only MCP tool flow passes.

## Auth Site URL and callback impact assessment

- The previously displayed `http://localhost:3000` Site URL was a historical screenshot, not an independently retrieved currently persisted configuration. The current connected Supabase action set did not expose an authoritative read of the Auth Site URL, so status remains **PENDING CURRENT LIVE CONFIG READBACK**.
- Supabase Auth global Site URL can affect default login redirects, email confirmation, password recovery, invitations and magic-link flows within the v1.1 Auth project. Changing it to Netlify now would be unjustified and might impact the already initialized ADMIN session. Preserve the existing value, capture actual current configuration and evaluate fallback/allowlisted Redirect URLs and email links, explicit Site URL rollback, and no-v1.0-coupling before any owner-approved modification.
- Exact ChatGPT **Business** app OAuth callback and actual client registration mode remain unknown; neither may be inferred from URL patterns. No static registration, DCR, CIMD or new Business app action taken.
- Netlify Free public staging frontend is currently an inert preview. It must never receive administrator credentials or serve as actual consent UI without implementation and independent owner review.

## Final acceptance / next bounded unit

- PASS: real installed Chrome CSP denial of Netlify HUD, static preview remains disabled, synthetic strict token guard rejects generic/cross-resource JWT.
- PENDING: current persisted Auth Site URL, exact Business callback/client registration, live issuer resource-bound token, one-tool authenticated Business workspace E2E, production runtime secret custody/migration.
- **B-S6G Production Target remains 7/11 PASS and B-S6 Production Cutover remains NO-GO.**
- No paid services, Netlify deployment, Supabase OAuth/Auth URL change, user creation, import, credential exchange or PR #9 merge.

**Next B-S6G-5K**: read-only establish real Supabase Auth Site URL and actual Business app callback/client method, then independent review of compatible issuer-signed resource-bound access-token semantics and a hardened Gateway verification design; seek separate owner approval before any live OAuth enable, consent page activation, token hook, Business app registration or production cutover.

## CI evidence and completion

- Isolated actual Chrome CSP check: PASS, including 2026-11-09 re-run.
- Synthetic offline strict MCP token admission: PASS with signature/issuer/expiry/resource aud/claim/client/scopes negative matrix.
- Hosted-mode full CI: **PASS 81.48 seconds**.
- Mac Studio complete Docker/Business/Personal CI: **PASS 99.31 seconds**.
- New B-S6G-5J token guard included in \`npm run test:ci\`, but the network-based real-browser test remains a separately executed independent verification, not a hosted CI dependency.
- GitHub exact HEAD CI to be independently checked on commit push. No authorization settings were changed by these tests.
