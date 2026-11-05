# ChatAgent Business v1.1 — B-S6G-5 Production Auth HTTPS and Keychain Readiness

Date: 2026-11-05 KST.
Scope: isolated read-only Production Supabase authentication canary, secure credential custody, owner-local sign-in preparation.
**Status: B-S6G-5A infrastructure + LIVE HTTPS anonymous denial PASS; B-S6G-5B REAL SIGNED JWT PENDING OWNER LOCAL LOGIN.**
B-S6 production cutover NO-GO / NOT STARTED / NOT AUTHORIZED. No final SQLite export/import, PR Ready/merge, v1.1 republish, service restart, paid services, or operator role change.

## 1. Read-only source and live state

- Canonical repository local and tracked GitHub branch were clean and equal at entry commit 0328938031df230823bfcaf3c72707b5cf774783.
- Mac Studio ChatAgent Business v1.0 server operator state RUNNING/healthy PID 13607; /health HTTP 200, secure tunnel /healthz and /readyz both HTTP 200.
- Dedicated KAI Org Production Supabase (Seoul) remains ACTIVE_HEALTHY, with verified release-org and one confirmed ACTIVE ADMIN, existing canonical 11 B-S1/B-S2 migrations, 15/15 private-table RLS.
- Production auth.sessions count 0 at preflight; one eligible confirmed Auth user with a password hash exists. Logging into Supabase Dashboard via management OAuth DOES NOT create an application Auth session.
- No signed application JWT, access/refresh token, or identity proof was obtained via the Supabase management connector.

## 2. Local owner-private canary configuration (no production v1.0 changes)

- Authorized Supabase get_publishable_keys supplied an enabled modern sb_publishable_ key. The legacy anon key was NOT installed, and no service-role or secret key was requested.
- Isolated owner-only directory: ~/ChatAgentBusiness/v11-bs6g5-canary, mode 0700.
- Target-pinned auth.json, mode 0600, contains only public Supabase URL/ref/publishable key, expected schema 1, isolated Keychain helper path/SHA and service name. No password/JWT/refresh/service-role key written in config.
- Native Mac Keychain helper compiled from the accepted donor C source, installed owner-executable, and SHA-256 pinned in auth.json. Runtime config loader rejects unexpected keys, project mismatch, unsafe permissions, and secret-role key use.
- Separate chatagent-business.bs6g5.production.auth Keychain service/account; no v1.0 Keychain service or operator secrets were modified.
- Existing B-S1B Keychain live test used an unrelated temporary random service and passed actual write/read/delete, leaving no test entry. At pre-login, isolated readback returns BUSINESS_AUTH_REQUIRED (expected fail-closed).
- The canary explicitly refuses to accept another project ref. No session token was fabricated using DB JWT settings.

## 3. Real Production HTTPS anonymous test (not simulation)

Using the modern publishable key alone from the Mac Studio with TLS and POST JSON to:
- /rest/v1/rpc/bc_member_profile → HTTP 401, PostgreSQL SQLSTATE 42501, permission denied.
- /rest/v1/rpc/bc_schema_status → HTTP 401, SQLSTATE 42501, permission denied.

This proves actual anonymous HTTP request denial at the Production Data API; SQL catalog and local mocks were not substituted. Negative test does not create any user or mutation.

## 4. Secure owner-local sign-in and independent readback, PREPARED NOT YET RUN

Canonical source:
- scripts/business/v1.1/bs6g5-production-auth-canary.mjs
- scripts/business/v1.1/bs6g5-secure-local-signin.py
- scripts/business/v1.1/bs6g5-production-auth-canary-test.mjs

Owner-only launcher:
~/ChatAgentBusiness/v11-bs6g5-canary/VerifyAuth.command

Run in Mac Studio Terminal (not via ChatGPT):
~/ChatAgentBusiness/v11-bs6g5-canary/VerifyAuth.command

The Python wrapper refuses non-interactive sessions; collects administrator email at a local TTY and password using getpass with echo disabled, then passes them directly through Node child stdin. Password and email are never command arguments, environment variables, Git files, or tool logs. The existing BusinessSupabaseAuthSession uses Auth signInWithPassword to obtain a REAL Supabase signed access token and writes only the refresh token to dedicated macOS Keychain via pinned native helper. The canary uses that access token over HTTPS to bc_member_profile and bc_schema_status and validates release-org/ADMIN/schemaVersion/contractVersion. It prints only status and booleans, not profile data or secrets. It does not mutate business tables. If Auth rejects credentials, no retry loop runs.

After the owner-local login succeeds, authorized Desktop Commander can run:
node scripts/business/v1.1/bs6g5-production-auth-canary.mjs readback --config=/Users/macstudio/ChatAgentBusiness/v11-bs6g5-canary/auth.json --expected-project-ref=hjgerbyofaxyfqdckret

This refreshes from owner-private Keychain and verifies signed HTTPS readback again, with no human sharing of tokens. **Do not mark this completed before it runs.**

## 5. Results, limits and next gates

Confirmed:
- Production public-key-only target config pinned and verified.
- Actual TLS/HTTPS anonymous denial 2/2 with SQLSTATE 42501.
- Mac Keychain native helper and isolated write/read/delete contract PASS.
- Scripted fail-closed pre-login readback PASS (BUSINESS_AUTH_REQUIRED).
- B-S6G-5 contract test integrated into Mac full CI and GitHub hosted CI; no secrets in public Git.

Still PENDING:
- Live administrator-signed JWT HTTPS positive readback (requires local credential sign-in), separate end-to-end v1.1 Gateway route and any nonmember/multi-user TEAM/PRIVATE canary on this target.
- Full production runtime Keychain/refresh policy and production operator identity; isolated canary is NOT a deployed Gateway.
- One-time importer privilege lifecycle (function absent), source stop/export/import, merger approval and release.

Existing B-S6G Target evidence remains 7/11 PASS. Do not promote authenticatedReadbackPlan or runtimeSecretCustody from an unexecuted login script or a one-off test Keychain account.

Owner action: launch private VerifyAuth.command in an actual Mac Studio Terminal, enter the confirmed Production application Auth email and password locally, confirm the screen reports B_S6G5_SIGNED_HTTPS_RPC_PASS; then tell ChatGPT only that the local signed-in test passed (no secrets). This is the sole human interaction required for next live-auth gate.

Reference: Supabase Auth sessions https://supabase.com/docs/guides/auth/sessions and password sign-in https://supabase.com/docs/guides/auth/passwords.

Release safety: B-S6 NO-GO; v1.0 continues untouched. Do not call this artifact a signed-JWT E2E PASS while auth.sessions=0.

## 6. CI and environmental deviation

- B-S6G-5 contract tests PASS; local Mac Studio hosted-mode CI PASS (72.38 seconds).
- Initial parallel full release-host CI failed at existing B-S4A Docker/PostgreSQL test because local Docker daemon socket reported connection refused. This was an infrastructure process availability failure, not an assertion failure in B-S6G-5 code.
- Independent read-only Docker inspection immediately afterwards showed Docker Desktop server v29.7.2 responding and no residual Business test containers; no Docker start/stop/reset/cleanup was performed.
- Full release-host CI was re-run once in isolation after confirming Docker readiness and passed all gates (93.56 seconds), including B-S6G-5 canary contract. The initial failure is retained as historical environment deviation, not hidden.
- CI tests never use real production Auth credentials, session tokens, operator privileges or Data API mutations. Real anonymous HTTPS negative canaries and temporary Keychain lifecycle were verified separately as above.
- GitHub exact-head CI for the newly pushed B-S6G-5A commit must be verified separately; local PASS does not substitute for protected GitHub checks.

## 7. B-S6G-5B authenticated owner login completed — 2026-11-05 KST

The prior pre-login zero-session status and instructions in sections 1, 4 and 5 are HISTORICAL, not the current state. The owner completed local private interactive sign-in. Mac Studio re-ran the accepted readback canary twice successfully using Keychain-restored real Supabase Auth signed access JWT over HTTPS. Issuer and asymmetric JWT signature were independently checked through published JWKS; Auth getUser returned the matching signed subject. The Production auth.sessions count is now one. No credentials, tokens or user identity were printed or recorded.

This is DIRECT SIGNED JWT HTTPS PASS but NOT v1.1 MCP Gateway E2E. Actual signed MCP tool-call not executed, final Gateway secret custody unproven. Target gate stays 7/11; see B_S6G5B_SIGNED_JWT_HTTPS_READBACK_AUDIT_20261105.md. No production cutover authorized.

## 8. B-S6G-5C isolated signed MCP Gateway (2026-11-05)

The earlier Gateway-pending language described the state BEFORE B-S6G-5C. An isolated owner-hosted loopback Gateway MCP SDK signed tools/call(member_get_profile) now PASS with real Production Auth JWT, live JWKS, negative missing/invalid bearer 401, OAuth resource metadata, and direct Supabase RPC profile parity. This does not establish published v1.1 app plugin E2E, final runtime secret custody or production cutover. Official audit: B_S6G5C_ISOLATED_SIGNED_MCP_GATEWAY_E2E_20261105.md. Overall target proof remains 7/11.
