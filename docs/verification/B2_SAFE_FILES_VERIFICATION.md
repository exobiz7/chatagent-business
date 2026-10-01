# B2 Safe Files — Verification Record

> Date: 2026-10-01 KST
> Baseline: B1 `85d273a3f2509df84fbbef90aa22233a26d9f239`
> Branch: `feat/business-b2-safe-files`
> Result: LOCAL IMPLEMENTATION / VERIFICATION PASS

## Implemented surface

READ:
- `list_directory`
- `stat_path`
- `read_file`
- `hash_file`

SAFE:
- `make_directory`
- `create_file`
- `replace_file`
- `apply_patch`

Together with `business_status`, configured B2 MCP publishes 9 tools.

## Authority and path contract

All file calls accept `projectId + relativePath` only.
The B1 registry selects the canonical host root and stored profile.

Verified denial:
- absolute path
- `..` traversal
- symlink component / escape
- direct `.git` path
- disabled/unknown project through inherited B1 tests
- READ_ONLY mutation
- caller/header profile elevation

No file response returns the registered host root.

## Mutation implementation

`make_directory` uses a new descriptor-traversed native mkdir-only primitive.
`create_file` directly reuses the Personal native O_EXCL create-only primitive.
`replace_file` directly reuses Personal Safe Replace CAS:
expected SHA → locked validation → staged inode → Darwin RENAME_SWAP → post-verify.

Mutation results return bounded relative-path receipts and final SHA where applicable.
Native helpers are pinned by absolute path and SHA-256 in an owner-private directory.
No native binary is committed by B2; tests compile disposable binaries from reviewed source.

`apply_patch` is deliberately small: one strict UTF-8 file, exact text context,
current SHA required, bounded input/result, commit through the same Safe Replace path.
It is not a multi-file transaction or generic patch interpreter.

## Negative and concurrency evidence

Verified:
- stale SHA does not commit
- existing create denied
- existing mkdir denied
- missing replace denied
- two concurrent same-SHA replacements produce exactly one winner
- FIFO/special-file hash and replace denied
- patch stale SHA/context mismatch/overflow/invalid UTF-8 denied
- post-commit observation failure returns non-retryable `UNCERTAIN`
- retry with the old SHA after `UNCERTAIN` is rejected as a conflict
- partial authority/profile injection remains fail-closed

Inherited Personal CAS regression also continues to cover metadata refusal,
native helper pinning, rollback uncertainty and hostile race fixtures.

## Actual E2E evidence

Focused:
`npm run test:business:b2` → `BUSINESS_B2_SAFE_FILES=PASS`.

Actual disposable macOS native workflow:
`read → mkdir/create → replace → patch → hash verify` → PASS.

Actual MCP workflow:
`read → create → replace → patch → hash` → PASS.

This is not a mock-only closure: native helpers were compiled and executed,
including Darwin Safe Replace and a real concurrent replacement race.

## Full regression

Final `npm test` after all B2 code changes:
- inherited Personal standalone suite: `34/34 PASS`
- B1 Organization + Project Boundary: PASS
- B2 Safe Files: PASS
- exit code: 0

`git diff --check`: PASS before the final full run.

## Threat-model boundary

Static/admission path confinement and all mutation commits reject symlink traversal.
Mutation primitives traverse parents by directory descriptors with no-follow semantics.

B2 does not claim to sandbox a separate malicious process already running as the same
macOS user. Ordinary read/list operations assume that local same-UID environment is trusted.
This is consistent with the inherited Personal host-boundary threat model and should not
be represented as hostile same-UID isolation.

## Known residuals / deferred work

- No installed/persistent Business production runtime yet.
- Operator packaging/pinning of native helpers is deferred to the later Ops unit.
- No audit ledger yet.
- No shared continuity yet.
- No STANDARD isolated execution yet.
- No delete, copy, rename, Git mutation or multi-file transaction tool.
- `apply_patch` intentionally uses exact-text replacement rather than unified diff syntax.

These are accepted sequence boundaries, not B2 implementation gaps.

## Next unit

B3 Shared Continuity:
five continuity tools, organization/project membership validation, revision/idempotency,
bounded handoff, freshness and secret rejection.

## Rollback

B2 is isolated on this feature branch.
Return to B1 commit `85d273a3f2509df84fbbef90aa22233a26d9f239`
to remove the complete Safe Files unit without touching Personal or P8.
