# B-S6A — Pre-Cutover Readiness / Release Dossier

Date: 2026-10-18 KST
Work unit: B-S6A (read-only)
Release decision: **NO-GO** — v1.0 production runtime record is stale and application listener is absent.
Production cutover: NOT STARTED. Owner cutover approval: NOT GRANTED.

## 1. Normative authority

The accepted 33-step production sequence and rollback doctrine are defined by docs/approved/CHATAGENT_BUSINESS_V1_1_ACCEPTED_DESIGN_20261005.md, §37. This dossier is an evidence index and readiness decision, not a new normative design. B-S5 was accepted and closed; v1.0.0 remains immutable and recoverable pending verified maintenance. No production state/file/credential/runtime was changed.

## 2. Candidate identity and independent verification

- Accepted B-S5 baseline HEAD: 1412dbeea1ffe89bb6e8dfb6cc305ac5fe0877d4
- Canonical branch: feat/business-v1.1-bs3-runtime-routing. Local and remote heads matched at initial inspection; worktree clean.
- Baseline GitHub hosted macOS push run 38910194454: SUCCESS; PR run 38910206594: SUCCESS.
- PR #9: OPEN, DRAFT, not merged; base feat/business-v1.1-bs2-continuity-foundation.
- Both user-authorized PUBLIC repositories retain protected main branches. Canonical required check: standalone. Canary required check: provider-guard. At least one review, admin enforcement, strict status check, force/delete denial.
- Exact-head full regression and GitHub hosted checks must be rerun for any later release HEAD; accepted baseline evidence is not a substitute for verification of a changed candidate.

## 3. Actual production v1.0 read-only evidence

| Surface | Result |
| --- | --- |
| Server LaunchAgent | not running; last exit code 1 |
| v1.0 installed operator Status | STALE_RECORD, healthy=false, previously recorded PID 8871 |
| Server stderr error identifier | OPS_RUNTIME_RECONCILIATION_REQUIRED |
| Production application port 31850 | unreachable, HTTP 000 |
| Production tunnel port 51950 | HTTP 200; tunnel process running |
| Staging app/tunnel 31861/51961 | HTTP 200 / HTTP 200 |
| Original v1.0 continuity SQLite | present regular file, not modified |
| Production root, state and projects | present, owner-local state directory |
| Production Doctor/Status release gate | NOT PASS |

Interpretation: the durable production runtime record does not reconcile with the actual process. The functioning tunnel alone does not make the v1.0 application healthy. Do not erase/replace runtime records, restart server, restore backup, run launchctl kickstart, or attempt auto-recovery without a separately authorized diagnosis. The Doctor command was not executed in this no-effect unit because it opens continuity/audit state. Require an authorized recorded Doctor result before the cutover stop step.

## 4. Readiness gates and evidence required for GO

| Gate | Current disposition | Required evidence |
| --- | --- | --- |
| B-S5 feature/safety/failure gates | PASS | All five top-level B-S5 gates retained |
| Release candidate exact HEAD | Revalidate after B-S6A commit | Exact local/remote SHA; clean worktree; artifact digest |
| Hosted macOS CI | Baseline PASS | Actual standalone SUCCESS on release HEAD |
| Release-host E2E | Execute for current candidate | Mac Studio Node v24.21.0 full test:ci including real Docker/PostgreSQL |
| GitHub provider controls | PASS on baseline | Protected main, review, CI strict and non-bypass |
| v1.0 Status/Doctor | BLOCKED | Healthy runtime identity and full Doctor PASS |
| Source snapshot safety | PENDING maintenance window | Fresh verified backup, original SQLite retained untouched, full counts/revisions/digests |
| Supabase target | PENDING maintenance window | Proven target state, bounded import authority |
| Final migration | NOT AUTHORIZED | One-time import; authenticated readback; identity, count, digest parity; retirement of import RPC |
| v1.1 startup and canaries | PENDING | Pinned artifact, Gateway/nodes, TEAM/search, HOST_USER, semantic file/Git/GitHub, multi-node, restart/revoke |
| Publication and release | PENDING | Post-cutover encrypted backup, private ChatGPT app publication/smoke, reviewed merge/tag/artifact/manual |
| Explicit owner cutover authorization | NOT GRANTED | Approved window, exact HEAD, rollback owner and target |

## 5. Cutover checkpoint index (Accepted Design §37 controls)

- C0 (steps 1–3): exact-head full regression, independent hosted CI, production Status/Doctor. Require all PASS before separate owner approval.
- C1 (steps 4–8): maintenance window, verified controlled v1.0 stop, fresh source backup, final SQLite logical export and recorded source digests/counts/revisions.
- C2 (steps 9–13): prove Supabase target, single import, authenticated reconciliation, retire temporary import RPC. Never dual-master or silently retry uncertain import.
- C3 (steps 14–24): pinned v1.1 installation and Gateway/nodes, authoritative published tools, TEAM/search/HOST_USER/semantic filesystem/Git/GitHub/multi-node/restart/revoke canaries.
- C4 (steps 25–33): encrypted backup, private ChatGPT app publish/smoke, reviewed release PR merge, tag v1.1.0, artifact, Product Specification, User Manual and DevOps handoff.

## 6. Rollback and stop criteria

Before v1.1 release acceptance: stop v1.1, restore retained v1.0 app/config, use untouched original v1 SQLite state, restart v1.0, and abandon that attempt's imported Supabase target. The present v1.0 runtime is unhealthy: recoverability must be verified, not assumed.

STOP on stale runtime, unhealthy Doctor, missing verified fresh backup, dirty source or mismatched HEAD, invalid Supabase target, any ID/count/revision/contextDigest mismatch, unretired import RPC, unauthorized node, unsafe model/provider behavior, inconclusive mutation, or missing owner approval. Uncertain writes must never be blindly retried.

## 7. Final disposition

B-S6A deliverable is a read-only preflight script, contract regression, release dossier and NO-GO gate. B-S6 production cutover remains NOT STARTED. PR #9 remains Draft; no release tag, import, production restart, or production state changes were performed.

## 8. Repeatable B-S6A preflight

Run from the canonical repository with a concrete full 40-character HEAD:

    npm run probe:business:bs6a -- --head=<EXACT_40_CHARACTER_SHA>

Exit 0 means only that automated prechecks are eligible; it is never owner authorization to cut over. Exit 2 means the HEAD argument is missing or malformed; exit 3 is NO-GO. No runtime record repair, start/stop, migration, backup, Git mutation or server reset is performed.

At the initial dirty-worktree inspection against B-S5 baseline, the live probe returned NO-GO with three separate reasons: dirty/unpinned candidate, unhealthy v1.0 STALE_RECORD runtime, and absent application listener. The provider check, B-S5 authority, and both hosted CI checks for that original HEAD were PASS.

## 9. B-S6A regression evidence

Authoritative Node v24.21.0 full release-host test:ci: PASS, exit 0, 103 seconds, including real Docker/PostgreSQL tests. B-S6A read-only preflight contract: PASS. Mac Studio hosted-mode test:ci:hosted: PASS, exit 0, 75 seconds. Exact final commit GitHub hosted checks are revalidated after commit. B-S6 release is not accepted and no production cutover was authorized.
