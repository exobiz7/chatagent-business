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
