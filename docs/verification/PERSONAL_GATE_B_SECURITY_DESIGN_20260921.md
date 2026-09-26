# ChatAgent Personal — Gate B security/design review and C1 implementation contract

- Date: 2026-09-21 KST
- Review type: INTERNAL engineering inspection; **NOT independent security sign-off**.
- Baseline: `exobiz7/chatagent-personal`, branch `feature/personal-archive-stage-atomic`, SHA `77a19503827e21bb289c22f757ed2bae6de3c9f7`.
- PR #4 OPEN/DRAFT; independent reviewer unassigned (reviewRequests empty).
- Scope: offline personal backup/restore and process evidence; NO P8/Business v2/M16 edit, merge, migration, private-app registration or live data access.
- Evidence: `docs/handoff/PERSONAL_NEXT_SESSION_HANDOFF_20260921.md`, `docs/architecture/PERSONAL_ARCHIVE_KEY_STAGE_CONTRACT.md`, existing verification and security records.
- Previous baseline: default 30 tests; optional SSD fixture increases count to 31 when explicitly configured. Exact baseline HEAD macOS Push/PR CI SUCCESS; no new tests executed in this design gate.

## 1. Threat model and boundary

Protect against accidental path reuse, missing/wrong keys, malformed archives, symlink leaf substitution, concurrent destination creation and uncertain native publish. Authenticated receipts, private mode, device/inode, and content fingerprint are meaningful under cooperative same-UID operation.
A **hostile same-UID process remains out of the isolation guarantee**: it can read keys/plaintext and may mutate private directories, process memory and parent paths. Path-based preflight and an HMAC receipt are not a macOS sandbox. Do not represent these measures as protection against a compromised owner session.
No operation may delete arbitrary user paths, overwrite an existing destination, silently retry an uncertain effect, or use a different host tool after a platform denial. Never operate on P8 roots or real personal memory during tests.

## 2. Verified code findings

**B-01 — unsafe cleanup after inspection (OPEN / C1):** `personal-stage-recovery.mjs:62-122` checks receipt, stage dev/ino, bounded filenames and SHA tree, writes and fsyncs cleanup intent, then calls pathname `rmSync(stage,{recursive:true,force:false})`. The final deletion is not descriptor-anchored. The verified pathname and intermediate parents may change before deletion.
**B-02 — other recursive cleanup paths (OPEN / C1):** `personal-memory-backup.mjs:121-161,173-219` also recursively removes a newly created backup destination after failure and a restore staging directory in a non-uncertain finally. These must be included in the C1 inventory; do not claim stage-recovery changes alone close cleanup risk.
**B-03 — ambiguous final result (OPEN / C1):** `personal-memory-encrypted-archive.mjs:61-142` publishes ciphertext or returns a restore result before a `finally` inspection/deletion that can throw. A cleanup failure can obscure the primary failure or mask a successfully published create-only effect. Never advise blind re-run.
**B-04 — native publish scope (PARTIALLY MITIGATED / C2):** `native-restore-publish.c` traverses parents with `openat/O_NOFOLLOW`, compares stage dev/ino and uses `renameatx_np(RENAME_EXCL|RENAME_NOFOLLOW_ANY)`. A concurrent final target is refused. It does not guarantee immutable ancestor pathnames against same-UID renames. `personal-memory-backup.mjs:163-219` verifies helper hash before executing its pathname; hash pinning is not a signed distribution or a complete executable TOCTOU defense. Confirm filesystem crash durability and document source/destination parent fsync conditions separately.
**B-05 — key lifecycle (OPEN / C2):** memory HMAC seal key is included inside the archive; AES key is a distinct caller-supplied 32-byte Buffer. Archive rewrap writes a NEW file and does not rotate the memory HMAC key. No Keychain access controls, escrow, recovery, retention, scheduled rotation or external rollback anchor implemented.
**B-06 — startup uncertainty (OPEN / C3):** `durable-host-processes.mjs:20-26,46-83` uses sequential `/bin/ps` observations. Temporary `RECOVERY_REQUIRED` may precede a terminal same-processId proof; test polling correction is not root-cause verification. Preserve sealed identity, fail-closed results, original processId and non-replay.
**B-07 — runtime and artifact (OPEN / C2):** Node 24 `node:sqlite` is used offline; reproducible native build, helper version/provenance, code signing/notarization where appropriate, Keychain lifecycle and external SSD behavior are not product-accepted.
**B-08 — output file lifecycle (OPEN / C2):** `personal-memory-encrypted-archive.mjs:29-32,81-96,181-190` creates final archive with `wx` then fsync; interrupted writes need explicit incomplete-file reconciliation. The destination is not to be removed based only on a caught exception.

## 3. C1 implementation scope (design approved for isolated engineering only)

C1a. Implement a macOS-only **exact owned-stage cleanup helper** or an equivalently audited descriptor-relative primitive. Use directory FDs, no-follow traversal and file identity checks immediately before each unlink; never recursively follow paths. Restrict relative names to the fixed archive/decrypt allowlists, use no arbitrary cleanup path and reject unknown entries. Require the receipt, exact UUID, kind, archive-key authentication, original target digest, verified fingerprint, dev/ino and explicit confirmation at the API boundary.
C1b. Revalidate parent/stage identity at operation points; if an ancestor can be moved outside the trusted root, fail closed or document the remaining threat rather than claiming absolute-path immutability. Never delete a changed, redirected or unverified entry.
C1c. Persist cleanup intent before the first deletion; fsync relevant directories. A crash after intent or any ambiguous unlink must return `CLEANUP_UNCERTAIN` / operator review, **not** automatic recursive retry or generic sweep. Define reconciliation of already-removed and still-present exact entries as a separately reviewed future operation.
C1d. Inventory and handle both `backupPersonalMemory` failure cleanup and `restorePersonalMemory` staging cleanup, not only encrypted stage cleanup. A restore that may have published remains uncertain until exact destination inspection; never delete either location on assumption. Existing roots and symlinks stay untouched.
C1e. Keep publication outcome and cleanup outcome distinct (structured result or preserved primary error plus cleanup diagnostic); when the effect exists but cleanup fails, report the exact outcome and action identifier if available without silently retrying. Avoid returning success when postconditions are unverified.
C1f. No change to archive cipher, HMAC format, native publish semantics, keys, existing tool inventory or Business wiring in this bounded implementation. If descriptor-based containment cannot be justified under the same-UID threat model, leave production cleanup blocked and implement safe operator quarantine instead.

## 4. C1 negative/positive acceptance tests — all disposable, private and isolated

| ID | Fixture | Required observation |
|---|---|---|
| T01 | Normal archive and decrypt owned stages | Exact verified cleanup succeeds; no other file changed. |
| T02 | Missing/wrong key, UUID, kind or original target | Refusal before any deletion. |
| T03 | Wrong fingerprint/dev/ino or malformed ownership receipt | Refusal; exact stage unchanged. |
| T04 | Unknown nested entry, symlink or hard-linked file | Refusal; external target unchanged. |
| T05 | Concurrent replacement of final stage leaf after precheck | Refusal or UNCERTAIN; replacement untouched. |
| T06 | Move/swap allowed intermediate parent during bounded test | No deletion outside owned tree; if unprovable, document BLOCKED threat boundary. |
| T07 | Controlled SIGKILL before cleanup intent | Exact stage remains inspectable; no automatic sweep. |
| T08 | Controlled SIGKILL after intent and before/during deletion | Explicit uncertain/quarantine state; no blind retry. |
| T09 | Cleanup failure after ciphertext final file exists | Preserve published file and record effect/cleanup statuses separately. |
| T10 | Cleanup failure after native destination publication | No second restore and no deletion of completed destination. |
| T11 | Backup destination failure and restore staging failure | Only provably owned new fixture is eligible for cleanup; unrelated entries remain. |
| T12 | Concurrent target insertion at native publish | `PUBLISH_DESTINATION_EXISTS`; existing target byte-for-byte unchanged. |
| T13 | Tampered helper SHA or helper-path substitution | Fail closed before publish; no fallback. |
| T14 | Repeat the same owned-process status polling | No new process start, no identity relaxation, terminal proof required. |

Native helper: Apple clang warning-clean syntax/build and deterministic source/hash record; if helper is expanded, pin the new binary and validate exact build inputs. Run default 30 suites locally and separately the optional SSD suite only when an explicitly owned disposable SSD fixture is available. Require two clean macOS CI executions on the same code SHA before claiming C1 engineering PASS; retain earlier failures in evidence.

## 5. Gate statuses and next action

Gate A inspection: PASS on prior turn (local/remote HEAD clean, PR #4 draft, Push/PR CI SUCCESS, P8/Canary external readiness HTTP 200).
Gate B internal review: COMPLETE for scoped threat model and C1 requirements; **independent review NOT ASSIGNED and NOT APPROVED**.
Gate C1: NOT STARTED. Next turn: choose a new isolated implementation branch from the verified personal revision, implement only safe cleanup/reconciliation increment, add tests; preserve original baseline. Code review and CI are separate gates.
Gate C2/C3: OPEN. Product/Business registration, PR merge and production deployment: BLOCKED pending independent approval and explicit owner authorization.
No implementation, runtime mutation, local test or new CI result is claimed by this review record.
