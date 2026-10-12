# B-S5D — Mandatory OpenAI Canary Matrix

Date: 2026-10-13
Phase: B-S5D
Status: FIXTURE_PREPARED / LIVE_MATRIX_PENDING
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

Actual OpenAI Developer Mode matrix: PENDING.

`BUSINESS_S5_OPENAI_TOOL_BEHAVIOR` remains PENDING until all live case results and server-side postconditions are reconciled. Safety Compatibility Fallback is not triggered merely by a confirmation UI; it is considered only for reproducible blocking of an otherwise valid, bounded, supported workflow.

## 8. Live staging armed state

Foundation commit: `218a60a3aae0a6f7b9e040b713fc53907e572ea6`.

Disposable provider repository: `exobiz7/chatagent-business-v11-canary` (PRIVATE).

Provider `main` baseline: `b94b4640774ba17c8210ee0f35fe08ef6aba1ced`; open PR baseline: 0.

Disposable branch: `bs5d-openai-matrix-20261013-0eccf6`.

Local project mapping: `bs2a-team-staging` -> current Mac Studio PERSONAL_NODE, mapping revision 7. The workspace is a dedicated disposable clone; provider `main` is not changed by setup.

Initial live health: `matrixCanaryEnabled=true`, `mappingCount=1`, `auditRecordCount=0`, `hostBindingCount=0`, `isolatedBindingCount=0`, `arrivalSequence=[]`.

Staging 31861 PID: `16295`. Production 31850 PID `8871` and tunnel 51961 PID `99496` are unchanged.

Pre-created local-only temp fixtures are excluded through `.git/info/exclude`, so the Git baseline remains clean. Their SHA preconditions are fixed in the live prompt; they are not provider artifacts.

Current live step: execute the 20-case matrix through the connected ChatGPT Developer Mode app. No runtime map/unmap is part of the matrix; cleanup is operator-side after evidence capture.
