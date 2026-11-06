# ChatAgent Business v1.1 — B-S6G production target and integration review

Prepared: 2026-11-02 KST
Scope decision: **B-S6G-1 discovery and guardrails PASS; B-S6G overall BLOCKED on unverified production target**.
Release: **B-S6 cutover NO-GO / NOT AUTHORIZED / NOT STARTED**.
Authority: Accepted Design 2026-10-05 sections 37 and 39; B-S6F 33-step runbook.

## 1. Actual read-only inventory

At start: local and origin HEAD b768e5fb1b35af253eca8f18ab829ee3b92f59d3, clean, branch feat/business-v1.1-bs3-runtime-routing; PR #9 OPEN/DRAFT. Last known v1.0 operator status RUNNING/healthy B5 (PID 38634); 31850/health, 51950/healthz and 51950/readyz were HTTP 200.

Two linked Supabase accounts inspected through read-only listing and project metadata:
- KAI Org: chatagent-personal-memory, INACTIVE, Personal-only (excluded).
- KAI Org: chatagent-business-v1.1-bs0, INACTIVE, historical B-S0 staging-only (excluded).
- bluemaje Org: no projects returned.
- NO dedicated ACTIVE Business production project identified in the connected inventory. A project in another unlinked account is not ruled out, but cannot be verified without explicitly connecting it.
- No Supabase project was created or resumed, and no database SQL was executed. Staging is NOT a valid production fallback.
- Application organization slug release-org inside a database differs from the Supabase platform organization identifier.

**Finding BS6G-P0-01**: No selected, verified, dedicated ACTIVE Business production Supabase project. Final target proof is BLOCKED, not PASS.

## 2. Fail-closed target proof artifacts

- docs/verification/v1.1/B_S6G_PRODUCTION_TARGET_EVIDENCE_20261102.json: public-safe evidence with 11 currently PENDING checks, no actor ID, project ref, credentials or private receipts.
- scripts/business/v1.1/bs6g-target-evidence-verifier.mjs and test: strict JSON contract; no target falsely proves any check, rejects pre-claimed owner approval, mutation or forged PASS, never allows Import, creation or Cutover even when evidence says all checks PASS.
- docs/ops/B_S6G_PRODUCTION_TARGET_READONLY_SQL_20261102.sql: **UNEXECUTED** authorized-console template, transaction READ ONLY, six SELECT statements. Verifies both private schema_meta versions, one application release-org slug, active ADMIN count, empty target logical/continuity/control/runtime rows, importer existence. It does NOT prove the specific migration ADMIN identity or DB connection TLS/secret custody by itself. Those require private independent evidence.

The owner must select an authorized dedicated production project, check plan/quota and possible cost, assign a private operator and verifier, prove schema and empty state, and authorize the above read-only inspection on that exact project. Never publish a key, UUID, service role secret, user identifier, connection URI or customer snapshot in public Git.

## 3. GitHub integration feasibility

- Live GitHub visibility of exobiz7/chatagent-business: **PUBLIC** (different from some older notes). Protect all production credentials and source DB exports outside source control; do not change visibility without approval.
- Protected main: strict required standalone CI, at least one approval, enforce admins, linear history. Squash and rebase merge are permitted; a merge commit cannot be assumed compatible with linear history.
- Existing PRs #6 B-S0/main (OPEN), #7 B-S1/B-S0 (DRAFT), #8 B-S2/B-S1 (DRAFT), #9 B-S3+/B-S2 (DRAFT) remain unmerged.
- All four ancestry edges PASS in git merge-base checks. At starting HEAD cumulative main...candidate: 226 files, 27,324 added and 35 deleted lines.
- Proposed single full-stack integration PR against main, approved separately, with complete diff/security review, independent approving reviewer and required CI. Keep existing stacked PRs intact until reviewed closure. No new PR was created by this unit.
- After a squash or rebase produces a different merged SHA, reconcile final tree content with the reviewed/deployed release artifact, recheck protected-main CI and tag only the accepted merged main SHA. Maintain Accepted Design section 37 ordering (actual merge at step 28 after service and published-app canaries).

## 4. Restart / rollback boundary

Existing B-S6F disposable process + stale-record fail-closed PASS does NOT prove v1.1 Mac reboot persistence. v1.0 installed server LaunchAgent historically had KeepAlive=false and last exit=1 while the real operator server was healthy. Full-machine reboot requires explicit approval, not a background repair action.
Before release: a bounded disposable v1.1 Gateway/node restart and revoke canary, exact PID/instance/port and stale-record recovery policy, maintenance window, primary operator, independent verifier and rollback owner. Retain original v1 SQLite app/config and verified stopped-source backup; never dual-write or blindly retry UNCERTAIN import.

## 5. Gates and next step

B-S6G-1 connected inventory, target proof guardrails and integration feasibility: can be accepted after code CI.
B-S6G overall production target: **BLOCKED / NOT VERIFIED**.
B-S6 final production cutover: **NO-GO**.

Next B-S6G-2: owner explicitly selects or provisions a dedicated ACTIVE Business production Supabase project, or connects the account containing one. Then obtain private identity/roles/empty-target proof and run SQL under the selected authorized account in read-only mode; continue exact-head final integration and operator review. Project creation, app restart, migration, PR merge and release are outside this unit.

## 6. Independent verification / B-S6G-1 closure

Code-bearing commit 2e92fb1966946f2ff34d63e7075f95858c0ab372:
- Mac Studio full release-host CI npm run test:ci: PASS / 99.94 seconds, including existing Docker/Postgres effect coverage.
- Mac Studio local hosted-mode CI npm run test:ci:hosted: PASS / 75.65 seconds.
- GitHub macOS hosted CI exact commit runs 41319636007 and 41319640769 both completed SUCCESS.
- B-S6A read-only preflight re-executed after both successes: local/origin exact, clean, hostedChecks=2, v1 app health READY, tunnel health+ready READY, blockers=[] and PRECHECKS_ELIGIBLE_NOT_CUTOVER_AUTHORIZED.
- B-S6G target proof verifier: structurally valid, 0/11 proofs, NO_GO_TARGET_NOT_VERIFIED; no create/import/cutover authority.
- Both linked Supabase organization plans are currently Free. KAI Org had two INACTIVE projects; bluemaje Org returned no projects. Quota/creation cost not assumed.
- No project restore, SQL execution, operator credential retrieval, source database export/import or production effects.

B-S6G-1 technical investigation and guardrails: ACCEPTED/CLOSED.
B-S6G-2 external dedicated target identity/schema/empty state: BLOCKED/NOT EXECUTED.
Overall B-S6 live production cutover: NO-GO/NOT AUTHORIZED.
A docs-only closure commit advances HEAD after the code-bearing verified SHA; do not infer new source code from that docs-only commit.

## 7. 2026-11-04 production target provisioning and read-only baseline

Historical finding B-S6G-P0-01 (no dedicated target) is RESOLVED for project provisioning, not for full production readiness.

- In the owner-selected KAI Org, the connected Supabase tool created chatagent-business-v1.1-production in Seoul ap-northeast-2 (provider returned ACTIVE_HEALTHY, PostgreSQL 17.11). The project creation cost quote was USD 0/month. No paid plan was activated.
- Historical paused Business B-S0 staging and Personal memory projects remain preserved, unchanged.
- Read-only introspection found no applied migrations, no application tables, and neither Business Control nor Business Continuity schema; the one-time import function is also absent.
- A transaction READ ONLY query verified these facts. The previous full-schema SQL inspection template cannot be executed successfully until canonical migrations are installed; no schema or production migration has yet been applied.
- Evidence validator now confirms projectIdentity/projectActive/distinctFromStagingAndPersonal (3 of 11). Application organization, admin, schema versions, post-schema logical empty target, privileged importer isolation, authenticated readback and runtime secret custody remain PENDING.
- Project reference, credentials, administrator IDs and private DB results are not included in this publicly visible source repository.

Decision: dedicated infrastructure EXISTS, SCHEMA NOT INSTALLED, PRODUCTION CUTOVER NO-GO. Next: B-S6G-3 canonical schema/security review and guarded initialization; separately verify actual application organization and migration authority.

## 8. 2026-11-04 schema initialization, log diagnosis and v1.0 recovery

The historical B-S6G-2 schema-not-installed state is superseded. 11/11 canonical B-S1/B-S2 migrations applied to the new dedicated KAI Org Production target. Control/Continuity versions 1/1, 15/15 private-table RLS, anon-executable bc RPC count 0/24, private schema USAGE denied, user/org/member/task/project/continuity rows zero, importer absent. Evidence 6/11 PASS; application Auth onboarding and signed-in canaries PENDING. See B_S6G3_PRODUCTION_SCHEMA_INITIALIZATION_REPORT_20261104.md.

The screenshot's 38 failed Postgres requests align with initialization-time internal Realtime missing-relation error logs; both named Realtime tables now exist, and fresh SQL checks succeed. See the dedicated report for the timestamps and limits of attribution.

A separate reversible v1.0 runtime recovery was performed after a stale-record finding: original record preserved privately, official backup verified, one Start, post-Start Doctor 15/15, and one tunnel-only kickstart, backend/tunnel HTTP 200. See B_S6G3_V1_RUNTIME_RECOVERY_REPORT_20261104.md. Host boot persistence is still NOT PROVEN.

B-S6 Production Cutover remains NO-GO. No v1.0 STOP for final export, SQLite migration, v1.1 app replacement or PR merge/tag occurred.

## 9. 2026-11-05 B-S6G-4 Production Auth bootstrap and DB RPC canaries

Previous B-S6G-3 statement that Auth users and application organizations are zero is HISTORICAL. The owner completed creation/confirmation of exactly one app Auth user. The canonical guarded one-time Production bootstrap was executed ONCE and verified: release-org exactly one, confirmed ACTIVE ADMIN exactly one, control_state exactly one. Post-bootstrap project/runtime/continuity rows remain zero, importer absent, schema migrations 11.

DB-level positive ADMIN role-simulated profile/schema RPC assertions PASS; negative nonmember, anon, private direct-table, and nonexistent-project checks PASS. These use SET LOCAL ROLE plus synthetic request.jwt.claims within READ ONLY SQL, and do NOT represent a live signed bearer HTTPS flow. Security Advisor findings remain reviewed; no privileges or auth providers changed.

Current target proofs: 7/11 PASS. Remaining four: future cutover operator identity, importer privilege lifecycle, real signed JWT readback, production runtime secret custody. See B_S6G4_PRODUCTION_ADMIN_AND_RPC_AUDIT_20261105.md for complete evidence and residual limitations. v1.0 production remains active and untouched. B-S6 cutover remains NO-GO.

## 10. 2026-11-05 B-S6G-5A authenticated HTTPS preparation (no signed user session)

Actual Production anonymous HTTPS bc_member_profile and bc_schema_status both returned HTTP 401 with SQLSTATE 42501 (PostgreSQL permission denied). The dedicated Mac Studio owner-only isolated canary now has an enabled publishable-only key, SHA-pinned macOS Keychain helper and a secure local interactive login launcher. A separate ephemeral Keychain write/read/delete test PASS and unattended readback fails closed as BUSINESS_AUTH_REQUIRED. Production Auth has one confirmed ADMIN but zero application sessions at preflight.

Real user-signed JWT HTTPS readback and actual v1.1 Gateway-to-Supabase end-to-end are NOT complete. Owner must run ~/ChatAgentBusiness/v11-bs6g5-canary/VerifyAuth.command directly in Mac Studio Terminal and enter credentials locally, never through ChatGPT. Do not change authenticatedReadbackPlan or runtimeSecretCustody from PENDING before signed JWT/Gateway independent verification. Refer to B_S6G5_PRODUCTION_AUTH_HTTPS_AND_KEYCHAIN_READINESS_20261105.md.

The previous 7/11 target-proof gate remains 7/11. B-S6 Production Cutover remains NO-GO.

## 11. 2026-11-05 B-S6G-5B actual signed-JWT direct Production HTTPS

Mac Studio owner-local application login has been completed. Two independent accepted canary readbacks passed with Keychain refresh-token restore, real Supabase-signed JWT access and Profile/Schema Status HTTPS RPC readbacks for exactly one release-org ADMIN. Additional Auth server getUser subject matching and cryptographic JWKS signature/issuer checks PASS; Supabase Auth sessions count one. Neither the auth user ID nor token was disclosed in public Git or ChatGPT.

Prior B-S6G-5A zero-session and pending-login statements are HISTORICAL. The signed-JWT direct HTTPS subgate is now PASS. However actual signed MCP Gateway tool-call E2E and final runtime/operator credential custody remain unproven. Keep full target proof 7/11 PASS with authenticatedReadbackPlan still PENDING pending Gateway. Source export/import, app republish and v1.1 cutover remain NO-GO. Refer to B_S6G5B_SIGNED_JWT_HTTPS_READBACK_AUDIT_20261105.md.

## 12. 2026-11-05 B-S6G-5C isolated signed-v1.1 MCP Gateway E2E

An isolated loopback-only v1.1 MCP fixture on Mac Studio completed actual signed Supabase Production JWT -> MCP SDK tools/call(member_get_profile) -> Production bc_member_profile, with direct HTTPS opaque-profile parity checked privately. JWKS signature, Auth getUser and OAuth protected-resource metadata matched the live issuer. No-bearer and explicitly invalid bearer were denied HTTP 401. Fixture process was terminated. Production DB showed no new project/runtime/continuity records and v1.0 stayed healthy.

This is an actual isolated signed Gateway read-only PASS, NOT a published Business-workspace ChatAgent plugin invocation or final production runtime custody proof. Business ChatGPT account must be used for direct plugin canaries when the correct v1.1 app is staged/published; the current personal Plus chat has no authority to call that Business account plugin. Do not treat the published v1.0 plugin as v1.1. Target 7/11 remains, published authenticatedReadbackPlan still PENDING. See B_S6G5C_ISOLATED_SIGNED_MCP_GATEWAY_E2E_20261105.md.

## 13. 2026-11-05 B-S6G-5D external read-only candidate

Independent source/evidence review found historical B-S0/B-S3B-3 ChatGPT Business developer apps but no active 31861/51961/32171 staging listener. No current actual Business-account v1.1 external app endpoint is proven; installed published Business app is still v1.0.

A new one-tool read-only loopback-only fixture (member_get_profile) was built. Actual Supabase Production JWKS/issuer/audience, Auth getUser, direct RPC vs MCP profile parity, exact one-tool discovery, unauthorized/invalid 401, OAuth protected-resource metadata, signed create_file denial and cleanup all PASS. No staging tunnel/publication or login consent was attempted; a browser OAuth authorization-code/PKCE handshake is NOT proved by a local JWT. Business-account plugin test remains PENDING; evidence 7/11 unchanged. See B_S6G5D_EXTERNAL_READONLY_WORKSPACE_ADMISSION_20261105.md.

## 14. 2026-11-05 B-S6G-5E — independent OAuth discovery preflight

Real Production Supabase project `hjgerbyofaxyfqdckret` returned 200 for the issuer's OIDC metadata with authorization_code/refresh_token and S256, but 404 for the MCP OAuth Authorization Server discovery route at /.well-known/oauth-authorization-server/auth/v1 and the alternate /auth/v1/.well-known/oauth-authorization-server. OIDC success is not OAuth Server discovery proof. The config might require enabled OAuth Server, exact route mapping or registration; no setting was changed or assumed.

A bounded GET-only preflight and fail-closed staging admission validator/tests were added to CI. Existing B-S0 consent UI has public signup, unpinned external browser dependency and inline CSP, so it was NOT deployed/reused. No public staging endpoint or Business-account app was registered; target evidence remains 7/11 and production cutover NO-GO. See B_S6G5E_OAUTH_DISCOVERY_AND_STAGING_DECISION_20261105.md.

## 15. 2026-11-05 B-S6G-5F secure local consent preview preparation

The owner explicitly canceled unsaved Supabase OAuth Server activation. Subsequent live GET-only Auth discovery still returned OAuth authorization server metadata HTTP 404 and OIDC HTTP 200. No remote settings changed.

A separate owner-reviewed login/consent *preview-only* web UI now exists as a local loopback-only static server with no signup, no enabled login/approve/deny buttons, no external CDN, no inline scripts, strict CSP and no-store. Pure pending authorization policy and a dormant SDK orchestration module fail closed on client ID/redirect/scope/ADMIN mismatches. Only synthetic/test fixtures were exercised, not a real consent. The future HTTPS staging site origin and exact Business client registration/redirect remain unresolved. Production Target 7/11, Cutover NO-GO. See B_S6G5F_CONSENT_PREVIEW_SECURITY_REPORT_20261105.md.

## 16. 2026-11-05 B-S6G-5G — offline consent controller and exact HTTPS plan

B-S6G-5G added a synthetic-only one-shot consent controller and a browser candidate that is NOT served by the local PREVIEW_ONLY app. Exact client ID/HTTPS redirect/scope, approved release-org ADMIN, one-use approve/deny, and a no-persistent-session browser contract PASS with mocks. The real staging origin, ChatGPT Business client ID/callback, OAuth Server discovery (404), actual browser PKCE and external app E2E remain PENDING. Auth Site URL is global to this Supabase project and must not be changed without redirect/recovery impact review. The exact staging plan has NULL origin/client/redirect; no public tunnel, Auth setting or v1.0 service changed. Production Target 7/11, Cutover NO-GO. See B_S6G5G_CONSENT_BROWSER_AND_HTTPS_TOPOLOGY_20261106.md.

## 17. 2026-11-06 B-S6G-5H independent free hosting and OAuth client registration review

Connected provider inventory: two unrelated Netlify sites and no Vercel projects/domains. Selected **new independent Netlify Free Consent site**, NOT created/deployed, and retained separate Staging MCP Gateway. The attached pre-publication plan leaves Site URL, OAuth Client ID, exact Business callback and Gateway resource unset. Preferred predefined client only if Business builder supports exact client credentials, else DCR after separate security review; CIMD unsupported/unverified by current issuer evidence. Live read-only OAuth discovery remains 404/200 (OAuth/OIDC). New blocking finding: Supabase OAuth default JWT aud=authenticated does not prove the exact MCP resource audience/parameter propagation expected by OpenAI; must validate or design a scoped token contract before accepting external tool calls. New fail-closed contract in CI never grants publication/import/cutover authority. B-S6 production target remains 7/11 and Cutover NO-GO. See B_S6G5H_FREE_HOSTING_AND_OAUTH_CLIENT_DECISION_20261106.md.

## 18. 2026-11-06 B-S6G-5I — dedicated Free Netlify site created, deployment pending

A new independent Netlify **Free** site `chatagent-business-v11-consent-staging`, ID `6a561d90-21fe-4001-8a04-ea566236f236`, was created in the connected KAI Free team. Existing unrelated Netlify sites were untouched. The site is EMPTY: no deploy ID or published content. Exact 6-file static no-JS preview assets were built on Mac Studio and tested for no signup, API, OAuth, form, consent execution or secrets. The available Netlify connector cannot deploy content, and Mac Studio lacks authenticated CLI. Manual owner Netlify browser upload is required before independent HTTPS/headers acceptance; no Auth/OAuth/Gateway/Business app changes were performed. Production 7/11 and B-S6 Cutover NO-GO persist. See B_S6G5I_NETLIFY_SITE_CREATION_AND_PREVIEW_DEPLOY_HANDOFF_20261106.md.

## 19. 2026-11-06 — B-S6G-5I static hosted HTTPS acceptance (no live OAuth)

Netlify dedicated Free site deploy `6aed3d71a3bf94cd4310cd9e` is READY; five HTTPS functional paths returned 200, Security headers PASS, generated source matches after exact known Netlify HUD/comment edge injection normalization. CSP currently forbids the injected provider script execution; actual live OAuth security approval remains separate. No real OAuth, dynamic client, Business app E2E, customer import or Production cutover. v1.0 health 3/3 HTTP 200, Supabase Authorization Server discovery HTTP 404, Production proof 7/11 PASS. See B_S6G5I_HOSTED_STATIC_PREVIEW_VERIFICATION_20261106.json.
