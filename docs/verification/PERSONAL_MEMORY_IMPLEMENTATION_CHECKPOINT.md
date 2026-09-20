# ChatAgent Personal — independent memory store and checkpoint implementation checkpoint

**Date:** 2026-09-20 KST
**Product:** private \`exobiz7/chatagent-personal\`
**Branch:** \`feature/personal-memory-checkpoints\`
**State:** SELF-CONTAINED LOCAL/MCP IMPLEMENTATION PASS / SECURITY PRE-REVIEW OPEN / BUSINESS NOT DEPLOYED

## Implementation / hard boundary

The personal product has its **own** \`scripts/l1/personal-memory-store.mjs\` and separately initialized state root \`PERSONAL_MEMORY_STATE_DIR\`. Node 24 built-in SQLite is used directly; there are no P8/enterprise package imports, containers, token files, memory databases, API endpoints, tunnels, Git remotes or runtime credentials. The former P8-compatible adapter remains under \`test/compat\` only, not in the Broker or MCP registry. No migration or live P8 data is required.

A 0600, 32-byte random \`memory-seal.key\` and a 0600 HMAC-sealed high-watermark \`memory-head.json\` are created under an owner-private 0700 directory. The independently created 0600 SQLite file uses WAL, FULL synchronous transactions and an explicit schema version. Each append-only logical event includes sequence, previous event hash, operation UUID, scoped project/task IDs, payload/input hash, timestamp and its sealed receipt. Source-of-truth events and task projections are reconciled on every read/write; no existing P8 table or file is mounted or copied. This is a bounded local event log (max 4096 events, 32 projects and 512 tasks), not an external multi-user service. Schema and node:sqlite require version-pinned macOS testing.

The project is a stable slug plus generated project UUID; task start creates a project-bound immutable task UUID, revision 0 and idempotency receipt. Checkpoint append requires **both** projectId and taskId, expected revision and operation UUID, summary, current state, next actions and verification. Optional artifact references and git SHA are bounded metadata, not executable instructions. Completion increments revision and prevents further changes. Reads require an explicit project scope; foreign task IDs are denied prior to any task-content projection. Search is bounded lexical checkpoint search (not semantic/RAG search).

Every write uses \`BEGIN IMMEDIATE\` and SQLite COMMIT before advancing a separately sealed head. An interrupted commit-before-head window is reconciled only by validating the complete HMAC event suffix. Repeating an identical operation UUID and payload returns the prior receipt; conflicting payload returns \`MEMORY_IDEMPOTENCY_CONFLICT\`. An ahead-of-journal signed head, incorrect HMAC payload, invalid schema or unsafe file mode fails closed. No write effect is replayed solely because a client retries after a timeout.

Memory access requires a paired local owner through the existing Broker credential; it **does not require or grant FULL_HOST**. With \`PERSONAL_MEMORY_ENABLED=1\`, generic host file tools protect the separate memory root. Two independently OFF feature flags (\`PERSONAL_MEMORY_ENABLED\` for Broker and \`PERSONAL_MEMORY_TOOLS\` for MCP) expose seven isolated MCP tools:
\`personal_project_register\`, \`personal_task_start\`, \`personal_checkpoint_append\`, \`personal_task_complete\`, \`personal_task_get\`, \`personal_project_context\`, \`personal_memory_search\`. Initializing a new store requires a separate one-time \`PERSONAL_MEMORY_INIT=1\` and must not reuse any prior state.

## Executed evidence

1. \`PERSONAL_MEMORY_STORE_TEST=PASS\`: new private key/database/head permissions, independent project/task registration, idempotent retry, wrong-project refusal, revision CAS, immutable completion, bounded search, secret-like input refusal, fresh replay, and signed event tamper/DB truncation refusal.
2. The injected *post-SQLite-COMMIT, pre-head-fsync* crash window returns \`MEMORY_RECOVERY_REQUIRED\` but a fresh instance verifies the suffix and returns the prior task receipt without relaunching the operation.
3. \`PERSONAL_MEMORY_PHYSICAL_RESTART=PASS\`: a uniquely owned Node worker was SIGKILLed after committing its checkpoint, and a new instance verified the durable task/checkpoint and suppressed the prior operation UUID.
4. \`PERSONAL_MEMORY_MCP=PASS\`: separately authenticated isolated L1+MCP produced **11 tools** with the seven personal memory tools, while file/process gates stayed disabled and owner mode remained ASK. It completed actual project/task/checkpoint/complete/read/search calls; foreign project, stale revision and sensitive input requests were rejected. P8 continuity tools were absent.
5. `PERSONAL_36_TOOL_CANDIDATE=PASS`: a separate, combined isolated L1/MCP fixture enabled the 29 personal host/file/process/scratch/copy capabilities plus 7 self-owned memory tools together. Actual native create, copy, stage cleanup, project/task/checkpoint read/search and the absence of all P8 continuity tools were verified. This is a 36-tool **development-only inventory**, not an installed Business private app.
6. New state was deliberately isolated from the Broker state and rejected by the generic host file facade when its protected root was configured. None of these tests accessed P8, M16, the live Business v2, user files or the external SSD.

## Open security / release gates

- This is engineering pre-release evidence, **not independent security sign-off**. A same-UID process may read memory and signing key; owner-private permissions are not an OS sandbox. Generic FULL_HOST process execution can access this user's files outside the file facade. Memory content never becomes host authorization.
- \`node:sqlite\` is experimental in the locally verified Node 24; pin/runtime-compatibility and macOS runner tests are required. WAL/database-head backup consistency, backup/restore, key rotation and retention/deletion need a separately reviewed plan.
- SENSITIVE regex is bounded best-effort rejection, not comprehensive secret detection or de-identification. Never store raw authentication secrets, arbitrary terminal logs or entire assistant conversation dumps.
- The HMAC chain and separate high-watermark defend against accidental/local tampering without the seal key. They do not provide tamper evidence against an adversary with access to the same macOS user and key, or to the full filesystem snapshot/rollback. A multi-user enterprise guarantee is explicitly outside scope.
- Detailed response content is capped; taskGet returns the most recent five checkpoints. Filesystem symlink swaps by same-UID adversaries, memory restore policy, concurrency/long-running performance and complete independent review remain OPEN.
- No production personal memory root was initialized, no business app tools were updated and no data was migrated. Actual Business private-app tool discovery and effect tests require a separately registered personal candidate and an explicit user-run canary; existing P8 Stable/Business v2 remain unchanged.

**Acceptance:** isolated functionality PASS. Product/security/release acceptance OPEN.
