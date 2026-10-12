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
