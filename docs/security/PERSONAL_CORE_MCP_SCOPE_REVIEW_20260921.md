# Personal core MCP — exact exposure and reviewer handoff

Date: 2026-09-21 KST. Reviewed base: `ca7441fc883712f81343cf9ead995f2d9edb557b` on `feature/personal-c1-bounded-cleanup`, Draft [PR #5](https://github.com/exobiz7/chatagent-personal/pull/5).
**Status: internal scope/security review and independent-review packet. Independent reviewer UNASSIGNED; no independent sign-off, Business registration, deployment or merge.**

## Core product intent and hard boundaries
Single-owner macOS ChatAgent enables a **chat to perform useful local file/process work and hold its own project/task memory**, not an enterprise multi-tenant product or a backup manager. Preserve convenient persistent owner-approved FULL_HOST usage: do not add per-operation approval prompts, blanket path locks, always-on security agents or speculative runner rewrites.
Private repo `exobiz7/chatagent-personal`; existing P8 Stable, Business v2 Canary (17-tool), STABLE-001 and M16 MUST NOT be repointed, modified, linked to the Personal state or reused for Personal credentials. Source `test/compat` is test-only.
The offline AES archive, raw seal-key backup, restore and key rewrap are **library-only**, not MCP tools. Their custody/power-loss constraints are a separate operational gate, not a prerequisite for assessing the *exposed* core.

## Exact MCP inventory — 36 names, not 36 operational capabilities
Inventory comes from `scripts/l0-ui-probe.mjs` and the isolated actual `tools/list` in `personal-36-tool-candidate-test.mjs` with all Personal development flags enabled:
- Owner/status/UI probes (4): `local_access_status`, `local_request_access`, `local_check_access`, `l0_confirmation_probe`. Access request/check only propose/reflect a grant RECORD; never grant arbitrary host authority. Confirmation probe only mutates volatile test state.
- Private personal memory (7): `personal_project_register`, `personal_task_start`, `personal_checkpoint_append`, `personal_task_complete`, `personal_task_get`, `personal_project_context`, `personal_memory_search`.
- Synchronous file (8): `local_list`, `local_stat`, `local_read`, `local_hash`, `local_write`, `local_create_file`, `local_replace_file`, `local_copy`.
- Owned scratch (2): `local_scratch_create`, `local_scratch_cleanup`.
- Async native copy (4): `local_async_copy_start/status/read/stop` (fully expanded names as in actual inventory).
- Exact owned copy-stage reconciliation (2): `local_copy_stage_inspect`, `local_copy_stage_cleanup`.
- Async hash (4): `local_async_hash_start/status/read/stop` (fully expanded names as in actual inventory).
- Host execution (5): `local_exec_start`, `local_process_status`, `local_process_read`, `local_process_input`, `local_process_stop`.

**Known visible-but-unavailable commands in tested strict/native/durable profile:** `local_replace_file` → `ATOMIC_REPLACE_UNAVAILABLE`; `local_copy` → `NATIVE_COPY_UNAVAILABLE` (use `local_async_copy_start` for new destinations); `local_process_input` → `DURABLE_STDIN_UNAVAILABLE`. The `local_write` **create** mode works, while its replace mode refuses. `l0_confirmation_probe` has no host effect. Do not claim 36 usable operational tools or promise that chat can currently edit an *existing* file in strict mode.
**Usability follow-up, not a new security gate:** Before publishing a Personal Business candidate, make actual availability obvious in the tool descriptions/inventory, preferably hide fixture-only and unavailable commands in the selected profile, or implement a separately reviewed atomic existing-file CAS if that capability is needed for normal chat-as-executor work. Preserve the functional create/read/native async-copy/durable process/memory flow and do not add repeat prompts.

## Authorization, data scope and runtime checks
- `broker-core.mjs:209-218`: after local owner enrollment and explicit passphrase-based FULL_HOST selection, file and exec use ordinary macOS effective-user authority. ASK/TRUSTED_PROJECT do **not** grant scoped file/exec effects. A pending proposal/grant record, memory contents or model text is not host authority. Owner socket supports routine status/approval without repeated password after enrollment; FULL_HOST transition still requires owner password.
- `broker-server.mjs`: separate file, async, memory and strict/native flags default OFF; memory state and broker state cannot overlap. Generic host-file facade denies private broker/support/memory roots even with FULL_HOST, including realpath-based links. L1 binds 127.0.0.1 and checks an independent private agent token; L0 checks its private token. L0 only permits known JSON-RPC operations and limits request bytes.
- `personal-memory-store.mjs`: project/task cross-scope checks, revision and operation-ID CAS; HMAC chained events and bounded context. Actual tests reject wrong-project task read/append and generic host-file read of its private root. No memory API creates a host process or grants file access.
- `durable-host-processes.mjs`: exact owned processId, nonce/start-token/command identity, max four active, non-replay idempotency; ambiguous observation remains `RECOVERY_REQUIRED`. Host execution can launch shell interpreters and therefore has BROAD user-file/network power. Protected file-facade paths are **not a sandbox against commands run as the same macOS user**. Do not imply that the helper can enforce all upstream platform safety denials.
- `local_copy_stage_cleanup` and scratch cleanup accept sealed owned IDs and exact digest/identity, NOT an arbitrary path; tests reject unknown handles and incorrect hash. An uncertain effect cannot be blindly restarted.
## Evidence and limits
- Base exact-SHA `ca7441f...` Push CI `35542873017` and PR CI `35542874858` SUCCESS. After adding the scope assertion, actual isolated 36-tool test PASS (`HASH_UNCERTAIN_OBSERVATIONS=0`) and full local `npm test` `PERSONAL_STANDALONE_SUITE=PASS count=30`, exit 0. The assertion runs with test-created credentials, temporary 0700 roots and private loopback ports; it verifies 36 distinct names, precisely 7 personal memory names and **no** backup/restore/archive/rotate/continuity MCP name. Exact-SHA CI for this new review/test commit must be checked separately.
- Isolated 36-tool fixture additionally checks create-only and replace/copy refusal, owned native async hash/copy of 9 MiB, no overwrite, orphan-stage identity, private memory project/task and original-processId no-replay. It is not a genuine ChatGPT Business-side smoke test.
- External P8/Business v2 readiness was checked in earlier gates, not evidence of a deployed Personal endpoint. Actual Personal credentials, tunnel isolation, approved package/signing and owner-in-chat tool effects remain unverified.
- Open security considerations: same-UID arbitrary host execution, parent/path races, Node 24 experimental SQLite, runner's intermittent observation, credential retention/revocation and release-specific binary hash/signing. Optional offline backup also has its separate key custody and crash windows.

## Independent reviewer decision checklist — currently OPEN
1. Review exact candidate commit and list **actually enabled** L0/L1 feature flags, tool annotations and execution semantics; explicitly distinguish test probes and known unavailable commands from supported effects.
2. Validate trusted single-owner FULL_HOST posture and isolation of Personal state, tokens, tunnel/app and native helpers from existing products; record upstream platform policy assumptions without presenting a local sandbox.
3. Verify create-only native destination refusal, exact owned cleanup and idempotent no-replay under crashes; require no silent rerun of a partially observed effect. Cross-project memory denial and secret-filter limitations must be recorded.
4. Approve scope of **exposed core** independently of optional backup/recovery; identify concrete required fixes and regression evidence. Do not request unneeded per-file authorization or additional locking for ordinary work.
5. After an identified independent reviewer signs off the *exact enabled profile* AND the owner explicitly approves, register a NEW private Personal Business candidate with independent credentials/state/tunnel. Verify actual chat tool-list and user-owned disposable effects with rollback. Never modify P8, Business v2 or M16, merge PR #5 automatically, or migrate live data during review.

**Internal disposition:** review packet PREPARED; independent review UNASSIGNED/NOT DONE; Business Personal candidate NOT registered; production approval NOT GRANTED.
