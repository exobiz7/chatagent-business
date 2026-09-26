# Personal F02-R1 narrow remediation — implementation and Astra re-review checkpoint

Date: 2026-09-21 KST. Prior reviewed implementation SHA: `8465c12c28f4aeb835ab0bfaf739d7a814376e44`. The exact implementation SHA is the containing commit, independently recorded in the PR #5 evidence comment; this document is part of that commit.
Independent Astra input (read-only): `/Users/macstudio/CodexReview/chatagent-personal/8465c12c28f4aeb835ab0bfaf739d7a814376e44-f01-f02-rereview/` (especially `02_REMAINING_FINDINGS.md` and `03_GATE_DELTA_AND_NEXT_STEPS.md`).
**Status:** engineering verification; NOT independent re-review sign-off, beta authorization, or real Business deployment.

## Implemented: F02-R1 file mutation response uncertainty
- New `scripts/l1/l1-file-transport.mjs` is used by the production L0 brokerCall. It only treats the four file mutation routes (`file/create`, `file/write`, `file/replace`, development `file/copy`) specially. Failed fetch, failed `response.json()` or structurally unusable JSON *after a mutation request was prepared* yield sanitized `L1_MUTATION_RESPONSE_UNCERTAIN`, `effect=UNCERTAIN`, `retryable=false`. A transport failure does NOT prove that the effect occurred or did not occur.
- Properly received L1 JSON errors continue to carry known COMMITTED or UNCERTAIN, optional `audit=UNCERTAIN`, and explicit refusal codes (e.g. precondition mismatch). Successful response remains unchanged. No automatic retry, duplicate attempt, global lock, change to owner authority, or new RPC endpoint.
- Read-only/other routes (file/read/hash, status, process/start, async-copy/start) are NOT labeled as file mutation effects. These routes' separate existing uncertainty/idempotency contracts are outside this narrowly scoped F02 fix.
## Associated regression: read-only file audit
- The earlier F02 dispatch refactor inadvertently removed pre-existing `HOST_FILE_COMPLETED` and `HOST_FILE_FAILED` records for `file/list`, `file/stat`, `file/read`, `file/hash`. `scripts/l1/file-effect-status.mjs` now provides `auditedFileRead` and `scripts/l1/broker-server.mjs` routes read-only operations through it.
- A failed read audit never claims `effect=COMMITTED`; the primary file error is not masked if failure-audit persistence also fails. Success-audit failure reports `HOST_FILE_READ_AUDIT_FAILED` plus `audit=UNCERTAIN`. No authorization, file contents, or write behavior changed.

## Tests and evidence
- `scripts/l1/personal-f02-r1-test.mjs` uses an injected *mock transport* to assert for **each of the four file mutations** fetch failure, JSON parse failure and null JSON: UNCERTAIN and nonretryable. Also checks successful result, known L1 effect states/refusals and nonmutation route isolation.
- The same isolated test checks restored read-only completed/failed audit and preservation of primary errors on audit failure. It is registered in `scripts/run-personal-tests.mjs`.
- Local full `npm test`: `PERSONAL_STANDALONE_SUITE=PASS count=34`, exit 0. The previous 33 suites remain plus one F02-R1 contract suite. Exact committed SHA macOS CI must be recorded separately.
- Limitations: real mid-flight network/socket loss, actual L0 MCP transport injected failure, real disk power loss, F01 deliberately split HTTP socket, and released Business app E2E have NOT been tested in this batch. The test does not claim proof of no duplicate effect in a different client. Operational contract remains: query/reconcile a previously attempted effect before any new action; never blindly retry UNCERTAIN.
## Scope boundary / remaining gates
F01 has prior independent PASS within code/in-memory bounds; actual HTTP split remains UNVERIFIED. F02-R1 needs Astra's independent check of the new source SHA and failure semantics before changing its recorded status. F03 metadata concurrency and F04 async-copy reserved-job recovery remain P1 OPEN and unchanged. Offline encrypted archive custody remains a separate non-MCP gate.
Draft PR #5 stays OPEN/unmerged. Existing P8 Stable/Business v2 Canary/M16/STABLE-001, user state/keys, app registrations and endpoints were not modified. Owner must approve any subsequent Personal private Business beta candidate and usage limits separately.
