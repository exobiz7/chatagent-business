# ChatAgent Business v1.1 / B-S6 cutover decision dossier (DRAFT)

Prepared: 2026-11-01 KST
Verdict: DRAFT, NOT CUTOVER AUTHORIZATION
Authority: docs/approved/CHATAGENT_BUSINESS_V1_1_ACCEPTED_DESIGN_20261005.md sections 37 and 39.

## Current accepted evidence

B-S0 through B-S5 accepted and closed. B-S6C v1.0 runtime recovery accepted and closed. B-S6D published v1.0 fresh-chat read-only smoke PASS/CLOSED 2026-11-01 with explicitly limited tool-to-request log attribution. v1.0.0 remains production.

Working branch: feat/business-v1.1-bs3-runtime-routing; PR #9 OPEN/DRAFT and unmerged. The pre-documentation local HEAD was 21c7465a745272a1f574376a3482f3c693115c06. This is NOT the final approved release HEAD. No v1.1 production migration/release/tag/app republish.

## Decision fields that remain unresolved

| Requirement | State |
| --- | --- |
| Separate explicit owner cutover approval | NOT GRANTED |
| Scheduled maintenance window | NOT SET |
| Reviewed and pinned exact release HEAD/artifact | PENDING |
| Exact-head full regression and hosted macOS CI | MUST RECHECK |
| Primary operator / independent reviewer / rollback operator | MUST DESIGNATE |
| Proven source stop and fresh final verified backup | MUST PERFORM IN WINDOW |
| Logical SQLite export and source digest/revision/counts | NOT PERFORMED |
| Production Supabase target identity/proof | PENDING |
| Once-only import, readback, reconciliation and RPC retirement | PENDING |
| HOST_USER / semantic files / Git / TEAM / search / multi-node / revoke canaries | MUST PERFORM FOR RELEASE |
| Restart persistence and prior stale-record recovery policy | NOT TESTED; NEED EXPLICIT TREATMENT |
| Post-cutover encrypted backup, private publication and smoke | PENDING |
| Release PR merge, v1.1.0 tag, artifact, specs, manual, DevOps handoff | PENDING |

## Accepted Design section 37: execute only after approval

C1 steps 1-8: pin HEAD; full regressions/CI; verify production Status/Doctor; begin approved maintenance window; stop v1.0; fresh verified backup; SQLite logical export and source count/revision/digest record.

C2 steps 9-13: prove target Supabase state; exactly-once final import; authenticated readback/export and identity/count/revision/contextDigest reconciliation; retire import RPC. Fail closed on uncertain mutation.

C3 steps 14-24: install v1.1 artifact; start Gateway/nodes; verify actual published tool contract; TEAM, history search, HOST_USER, focused semantic file, Git/GitHub, multi-node, restart persistence and revoke canaries.

C4 steps 25-33: encrypted post-backup, privately publish changed v1.1 app and post-publish smoke, reviewed PR merge, tag v1.1.0, publish artifact, update Product Specification and User Manual, DevOps handoff.

## Safety and next work unit

Protect all section 39 hard invariants, unchanged original SQLite, retained v1.0 recoverability, and private credentials. Never treat B-S6C recovery backup as the cutover-window final snapshot. No blind retry of UNCERTAIN effects, no dual-master. Rollback before acceptance: stop v1.1, restore retained v1.0 app/config, use untouched original v1 SQLite state, restart v1.0 through its approved operator, abandon partial Supabase import target.

Next: verify exact PR/CI and release-head selection plan, existing import/rollback runbook and reboot persistence risk; fill owner/operator/window data; produce GO/NO-GO recommendation. STOP and obtain separate cutover approval before any production effect.
