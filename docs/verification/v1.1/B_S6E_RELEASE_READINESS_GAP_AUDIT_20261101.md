# ChatAgent Business v1.1 / B-S6E pre-cutover safety and release strategy audit

Date: 2026-11-01 KST
Work unit: B-S6E / evidence-first release readiness gap audit
Decision: RELEASE-CUTOVER NO-GO, PRECHECK ONLY
Authority: Accepted Design 2026-10-05 sections 37 (33 steps) and 39 (hard invariants).

## 1. Observed current head and governance

- Initial audited HEAD: a3c13516c285a408509c7d32bd16fffd3167aad9, local = origin, clean before B-S6E edits.
- PR #9: OPEN / DRAFT, base B-S2 branch. GitHub-hosted macOS workflow run 41308757916 / 150 completed SUCCESS for the initial audited HEAD.
- B-S6A read-only exact-head preflight on that initial head: blockers=[] and PRECHECKS_ELIGIBLE_NOT_CUTOVER_AUTHORIZED; two independent hosted standalone checks reported success.
- Current B-S6E code-bearing working tree passed Mac Studio full release-host npm run test:ci on 2026-11-01 (exit 0, 102.46 seconds), including actual Docker/PostgreSQL effect tests and hardened B-S6A contract. Exact post-commit GitHub-hosted checks and a clean-head B-S6A probe still must be verified.
- Protected-main release stacking is material: PR #6 B-S0 -> main (OPEN, not merged); PR #7 B-S1 -> B-S0 (OPEN/DRAFT); PR #8 B-S2 -> B-S1 (OPEN/DRAFT); PR #9 B-S3..B-S6 -> B-S2 (OPEN/DRAFT). Do not merge only PR #9 and claim it released the entire stack. Before §37 step 28, choose and review an approved protected-main sequence, retain linear history, required CI/review, do not squash/rebase/Ready/merge without separate authority. The branch HEAD is a CANDIDATE, not an approved release commit.
- Existing published AIspace ChatAgent Business is v1.0.0 with 17 tools, not the v1.1 39-tool release artifact. B-S6D published v1.0 read-only fresh-chat user-path accepted 2026-11-01.

## 2. B-S6A validation false-positive risk found and repaired in development

Finding B-S6E-F01 (preflight accuracy defect):
- The older read-only readiness probe called HTTP GET /healthz on the v1.0 application port 31850, but that endpoint is NOT the v1.0 app readiness route; valid v1.0 readiness endpoint is /health.
- The old probe treated any HTTP response, including HTTP 404, as app-port responding. The probe also did not gate on /readyz, the tunnel readiness endpoint which had actually returned HTTP 503 before the approved tunnel-only recovery.
- Separate v1.0 operator health was checked, so this did not by itself prove that an unhealthy service could pass the entire previous preflight; it did mean the app/tunnel HTTP checks were too permissive.
- Minimal repair on B-S6A only: perform read-only GET /health (31850), require HTTP 200 and JSON ready=true, phase B5, execReady=true and execHealthy=true; for production tunnel require both 51950/healthz and /readyz HTTP 200. Preserve existing status output compatibility, distinguish port response from readiness, fail closed on invalid/missing body.
- Added pure readiness classifiers and deterministic negative tests for non-200 responses, invalid phase/flags and readyz 503. B-S6A contract test PASS. Mac Studio full release-host test:ci PASS/102.46s on the exact code-bearing working tree. GitHub hosted CI on the final commit remains to be checked.

No production application, tunnel, database or config was changed to repair this detector.

## 3. Migration / consistency evidence and outstanding release controls

Already accepted in B-S4A (DISPOSABLE TARGET ONLY):
- Bounded source SQLite logical exporter with read-only DB open, HMAC-seal/event-chain/integrity/schema checks and private 0600 exclusive output.
- Control-plane organization normalization; preserving source task/checkpoint IDs, revisions, event order and source contextDigest.
- One-time SQL importer public.bc_import_snapshot(jsonb,uuid) restricted from public/anon/authenticated; requires matching organization slug, active ADMIN actor, empty target and verified canonical SHA-256 payload.
- Disposable PostgreSQL 16 test proves actual import, authenticated readback, per-task contextDigest preservation, rejected duplicate import and function retirement via bs4-retire-one-time-import.sql.
- Encrypted snapshot/restore and operator integration (B-S4B/B-S4C) accepted; this does not constitute a production restore rehearsal.

Pre-cutover obligations NOT SATISFIED:
1. Prove dedicated production Supabase project/organization slug release-org, approved active migration ADMIN identity, target state empty and correct production schema/version, without copying staging identities or credentials into the public repo.
2. Final source STOP and official fresh verified source backup in the approved maintenance window. Existing B-S6C verified pre-start snapshot is NOT a stopped-source cutover snapshot.
3. Export only the STOPPED actual v1.0 source; capture logical counts, revisions, source digest and complete HMAC event integrity. Check source project enabled/profile constraints again at window time; the earlier count of 3 raw events is historical, not immutable.
4. Define tested operator-only SQL execution with strict target proof, transaction result/receipt capture and guarded exactly-once submission. There is a tested SQL function and a source export CLI, but not an accepted end-to-end production import orchestration CLI; this is an OPERATIONS RUNBOOK/OPERATOR GATE, not evidence of a model implementation defect.
5. Independently authenticated per-project and per-task readback, ID/count/revision/contextDigest and target event-chain reconciliation; only on exact success retire one-time importer and verify it is gone.
6. Record a fail-closed response to uncertain importer execution or network loss: inspect actual target before ANY retry; never blind retry, dual-write or silently overwrite.
7. Protect private live SQLite/WAL/SHM, deployment credential, original config, all source backups and incident artifacts outside public Git/ChatGPT logs.

## 4. Runtime/restart persistence risk (release blocking)

- The running v1.0 server process is healthy (owned PID 38634 after authorized B-S6C recovery), while launchctl com.chatagent.business.server reports not running / last exit=1.
- Read-only LaunchAgent inspection: server RunAtLoad=true, KeepAlive=false and invokes Start.command; tunnel RunAtLoad=true, KeepAlive=true. These are distinct supervisor states, not contradictory server liveness claims.
- Oct 14 host reboot left prior runtime record for PID 8871; the fail-closed operator prevented an unsafe blind Start until separately approved reversible quarantine and backup recovery on Oct 28.
- The approved Nov 1 tunnel-only restart recovered readyz 503 and left PID 38634 intact, but it did NOT test v1.0 server boot persistence, nor the v1.1 restart/recovery contract.
- REQUIRE before release GO: written owner-approved persistence behavior and post-cutover restart test plan with exact identity/port/record checks, operator ownership, bounded stop conditions and rollback. Prefer an isolated disposable machine/session test of stale-record detection and clean restart before the production maintenance window; host reboot is not authorized by this unit.
- No auto-deletion of stale record, launchctl kickstart of v1.0 server, or reboot as a hidden preflight step.

## 5. GO/NO-GO matrix

| Gate | Current | Requirement for GO |
| --- | --- | --- |
| B-S0..B-S5 functional foundation | PASS historical | Preserve accepted scope |
| B-S6D published v1.0 fresh chat | PASS | Keep evidence limitations |
| Initial head hosted CI & provider protection | PASS at a3c1351 | Recheck on exact final approved HEAD |
| Hardened B-S6A preflight regression | Targeted PASS; full release-host CI PASS | Hosted CI + fresh probe on exact final HEAD |
| v1.0 runtime + tunnel /health and /readyz | PASS at inspection | Must remain PASS through window |
| v1.0 Doctor, restart persistence | Historical Doctor PASS; persistence NOT TESTED | Validate at correct checkpoint |
| New stopped-source backup/export | NOT STARTED | Exact maintenance window |
| Supabase production organization and target proof | NOT PROVEN | Independently verify correct empty target |
| One-time production import/readback/retirement | NOT STARTED | Verified gated C2 |
| v1.1 runtime canaries + restart/revoke | NOT STARTED | Verified gated C3 |
| Post-cutover encrypted backup + published app | NOT STARTED | Verified C4 |
| PR stack protected-main release strategy | UNAPPROVED | Explicit stack/release review |
| Owner maintenance window + operator/rollback owner | NOT SET | Separate written approval |

**Overall: NO-GO FOR PRODUCTION CUTOVER.** This is not a feature regression and does not reopen accepted B-S4/B-S5. B-S6 remains preparation-only until explicit approval.

## 6. Required next bounded unit

B-S6F — Cutover operationalization and independent release decision:
1. Receive current exact-head CI results, fix any findings, pin reviewed release candidate.
2. Build production migration command/receipt/checklist from B-S4A SQL and original source export *without running it*; explicitly assign operator and target authority.
3. Document/test isolated restart-persistence and runtime-identity safety gates; do not reboot or restart live v1.0 without approval.
4. Establish protected PR-stack integration and review/CI sequence.
5. Provide owner-filled cutover window, primary/verifier/rollback ownership and rollback cutoffs; re-evaluate GO/NO-GO, then STOP for separate §37 cutover authorization.

Public evidence hygiene: no private paths, screenshots, raw secrets, live organization member IDs or backup file names are included in this audit.
