# B-S3D-1 — Semantic Git/GitHub Foundation Report

Date: 2026-10-10
Status: **ACCEPTED / CLOSED**

## Scope

B-S3D-1 implements the local semantic Git/GitHub foundation required by the accepted v1.1 design. It does not activate live OAuth Git/GitHub effects and does not mutate production, the canonical repository, or an external GitHub repository.

The public 39-tool catalog is unchanged. The canonical Git/GitHub surface remains exactly 13 focused tools:

- read: `git_get_status`, `git_get_diff`, `git_get_history`, `git_list_branches`;
- local mutation: `git_create_branch`, `git_switch_branch`, `git_stage_files`, `git_create_commit`;
- remote/provider: `git_clone_repository`, `git_fetch_remote`, `git_pull_ff_only`, `git_push_branch`, `github_create_pull_request`.

## Runtime/project authority

Mapped Git operations use the B-S3A runtime routing contract. An explicitly selected node must still be approved and caller-eligible. With one eligible mapped node the server may resolve that node; with multiple eligible mapped nodes the caller must select one.

Git semantic tools are available only for `STANDARD` project profile. `SAFE`/`READ_ONLY` do not silently acquire Git mutation authority.

A PERSONAL_NODE remains owner-only. SHARED_NODE semantic Git operations do not inherit the broad `process_start_host` host-power requirement; they remain focused, root-bounded semantic actions.

`git_clone_repository` is intentionally different from mapped-project operations: it requires an explicitly authorized runtime node and approved workspace root, creates only a new checkout under that root, and never creates a hidden Business logical-project mapping.

## Command boundary

Implementation: `scripts/business/v1.1/runtime/business-semantic-git-service.mjs`.

Git/GitHub execution is argv-based with `shell:false`; no semantic action is implemented by handing a free-form command to a shell or to `process_start_host`.

The foundation additionally constrains Git-specific execution escape hatches:

- literal Git pathspec mode is forced so `:(...)` pathspec magic cannot broaden staging/history scope;
- repository hooks are disabled for semantic operations;
- fsmonitor is disabled;
- Git `ext::` transport is disabled;
- arbitrary configured clean/smudge/process filters are denied; canonical Git LFS filter commands are the only permitted filter exception;
- remote `core.sshCommand` and `url.*.insteadOf` rewrites are denied for remote semantic operations;
- configured remote URLs must use bounded HTTPS/SSH forms; `file://` is enabled only by the test-only constructor flag;
- read tools use no-optional-lock semantics and bounded outputs;
- external command stderr/host paths are not surfaced as public authority.

This is not a custom Git authorization engine. Remote repository permission, authentication, branch protection, review and CI remain authoritative at Git/GitHub.

## Exact stage/commit contract

`git_stage_files` stages only the exact supplied literal project-relative paths. It does not use `git add .`, wildcard pathspec expansion, commit, or push.

After staging, the server computes SHA-256 over the exact bounded staged binary/full-index diff (`git diff --cached --binary --full-index ...`). The returned `stagedDiffSha256` is the precondition for `git_create_commit`.

`git_create_commit` recomputes the staged diff and refuses the commit on any digest mismatch with `BUSINESS_GIT_STAGED_DIFF_CONFLICT`. It never stages implicitly, amends, rebases or rewrites history.

## Branch/remote safety

`git_create_branch` creates one local branch from a verified commit-ish and does not switch to it.

`git_switch_branch` switches only to an existing local branch and does not create/reset/force a branch.

`git_fetch_remote` fetches configured remote refs without merge, tags or submodule recursion.

`git_pull_ff_only` resolves the configured upstream and executes only an explicit fast-forward-only, no-rebase update.

`git_push_branch` publishes exactly one local `refs/heads/<branch>` to the same remote branch ref. It provides no force option, deletion refspec, tag deletion or history-rewrite mode.

The semantic surface provides no `git reset --hard`, `git clean -fdx`, force push, remote destructive branch deletion or branch-protection bypass.

## GitHub provider boundary

`github_create_pull_request` uses the configured GitHub CLI only after confirming a GitHub remote. It supplies explicit repository and head branch arguments, preventing an implicit push/fork workflow. The semantic action only requests PR creation; it does not merge, force-push, edit branch protection or bypass review/CI.

Provider failure remains a provider denial/uncertainty rather than being converted into local authority.

B-S3D-1 behavioral tests use a fake `gh` executable and therefore create no real PR. Real OAuth/provider validation is deferred to B-S3D-2.

## Local effect audit

`BusinessLocalEffectAudit` is generalized backward-compatibly from filesystem-only events to focused Git/GitHub effects.

Mapped Git events remain project/mapping-revision scoped. Clone events use a workspace-root scope and deliberately carry no invented project ID or mapping revision.

The HMAC chain records bounded effect metadata such as tool/effect/stage, branch/path labels and commit precondition digest. It does not persist Git command argv, commit message, PR body, remote URL, OAuth subject plaintext, file contents or absolute host roots.

The existing live B-S3C-2 14-record filesystem audit was reopened with the generalized implementation and verified unchanged, proving backward compatibility.

## Verification

Authoritative Node: `v24.21.0`.

Targeted gates:

- `BUSINESS_S3D1_SEMANTIC_GIT_CONTRACT=PASS`
- `BUSINESS_S3D1_SEMANTIC_GIT_EFFECTS=PASS`
- B-S3C-2 existing live audit backward compatibility: 14/14 records verified
- `git diff --check=PASS`

Behavioral coverage includes:

- bounded mapped status/diff/history/branch reads;
- create branch without switch;
- safe existing-branch switch;
- literal exact-path staging;
- pathspec-magic non-expansion;
- exact staged-diff SHA commit precondition and mismatch refusal;
- one-branch non-force push to a disposable bare remote;
- fetch and ff-only pull from disposable remote;
- clone into approved disposable workspace without hidden Business mapping;
- arbitrary custom filter denial;
- `core.sshCommand` denial;
- `ext::` remote denial;
- STANDARD-only project gate;
- PERSONAL_NODE owner mismatch denial;
- SHARED_NODE semantic Git without broad host-power opt-in;
- multi-node explicit selection;
- fake-GitHub explicit repo/head PR creation with no hidden push/merge/force;
- local HMAC audit privacy and scope.

Full regression:

`npm run test:ci` → exit `0`.

## Production/staging impact

- production v1.0 mutation: **none**;
- staging Git effect: **none**;
- OAuth Git effect: **none**;
- external GitHub push/PR: **none**;
- canonical repository business content mutation: only this B-S3D-1 implementation/evidence work;
- B-S3C-2 staging effect gates remain disabled.

## Closure

B-S3D-1 is accepted and closed as the semantic Git/GitHub local foundation.

The top-level `BUSINESS_S3_GIT_SEMANTICS` gate remains in progress until B-S3D-2 proves the focused Git/GitHub surface through the real ChatGPT OAuth path against controlled disposable targets and independently verifies audit/cleanup/provider-policy behavior.
