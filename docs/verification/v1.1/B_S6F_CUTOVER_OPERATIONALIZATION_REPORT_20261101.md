# ChatAgent Business v1.1 — B-S6F cutover operationalization & independent release decision

Date: 2026-11-01 KST
Work unit: B-S6F
Verdict: **B-S6F OPERATIONAL PREPARATION ACCEPTED/CLOSED; RELEASE CUTOVER NO-GO**.
Canonical authority: Accepted Design 2026-10-05 section 37 required order and section 39 hard invariants.
Production change: NONE (only local repo documentation, tests and read-only operator/CI probes).

## 1. Actual repository / release authority

- Starting local and origin HEAD: 0265fdc94b1668ab77045e1686c12c2d5e5c7f82, clean, branch feat/business-v1.1-bs3-runtime-routing, PR #9 OPEN/DRAFT, source v1.0.0 still running.
- Starting 0265fdc HEAD two GitHub macOS CI runs SUCCESS, actual 31850/health and tunnel 51950/healthz + /readyz HTTP 200, v1.0 operator RUNNING/healthy B5.
- Existing accepted B-S4 disposable PostgreSQL migration / encrypted backup foundation and B-S5 canaries NOT reclassified as actual production migration.
- No release tag; no production Supabase import, no final source SQLite export, no host reboot, no PR ready/merge.

## 2. Deliverables / auditable test contract

1. docs/ops/B_S6F_PRODUCTION_CUTOVER_RUNBOOK_20261101.md: complete accepted 33-step runbook with operator/verifier separation, stop/rollback cutoffs, one-time importer/retirement, source/target identity and protected GitHub integration.
2. docs/verification/v1.1/B_S6F_CUTOVER_DECISION_WORKSHEET_20261101.json: exact step enumeration, all unexecuted future steps NOT_STARTED, honest current prerequisite status, candidate SHA, stacked PR refs.
3. scripts/business/v1.1/bs6f-cutover-readiness.mjs: read-only and non-authorizing worksheet schema/step/PR-stack verifier; rejects wrong step names/count, preclaimed future PASS, malformed SHA, forged self-approval, wrong keys and invalid productionCutoverStarted flag. Under no circumstance returns executionAllowed=true.
4. scripts/business/v1.1/bs6f-cutover-readiness-test.mjs: deterministic valid and malicious-negative contract tests.
5. scripts/business/v1.1/bs6f-disposable-process-lifecycle-test.mjs: actual disposable localhost child launched under temporary nonproduction path; read-only B-S6B probe detects live process and, following a bounded STOP of that owned disposable child, identifies stale runtime record and NO-GO with original record unchanged. No live v1.0 process effects, no launchctl changes, no actual host reboot. This verifies a process/record boundary, NOT macOS restart persistence of the v1.1 Gateway or nodes.
6. package.json CI wiring: B-S6F contract and disposable fixture tests added to full and derived macOS hosted CI without weakening B-S4/B-S5 actual release-host Docker/PostgreSQL tests.

## 3. Principal unresolved operational risk

**Production Supabase target**: actual production project/ref, matching organization slug release-org, active admin, empty continuity target and final-schema check have not been proven. Existing staging source and historical B-S4 disposable PostgreSQL rehearsal are not acceptable replacements.

**Migration**: full source read-only exporter (with HMAC integrity) and one-time SQL importer with authenticated readback/contextDigest parity have accepted fixture tests. A hardened production operator command/receipt sequence, maintenance-window source freeze, fresh verified backup, target proof and no-blind-retry handling require approval and real evidence. No SQL import was run in this unit.

**Restart persistence**: v1 server LaunchAgent RunAtLoad=true, KeepAlive=false; former supervisor exit=1 despite manually running v1 server. Tunnel KeepAlive=true. Existing B-S6C safe recovery and 2026-11-01 tunnel-only restart do not prove Mac reboot recovery. B-S6F disposable life-cycle only verifies stale-record denial. Real v1.1 restart/revoke test remains normative steps 23–24, and reboot requires its own approval.

**Protected branch integration**: GitHub current main requires strict standalone CI, ≥1 review, enforce admins and linear history; merge methods rebase/squash available. Current PR stack: #6 B-S0/main, #7 B-S1/B-S0, #8 B-S2/B-S1, #9 B-S3+/B-S2. Merging #9 alone would not integrate the whole stack into main. Preferred decision proposal: a separately reviewed full-stack release-integration PR based on protected main, exact candidate source provenance and entire cumulative diff; retain existing stacked PRs without merging during preparations. Rebase/squash may change main SHA, requiring independent deployed-artifact and final-tag provenance. This proposal is NOT an approval to create, ready or merge such a PR.

**Owner approvals**: maintenance window, primary operator, verifier and rollback authority unassigned; no production cutover approval. They are real release blockers even if a read-only precheck returns zero technical errors.

## 4. Release GO criteria and decision

- Current worksheet verdict: NO_GO_CUTOVER, deliberately non-authorizing.
- Automation cannot decide the final cutover; explicit owner approval and unambiguous production DB/source/runtime evidence are mandatory.
- §37 steps 4–33 remain NOT STARTED and may only be conducted in exact normative order after gates 1–3 and separately authorized window.
- §39 protects secrets, org isolation, approved nodes, no hidden security bypass, safe UNCERTAIN handling and v1.0 rollback until v1.1 acceptance.

## 5. Next work after B-S6F

B-S6G — final owner-assisted production target identity and precise operator rehearsal **without** live migration, plus preapproved integration PR release candidate and restart-persistence plan. The owner must supply or authorize authorized production target details/identities via secure app/console controls and designate the maintenance/rollback owners. Do not run a release cutover until a separate owner authorization is explicitly received.

This report is a technical evidence index; review the exact final Git HEAD and CI associated with this unit before treating B-S6F as accepted/closed.

## 6. Verification closure / 2026-11-01

**Actual B-S6F code-bearing commit**: 77f82dbeeea01446d4b2929a8220d62ad43a880d.

- Mac Studio full release-host npm run test:ci: PASS/exit 0 (104.63 seconds), includes real Docker/PostgreSQL effect coverage and new B-S6F tests.
- Mac Studio npm run test:ci:hosted: PASS/exit 0 (87.57 seconds).
- GitHub macOS hosted CI on exact code-bearing HEAD: runs 41316360392 and 41316363727 both completed SUCCESS.
- Exact HEAD read-only B-S6A preflight after both CI completions: local=origin, clean, canonical+canary protected main and required checks true, production /health and tunnel /healthz+/readyz all ready, blockers=[] and PRECHECKS_ELIGIBLE_NOT_CUTOVER_AUTHORIZED.
- Exact 33-step worksheet structurally valid; full release host/hosted CI PASS, operating v1 Status PASS; source Doctor (current), unreviewed release-head approval, Supabase target, maintenance/roles, importer/rollback and real reboot persistence remain PENDING. Current step 3 PENDING, steps 4–33 NOT_STARTED.
- All documented tool and process life-cycle checks are **nonproduction or read-only**; the production v1 server/tunnel were not restarted or modified.

B-S6F technical/preparation unit: **ACCEPTED/CLOSED**, with operational release blockers intentionally retained.

B-S6 live cutover: **NO-GO / NOT STARTED / NOT AUTHORIZED**.

After this documentation-only closure commit, its new HEAD may differ from the verified B-S6F code-bearing SHA; do not infer that a later *final release* SHA is approved from this evidence. Any new code-bearing change requires exact-head tests and final release pinning.
