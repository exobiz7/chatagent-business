# B-S3D-2 — Staging OAuth Semantic Git/GitHub Canary

Date: 2026-10-10
Status: **STAGING ARMED / LIVE OAUTH EFFECT PENDING**

## Purpose

B-S3D-2 is the real ChatGPT OAuth safety canary for the accepted B-S3D-1 semantic Git/GitHub foundation. It must prove that an authenticated Business member can use focused Git/GitHub semantic tools on an approved runtime node without falling back to generic host execution, while GitHub remains the final remote/provider authority.

Production v1.0 and the canonical `chatagent_business` repository remain frozen. The live canary uses a dedicated private GitHub fixture repository and a disposable clone under the approved `proj04` workspace root.

## Committed fixture

Fixture implementation head:

`ec727d529d9726e1cdf704bb168f5a4be9d2b95d`

Files:

- `scripts/business/v1.1/bs3d2-live-fixture-server.mjs`
- `scripts/business/v1.1/bs3d2-live-fixture-smoke-test.mjs`
- `package.json`

The canonical 39-tool public catalog is unchanged.

While the temporary B-S3D-2 gate is armed, live effects are limited to:

- `runtime_map_project`
- `runtime_unmap_project`
- the canonical 13 Git/GitHub semantic tools
- `fs_create_file` for exactly one bounded canary marker file

All process tools remain probe/no-effect. No generic shell/host-process fallback is available through this staging fixture.

## Dedicated GitHub fixture

A dedicated private repository was created for reusable Business Git/GitHub semantic canaries:

`exobiz7/chatagent-business-v11-canary`

Properties at arm time:

- visibility: PRIVATE;
- default branch: `main`;
- `main` seed OID: `b94b4640774ba17c8210ee0f35fe08ef6aba1ced`;
- canary branch absent;
- open pull requests: `0`.

The seed commit contains only a README identifying the repository as a staging canary. The repository is not production source and is not the canonical ChatAgent Business repository.

## Exact live contract

Logical project: `bs2a-team-staging`

Runtime node: `ad610e88-e671-4b7d-818d-a2f1f2eb2de1` (`Mac Studio B-S1C`, PERSONAL_NODE)

Workspace root ID: `proj04`

Clone directory: `bs3d2_canary_clone`

Repository URL: `https://github.com/exobiz7/chatagent-business-v11-canary.git`

Feature branch: `bs3d2-oauth-canary-20261010`

Marker file: `oauth-canary.txt`

Marker content: `BS3D2_OAUTH_GIT_CANARY\n`

Marker SHA-256: `b14fe9a858c85a1a9b66f2815315eaf753d7b4f8e10a0b4238d428f0b92050d6`

Commit message: `test: B-S3D-2 OAuth Git canary`

Draft PR title: `B-S3D-2 OAuth Git Canary`

Draft PR body: `Automated staging canary; no merge requested.`

Map operation UUID: `7f7a114a-6ef8-4e92-8a2c-acb7658851c0`

Unmap operation UUID: `cdf03dd3-3e04-405a-91c3-8abee51c8f0d`

The server-side canary gate denies any different repository URL, clone destination, branch, marker path/content, commit message, PR title/body/base/head, project, runtime node, workspace root, or mapping operation UUID before effect.

`git_create_commit` still requires the actual `stagedDiffSha256` returned by `git_stage_files`; the temporary canary gate only validates that the supplied precondition has SHA-256 form. The B-S3D-1 service independently performs the exact staged-diff equality check immediately before commit.

## Intended live sequence

1. clone the private canary repository into the exact approved clone directory;
2. map `bs2a-team-staging` to that clone with exact expected Git remote verification;
3. read status/branches;
4. fetch `origin` and run `git_pull_ff_only` on `main`;
5. create and switch to the exact canary branch;
6. create the exact marker through `fs_create_file`;
7. inspect diff;
8. stage exactly `oauth-canary.txt` and capture `stagedDiffSha256`;
9. inspect staged diff;
10. create exactly one commit using that returned SHA precondition;
11. push only the same-name canary branch to `origin`;
12. create one draft PR from the canary branch to `main`;
13. verify history/branches/status;
14. exact-revision unmap.

After the live OAuth result is returned, independent Mac Studio closure must verify local mapping/audit state and GitHub branch/commit/PR state. Operator cleanup will then close the canary PR, delete only the canary branch, remove only the disposable clone/seed directories, and disable the temporary staging Git effect gate. The private canary repository and its `main` seed remain for future tests.

## Local effect audit

B-S3D-2 uses a fresh owner-private `BusinessLocalEffectAudit` state. At arm time:

- audit record count = `0`;
- mapping count = `0`;
- clone destination = absent.

The audit stores HMAC-chained bounded effect metadata. It does not persist Git argv, commit-message text, PR body text, remote URL, OAuth subject plaintext, credentials, file contents, or absolute host roots.

## Pre-activation validation

Authoritative Node: `v24.21.0`.

Passed before activation:

- `BUSINESS_S3D1_SEMANTIC_GIT_CONTRACT=PASS`
- `BUSINESS_S3D1_SEMANTIC_GIT_EFFECTS=PASS`
- `BUSINESS_S3D2_LIVE_FIXTURE_SMOKE=PASS`
- `git diff --check=PASS`
- full `npm run test:ci` → exit `0`

GitHub CLI authentication is available to the logged-in macOS user through the existing provider credential store. No GitHub token is persisted in the fixture, repo, MCP response, audit state, or documentation.

## Staging activation evidence

Immediately after activation:

- production `31850` remained PID `8871`;
- B-S3D-2 staging `31861` started PID `1956`;
- secure tunnel `51961` remained PID `99496`.

Staging health:

- `status=live`;
- `gitCanaryEnabled=true`;
- `mappingCount=0`;
- `auditRecordCount=0`;
- `gitEffectTools=13`;
- `fileEffectTools=[fs_create_file]`;
- `processEffectTools=[]`.

Unauthenticated `/mcp` returned HTTP `401` with the OAuth protected-resource challenge.

At arm time the disposable clone destination did not exist, the remote canary branch did not exist, and the canary repository had no open PR.

## Closure requirements

Do not mark B-S3D-2 accepted until a real connected ChatGPT app completes the intended OAuth sequence and independent verification proves:

1. clone occurred only inside the approved workspace root;
2. clone did not implicitly create a Business mapping;
3. logical project mapping used the exact Git remote expectation;
4. project profile admitted semantic Git as STANDARD;
5. fetch and ff-only pull reached the real GitHub provider without merge/rebase fallback;
6. exactly one named local branch was created/switched;
7. only the exact marker path was staged;
8. commit used the exact returned staged-diff SHA precondition;
9. push published only the same-name branch without force;
10. one draft PR was created against `main` without hidden push/merge;
11. exact-revision unmap succeeded and final mapping state is empty;
12. expected HMAC audit sequence exists and contains no forbidden payload/host-path data;
13. no process/host-exec fallback occurred;
14. canonical ChatAgent Business repo and production runtime remained unchanged;
15. temporary Git effect gate was disabled after the pass;
16. operator cleanup closed the canary PR, removed only the canary remote branch and local disposable checkout, while preserving canary `main`.

Until these requirements are independently verified, authority remains **STAGING ARMED / LIVE OAUTH EFFECT PENDING**.

## Live OAuth closure — ACCEPTED / CLOSED

The real connected ChatGPT OAuth canary completed the full bounded workflow successfully on 2026-10-10.

Observed live results:

- project profile: `STANDARD`;
- private canary clone: PASS;
- mapping revision: `4`;
- initial branch / worktree: `main` / clean;
- real GitHub fetch: PASS;
- ff-only pull: PASS, `main` remained `b94b4640774ba17c8210ee0f35fe08ef6aba1ced`;
- branch create/switch: PASS for `bs3d2-oauth-canary-20261010`;
- marker file: `oauth-canary.txt`, expected content SHA-256 PASS;
- staged diff SHA-256: `fd59735f3ece1045e1029218b3007d03a17de41bbd1aee9545528739b5dc329b`;
- commit: `dbd285fad6dc10411ccd1600e8e25ba34c83ba9e`;
- same-name non-force push: PASS;
- GitHub draft PR: `#1`, base `main`, head `bs3d2-oauth-canary-20261010`, unmerged;
- exact-revision unmap: PASS for revision `4`;
- final mapped-project result: none;
- no process tool, force push, reset, clean, history rewrite, branch delete, PR merge/close, or continuity mutation occurred during the OAuth canary;
- no absolute host path was disclosed through the connector result.

### Independent GitHub verification

The connected GitHub provider independently confirmed before cleanup:

- PR `#1` was open, draft, unmerged, base `main`;
- PR base SHA was the unchanged seed `b94b4640774ba17c8210ee0f35fe08ef6aba1ced`;
- PR head SHA was `dbd285fad6dc10411ccd1600e8e25ba34c83ba9e`;
- exactly one file changed: `oauth-canary.txt`;
- the branch file content was exactly `BS3D2_OAUTH_GIT_CANARY\n`;
- the canary branch existed before cleanup.

### Independent Mac Studio verification

Local authority state matched the OAuth report:

- mapping registry contained exact MAP/UNMAP receipts for revision `4` and finished with `mappings=[]`;
- disposable clone HEAD was `dbd285fad6dc10411ccd1600e8e25ba34c83ba9e`;
- clone `origin` was the dedicated private canary repository;
- working tree was clean;
- no residual canary process was present;
- canonical ChatAgent Business worktree remained clean before closure documentation.

The owner-private local effect audit verified its HMAC chain with exactly `20` records: ten effects, each represented by `ISSUED -> COMPLETED/OK/COMMITTED`:

1. `git_clone_repository`;
2. `git_fetch_remote`;
3. `git_pull_ff_only`;
4. `git_create_branch`;
5. `git_switch_branch`;
6. `fs_create_file`;
7. `git_stage_files`;
8. `git_create_commit`;
9. `git_push_branch`;
10. `github_create_pull_request`.

Raw audit inspection confirmed no persistence of the marker file content, absolute host root, commit-message text, PR-body text, or full remote URL. OAuth identity remains represented only through the audit actor digest contract.

### Cleanup and platform-safety observation

After independent verification, cleanup was deliberately outside the semantic canary so that evidence remained inspectable first.

A connected GitHub tool request to close PR `#1` was blocked by OpenAI's safety layer. This did **not** occur during the B-S3D-2 semantic Git/GitHub canary itself and does not invalidate its functional result; it is retained as concrete evidence for the later `BUSINESS_S3_OPENAI_SAFETY_CANARY` decision.

Because cleanup had already been explicitly authorized and was restricted to the dedicated canary assets, the authenticated Mac Studio GitHub/Git tooling then performed only these exact cleanup actions:

- close canary PR `#1` without merge;
- delete only remote branch `bs3d2-oauth-canary-20261010`;
- preserve `main` at `b94b4640774ba17c8210ee0f35fe08ef6aba1ced`;
- remove only `/Volumes/SSD 4T/z_proj/proj04_chatagent/bs3d2_canary_clone` after remote/head/mapping safety checks.

Post-cleanup GitHub verification confirmed PR `#1` is closed and unmerged and the canary branch is absent.

The staging launch gate was changed to `BS3D2_ENABLE_GIT_CANARY=0` and only staging `31861` was restarted. Final health:

- `gitCanaryEnabled=false`;
- `dbBackedMutations=[]`;
- `gitEffectTools=[]`;
- `fileEffectTools=[]`;
- `processEffectTools=[]`;
- `mappingCount=0`;
- `auditRecordCount=20`.

Production `31850` remained PID `8871`; secure tunnel `51961` remained PID `99496`.

Post-cleanup validation passed under Node `v24.21.0`:

- `BUSINESS_S3D1_SEMANTIC_GIT_CONTRACT=PASS`;
- `BUSINESS_S3D1_SEMANTIC_GIT_EFFECTS=PASS`;
- `BUSINESS_S3D2_LIVE_FIXTURE_SMOKE=PASS`;
- full `npm run test:ci` -> exit `0`.

**Final B-S3D-2 verdict: ACCEPTED / CLOSED.**

The top-level `BUSINESS_S3_GIT_SEMANTICS` gate is therefore PASS. Remaining B-S3 work is SHARED_NODE root-policy closure, isolated-backend regression, and the final OpenAI safety/tool-selection canary.
