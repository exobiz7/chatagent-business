# ChatAgent Personal — independent single-owner macOS agent

Private personal product and independent git history: `exobiz7/chatagent-personal`.
Only selected code was copied from the former chatagent feature evidence (source commit
`359b9acb9c9391f3d9f88d60bcac924f07bb6186`). No P8/enterprise repository,
container, tunnel, shared database, shared secret, original state directory or remote
Git history is a runtime dependency. The old P8 and current Business v2 apps remain separate.

**Development candidate, not a deployed or accepted Business product.** All advanced
host/process/copy flags default OFF. Use newly initialized, owner-private personal
state and credentials; never point a personal runtime at P8's state, tunnel or token.

The P8-compatible memory adapter is retained ONLY in `test/compat/` for API comparison;
it is absent from the personal Broker/MCP runtime. The **personal product now implements
its own** owner-private SQLite event store, HMAC-sealed journal and seven optional scoped
memory tools (project/task/checkpoint/complete/read/context/search). These are independent
of the P8 container, token and database. See
`docs/verification/PERSONAL_MEMORY_IMPLEMENTATION_CHECKPOINT.md`. The memory implementation
has local/MCP/SIGKILL test evidence but is NOT released or security-approved.

Install dependencies with `npm ci --ignore-scripts --no-audit`. Run `npm test` for
isolated 26-suite macOS tests (including owner-scoped stage SIGKILL recovery).
For a separately authorized actual APFS SSD test:
`PERSONAL_TEST_SSD_ROOT="/Volumes/SSD 4T" npm test`. This creates and deletes
ONLY a unique, verified 32MiB disposable test fixture. No CI job runs this SSD test.

No existing-file atomic replace is provided in strict mode. New-destination copy
cannot overwrite an existing entry, and only an owned, terminal job with matching
stage SHA-256/device/inode is eligible for orphan-stage cleanup. These checks
mitigate ordinary faults but are not a same-UID hostile-process sandbox.

Security and release gates remain open: independently signed/pinned native helper,
full stage crash-window and same-UID concurrency review, self-contained personal
memory implementation, copied M16 workload, and a separately approved private
Business app/cutover.

For standalone memory regression only: `npm run test:memory`. To run an **isolated**
Broker with memory, initialize a brand-new, owner-private state directory with
`PERSONAL_MEMORY_ENABLED=1`, `PERSONAL_MEMORY_INIT=1` and an independent absolute
`PERSONAL_MEMORY_STATE_DIR` outside the Broker state. Set `PERSONAL_MEMORY_INIT=0` on
subsequent starts and `PERSONAL_MEMORY_TOOLS=1` in the separately authenticated MCP
process. Do not reuse P8 or any other product state or credential. Memory functions
require a paired owner but are not tied to FULL_HOST permission. These flags remain
OFF in the existing apps.

### Offline backup candidate (NOT production-ready)

`personal-memory-backup.mjs` offers library-only backup into a **new** owner-private bundle
and verified restore into a **new** personal root. It has no MCP endpoint. The bundle contains
a copy of the raw 32-byte memory seal key; treat it as a credential and only keep it in an
independently encrypted, access-controlled location. Stop writers before invoking backup.
A changing source fails closed. There is no managed key rotation, backup scheduler or
P8 migration. Run `node scripts/l1/personal-memory-backup-test.mjs` for an isolated test.
Details: `docs/verification/PERSONAL_MEMORY_BACKUP_RECOVERY_CHECKPOINT.md`.

### Optional encrypted archive — development only

`personal-memory-encrypted-archive.mjs` wraps the offline snapshot into one
AES-256-GCM encrypted archive file. The caller **must supply a separate random
32-byte archive key** from an independently protected source; using the memory
seal key as the archive encryption key is rejected. The completed archive
contains no plaintext SQLite, head or seal key. Temporary private working
folders DO contain plaintext until cleanup, and crash/orphan reconciliation,
external key custody/rotation and independent review remain open. No memory
backup or restore capability is exposed through Business/MCP.

The intermittent runner `RECOVERY_REQUIRED` remains under investigation. Do not
retry the same uncertain effect on another host/transport. Diagnostic repetitions
only use new isolated, test-owned effects. See
`docs/security/PERSONAL_INDEPENDENT_REVIEW_HANDOFF.md`.

### Exact orphan recovery, native restore and key rotation — development candidate

An owner-private, HMAC-receipted UUID scratch stage is created *before* an archive
or decrypt operation produces plaintext. The offline operator can inspect and
manually clean ONLY that owned stage using its original target, stage dev/ino,
expected tree fingerprint and explicit confirmation. The SIGKILL test covers
real archive and decrypt plaintext stages; unattended cleanup and a same-UID
adversary guarantee are NOT provided. Restoring a memory root requires a
locally pinned private native macOS no-overwrite publish helper. Archive key
rotation rewraps ciphertext in memory to a NEW file and retains the old archive;
keys are still externally supplied, not automatically stored in Keychain.

Full contract: docs/architecture/PERSONAL_ARCHIVE_KEY_STAGE_CONTRACT.md.
Evidence: docs/verification/PERSONAL_ARCHIVE_STAGE_ATOMIC_CHECKPOINT.md.
Production use and Business registration remain BLOCKED pending independent
security review and explicit owner acceptance.
