# ChatAgent Personal — C1-1 bounded cleanup implementation checkpoint
Date: 2026-09-21 KST. Scope: **internal implementation only**, not independent review or release acceptance.

## Baseline and isolation
- Starting SHA: `77a19503827e21bb289c22f757ed2bae6de3c9f7`.
- Local branch: `feature/personal-c1-bounded-cleanup` created from that exact SHA.
- Prior Gate B document is retained as an untracked local file; no prior branch or live P8/Business v2/M16 state modified.
- Personal-only source; no P8 credentials, app registration, Keychain, scheduler or new approval UX.

## Implemented in this bounded increment
1. `personal-stage-recovery.mjs`: replace broad recursive stage deletion with deletion of the exact inspected allowlisted files; check parent, stage, child and archive snapshot dev/inode during operation; reject new entries. Record/fsync existing intent first, preserve it on partial/uncertain cleanup. Check intent BEFORE requiring a receipt so partial deletion is reported as `STAGE_CLEANUP_UNCERTAIN`.
2. `personal-memory-encrypted-archive.mjs`: preserve original failure when cleanup also fails; expose stage ID and cleanup uncertainty for reconciliation. If the archive or restore was already confirmed, raise explicit cleanup-uncertain error with `effect=COMMITTED`, rather than treating creation as absent or repeating it.
3. `personal-stage-sigkill-test.mjs`: add tests for confirmed ciphertext retained despite cleanup failure, and for a late unexpected entry preserving the cleanup intent. Existing archive/decrypt physical SIGKILL fixtures remain unchanged.
## Targeted local evidence
- `node --check` modified JS modules: PASS.
- `git diff --check`: PASS.
- `node scripts/l1/personal-stage-sigkill-test.mjs`: PASS, including both physical SIGKILL fixtures, final ciphertext retention and cleanup-intent negative case.
- `node scripts/l1/personal-memory-encrypted-archive-test.mjs`: PASS, authenticated archive, key rotation and new-root restore.
- `node scripts/l1/personal-memory-backup-test.mjs`: PASS, offline backup, original target preservation and native create-only restore.
- These are three targeted scripts; full regression is recorded separately below.

## 2026-09-21 — Full local regression gate
- Confirmed local branch `feature/personal-c1-bounded-cleanup` and unchanged starting HEAD `77a19503827e21bb289c22f757ed2bae6de3c9f7`; patch integrity `git diff --check` PASS.
- Mac Studio Node.js `v24.13.1`, npm `11.8.0`; `PERSONAL_TEST_SSD_ROOT` unset, so the optional SSD fixture was **not** executed.
- Executed `npm test` on the working-tree C1-1 implementation: `PERSONAL_STANDALONE_SUITE=PASS count=30`, process exit code 0. All 30 included fixtures (including owned async process, memory, backup, archive and physical SIGKILL) passed. This is local evidence on an **uncommitted worktree**, not exact-SHA CI proof.
- Read-only external readiness recheck: P8 Stable HTTP 200 and existing Business v2 Canary HTTP 200. No app/tunnel deployment or reroute.
- A passing regression does not close prior intermittent `RECOVERY_REQUIRED` root-cause or any independent security review item.

## Personal-product scope and unresolved risks
- Normal operator workflow and prior archive/restore APIs remain unchanged; no extra prompt, key requirement or managed daemon. No general-purpose deletion facility added.
- This remains Node pathname-based deletion; it is NOT descriptor-anchored or proven safe against hostile same-UID parent swaps and leaf races. Do not claim T05/T06 or full C1 security closure.
- The non-encrypted `backupPersonalMemory` failure cleanup and `restorePersonalMemory` staging cleanup still use their previous recursive operations. C1-2 should evaluate a similarly bounded, non-disruptive fix only for independently created owned fixtures.
- Tests inject a late unexpected entry after intent, **not** an actual post-intent SIGKILL; real crash/recovery validation remains open.
- Keychain/escrow, reproducible signed native helper, original runner `RECOVERY_REQUIRED` cause, independent review and Business integration remain OPEN.

## Next gate
Full local 30-suite regression is PASS. Next: controlled commit/push of only the bounded personal files and documents, then verify exact code SHA in two clean macOS Push/PR CI runs; preserve any failures and reassess whether C1-2 is required before independent review. This checkpoint does NOT authorize production migration, existing PR merge or Business app registration.
