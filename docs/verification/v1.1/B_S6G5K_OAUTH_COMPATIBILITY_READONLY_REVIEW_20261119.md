# B-S6G-5K — Current OAuth Compatibility and Read-Only Admission Review

Date: 2026-11-19 KST
Decision: **SOURCE-BASED CONTRACT REVIEW + FAIL-CLOSED EVIDENCE GATE PASS; LIVE OAUTH CONNECTION NOT ESTABLISHED.**
Cutover: **NO-GO; Production Target 7/11 PASS**.

## 1. Actual estate
- Canonical repository: `/Volumes/SSD 4T/z_proj/proj04_chatagent/chatagent_business`, feature branch `feat/business-v1.1-bs3-runtime-routing`. Opening HEAD/upstream `ae26834ec5de4718f4c715b67321d6cdcbc99268`, worktree clean.
- v1.0 protected endpoints (31850 /health; 51950 /healthz, /readyz) remained 3/3 HTTP 200 on current read-only check. No v1.0 configuration or process action.
- Connected v1.1 Supabase project `hjgerbyofaxyfqdckret` is `ACTIVE_HEALTHY`, current connected API exposes project data and SQL but no authoritative Auth Site URL/Redirect URL settings getter. Historical screenshot of `http://localhost:3000` is not current authoritative readback.
- OAuth authorization-server discovery last verified HTTP 404, OIDC HTTP 200; feature not enabled by this work unit.
- Netlify dedicated Free `chatagent-business-v11-consent-staging` still serves static, disabled preview. No redeployment, no actual login.
- Actual ChatGPT **Business workspace** app's exact client ID, Callback URI and OAuth registration method are still **not verified from that account**. Do not derive them from this personal Plus session, examples, or URL templates.

## 2. New compatibility finding
- Supabase OAuth Server Token Security documentation demonstrates a default OAuth JWT with `aud: "authenticated"` and `client_id`. It does not demonstrate the desired `resource` claim or resource-specific JWT `aud` assumed by the previous `bs6g5j-oauth-token-admission.mjs` candidate.
- Therefore strict audience=exact MCP URL and resource-claim checking in that **synthetic offline code** is not yet compatible with the proven issuer token contract. It must **not** be connected to a real gateway simply because offline tests pass. Do not relax the gateway to generic `aud=authenticated` without a reviewed resource-binding design either.
- Supabase OAuth scopes `openid`, `email`, `profile`, `phone` control OIDC identity data, NOT Postgres table access or application MCP tool authority. Resource authorization additionally requires trusted issuer/exp/signature checks, exact client binding, session/org membership/RLS, tool-specific access rules and a verified resource-token binding.
- Supabase Custom Access Token Hooks can modify JWT claims, including client-aware claims, but run across **all** token issuance and can affect existing local admin login/recovery. No Hook should be applied without isolated design, rollback, account recovery evidence and owner authorization.
- Independent alternatives (custom resource-bound issuer, token exchange/mediator, or issuer-supported resource parameter) remain **candidates**, not approved implementations. User data/refresh tokens must not be routed into new components by assumption.

## 3. Browser and Site URL
- B-S6G-5J already used an isolated installed Chrome browser to establish that the injected Netlify HUD script is blocked by CSP; that proves static preview behavior only. No OAuth consent UI is currently deployed.
- Supabase global Auth Site URL is used with the OAuth Authorization Path for consent routing and may affect email confirmation, password reset, invitation and magic link defaults. Need real persisted value + allowed Redirect URLs + rollback plan before change.
- No authoritative direct Site URL read operation exists in currently connected Supabase tools. Authentication dashboard UI review by the owner, or future authorized secure read-only management action, is needed; DO NOT ask for secret/admin keys in chat. The existing account's logged-in dashboard screenshot is acceptable for public URL fields only.
- Business OAuth callback/client configuration must be read from the **Business workspace developer app**, not the Personal Plus plugin page. No DCR/CIMD assumption is accepted.

## 4. Fail-closed code and concrete missing evidence
- `B_S6G5K_AUTH_READONLY_EVIDENCE_20261119.json`: no guessed Site URL, client ID, Callback URI or real issuer audience values. Unsupported fields remain null/false.
- `bs6g5k-auth-evidence-gate.mjs` evaluates 16 distinct prerequisites; missing evidence yields `BLOCKED_REAL_OAUTH_DEPENDENCIES`. Even hypothetical all-true evidence yields `EVIDENCE_REQUIRES_INDEPENDENT_OWNER_REVIEW`, never authorization to modify settings, deploy externally or cut over.
- `bs6g5k-auth-evidence-gate-test.mjs` tests current blocked status, all-true non-authorization, unsupported client mode and governance violation.
- This does not alter `bs6g5j-oauth-token-admission.mjs` or its existing tests. It records that module as a *candidate*, not a production-compatible guard.
- Business Account plugin E2E NOT PERFORMED, no OAuth app registered, no Auth settings toggled, no JWT Hook deployed, no Netlify/site/public Gateway changes, no billing, data import, PR merge or release tag.

## 5. Next bounded unit B-S6G-5L
1. Read exact current Supabase Auth **Site URL** + Redirect URLs from connected authenticated dashboard through explicit owner-approved inspection, *read only*. Document before-value and confirmation/recovery link impact.
2. In **Business workspace**, capture exact existing/new draft developer-app OAuth **Callback URL**, client registration choices and stable MCP resource URL; no registration or OAuth enable merely to inspect.
3. Design/test the issuer+resource binding contract with actual documentation and safely reproducible synthetic fixtures; for any necessary custom token hook or token exchange, obtain separate owner approval and preserve an independently verified administrative recovery path.
4. Only after an owner-approved change record and isolation review may a staged OAuth activation and one read-only tool end-to-end test occur. Production migration gates remain independent.

## Sources
- Supabase: https://supabase.com/docs/guides/auth/oauth-server/token-security
- Supabase: https://supabase.com/docs/guides/auth/oauth-server/getting-started
- Supabase: https://supabase.com/docs/guides/auth/oauth-server/oauth-flows
- ChatGPT authentication documentation: https://developers.openai.com/plugins/build/auth

## 6. Verification closure

- B-S6G-5K pure evidence gate: PASS (current missing-evidence case blocks, all-true synthetic evidence never self-authorizes settings/import).
- Mac Studio `npm run test:ci:hosted`: PASS (2026-11-19).
- Mac Studio full `npm run test:ci` with Docker Desktop 29.7.2 available: PASS (96.57 seconds).
- Final exact GitHub commit CI must be checked after push. No real OAuth or Business-account plugin call.
