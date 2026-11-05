# ChatAgent Business v1.1 — B-S6F production cutover operator runbook (DRAFT)

Prepared: 2026-11-01 KST
Authority: Accepted Design docs/approved/CHATAGENT_BUSINESS_V1_1_ACCEPTED_DESIGN_20261005.md section 37 (exact order 1–33), section 39 (non-negotiable invariants).
State: **NO-GO / DOCUMENTED PLAN ONLY / NOT PRODUCTION EXECUTION AUTHORITY**.
Current runtime: ChatAgent Business v1.0.0 production. The 2026-11-01 B-S6D published-app smoke and B-S6E exact-head CI are accepted.

This runbook is intentionally a reviewable execution plan, not a shell script. The names in angle brackets denote unknown owner-private values; never paste credentials, SQLite payloads or personal root paths into Git, ChatGPT or CI. A successful worksheet validator can NEVER authorize a live release.

## A. Owner/operator decision register

| Control | Owner must record privately | Gate |
| --- | --- | --- |
| Exact immutable release candidate SHA and artifact SHA-256 | SHA and independent reviewer | Before step 1 |
| Separate owner authorization and approved downtime window | Signed decision, start/end, no-open-user-work condition | Before step 4 |
| Primary Mac Studio operator and second independent verifier | Two distinct identities; action and observation separated | Before step 4 |
| Rollback decision authority | Named person, incident contact, abort deadline | Before step 4 |
| v1 original SQLite and WAL/SHM custody | Stopped-source verified snapshot receipt; owner-private storage | Before step 7 |
| Supabase production target | Authorized project identity, organization slug release-org, schema, active ADMIN, pre-import empty snapshot | Before step 10 |
| Runtime/service topology | v1 server/tunnel identity, new v1.1 Gateway + nodes ports/owners, supervision and collision avoidance | Before step 14 |
| Publication | Exact v1.1 tool manifest, workspace publishing privilege, post-publish smoke owner | Before step 26 |
| Protected GitHub release | Approved integration PR, protected main required standalone check and review, exact artifact/provenance plan | Before step 28 |

Release GO means a named person has accepted the exact evidence and permitted a specific maintenance window; neither a local script nor this document grants that permission.

## B. Pre-operations C0 (normative steps 1–3)

**1. Exact HEAD release-host full regression.** Freeze proposed source SHA; confirm local == remote, clean worktree, correct branch/reviewed diff, verified Node and Docker/PostgreSQL environment. Run npm run test:ci on Mac Studio; capture exit 0, test summary, HEAD and dependencies. Never treat an older accepted HEAD as evidence for a new code-bearing HEAD.

**2. GitHub/macOS hosted CI.** Verify required check name standalone, strict current-head result SUCCESS, correct PR head and review status, branch protection and policy non-bypass. Do not infer full Docker/PostgreSQL coverage from GitHub macOS hosted runs; that belongs to step 1.

**3. v1 production Status/Doctor.** Run installed Status.command; only with authorized owner run installed Doctor.command. Require live PID+instance binding, B5 core checks, audited continuity and backups; confirm actual HTTP GET 31850/health returns 200 + ready B5 and 51950/healthz AND /readyz return 200. LaunchAgent readiness is independent: server historically had KeepAlive=false and exited with code 1 while manually started server remained healthy. Any stale record, identity mismatch or readiness discrepancy = NO-GO. No undocumented repair, auto-quarantine, or reboot.

## C. Authorized maintenance C1 (steps 4–8)

**4. Begin approved window.** Operator + verifier jointly record timestamp, exact source HEAD, frozen source DB, maintenance notification, stop/abort checkpoints, and read-only exposure of legacy ChatGPT v1 user path. Do not start if user activity, credentials or target are uncertain.

**5. Stop v1.0.** Use installed Stop.command for the exact owned v1 instance only. Verify receipt and port state. Do NOT launchctl unload/restart broad services, kill arbitrary PID or delete the runtime record to force STOP; on UNCERTAIN stop the change and reconcile identity first. Preserve stopped v1 app/config and existing production SQLite in place.

**6. Fresh source backup.** Use the installed v1 Backup.command only after successful STOP; operator retains evidence of archive integrity/manifest, source seals and hash, file modes and a separately readable restore key. Keep original DB/WAL/SHM untouched and backed up. B-S6C prestart recovery backup is not an adequate replacement for this step. If backup or restore prerequisites are doubtful, resume original v1 only through approved operator after verifying the original source state.

**7. Final SQLite logical export.** On STOPPED source only: npm run migrate:business:v1-export -- --source-state-dir <OWNER_PRIVATE_STOPPED_SOURCE_DIR> --output <NEW_OWNER_PRIVATE_0600_JSON>; dedicated existing 0700 output parent; exclusive file create (no overwrite). Verify exporter HMAC chain, sealed head and integrity; do not run as a live-state shortcut, or expose payload in logs.

**8. Source receipts.** Independently capture counts, project/task/checkpoint IDs, revisions, contextSeq and per-task contextDigest, archive digest, export logical SHA-256 and source identity. Require complete structural consistency and an independently reviewed migration input record. A historical fixture/event count is NOT the present production snapshot.

## D. Single source of truth migration C2 (steps 9–13)

**9. Prove target** under explicit Supabase maintenance authority: exact production project reference, correct organization slug release-org, schema version, active migration ADMIN identity, no pre-existing logical projects or continuity rows, backup/restore prerequisites and privileged SQL connection security. Reject staging environment or unexpected pre-existing state. A healthy staging connector does not prove production target.

**10. Exactly one import.** Production SQL surface is scripts/business/v1.1/migration/bs4-one-time-import.sql, exposing public.bc_import_snapshot(jsonb,uuid) only for privileged migration actor. Use an approved private SQL operator/session; prove EXECUTE revoked from public/anon/authenticated. Import the *exact verified* stopped-source bundle once, retain private operation receipt. No automatic retries after network failure/ambiguous commit. A tested disposable PostgreSQL 16 importer exists; this runbook does NOT claim a production-import orchestration CLI exists.

**11. Authenticated readback/export.** Query target via supported authenticated bc_export_snapshot per project after the importer returned, using only approved identities; record independent readback artifacts outside repository. Do not mistake SQL import receipt alone for end-to-end correctness.

**12. Reconcile.** Compare exact project keys/profiles, source task/checkpoint IDs and revisions, counts, contextSeq, event-chain integrity and every original handoff contextDigest; compare target against both source export and independently generated expected receipts. Any mismatch or uncertain readback = STOP. Do not rewrite target, replay events or accept partial data.

**13. Retire importer.** Only AFTER step 12 independently PASS, apply scripts/business/v1.1/migration/bs4-retire-one-time-import.sql through approved maintenance role; verify function absence and authenticated EXECUTE denial. No cloud dual-write or SQLite fallback.

## E. v1.1 runtime/canaries C3 (steps 14–24)

**14.** Install exact reviewed v1.1 artifact/digest without destroying retained v1 files.
**15.** Start Gateway and approved runtime nodes with distinct versioned configuration; independently verify service ownership, ports and logged identities. No accidental v1/tunnel collisions.
**16.** Verify exact published v1.1 tool contract with truthful safety declarations; never reuse v1.0 17-tool catalogue as a v1.1 contract. B-S5 canary reported 39 tools; verify the actual approved release manifest, not a fixed count alone.
**17.** TEAM continuity task/checkpoint/handoff on approved disposable project, with identity and revision evidence.
**18.** continuity_search_history scoped/cursor canary, no cross-organization disclosure.
**19.** HOST_USER/process_start_host harmless bounded command, actual runtime node ownership and effect receipt.
**20.** Focused semantic filesystem operations within current approved project root, CAS/uncertain semantics.
**21.** Bounded semantic Git/GitHub operations (branch, stage, commit, fetch, pull, push, PR) on dedicated disposable repository/branch, never production main.
**22.** Multi-node fresh ChatGPT chats verify correct member/node mapping and project authorization.
**23.** Controlled v1.1 runtime restart persistence: stopped and started only with owner acceptance, verify exact persistent node identity, fresh ports, durable session behavior, no stale record or uncontrolled auto-recovery. A host reboot requires its own explicit approval; a simulated process restart is not evidence of full-machine reboot persistence.
**24.** Node revoke and replacement: prove old-node file/Git/HOST_USER new actions denied and replacement requires reauthorization. No unsafe kill of owner host processes.

## F. Close / publication C4 (steps 25–33)

**25.** Create encrypted post-cutover business continuity backup, independently verify archive format/digest and Keychain key custody; separately rehearse empty-target restoration only in a disposable target.
**26.** Update/create v1.1 Business app with actual OAuth 2.1 identity, scoped authorized tool metadata, and privately publish to AIspace; never carry v1.0 No-auth deployment assumptions to v1.1.
**27.** Published-app fresh-chat smoke and independent Gateway/tunnel request correlation, approvals/connector behavior, secret non-disclosure, required read/write canary per accepted strategy.
**28.** Merge the explicitly reviewed release PR under protected main, preserving required check/review/strict/linear history. DO NOT merge PR #9 alone: current stacked chain is PR #6 B-S0/main, #7 B-S1/B-S0, #8 B-S2/B-S1, #9 B-S3+/B-S2. Preferred review strategy to evaluate: one integration PR whose head contains the full reviewed stack and whose base is protected main; validate entire aggregated diff, correct release artifact digest and branch protection, leave original stack draft/unmerged until cleanup approval. If merge changes commit SHA (squash/rebase), record the resulting main commit and provenance; do not claim identity with pre-merge artifact SHA unless measured.
**29.** Tag v1.1.0 on the approved *merged main* commit only, after reconciling source/artifact provenance.
**30.** Publish release artifact with SHA-256/provenance and immutable retained build.
**31.** Update Product Specification to actual published tool/auth/runtime contract.
**32.** Update User Manual including operator controls and permission boundaries.
**33.** Produce DevOps handoff with production state, launch/reboot rules, backup/restore, incident response, exact SHA, CI and rollback ownership.

## G. Stop/rollback policy (independent and fail-closed)

| Failure boundary | Required response |
| --- | --- |
| Step 1–3 status/CI/identity mismatch | NO-GO; no production effects |
| Step 4–5 uncertain stop or stale v1 record | Freeze and reconcile owner identity; do not auto-delete/force restart |
| Step 6–8 source seal, fresh backup or digest failure | Stop; preserve original SQLite, verify receipt before controlled v1 resume |
| Step 9 unauthorized/nonempty target | No importer call; retain v1 source and abort migration |
| Step 10 commit ambiguous | NO AUTOMATIC RETRY. Quarantine target as uncertain; inspect target/receipt out of band |
| Step 11–13 mismatch, import RPC not retired | Stop; mark target abandoned; rollback original v1 without dual-master |
| Step 14–27 auth/revoke/runtime/published-app failure | Stop v1.1; restore retained v1 app/config; use *untouched original v1 SQLite*; restart v1 using approved operator; abandon imported target |
| Step 28–33 review/tag/manual/artifact failure | Freeze release closure, preserve all evidence; do not re-tag or re-merge blindly; apply owner-led reconciliation |

Owner-authorized rollback deadline and decision owner must be recorded before step 4. No operations are automatically run by this runbook. Unknown, partial, UNCERTAIN and missing approval all mean STOP/NO-GO.

## H. Current release decision and remaining evidence

- B-S6F worksheet: docs/verification/v1.1/B_S6F_CUTOVER_DECISION_WORKSHEET_20261101.json; inspect using node scripts/business/v1.1/bs6f-cutover-readiness.mjs --worksheet=<SAME_PATH>. This only returns an advisory decision.
- B-S6F initial worksheet is deliberately NO-GO; roles, target, current Doctor, final backup/import, restart persistence, protected integration PR and owner approval are pending.
- B-S6B stale-record disposable contract PASS is not the same as a v1.1 host reboot/restart canary.
- The accepted B-S4 disposable import/readback and encrypted backup are reusable evidence but not production operations evidence.
- Approval to write this runbook is not permission to execute any of its steps 4–33.

## B-S6G amendment — 2026-11-02

Connected Supabase accounts currently have no verified dedicated ACTIVE Business production project. Historical B-S0 staging is INACTIVE and not a replacement for production. Do not claim step 9 completed. The prepared B-S6G read-only SQL has not been run.

GitHub canonical repository is currently PUBLIC, so raw DB backups, tokens, migration receipts and private operator/member identifiers must remain entirely outside Git. Any change to repository visibility is a separate owner decision.

## B-S6G-3 schema and identity amendment (2026-11-04)

The KAI Org Business v1.1 dedicated Production project now has all 11 canonical B-S1/B-S2 schema migrations applied with verified 15/15 private-table RLS. Auth users and application organizations are still zero. Do NOT treat a Supabase Dashboard login as an application Auth user. Do not run the guarded production bootstrap until exactly one confirmed, non-anonymous actual Auth user is independently verified.

Once an Auth user has been registered by its owner, guarded one-time setup lives outside migrations in scripts/business/v1.1/control/bs6g3-production-bootstrap-single-admin.sql and is NOT YET EXECUTED. Actual source STOP/export/import remains governed by Accepted Design section 37, separate owner authorization and full rollback/identity proofs.

v1.0 runtime was manually recovered with a verified private prestart backup, one scoped Start and tunnel restart; automated host reboot persistence remains unproven.

## B-S6G-4 authenticated admin initialization amendment (2026-11-05)

B-S6G-3 prior 0-user/0-org status is HISTORICAL: exactly one confirmed Auth application user was registered by the owner, and one guarded release-org ADMIN bootstrap was executed. A fresh read-only query confirmed exactly one active ADMIN and one release-org, with all source data target rows still 0 and importer absent. **Never rerun the one-time bootstrap.**

Database role/claim simulation proved key profile/schema and nonmember/anon denial paths, but is NOT a real HTTPS signed JWT or v1.1 Gateway E2E test. The migration operator's actual credential/session approval, importer restricted-execution lifecycle, publishable-only runtime secret custody, a real signed JWT readback, and actual Mac boot persistence remain release gate blockers. Step 9 must not be called fully PASS and the remaining production cutover steps must not be executed without separate authority.

## B-S6G-5A isolated HTTPS and Keychain canary (2026-11-05)

Modern publishable-only Supabase target-pinned canary and owner-only Mac Keychain helper prepared outside the existing v1.0 runtime, no source stop/export/import. Real Production anonymous HTTPS profile/schema RPC calls rejected with HTTP 401 / SQLSTATE 42501. Owner signed-JWT positive live login remains PENDING because the confirmed Auth user has no active session; do not fabricate tokens or treat Supabase management OAuth as an app session. A private Mac Studio-only VerifyAuth.command requires interactive TTY and concealed password input. The one-time ADMIN bootstrap from B-S6G-4 MUST NOT be replayed. Public Git contains no credentials or session receipts.

Continue no-GO for source SQLite final export, Supabase privileged importer, app republish, PR Ready/merge, tag, reboot or customer cutover. See B_S6G5_PRODUCTION_AUTH_HTTPS_AND_KEYCHAIN_READINESS_20261105.md.

## B-S6G-5B signed Production Auth HTTPS verification (2026-11-05)

Owner-local protected app Auth sign-in completed without ChatGPT-visible credentials. Keychain restored and rotated the legitimate refresh token; live signed JWT over TLS passed member profile and schema status for release-org ADMIN. JWKS signature and issuer plus Auth getUser identity corroborated the direct HTTPS proof. Production sessions count one. Previous B-S6G-5A zero-session text is historical. This verifies the direct bearer HTTPS subgate only, NOT a real signed v1.1 MCP Gateway tool-call or final production runtime Keychain custody. Keep authenticatedReadbackPlan PENDING; target 7/11. No privileged importer, original SQLite export, production cutover or PR release authorization.

## B-S6G-5C isolated MCP authorization canary — 2026-11-05

On the actual Mac Studio, the owner's Production Auth JWT from a dedicated Keychain account was verified using public JWKS and used in an isolated **loopback-only** v1.1 MCP Gateway fixture. Read-only member_get_profile tools/call succeeded and matched a separately authenticated Supabase RPC. No-bearer and malformed-bearer were HTTP 401; protected-resource metadata matched expected issuer. No public tunnel, v1.0 port, customer data, project or privileged import endpoint was used; the fixture shut down cleanly.

Do not call this a Business workspace app-plugin canary or a production-deployed v1.1 Gateway acceptance. Separate Business-account UI/plugin testing must occur only in an authenticated Business workspace, against the exact approved target. Current v1.0 Business plugin cannot prove v1.1 cutover. Target evidence remains 7/11 and Cutover NO-GO; do not advance import/PR merge/tag/app republish or reboot gates.

## B-S6G-5D — external Business account path NOT ARMED (2026-11-05)

Created a separate one-read-only-tool localhost MCP fixture with real signed Supabase JWT verification. Exact one tool member_get_profile; missing/malformed bearer denied; write tool create_file rejected even with real ADMIN token; production business data remains untouched. Historical staging 31861/51961 and consent 32171 listeners are not active. No public staging tunnel, new/modified Business app, browser OAuth authorization code flow or fresh Business-account MCP request has been executed.

Do not call a published v1.0 app to claim v1.1 acceptance. Owner approval is required before staging external endpoint, OAuth consent registration or a new Business account app is created/changed. A HOLD-only user-side read-only prompt is prepared at docs/ops/B_S6G5D_BUSINESS_ACCOUNT_READONLY_TEST_PROMPT.md. B-S6 Cutover remains NO-GO and target proof remains 7/11.

## B-S6G-5E — OAuth discovery BLOCKED (2026-11-05)

Supabase OIDC document 200 confirms issuer and advertised auth-code/PKCE metadata, but live OAuth Authorization Server Discovery at both expected locations returned 404. Do not activate public staging tunnel or register new Business workspace plugin until OAuth Server config and discovery are independently verified and owner-approved. Historic B-S0 consent fixture is not approved for reuse with Production: public signup, browser CDN and inline-CSP risks require a dedicated reviewed consent UI. GET-only automated preflight contract blocks OIDC-only false positives; supporting evidence validator never grants import/republish/cutover even if all green. All v1.0 and Production import gates unchanged; no source stop, SQL import, merge, tag, app republish or new paid resource.

## B-S6G-5F — OAuth consent UI PREVIEW-ONLY, NOT PUBLISHED (2026-11-05)

The owner canceled the unsaved Supabase OAuth toggle; issuer OAuth discovery remains 404, OIDC 200. One isolated local consent preview has been built with *disabled* login/approval, no public signup, local pinned SDK UMD only, strict CSP, no-store and fail-closed future client ID/redirect/ADMIN/scopes contracts. There is no real browser authorization code or ChatGPT Business app registration. Site URL is a global Auth configuration: do not set it to a speculative staging URL or activate OAuth without assessing impacts. Existing v1.0 server/tunnel, Auth settings and importer/customer data remain unchanged. Target 7/11, Cutover NO-GO. See B_S6G5F_CONSENT_PREVIEW_SECURITY_REPORT_20261105.md.
