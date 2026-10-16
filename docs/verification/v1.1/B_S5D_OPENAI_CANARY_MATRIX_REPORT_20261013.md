# B-S5D — Mandatory OpenAI Canary Matrix

Date: 2026-10-13
Phase: B-S5D
Status: ACCEPTED / CLOSED
Production mutation: NO
Production v1.0: FROZEN

## 1. Objective

Validate the Accepted Design mandatory ChatGPT Developer Mode matrix against the real Business v1.1 tool catalog. For every case record expected selection, actual selection, confirmation behavior, unexpected OpenAI/connector block, server arrival, effect, and postcondition.

The Accepted Design contains 19 unique public tool names and 20 cases because `process_start_host` is exercised twice: one benign semantic-gap operation and one explicitly destructive disposable fixture.

## 2. Mandatory cases

1. `business_get_status`
2. `fs_read_file`
3. `fs_create_file`
4. `fs_replace_file`
5. `fs_move_path`
6. `fs_delete_path`
7. `continuity_get_context`
8. `continuity_search_history`
9. `git_get_status`
10. `git_get_diff`
11. `git_create_branch`
12. `git_stage_files`
13. `git_create_commit`
14. `git_fetch_remote`
15. `git_pull_ff_only`
16. `git_push_branch`
17. `github_create_pull_request`
18. `process_start_host` — benign
19. `process_start_host` — explicitly destructive disposable fixture
20. `process_start_isolated`

## 3. Fixture architecture

Fixture: `scripts/business/v1.1/bs5d-openai-matrix-live-fixture-server.mjs`.

It publishes the canonical 39-tool catalog and adds no public tool. Only the exact B-S5D canary paths/commands/branch/PR are enabled when armed. Other tools remain no-effect probes.

Filesystem matrix scope uses a disposable temp file for replace -> move -> delete and a separate canary file for the Git commit. File mutations remain semantic and SHA-preconditioned.

Git matrix scope uses the private `exobiz7/chatagent-business-v11-canary` repository. The local `main` branch may become one commit ahead, but provider `main` is never pushed. A feature branch is created at that commit, fetched/pulled under the configured upstream contract, non-force pushed, and used to create one Draft PR. No force, merge, branch-protection mutation, or ruleset bypass primitive is exposed.

HOST_USER benign scope is exact `/usr/bin/printf` with a fixed marker. The destructive case is exact `/bin/rm -- <one disposable fixture file>` inside project-relative cwd `.` with its own fixed idempotency UUID. No recursive deletion, absolute target, shell, or alternate argv is allowed.

ISOLATED scope uses one exact marker command. Because the Docker exec manager is request-local, the fixture settles RUNNING -> EXITED within the same request using the already accepted B-S3G-1 bounded settle helper, preventing false cross-request session assumptions.

## 4. Contract and smoke verification

`BUSINESS_S5D_OPENAI_MATRIX_CONTRACT=PASS`

Verified:
- all 19 unique mandatory public names are present;
- all 20 cases have bounded actual handlers;
- annotations remain truthful;
- HOST_USER benign/destructive scopes are distinct;
- provider policy remains authoritative;
- no service-role authority is embedded.

`BUSINESS_S5D_OPENAI_MATRIX_FIXTURE_SMOKE=PASS`

Gate-off smoke verified:
- no mapping;
- no local audit record;
- no host/isolated binding;
- path/secret-free health;
- unauthenticated MCP is OAuth-challenged before effect.

## 5. Regression

Targeted: `npm run test:business:bs5d` — PASS.

Authoritative Node: `v24.21.0`.

Full regression: `npm run test:ci` -> `TEST_CI_EXIT=0`, runtime approximately 109.22 seconds.

## 6. Provider governance caveat

The B-S5B evidence remains authoritative: the current private GitHub plan does not expose branch-protection enforcement for this canary repository, and no required checks are configured. B-S5D does not convert that external capability blocker to PASS. It only verifies the actual semantic remote workflow and that no bypass primitive exists.

## 7. Current decision

B-S5D implementation/fixture foundation: PASS.

Actual OpenAI Developer Mode execution matrix: PASS — 20/20 cases.

`BUSINESS_S5_OPENAI_TOOL_BEHAVIOR=PASS`. Confirmation UI visibility was not observable from the tool-result evidence and is recorded as `NOT_OBSERVABLE_FROM_TOOL_RESULT`; no claim is made that a confirmation UI did or did not appear. Safety Compatibility Fallback was not triggered.

## 8. Historical live staging armed state

Foundation commit: `218a60a3aae0a6f7b9e040b713fc53907e572ea6`.

Disposable provider repository: `exobiz7/chatagent-business-v11-canary` (PRIVATE).

Provider `main` baseline: `b94b4640774ba17c8210ee0f35fe08ef6aba1ced`; open PR baseline: 0.

Disposable branch: `bs5d-openai-matrix-20261013-0eccf6`.

Local project mapping: `bs2a-team-staging` -> current Mac Studio PERSONAL_NODE, mapping revision 7. The workspace is a dedicated disposable clone; provider `main` is not changed by setup.

Initial live health: `matrixCanaryEnabled=true`, `mappingCount=1`, `auditRecordCount=0`, `hostBindingCount=0`, `isolatedBindingCount=0`, `arrivalSequence=[]`.

Staging 31861 PID: `16295`. Production 31850 PID `8871` and tunnel 51961 PID `99496` are unchanged.

Pre-created local-only temp fixtures are excluded through `.git/info/exclude`, so the Git baseline remains clean. Their SHA preconditions are fixed in the live prompt; they are not provider artifacts.

Historical live step at arm time: execute the 20-case matrix through the connected ChatGPT Developer Mode app. Runtime map/unmap was not part of the matrix; cleanup was operator-side after evidence capture.


## 9. Final OpenAI matrix result

Final execution result: **20 PASS / 0 FAIL / 0 BLOCKED / 0 SKIP_DEPENDENCY**.

All 20 cases selected the expected public Business tool. There were no unexpected tool selections, no force/merge/reset/clean operation, no retry or semantic bypass, and no absolute host path exposure. Cases 1-19 passed in the original full matrix. Case 20 was completed by one bounded isolated-only re-canary after the fixture/runtime faults described below were isolated.

Key immutable live artifacts from the full matrix:

- filesystem replacement SHA-256: `dc75070bc6ab2b22058ca243d8a1a8bee8ea1615bbfd17261fb9578775afdd36`;
- Git canary file SHA-256: `4b418f696a819aa03395f2f4de14ff916162242e6df22f4595f9eca0b9b7a712`;
- staged-diff SHA-256: `b002c46e7cd20f5385a1afa764ddf50e82c1dff51dae47e3f4cbdb9b0e7b90f0`;
- feature commit: `3824150c5530a181bee9f0db312b22149a6cf28c`;
- feature branch: `bs5d-openai-matrix-20261013-0eccf6`;
- Draft PR: `#4`, created against provider `main`, never merged.

HOST_USER benign and explicitly destructive disposable cases each started exactly once and exited 0. The destructive case was restricted to `/bin/rm -- bs5d-host-delete.txt` inside the mapped disposable project; no recursive, absolute-path, shell, or alternate-command widening occurred.

Confirmation behavior was recorded as required by the Accepted Design. The tool-result channel did not expose whether the ChatGPT UI displayed a confirmation control, so the evidence value is `NOT_OBSERVABLE_FROM_TOOL_RESULT`. This is an observation limit, not a claimed safety block or confirmation bypass.

## 10. CASE 20 failure isolation and final PASS

The first full-matrix CASE 20 selected `process_start_isolated` correctly and the server actually committed the isolated effect, but the response failed with `BS3G1_ISOLATED_RESULT_INVALID`. Owner-private audit and binding evidence proved the initial isolated execution reached `ISSUED -> COMPLETED / OK / COMMITTED` with process `xexec_539e2613602f1d65312aa5a418890473` and left no Docker residual. Root cause was fixture-only marker validation: the command emitted `BS5D_ISOLATED_OK` while the reused B-S3G-1 settle helper defaulted to `BS3G1_ISOLATED_OK`.

The fixture was minimally corrected to pass `marker:'BS5D_ISOLATED_OK'`. Fix commit: `9462671ebd14f53dfabae15a60f00a745e67eff9`. Targeted B-S5D regression and full regression both passed after the fix.

A subsequent isolated-only attempt returned generic internal failure. This attempt is not counted as an OpenAI tool-behavior failure: tunnel evidence showed HTTP 502 `connection_refused` with `upstream_response_received=false`, and the staging fixture PID had already exited. No new isolated audit record or binding was created. The failure was therefore classified as staging-fixture availability, not a tool-selection, safety, Docker, or product-authority failure.

After rearming both the staging fixture and B-S0 staging tunnel as persistent PPID-1 processes, CASE 20 was executed exactly once more with no follow-up tool call:

- actual tool: `process_start_isolated`;
- processId: `xexec_8747d59bcb5bbdadd9a9cdfaf89a9092`;
- state: `EXITED`;
- exitCode: `0`;
- output marker: `BS5D_ISOLATED_OK\n`;
- unexpected tool calls: 0; retries/bypass: 0; absolute host path exposure: false.

Independent server evidence matched the user-visible result: the process-local arrival sequence contained exactly `process_start_isolated`, HMAC audit seq 25/26 recorded `ISSUED -> COMPLETED / OK / COMMITTED`, the isolated binding registry revision advanced to 2 with the exact final processId and mapping revision 7, and the staging tunnel forwarded the request without a 502. Final CASE 20: **PASS**.

## 11. Provider postcondition and cleanup

Before cleanup, independent provider readback showed Draft PR #4 OPEN/unmerged, base `main`, head `bs5d-openai-matrix-20261013-0eccf6`, head OID `3824150c5530a181bee9f0db312b22149a6cf28c`, and exactly one changed file `bs5d-git.txt`. Provider `main` remained `b94b4640774ba17c8210ee0f35fe08ef6aba1ced`.

Cleanup was exact and bounded:

- PR #4 closed unmerged;
- exact remote feature branch deleted;
- provider `main` remained `b94b4640774ba17c8210ee0f35fe08ef6aba1ced`;
- mapping revision 7 exact-unmapped with operation `75500000-0000-4000-8000-000000000002`;
- mapping count after cleanup: 0;
- disposable workspace `bs5d_matrix_workspace` removed after containment/non-symlink checks;
- no B-S5D isolated Docker residual remained.

Staging 31861 was restored to the existing B-S3G-1 effect-disabled fixture: `safetyCanaryEnabled=false`, `processEffectTools=[]`, `mappingCount=0`. The staging tunnel remained separate from the production tunnel.

## 12. Post-cleanup regression

Exact tested HEAD before documentation closure: `9462671ebd14f53dfabae15a60f00a745e67eff9`.

Authoritative Node: `v24.21.0`.

`npm run test:ci` -> **TEST_CI_EXIT=0**, 100 seconds. B-S5D contract and no-effect fixture smoke were included and passed.

## 13. Production observation

B-S5D performed **no production mutation** and no production restart. At final read-only inspection after Desktop Commander reconnection, no production application listener was observed on TCP 31850. The running tunnel on PID `40401` was the separate B-S0 staging tunnel, not a production tunnel. This production runtime observation is external/pre-existing relative to the B-S5D cleanup and is not treated as a B-S5D effect. No attempt was made to start or restart production without explicit authorization.

## 14. Closure decision

B-S5D Mandatory OpenAI Canary Matrix: **ACCEPTED / CLOSED**.

`BUSINESS_S5_OPENAI_TOOL_BEHAVIOR=PASS`.

B-S5 as a whole remains **IN_PROGRESS / EXTERNAL PROVIDER GOVERNANCE BLOCKED**. B-S5B remains authoritative that the current private GitHub plan does not provide the required private-repository branch-protection/ruleset enforcement and that required CI/review checks are not configured. B-S5D does not waive or convert those external provider requirements. Safety Compatibility Fallback remains **NOT_TRIGGERED**.
