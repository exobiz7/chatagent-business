# ChatAgent Business v1.1 — B-S6G-5C Isolated Signed MCP Gateway E2E Audit

Date: 2026-11-05 KST
Verdict: **ISOLATED READ-ONLY SIGNED-JWT MCP GATEWAY E2E PASS**.
Release authority: **B-S6 CUTOVER NO-GO / NO OWNER APPROVAL**.

## Authoritative baseline and scope

- Mac Studio canonical repository and GitHub upstream matched commit `2042ae6d71dd2df541bfe84be1fab33f1504a2c4` at start; tree clean.
- Executed existing v1.1 `bs1c-live-fixture-server.mjs` on a dynamically selected loopback port using the standard MCP SDK Client and Streamable HTTP transport.
- The fixture has `fixture=true`, `noEffect=true`, and only `member_get_profile` and `runtime_list_nodes` as DB-backed read methods. All other catalog methods are no-effect test probes.
- Uses an owner-private `0600` configuration and SHA-256-pinned native macOS Keychain helper from earlier B-S6G-5A. Only modern Supabase publishable key passes as process configuration; no service_role/secret key.
- The access token is recovered into memory by the accepted `BusinessSupabaseAuthSession` from the dedicated Keychain refresh-token service. No token, email, UUID or private profile is placed in argv, logs, Git, artifacts or ChatGPT.

## Actual Production signed authorization path

1. Supabase Auth refresh-token restoration succeeded against the selected KAI Org Business Production project.
2. Issuer- and authenticated-Audience-bound live JWKS cryptographic signature verification of the real access JWT succeeded.
3. Supabase Auth `getUser(accessToken)` independently confirmed the JWT subject and authenticated role.
4. Direct real signed HTTPS `bc_member_profile` produced the expected opaque profile object privately in memory.
5. The loopback-only v1.1 Gateway returned **HTTP 401** for requests with no Bearer token and for an explicitly invalid Bearer token.
6. GET `/.well-known/oauth-protected-resource` advertised the expected resource URI, Production Auth issuer, and header Bearer method, all checked before positive invocation.
7. A real MCP SDK `Client.connect()` and `Client.callTool({name:'member_get_profile'})` succeeded with the actual JWT, and the Gateway's structured profile matched the independently retrieved Production HTTPS profile by opaque ID, email and nickname **without emitting any of those values**.
8. The dedicated fixture process was terminated and its port closed. No public tunnel or production v1.0 port was attached.
9. Independent Production read-only SQL after canary showed one confirmed Auth user/session, one release-org and ACTIVE ADMIN, and **zero** project/node/session/task/checkpoint/event records. One-time importer absent.
10. Existing production v1.0 operator remains RUNNING/healthy PID 13607, server /health HTTP 200, tunnel /healthz and /readyz both HTTP 200.

## Reproducible source and validation

- `scripts/business/v1.1/bs6g5c-signed-gateway-canary.mjs`: actual owner-private Keychain, JWKS/Auth, Supabase direct RPC and v1.1 SDK MCP fixture flow. PASS-only output.
- `scripts/business/v1.1/bs6g5c-signed-gateway-canary-test.mjs`: strict profile comparison and negative authentication contract assertions.
- `npm run test:business:bs6g5c` is included in full local and hosted CI. CI never uses a real Production session. The true live authenticated canary must be executed separately on the authorized Mac Studio.
- First development run exposed an observer cleanup check using only `child.exitCode` (which remains null for signal exits); the cleanup status check was corrected to consider `child.signalCode`. The initial attempt returned FAIL; the corrected full canary PASS, and no fixture process/listener was left behind.
- No SQL DDL/DML, role permission change, SQLite export/import, app reconfiguration, v1.1 server publication, PR merge or release tag was performed.

## What this does not establish

- This is a **local fixture Gateway** E2E, not a production-deployed v1.1 Gateway and not a ChatGPT Business-account plugin invocation. The current ChatGPT Plus chat cannot directly exercise the Business workspace's connected ChatAgent plugin.
- Existing published Business plugin still targets the v1.0 production application; a PASS from that plugin does **not** constitute v1.1 published endpoint acceptance.
- Actual Business workspace plugin/OAuth handshake, final production Gateway runtime credentials, migration operator identity, privileged importer lifecycle, TEAM/PRIVATE cross-member isolation and release cutover remain independently gated.
- To prevent a premature release verdict, the B-S6G target evidence stays **7/11 PASS**, with `authenticatedReadbackPlan` PENDING until external/published Gateway and migration readback authorization criteria are accepted. The loopback subgate is specifically PASS.

## Next unit and account routing

B-S6G-5D: design and verify an owner-approved staging/external ChatGPT Business-workspace plugin OAuth path while retaining v1.0 production, plus operator-identity and credential-custody contracts. When a business-account-only direct plugin test is necessary, provide a separate minimal, read-only prompt for the user to run in the Business workspace and return only redacted PASS/FAIL; do not run v1.1 against the v1.0 production plugin or re-publish without separate approval.

## Independent CI and tightened audience guard

- Native Mac Studio full release-host CI: PASS (95.61 seconds), with the B-S6G-5C contract in the release-host test chain.
- Local hosted-mode CI: PASS (79.10 seconds), including the new B-S6G-5C contract.
- Signed-JWT live verifier and loopback Gateway now enforce expected JWT audience authenticated in addition to issuer and asymmetric JWKS signature, and the full live Gateway canary was repeated successfully after hardening.
- Public GitHub exact-head CI must be checked after pushing this commit; the local/hosted PASS cannot serve as a substitute.
- Business-account plugin invocation remains NOT EXECUTED, and no credentials are placed in the public repository.
