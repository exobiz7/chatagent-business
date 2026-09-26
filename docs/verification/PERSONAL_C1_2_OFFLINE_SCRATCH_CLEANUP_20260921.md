# ChatAgent Personal — C1-2 offline scratch cleanup checkpoint
Date: 2026-09-21 KST. Internal engineering evidence only; **NOT** independent security sign-off.

## Scope and personal-product constraints
- Base SHA: `2a20fee341a52b52101a0599de290882a6c1a334` on `feature/personal-c1-bounded-cleanup`. This incremental change stays on the same isolated personal branch and Draft PR #5.
- Only `scripts/l1/personal-memory-backup.mjs`, its existing test, and this checkpoint are added/modified.
- No new UI approval, credential, Keychain, scheduler, general-purpose delete, MCP backup tool, P8/M16 dependency or Business registration.

## Implementation
- Both raw backup failure and native restore *known non-publish* failure now use one private, non-recursive cleanup for their uniquely created directory. Record parent/stage device+inode at creation, recheck at cleanup; inspect a small fixed file allowlist and require owner-private regular, single-link entries.
- Reject unexpected files, symlinks and root substitution. Only unlink inspected entries, require empty directory, then rmdir. On cleanup mismatch or failure preserve the primary operation error with `cleanupState=UNCERTAIN` and exact `stagePath`; do not sweep or blindly retry.
- Native publisher's uncertain outcome still skips cleanup entirely. A verified raw backup that fails only parent directory sync is retained and reported `CREATED_DURABILITY_UNCERTAIN`, never presumed absent.
- Normal archive/restore contract and successful results are unchanged. Current checks are pathname-based and do NOT establish protection from a hostile same-UID actor or all parent races.

## Executed verification
- `node --check` both modified JS files and `git diff --check`: PASS.
- `personal-memory-backup-test.mjs`: PASS, including substituted restore scratch (replacement untouched, original retained), protected existing target, interrupted raw backup with unexpected file and preserved first failure.
- `personal-memory-encrypted-archive-test.mjs`: PASS. `personal-stage-sigkill-test.mjs`: PASS.
- Full local `npm test`: `PERSONAL_STANDALONE_SUITE=PASS count=30`, exit 0, Node v24.13.1. Optional external SSD fixture was NOT run.
- Source revision for local test is the uncommitted C1-2 worktree; exact committed SHA and two macOS CI outcomes must be added to PR #5 after completion.

## Explicit OPEN items
- Node pathname-based cleanup is not descriptor-anchored against malicious same-UID mutation.
- Post-intent physical crash/cleanup reconciliation beyond prior SIGKILL-before-cleanup proof; external archive key custody/escrow/retention; reproducible signed native helper; root cause of historical intermittent `RECOVERY_REQUIRED`; independent security review remain OPEN.
- No real user backup, migration, P8/Business v2/M16 change, app registration or production acceptance in this gate.

## Next
Commit only these C1-2 files, push existing isolated branch, verify exact SHA for Push and PR macOS runs, add result to PR #5, then assess remaining review/operational acceptance work. Preserve any CI failure evidence rather than hiding it.
