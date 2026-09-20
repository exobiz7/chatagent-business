# ChatAgent Personal — isolated backup/restore and intermittent runner recovery checkpoint

**Date:** 2026-09-20 KST
**Repo:** private `exobiz7/chatagent-personal`
**Status:** LOCAL CANDIDATE / NO PRODUCTION MEMORY BACKUP / NO BUSINESS DEPLOYMENT

## Actual source of the intermittent failure

The two macOS CI runs against the same `4a394088...` feature commit disagreed. The failed run reported `HASH_FAILED_RECOVERY_REQUIRED` in the isolated 29-tool MCP fixture immediately after owned async-hash start; a subsequent run on the identical commit passed all 26 tests, including the combined 36-tool candidate. The durable process supervisor uses several sequential `/bin/ps` checks to match the sealed PID, start token and runner command. This is a possible startup or observation race, **not a demonstrated root cause**. Six additional isolated 19-tool hash-MCP repetitions on the owner Mac were PASS. No fail-open change, silent retry of a denied effect, or alternative host transport was added. The runner's ambiguous status remains a fail-closed signal requiring owner reconciliation; deterministic reproduction and CI-load diagnosis remain OPEN.

## Offline personal memory backup prototype

`scripts/l1/personal-memory-backup.mjs` exposes `backupPersonalMemory` and `restorePersonalMemory` as **offline operator/library operations only**; they are not MCP tools. Neither function has a P8 token, container, database, or migration path. Inputs reject former-product roots. Destinations must be absent and under an already existing owner-private parent. Backup uses Node 24 SQLite's snapshot API; a read-only, non-mutating independent event-chain verifier validates SQLite integrity/schema, head HMAC and each sequential HMAC event. The source journal sequence/head/key must be identical before and after backup. A changed source aborts without publishing an accepted backup. The private backup includes a 0600 SQLite snapshot, signed head, 0600 seal key and an HMACed SHA-256 manifest. The manifest is checked before restoring into an entirely NEW root; validation of the restored journal is required. No existing memory root is replaced.

`PERSONAL_MEMORY_BACKUP_TEST=PASS` exercises exact project/task/checkpoint restoration, duplicate target refusal, altered manifest and seal-key refusal, interrupted backup and changing-source refusal, plus owner gate. These tests use uniquely created disposable personal fixtures. No real private user data or live memory store was backed up, moved or restored.

**Key-management boundary:** the backup carries the same seal key; copying its directory to an unencrypted cloud folder is not acceptable. The owner must provide an encrypted, access-controlled backup destination and independently protect the key. The HMAC chain does not protect against an attacker holding the same key, nor detect coordinated full snapshot rollback. Safe offline key rotation, escrow/loss recovery, consistent multiple backups, stale-backup selection and retention/deletion policy are **NOT IMPLEMENTED**. Don't expose backup paths or keys to MCP, stdout or a repository.

**Concurrency boundary:** source-quiescent/offline semantics are expected; the source recheck prevents a changed sequence from being presented as a verified backup. It is not a cross-process exclusion mechanism. External same-UID mutation, symlink/parent swaps and a crash during temporary-directory cleanup remain security-review items. This is not a production backup/restore guarantee.

## Release gate

- Preserve separate P8 and current Business v2 apps, secrets, memory, and tunnels.
- Independently review backup key lifecycle, manifest authenticity and restore/new-root path handling, including interrupted effects and malicious same-UID concurrency.
- Collect additional CI evidence and determine the root cause of the intermittently reported `RECOVERY_REQUIRED` before claiming runner reliability closure.
- Only after independent sign-off, pin a separate personal artifact and register an expressly authorized new private Business candidate. An in-chat report is not an actual Business tool effect test.

**Disposition:** backup/restore candidate LOCAL PASS; runner diagnosis PARTIAL; security and product acceptance OPEN.
