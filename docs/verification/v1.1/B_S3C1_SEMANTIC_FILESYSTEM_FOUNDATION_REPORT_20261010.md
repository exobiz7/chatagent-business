# ChatAgent Business v1.1 — B-S3C-1 Semantic Filesystem Foundation

Date: 2026-10-10
Status: **ACCEPTED / CLOSED**
Parent phase: B-S3 — IN_PROGRESS
Next bounded unit: B-S3C-2 — isolated staging OAuth semantic filesystem canary

## Scope

B-S3C-1 establishes the local distributed-runtime filesystem effect foundation only. It does not activate filesystem mutation tools on the public staging fixture and does not close the top-level `BUSINESS_S3_SEMANTIC_FILE_EFFECTS` gate.

Implemented and verified:

- B-S3A mapped-project routing reused for all focused filesystem operations;
- project profile enforcement (`READ_ONLY` read-only, `SAFE` / `STANDARD` mutation-capable);
- reuse of the proven v1 safe file primitives for list/info/read/hash/mkdir/create/replace/patch;
- new descriptor-bound no-overwrite move primitive;
- new bounded regular-file / empty-directory delete primitive;
- owner-private HMAC-chained Business local effect audit;
- no content, OAuth subject, credential, or absolute host path in local audit records;
- mutation intent audit before effect and explicit non-retryable audit uncertainty after a committed effect;
- semantic filesystem operations do not require SHARED_NODE generic host-power opt-in;
- PERSONAL_NODE ownership, node lifecycle, cached lease expiry, mapping revision, and multi-node routing continue to use B-S3A authority.

## Public filesystem contract preserved

The canonical 10-tool surface remains unchanged:

- `fs_list_directory`
- `fs_get_path_info`
- `fs_read_file`
- `fs_get_file_hash`
- `fs_create_directory`
- `fs_create_file`
- `fs_replace_file`
- `fs_patch_file`
- `fs_move_path`
- `fs_delete_path`

No public schema shape or risk annotation changed in this unit.

## Reuse versus new implementation

Reused without weakening:

- `BusinessFileOps` for path normalization, traversal/symlink/.git denial, bounded reads, safe mkdir/create, exact-SHA replace and exact-context patch;
- B-S3A `resolveBusinessRuntimeRoute` for node/mapping authority;
- pinned native create / replace / mkdir helpers already proven by v1 regression.

New bounded primitives:

- `native-move-excl.c`: descriptor-bound source and destination-parent traversal, optional exact source SHA for regular files, destination `RENAME_EXCL`, post-commit identity verification, no overwrite;
- `native-delete-bounded.c`: regular-file exact SHA or empty-directory-only deletion, randomized same-parent staging, identity checks, recovery on non-empty directory, no recursive delete.

The new move/delete primitives are invoked through pinned-hash wrappers. They are not implemented with shell commands and do not route through `process_start_host`.

## Local effect audit contract

`BusinessLocalEffectAudit` is owner-private and HMAC chained. Records contain bounded metadata only:

- actor digest, never raw OAuth subject;
- organization / logical project / runtime node identifiers;
- mapping revision and project profile;
- semantic tool and effect class;
- project-relative target path(s);
- optional precondition digest;
- result/stage/effect outcome.

Records intentionally exclude file content, argv, bearer/OAuth tokens, credentials, and absolute host paths.

Audit behavior:

- inability to persist `ISSUED` intent prevents the filesystem mutation;
- normal deny/failure attempts are recorded when the audit ledger is available;
- committed mutation followed by completion-audit failure returns explicit `BUSINESS_LOCAL_AUDIT_UNCERTAIN`, `effect=COMMITTED`, `retryable=false`;
- HMAC-chain tampering fails closed with `BUSINESS_LOCAL_AUDIT_INTEGRITY_FAILED`.

## Verification

Authoritative runtime:

`/Users/macstudio/.nvm/versions/node/v24.21.0/bin/node` (`v24.21.0`)

Targeted:

- `BUSINESS_S3C1_SEMANTIC_FILE_CONTRACT=PASS`
- `BUSINESS_S3C1_SEMANTIC_FILE_EFFECTS=PASS`
- non-empty directory delete restores the exact staged directory and refuses recursive deletion;
- move destination overwrite and stale source-SHA races preserve original data;
- regular-file delete refuses stale SHA;
- READ_ONLY mutation denial is pre-effect and audited;
- SHARED_NODE semantic file effects do not depend on broad host-power;
- PERSONAL_NODE ownership, expired lease and ambiguous multi-node routing fail closed;
- traversal, symlink escape and direct `.git` access remain denied;
- audit intent failure prevents effect; completion-audit failure is non-retryable committed uncertainty;
- audit tamper fails closed.

Full pinned-Node regression:

`npm run test:ci` → **exit 0**

`git diff --check` → **PASS**

## Production / staging effect

- Production v1 mutation: **NONE**
- Staging semantic filesystem effect: **NONE**
- OAuth filesystem effect: **NONE**
- Existing B-S3B process canary remains disabled
- Public tool catalog shape: **UNCHANGED**

## Gate decision

B-S3C-1 is **ACCEPTED / CLOSED** as the local semantic filesystem + local effect audit foundation.

The parent `BUSINESS_S3_SEMANTIC_FILE_EFFECTS` gate remains **IN_PROGRESS_BS3C2** until a bounded real ChatGPT OAuth staging canary proves mapped semantic reads and mutations, exact-SHA replace/delete behavior, no-overwrite move, audit evidence, cleanup, host-path privacy, and semantic-tool selection without falling back to `process_start_host`.
