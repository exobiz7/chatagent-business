# ChatAgent Business v1.1 — B-S6G-5D External Business Workspace Admission

Date: 2026-11-05 KST
Disposition: **LOCAL READ-ONLY EXTERNAL CANDIDATE PASS / PUBLIC ENDPOINT NOT ARMED / BUSINESS-WORKSPACE PLUGIN E2E NOT RUN**.
Release: **B-S6 CUTOVER NO-GO**, no separate owner approval for app republish, customer import, PR merge or production replacement.

## Baseline evidence

- Canonical Mac Studio repo/upstream HEAD at entry: `680202731fbee8221ccf9912c6a6e3f692f117fe`, clean worktree, protected PR #9 OPEN/DRAFT; exact preceding HEAD GitHub checks SUCCESS.
- v1.0 Production `Status.command` reports RUNNING/healthy, PID 13607, phase B5. Server /health and secure tunnel /healthz /readyz all HTTP 200. No restart or config change.
- Dedicated KAI Org Business v1.1 Supabase Production remains ACTIVE_HEALTHY (ap-northeast-2). Its schema 11/11 canonical migrations, one confirmed Auth member and release-org ACTIVE ADMIN, importer absent. Previous 7/11 target proofs unchanged.
- Historic Business v1.1 Developer Mode app entries include `ChatAgent Business v1.1 B-S0 SchemaFix` and `ChatAgent Business v1.1 B-S3B-3`. These records establish historic tests, not current published app identity or endpoint.
- At this checkpoint the historic staging port pair 31861/51961 and consent port 32171 are **not listening**. No currently armed v1.1 Business-account external endpoint was independently established.
- Published Business plugin is still v1.0. A v1.0 `business_status` PASS is NOT v1.1 evidence.

## B-S6G-5D implementation and live local evidence

- Created `scripts/business/v1.1/bs6g5d-readonly-external-fixture.mjs`, a separate **one-tool only** MCP HTTP fixture. `tools/list` and actual registration include exactly `member_get_profile` with `readOnlyHint=true`. It does NOT register process, filesystem, Git or privileged import tools.
- This fixture binds only to `127.0.0.1` on an ephemeral canary port; no Internet/tunnel publication is made. Its health response explicitly says `fixture=true`, `noEffect=true`, `toolCount=1`, `published=false`.
- Private config is owner-only Mac Studio `0600`, with modern Supabase publishable key; no `service_role`, `sb_secret` or privileged DB direct connection in this fixture. Server does not require the member's refresh token; requests carry real signed access JWT.
- OAuth resource metadata declares the Supabase Auth issuer, a target-specific resource URI and Bearer-in-header support. Missing bearer and malformed bearer return HTTP 401; real JWT is validated against published JWKS with issuer, `aud=authenticated`, authenticated role and non-anonymous subject.
- Owner-private Mac Keychain restores/rotates the authorized session only in the **test client**. No credentials are printed, persisted or sent through ChatGPT.
- Actual local client connected via standard MCP StreamableHTTP SDK using real Production signed JWT. Verified exact tool inventory one read-only tool, actual `member_get_profile` call PASS, and opaque profile matched a second direct authenticated Supabase `bc_member_profile` call privately in memory.
- Tried `create_file` through the actual signed MCP connection: **rejected**, no mutation. Local fixture was terminated and listener closed; v1.0 ports unaffected.
- New offline contract test `scripts/business/v1.1/bs6g5d-readonly-external-fixture-test.mjs` checks the one-tool whitelist, audience/issuer/JWKS path, no-effect/loopback flags, negative authentication contracts, signed canary and owned cleanup. It is added to full and hosted CI; CI tests never use real production Auth secrets.

## Admission gates for an actual Business-account plugin test

Do not ask the Business account user to execute a v1.1 plugin request until **all** independent preconditions are true:

1. **New/exact Staging app identity**: the intended v1.1 B-S6G-5D ReadOnly app/version/ID and owning Business workspace confirmed. Do not reuse published `ChatAgent Business` v1.0 or historic B-S3B-3 39-tool app.
2. **Separate external HTTPS endpoint**: an authorized owner-approved staging HTTPS address and tunnel, not 31850/51950 production; correct TLS, resource URL and consent/authorization flow; server starts from reviewed immutable source and explicitly advertises one read-only tool.
3. **OAuth Browser flow**: ChatGPT Business actual authorization-code/consent redirect, PKCE and user login successfully configured for the selected audience/issuer. Published resource metadata alone does NOT prove consent/login capability, and a locally restored Keychain JWT is NOT a ChatGPT-issued delegated session.
4. **Guarded tunnel and operational status**: external GET protected-resource metadata is correct; unauthenticated POST /mcp returns 401 Bearer challenge; exact one tool is discoverable; no write-capable tool is advertised. Independent forwarded request count and timestamps can be correlated without capturing bearer tokens.
5. **Approved test consent**: owner explicitly authorizes staging-only app connection/consent. No production app republish, no secret pasting, no new paid service or relaxed RLS.
6. **Actual Business-workspace invocation**: new Business-account ChatGPT chat, exact app selected, exactly one `member_get_profile` call, no other tool/mutation/retry. Report only non-identifying PASS/FAIL and tool count. Confirm arrival via private staging ingress evidence. Never count a Plus-account message, manual curl, or v1.0 plugin call as this gate.

If any item fails or is absent, stop at `PENDING_STAGING_NOT_ARMED`; do not manufacture Auth tokens, infer installed app IDs from historical screenshots or relax authentication.

## Remaining release blockers

The formal Production Target remains **7/11 PASS**: `migrationAdmin`, `importerPrivilegeIsolation`, `authenticatedReadbackPlan` (actual externally connected/published authorized v1.1 app path), and `runtimeSecretCustody` (final gateway/operator credentials) remain PENDING.
Owner-private Keychain prototype and loopback live JWT prove technical feasibility, not final deployed runtime security/rotation/recovery. Neither the one-time importer nor final v1.1 Gateway is installed.
No source SQLite export/import, app replacement, PR Ready/merge/tag, reboot or paid infrastructure were executed.

## Next bounded unit

B-S6G-5E — Staging Publication Decision / External OAuth Registration. First verify independent no-effect staging tunnel/consent topology and exact Business workspace app identity, then seek the distinct owner approval **before** creating/changing a remote draft app or making a public staging endpoint reachable. Once armed, use the prepared exact read-only Business-account prompt in `docs/ops/B_S6G5D_BUSINESS_ACCOUNT_READONLY_TEST_PROMPT.md`. Compare results with staging ingress records. Keep existing v1.0 production untouched and Cutover NO-GO.

## CI and independent privacy verification

- Mac Studio release-host `npm run test:ci`: **PASS (93.14 seconds)**, including B-S6G-5D one-tool contract, all prior Business and Personal baseline tests.
- Mac Studio `npm run test:ci:hosted`: **PASS (79.25 seconds)**, including the same focused contract.
- Live Production OAuth read-only canary was tested separately with the owner-private Keychain, never inside GitHub or hosted CI; its exact one-tool, signed/profile-match, denied create_file and cleanup assertions all PASS.
- Exact changed-file allowlist (10 files), public-repository secret scan, private config ownership mode 0600 and Keychain helper SHA-256 pin PASS.
- Production database read-only census after the test: one release-org ACTIVE ADMIN, no project/runtime/continuity rows, importer absent. No schema/RLS/policy change.
- GitHub exact-HEAD CI must be verified after the new commit is pushed; local tests are not a substitute for provider required checks.
