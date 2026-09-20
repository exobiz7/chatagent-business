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
