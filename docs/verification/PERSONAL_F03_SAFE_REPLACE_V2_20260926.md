# ChatAgent Personal — F03 Safe Replace v2 engineering record

Date: 2026-09-26 KST
Branch: `feature/personal-f03-safe-replace-v2`
Parent HEAD: `f090ac68a58bc31681aa0a12eaa87ca44eb1240e`
Host research environment: macOS 26.5.2 (25F84), Apple clang 21.0.0.

**Status:** engineering remediation candidate. This record does not independently close F03, enable the live 33-tool Business profile, merge, start beta, or approve production.

## 1. Goal

Existing-file replacement is required for the chat-as-executor product goal. The previous native expected-SHA implementation had strong pre-swap checks but still had a final `check -> renameat` race: an independent writer could change the path or bytes after the final observation and before clobbering rename.

Safe Replace v2 keeps create-only and replace contracts separate, but redesigns replace around OS-managed inode locks, an atomic two-name exchange, post-swap validation and rollback.

## 2. Darwin / filesystem research decisions

- Current macOS SDK exports `renameatx_np` with `RENAME_SWAP`, `RENAME_EXCL`, `RENAME_NOFOLLOW_ANY` and related flags in `usr/include/sys/stdio.h`. The implementation uses verified parent dirfds plus leaf names and `RENAME_SWAP | RENAME_NOFOLLOW_ANY`.
- Current SDK still declares `exchangedata()`, but marks it deprecated in favor of rename swap. A real Mac Studio fixture returned `ENOTSUP` for `exchangedata`, so it is not a usable core primitive here.
- A real dirfd fixture confirmed `renameatx_np(..., RENAME_SWAP | RENAME_NOFOLLOW_ANY)` atomically exchanges the two directory entries on the current local filesystem.
- A second fixture confirmed APFS rename swap changes inode `ctime` while preserving `mtime`. Therefore post-swap race validation cannot compare the old ctime snapshot directly; it instead compares inode identity, mode, flags, uid/gid, link count, size, mtime, SHA-256 and xattrs.
- Darwin `O_EXLOCK` is a flock-style advisory exclusive lock. It is useful for ChatAgent-to-ChatAgent serialization and lock-aware peers, but raw POSIX writers may ignore it.
- `NSFileCoordinator(.forReplacing)` was reviewed. It is valuable for cooperating Cocoa/FilePresenter clients, but does not make arbitrary raw POSIX writers mandatory participants and would add Foundation coordination complexity to the small native helper. It is not a Core dependency in v2.
- Stage and directory durability retain the existing bounded `fsync` behavior. `F_BARRIERFSYNC` remains a possible later latency optimization, not a requirement for solving F03.

## 3. Safe Replace v2 algorithm

1. Resolve every parent component through directory fds with `O_NOFOLLOW`; never follow a substituted parent symlink.
2. Open the current target with `O_NOFOLLOW | O_EXLOCK`.
3. After the exclusive lock is actually acquired, compare the opened inode with the current leaf again. A waiter that locked a stale, already-replaced vnode returns `CAS_TARGET_CHANGED`.
4. Hash the locked original and require the exact caller-provided SHA-256. Retain the existing regular-file, owner, nlink, size, ACL/flags and metadata bounds.
5. Create the same-directory private stage with `O_CREAT | O_EXCL | O_NOFOLLOW | O_EXLOCK`. Keep this fd open and exclusively locked through commit.
6. Preserve supported mode/xattrs, write the new bytes and sync the staged inode.
7. Perform the existing final pre-swap path/content/metadata/xattr rechecks.
8. Atomically exchange the private stage and public leaf using `renameatx_np(..., RENAME_SWAP | RENAME_NOFOLLOW_ANY)`.
9. Do **not** delete the displaced original. It remains at the private stage name while both sides are verified.
10. Verify the public leaf is still the staged NEW inode and the private stage is the inode that was actually displaced.
11. Re-hash and revalidate the displaced OLD inode after the swap. If a writer changed the old content or supported metadata in the historical final-check window, atomically swap back.
12. Re-hash and revalidate the committed NEW inode against the exact incoming bytes and its prepared metadata snapshot. If a raw writer changed the new inode after the swap, atomically swap back.
13. A safe rollback is attempted only while both directory entries still match the exact inodes observed for rollback. After the reverse swap, both identities are verified again before deleting only ChatAgent's own staged inode.
14. Only after old and new post-swap validation succeeds is the two-name state synced, the displaced old inode removed, and the directory synced again.
15. The success receipt advertises `commitMode: DIRFD_DUAL_EXLOCK_RENAME_SWAP`.

This is a two-phase lock-coupled file replacement pattern: both old and new inodes remain exclusively locked across the atomic name exchange and validation interval. OS lock lifetime automatically ends on process exit/crash; no global lock service or persistent lock database is added.

## 4. Race / failure semantics

- Wrong expected SHA: `CAS_PRECONDITION_MISMATCH`; no replace.
- Target changed while a helper was waiting for the inode lock: `CAS_TARGET_CHANGED`.
- Target path/content changed in the exact old F03 final-check window: swap reveals the displaced state, v2 atomically restores that intervening state, removes only its own stage, and returns `CAS_TARGET_CHANGED`.
- NEW inode content changed by a raw writer immediately after swap: exact incoming digest verification fails; original is atomically restored and `CAS_TARGET_CHANGED` is returned.
- Public leaf is replaced again after our swap so exact rollback ownership can no longer be proven: `CAS_ROLLBACK_UNCERTAIN`. Success is never reported and the displaced original is deliberately preserved at the private stage name for recovery.
- Unsupported filesystem locking or swap primitives fail closed as `CAS_LOCK_UNSUPPORTED` / `CAS_SWAP_UNSUPPORTED`; there is no weaker rename fallback.
- Any `*_UNCERTAIN` result remains non-retryable under the existing F02 response/effect contract.

## 5. Deterministic engineering evidence

The expanded native CAS fixture now covers:
- wrong SHA, missing target, symlink, hardlink and unsafe parent substitution;
- supported xattr preservation and unsupported ACL/file-flag refusal;
- source mode, source xattr and staged-xattr drift;
- exact pre-swap **path replacement** race after the final check;
- exact pre-swap **in-place content** race after the final check;
- hostile post-swap public-leaf replacement: fail-closed `CAS_ROLLBACK_UNCERTAIN` with displaced original preserved;
- hostile post-swap mutation of the NEW inode: detected and original atomically restored;
- eight simultaneous same-target helpers with the same expected SHA: exactly one commits and all losers fail closed;
- existing F02 post-commit observation uncertainty remains non-retryable.

The isolated 33-tool MCP fixture continues to validate `local_replace_file`, mismatch refusal, create-only separation, >8 KiB content and xattr retention using the new commit mode.

## 6. Security boundary / residual risk

Darwin does not expose a syscall equivalent to `replace path only if SHA-256(path) == X` as one indivisible kernel transaction. `O_EXLOCK` is advisory. Therefore Safe Replace v2 does not claim that a malicious same-UID process is prevented from issuing raw writes/renames.

The stronger v2 property is instead:
- cooperating ChatAgent writers are serialized at the inode level;
- the old inode is retained through post-swap validation rather than immediately destroyed;
- races in the previous check/rename window are detected from the atomically displaced inode and rolled back when ownership is still provable;
- if an uncooperative writer destroys the ability to prove rollback safety, the operation fails closed as non-retryable uncertainty and preserves recovery data instead of claiming success.

This materially changes F03 from an undetectable last-check clobber window into a verified/rollback protocol, but independent review must decide whether the residual hostile post-swap uncertainty is acceptable for the Personal threat model.

## 7. Gate posture

- Current live AIspace Business candidate remains the previously validated **32-tool** profile in ASK mode.
- `local_replace_file` / 33-tool activation remains OFF until this exact implementation SHA receives independent F03 review and a separate disposable 33-tool Business E2E.
- PR #5 remains untouched by this development branch.
- No beta, production, merge, existing user file replacement, or production data operation is authorized by this record.

## 8. Final local verification on this worktree

- `node scripts/l1/personal-native-cas-test.mjs`: PASS, including exact pre-swap path/content races, post-swap path uncertainty preservation, post-swap NEW-content rollback, and eight concurrent same-target writers.
- `node scripts/l1/personal-native-cas-mcp-test.mjs`: PASS with 33 names and `local_replace_file` using `DIRFD_DUAL_EXLOCK_RENAME_SWAP`.
- `node scripts/l1/personal-f02-r1-test.mjs`: PASS; `CAS_ROLLBACK_UNCERTAIN` is non-retryable `effect=UNCERTAIN` under the existing mutation contract.
- Final `npm test`: `PERSONAL_STANDALONE_SUITE=PASS count=34`, exit 0.
- Small-file native-helper microbenchmark on this Mac Studio, 50 sequential replacements in `/private/tmp`: median 4.624 ms, p95 5.685 ms. One 192.942 ms scheduling/outlier sample occurred; this is engineering evidence only, not an SLA.
- An attempted benchmark under `/tmp` was correctly refused as `CAS_PARENT_UNSAFE` because macOS `/tmp` is a symlink to `/private/tmp`; the no-follow parent policy remained active.

Exact commit SHA and remote CI are to be recorded after the implementation commit/push. Independent F03 security review remains a separate next gate.
