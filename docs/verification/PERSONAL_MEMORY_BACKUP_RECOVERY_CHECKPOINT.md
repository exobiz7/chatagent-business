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

## 2026-09-20 — Encrypted transport and runner observation follow-up

An **optional, offline-only** `personal-memory-encrypted-archive.mjs` now creates
an AES-256-GCM authenticated archive using an independent, caller-provided
32-byte key. The completed file contains only a versioned encrypted payload,
nonce and tag. The memory seal key is included **inside the encrypted payload**;
reusing the memory seal key as the encryption key is denied. Wrong-key and
modified ciphertext restoration reject before new destination creation. Test
`PERSONAL_MEMORY_ENCRYPTED_ARCHIVE=PASS` also verifies restored checkpoints.
This is NOT integrated with Keychain, escrow, rotation or production backup.
Private plaintext staging exists during both encryption and restoration, so
abnormal crash remnants and hostile same-UID races remain open.

The separate test-owned `personal-runner-observation-test.mjs` performed 12
new short-lived owned processes, terminal/output verification and same-key
non-replay with PASS. It does **not** reproduce or root-cause the earlier CI
`RECOVERY_REQUIRED`, and it does not change execution ownership checks.

Security reviewer handoff: `docs/security/PERSONAL_INDEPENDENT_REVIEW_HANDOFF.md`.
Independent security approval, live Business candidate registration and
production promotion have not occurred.

## 2026-09-20 — Two CI failures on new feature SHA and bounded same-ID test observation

Both initial macOS CI runs on encrypted-archive commit `ac18647b1496569959b7255d4d09c96e3cdd7a7e` stopped at the *unchanged* `l6-b05-async-hash-mcp-test` before running the new encryption and runner observation tests, each reporting `HASH_FAILED_RECOVERY_REQUIRED`. The test previously treated a single fail-closed startup observation as terminal. The existing supervisor reserves a sealed processId ahead of launch, so a short unbound/startup observation can report RECOVERY_REQUIRED while the exact same process later reaches a verified terminal state. Test polling now continues, bounded to 120 observations of the **same processId only**; no new start, fallback transport, or ownership validation change is permitted. If no verified EXITED/0 and final digest is seen, the test still fails; it reports uncertain-observation count. The separate strict safety and ownership contract is unchanged. CI results on the revised commit remain to be recorded. This removes an overly eager test assertion; it does NOT prove the underlying /bin/ps timing root cause is fixed.

## 2026-09-20 — 36-tool candidate CI follow-up

The next SHA `d471ad9d0d6fa0298fcdbead211d1084f6ff0ee7` had one macOS CI SUCCESS and one FAILURE. The failed run passed the corrected 23-tool hash and 29-tool tests, then stopped in the *separate 36-tool candidate test*, which retained the same immediate-RECOVERY_REQUIRED assertion. That third isolated test now also polls only its original owned processId for a bounded time and requires a terminal EXITED/0 plus final SHA before PASS. All original ownership checks, sealed IDs and no-replay behavior remain intact. A mixed CI result on the previous commit is preserved as evidence; no successful run conceals the failure. Further CI on the new revision is required. The source of transient uncertainty is still not independently established.

## 2026-09-21 — New optional archive-stage controls

The separate branch feature/personal-archive-stage-atomic moves offline restore
to a required SHA-pinned native no-overwrite helper and makes both plaintext
staging modes HMAC-ownable/reconcilable by an offline operator. New-file AES
rotation is tested; it does not rotate the store seal or keep a Keychain key.
See PERSONAL_ARCHIVE_STAGE_ATOMIC_CHECKPOINT.md for evidence and unresolved
same-UID, orphan-intent and signed build gates. All P8 and current Business
runtime endpoints remain separate.
