# Personal memory: independent checkpoint and project/task-bound contract

**Date:** 2026-09-20
**State:** ISOLATED IMPLEMENTATION TEST PASS / NOT INDEPENDENTLY SECURITY-APPROVED / NOT DEPLOYED
**Product/repository:** exobiz7/chatagent-personal (private)
**Hard boundary:** No runtime dependency on the earlier chatagent/P8 repositories, P8 memory container, its token, database, tunnels or state directories.

## 1. Ownership and storage

The personal product SHALL implement its own persistent memory service under an owner-private, independently initialized **personal** state root (for example, ~/Library/Application Support/chatagent-personal/memory). Never mount, symlink, copy live state, or share a secret from the P8 application or any future enterprise product. A separate randomly generated memory seal key, private directory ownership/mode, bounded event records, atomic writes/fsync and an explicit schemaVersion are mandatory. Data is organized by stable projectId and taskId and is not a source of execution authority.

A P8-compatible read adapter was copied for testing only and is now under test/compat. A real one-off authenticated, read-only P8 API probe validated /v1/tasks/list with zero returned entries without transmitting secrets outside the container. There is **no** P8 memory route in the personal Broker/MCP runtime.

## 2. Proposed API (not currently available)

- personal_project_register: bind a normalized project slug to the owner, root locator (metadata only) and durable project UUID; never infer a project from remembered prose.
- personal_task_start: create a task only under a registered project; return immutable taskId, revision 0 and an idempotency receipt.
- personal_checkpoint_append: require projectId AND taskId, expectedTaskRevision, operationId (UUID), concise summary, bounded currentState/nextActions/verification, optional sanitized artifact references and supplied git SHA metadata. Validate the referenced task belongs to that exact project and is ACTIVE. Reject mismatched revision/project, completed tasks, malformed fields and sensitive credential-like content.
- personal_task_get, personal_project_context and personal_memory_search: filter by the owner's projectId before database projection; get_task must verify the returned task's project before returning any fields.
- personal_task_complete: exact task owner/project and expected revision, separate idempotency receipt; completed tasks do not accept further checkpoint writes.

The store is append-only: each checkpoint is an immutable event with sequence, eventId, operationId, projectId/taskId, expected and resulting revision, SHA-256 of sanitized input, timestamp and previous event hash. Persist the event plus projected state transactionally. The exact same operationId + payload returns the original result; changed payload with same ID fails, and an interrupted effect remains RECOVERY_REQUIRED until proven committed. No automatic side-effect replay.

## 3. Scope and safety

The owner-paired identity and project scope are independently checked for every operation, not inferred from previous chat memory, a retrieved checkpoint, a filesystem pathname or a P8 grant. User-selected host access remains governed by the separate file/process gate. Secret-like keys, raw logs, credential strings and entire model outputs are not valid memory values. Cap request/response sizes, task counts, project count and retention; redact before seal and never send stored secrets into searchable context. Decide backups and personal-data deletion policy separately. Do not enable enterprise multi-tenant access by widening the personal identity claim.

No direct P8 data migration is part of this plan. Any future migration requires explicit owner approval, offline sanitized export/import, independent hashes, provenance and rollback. A successful protocol compatibility probe is not authorization for an ongoing live service connection.

## 4. Required test matrix before exposing MCP writes

Test isolated personal state only: (1) wrong-project taskId denial before disclosure/write, (2) exact expected revision and conflicting operationId rejection, (3) completed task immutable, (4) checkpoint append survives process crash and restarts, (5) verified tail corruption quarantine/fail-closed recovery, (6) bounded search and context, (7) secret redaction and no host authorization from memory, (8) own seal/state directory and zero P8 imports/mounts, (9) no unapproved cross-product request. Then an independent reviewer and a separate private Business candidate may evaluate the accepted read/write schema.

**Release decision:** This design does not assert that memory continuity is complete. Personal memory runtime implementation and user acceptance remain OPEN.

## 5. Implementation status (2026-09-20)

The independent personal product now contains `scripts/l1/personal-memory-store.mjs` using Node 24 built-in SQLite, a distinct owner-private database, random HMAC seal key, signed append-only event chain, and sealed high-watermark. Seven optional personal memory MCP tools have direct owner/project/revision/idempotency scopes and do not require FULL_HOST. `docs/verification/PERSONAL_MEMORY_IMPLEMENTATION_CHECKPOINT.md` records isolated local/MCP/restart tests. The signed/verified event suffix can reconcile a DB commit before head promotion, while corruption and signed-head-ahead truncation fail closed. The physical SIGKILL test uses only a disposable personal worker. This implementation does not make the P8-compatible adapter (kept under `test/compat`) a personal runtime dependency. Backup/restore, retention, concurrency review, Node SQLite API stability, independent security review and actual Business candidate tests remain OPEN.
