# ChatAgent Personal — independent security-review handoff (NOT a sign-off)

**Date:** 2026-09-20 KST
**Repository:** private `exobiz7/chatagent-personal`
**Scope:** self-contained single-owner personal runtime; no P8, M16 or enterprise runtime dependencies.
**Review status:** independent reviewer NOT assigned; review NOT completed.

## Code and evidence requested

Review the exact candidate source SHA pinned by the next feature commit, specifically:
- `scripts/l1/durable-host-processes.mjs` and `durable-process-runner.mjs` — sealed runner identity, /bin/ps timing and fail-closed RECOVERY_REQUIRED classification. The earlier identical commit had one failed CI run and one successful run. Local hash MCP test repeated six times PASS, and the separate twelve-process owned-observation test PASSED. No proven root cause and **no production change to runner semantics**.
- `scripts/l1/personal-memory-store.mjs` — owner-private SQLite (Node 24 experimental API), HMAC chained events, signed high-watermark, committed-before-head recovery, exact project/task scope, revision/operation ID CAS, secret filtering.
- `scripts/l1/personal-memory-backup.mjs` — offline SQLite snapshot, private raw-seal-key backup bundle, keyed manifest and new-root restore; no P8 migration, existing-target replacement or MCP exposure.
- `scripts/l1/personal-memory-encrypted-archive.mjs` — optional AES-256-GCM archive transport with a separately supplied 32-byte key, authenticated decryption, no cleartext memory seal key **inside the completed archive**. The archive key is not saved or exposed by MCP. Key reuse of the memory seal is refused. Raw plaintext snapshots temporarily exist under a newly created owner-private scratch directory.
- `scripts/l1/personal-memory-backup-test.mjs`, `personal-memory-encrypted-archive-test.mjs` and `personal-runner-observation-test.mjs` — bounded fixtures and negative tests.

## Explicit high-severity open findings

| Finding | Engineering evidence | Required independent decision |
|---|---|---|
| SR-01: Same-UID adversary | File permissions, no-follow checks and HMAC protect against ordinary faults, not arbitrary commands run by the same owner. | Review full threat model and refuse claims of sandbox isolation. |
| SR-02: key custody | Raw backup duplicates the memory HMAC seal key. Encrypted candidate takes an external 32-byte AES key, but the caller supplies, stores, rotates and recovers it. | Approve a user-mediated Keychain/encrypted-vault contract; no silent key export or backup without explicit consent. |
| SR-03: crash-window plaintext | An interrupted encryption or restore can leave a raw seal-key snapshot in a private `.personal-archive-working-*` or `.personal-decrypt-working-*` scratch directory. | Build exact orphan inventory/reconciliation without indiscriminate recursive deletion before production. |
| SR-04: race-free destination | Current Node `existsSync` + `renameSync` is not an atomic conditional no-overwrite commit. A same-UID actor could replace the restore destination during the check. | Evaluate native macOS descriptor-anchored no-replace directory commit; do not claim malicious concurrent overwrite resistance. |
| SR-05: filesystem trust | SQLite snapshot+head consistency is compared before/after the backup. An active same-UID mutator is not excluded and a complete coordinated rollback with key remains undetectable. | Offline/quiescent backup contract, external rollback anchor, tested FileVault/APFS or encrypted volume. |
| SR-06: intermittent runner | One CI run on the previous unchanged commit observed `HASH_FAILED_RECOVERY_REQUIRED`; another succeeded. Repetition without failure does not establish causation. | Capture bounded startup/identity state transitions on CI under load and preserve non-replay semantics. |
| SR-07: non-prod API | Node 24 `node:sqlite` and native macOS helper version/toolchain are not signed release components. | Pin compiler/runtime, verify SBOM/build provenance, test launchd and rollback. |

## Reviewer decision form

Reviewer identity: **UNASSIGNED**
Exact source revision reviewed: **NOT REVIEWED**
Adversarial same-UID tests: **NOT COMPLETE**
Encrypted key lifecycle and scratch recovery: **NOT APPROVED**
Backup restoration under malicious concurrent writers: **NOT APPROVED**
Runner startup race root cause: **OPEN**
Approval for new private Business canary: **NOT GRANTED**
Approval for production cutover: **NOT GRANTED**

**Engineering disposition:** additional implementation and negative tests can continue in the independent personal repository, but no statement of independent security approval is justified. The accepted P8 Stable, current Business v2 and M16 are not modified or reused.

## Additional CI observation

Two further CI runs on the first encrypted-archive feature SHA both failed in the pre-existing hash-MCP test on one RECOVERY_REQUIRED observation; neither run reached the new archive tests. The test now polls the original owned processId to a bounded terminal proof, never issuing a second start or relaxing production identity checks. Reviewers must still identify why the observation was uncertain and confirm no false terminal success is possible. This test correction is not a security sign-off.

A further CI failure on `d471ad9d...` occurred in the distinct 36-tool candidate test using the same stale first-observation assertion after its 23-tool and 29-tool tests had passed. All three independent MCP fixtures now use bounded **same-processId status-only observation**, never duplicate start. CI must be reverified on the corrected candidate SHA. This resolves only the test's premature classification; runner /bin/ps uncertainty remains a separate reviewer item.
