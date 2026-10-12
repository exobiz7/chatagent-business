# B-S5C — Live Failure-Recovery / Node-Revoke E2E

Date: 2026-10-12
Phase: B-S5
Unit: B-S5C
Status: DETERMINISTIC_PASS / LIVE_OAUTH_PENDING
Production mutation: NONE

## 1. Purpose

B-S5C verifies the Accepted Design failure/recovery chain without mutating frozen v1.0 production:

- bounded local filesystem/Git/HOST_USER work remains available during a controlled control/continuity outage while valid cached authority exists;
- continuity mutation fails closed and continuity reads become explicitly UNVERIFIED;
- recovered control-plane node revocation blocks new work on the old PERSONAL_NODE;
- replacement PERSONAL_NODE authority restores bounded work;
- ISOLATED Docker execution still satisfies the existing sandbox contract.

The live staging portion uses an injected transport-outage flag inside the staging fixture. It does not shut down or corrupt Supabase and does not create an offline continuity database.

## 2. Authority model

Project authorization uses `BusinessProjectAuthorizationCache`:

- member + project scoped;
- in-memory only;
- bounded TTL;
- cache fallback only on `BUSINESS_BACKEND_UNAVAILABLE`;
- no fallback for authorization denial;
- expiry fails closed.

Runtime route authorization continues to use the node/session lease contract in `assertRuntimeAuthorization`.

## 3. Deterministic composite regression

Test:

`scripts/business/v1.1/bs5c-failure-recovery-test.mjs`

Actual sequence:

1. warm current STANDARD project authorization;
2. inject backend unavailable;
3. create a mapped project file;
4. create a local Git branch;
5. execute one owned HOST_USER process;
6. attempt continuity mutation and require `BUSINESS_BACKEND_UNAVAILABLE`;
7. require continuity read `UNVERIFIED / CONTINUITY_UNAVAILABLE`;
8. restore control reachability;
9. set old PERSONAL_NODE lifecycle to `REVOKED`;
10. require new file/Git/HOST_USER work to fail with `BUSINESS_RUNTIME_NODE_REVOKED`;
11. replace with a distinct APPROVED PERSONAL_NODE + new mapping revision;
12. verify local read authority returns;
13. run actual ISOLATED Docker command and require `EXITED / 0 / BS5C_ISOLATED_OK`.

Result:

`BUSINESS_S5C_FAILURE_RECOVERY=PASS`

## 4. Deterministic observed invariants

PASS:

- filesystem remains available under bounded cached project/node authority;
- local Git remains available under bounded cached authority;
- HOST_USER remains available under bounded cached authority;
- continuity mutation does not queue offline;
- continuity read does not claim freshness;
- recovered revoke blocks old-node file access;
- recovered revoke blocks old-node Git access;
- recovered revoke blocks old-node HOST_USER start;
- replacement node uses a distinct runtimeNodeId and new mapping revision;
- replacement node can use local project authority;
- actual Docker isolation remains healthy after recovery.

## 5. Live staging fixture

Fixture:

`scripts/business/v1.1/bs5c-live-failure-fixture-server.mjs`

The fixture preserves the canonical 39-tool catalog. It adds no public tool.

When the B-S5C canary gate is off, all canary effects are no-effect probes.

When armed, exact bounded canary operations are allowed only for the staging project and current node:

- `runtime_map_project` during NORMAL mode;
- `git_get_status` to warm/revalidate route authority;
- `fs_create_file` during outage for one exact filename/content;
- `git_create_branch` during outage for one exact branch;
- `process_start_host` during outage for `/usr/bin/printf` with one exact marker;
- `process_start_isolated` during outage for one exact marker command;
- `continuity_get_context` during outage;
- `continuity_start_task` during outage for one exact objective, expected to fail closed;
- normal process status/read/terminate follow-ups.

No GitHub mutation is part of B-S5C.

## 6. Controlled outage mechanism

A localhost-owned flag under the B-S5C private state directory controls transport availability.

NORMAL:

- OAuth identity is verified normally;
- Supabase project authorization is refreshed;
- runtime status/lease is refreshed;
- project/node authority is cached in memory.

OUTAGE:

- fresh control/project loads return `BUSINESS_BACKEND_UNAVAILABLE`;
- continuity RPC transport returns unavailable without contacting Supabase;
- only still-valid cached project/node authority may authorize local work;
- continuity mutation fails closed;
- no SQLite fallback or offline write queue exists.

The same server process remains running across NORMAL -> OUTAGE so in-memory lease behavior is genuine.

## 7. Revocation limitation of live staging step

`bc_runtime_revoke` is an ADMIN control-plane RPC and is intentionally not part of the public 39-tool ChatGPT surface.

The current staging machine has publishable-only runtime configuration and no installed maintenance database credential / reusable operator OAuth refresh-token config.

B-S5C therefore does **not** extract connector OAuth tokens, create service-role authority, or add a hidden admin mutation tool merely to force live revocation.

Actual revoke/replacement semantics remain verified by:

- B-S1C PostgreSQL runtime lifecycle tests;
- B-S5A multi-participant PostgreSQL E2E;
- B-S5C deterministic composite runtime-services E2E.

The live OAuth portion is scoped to outage/local-work/continuity fail-closed behavior.

## 8. Regression

Targeted:

`npm run test:business:bs5c`

PASS:

`BUSINESS_S5C_FAILURE_RECOVERY=PASS`

Full authoritative regression:

`npm run test:ci`

Result:

`TEST_CI_EXIT=0`

Runtime: approximately 100.59 seconds.

## 9. Production and staging safety

Before arming the live fixture:

- v1.0 production remains frozen;
- production 31850 is not changed;
- the existing 31861 staging fixture is effect-disabled;
- tunnel 51961 is unchanged;
- no production database mutation occurs;
- no Supabase outage is induced globally.

## 10. Current gate decision

Deterministic failure/recovery foundation: PASS.

Live OAuth outage/local-work canary: PENDING.

Therefore top-level `BUSINESS_S5_FAILURE_RECOVERY` remains IN_PROGRESS until live OAuth evidence and post-canary cleanup are independently verified.

## 11. Live fixture armed state

Committed staging code:

`d18be9180e94c5f65ac2ba5e7a7195f78e9380fc`

Staging 31861 was replaced only after the committed fix was pushed.

Initial armed health:

- `canaryEnabled=true`
- `outageMode=false`
- `mappingCount=0`
- `projectLeaseCount=0`
- `routeLeaseCount=0`
- `auditRecordCount=0`
- `isolatedBindingCount=0`
- `arrivalSequence=[]`

Staging PID: `56782`.

Production PID `8871` and tunnel PID `99496` were unchanged.

A first startup attempt exposed an out-of-range health-only `audit.readRecent(300)` call. The audit contract allows at most 200 records. The server had not received any OAuth tool call or effect before that failure. The health query was corrected to 200, targeted B-S5C re-passed, fix commit `d18be9180e94c5f65ac2ba5e7a7195f78e9380fc` was pushed, and only then was the staging fixture re-armed.

Historical armed-state note: OAuth NORMAL-mode warm-up was pending at this point; final live closure evidence is recorded in Sections 12–14 below.

## 12. First live outage attempt — bounded expiry behavior

The first human-separated NORMAL -> OUTAGE attempt occurred after the fixed 300-second project authorization lease had expired. Server evidence showed `projectLeaseCount=0` before local effects. `fs_create_file`, `git_create_branch`, `process_start_host`, and `process_start_isolated` were all denied before effect with `BUSINESS_PROJECT_AUTH_LEASE_EXPIRED`. No file, branch, process, binding, audit effect, or Docker container was created.

Continuity behavior in that same attempt was correct: mutation failed closed with `BUSINESS_BACKEND_UNAVAILABLE`, while context returned `UNVERIFIED / CONTINUITY_UNAVAILABLE`. This attempt is retained as a positive fail-closed lease-expiry test, not counted as the local-work outage proof.

## 13. Same-turn live OAuth outage canary — PASS

The fixture was changed only to remove human round-trip delay: a successful NORMAL `git_get_status` refreshes the real project/node authority and then the fixture immediately flips its localhost-only outage flag in the same ChatGPT request. The product `authorization_lease_seconds=300` policy was not changed.

Final user-visible results were: initial Git status PASS on clean `main` with mapping revision 6; `degradedContinuity=true`; `localWorkEligible=true`; exact file create PASS; exact branch create PASS; HOST_USER exited 0 with the expected marker; ISOLATED exited 0 with the expected marker; continuity mutation failed closed with `BUSINESS_BACKEND_UNAVAILABLE`; and continuity context returned `UNVERIFIED / CONTINUITY_UNAVAILABLE` with no continuity authority. Each start tool was called exactly once. Follow-ups were limited to two status reads and two output reads. There was no unexpected tool call, retry, fallback, safety block, GitHub mutation, mapping mutation, or absolute host-path disclosure.

Independent server evidence matched the user-visible report. Arrival order contained exactly 12 calls: NORMAL `git_get_status`, followed by OUTAGE status, file create, branch create, host start/status/read, isolated start/status/read, continuity start, and continuity context. Server postconditions showed mapping revision 6, one valid project lease, one route lease, six local audit records for file/Git/isolated effects, one host binding, one isolated binding, the expected local file, and zero residual Docker containers.

## 14. Post-canary cleanup and final B-S5C decision

Cleanup was exact and bounded. The B-S5C staging process was stopped before local cleanup, the outage flag was removed, and `LocalWorkspaceRegistry.unmapProject` used project `bs2a-team-staging`, the exact node, expected mapping revision 6, and the reserved B-S5C unmap operation. Unmap returned `unmapped=true` and mapping count became 0. The exact disposable `bs5c_canary_workspace` directory was removed only after path, containment, ordinary-directory, and symlink checks.

Staging was then restored to the existing B-S3G-1 effect-disabled fixture. Final staging health has `safetyCanaryEnabled=false`, `processEffectTools=[]`, and `mappingCount=0`. Production PID 8871 and tunnel PID 99496 were unchanged. Docker residual count is 0. Owner-private B-S5C audit/binding evidence is retained only as verification evidence and grants no active mapping authority.

Post-cleanup authoritative regression on Node v24.21.0: `npm run test:ci` -> `TEST_CI_EXIT=0` (about 102 seconds).

B-S5C is therefore **ACCEPTED / CLOSED**. `BUSINESS_S5_DISTRIBUTED_TEAM_E2E=PASS`, `BUSINESS_S5_NODE_SECURITY=PASS`, and `BUSINESS_S5_FAILURE_RECOVERY=PASS`. B-S5 remains open because the GitHub private-plan branch-protection/required-check enforcement blocker remains explicit and the mandatory B-S5D OpenAI canary matrix is still pending.
