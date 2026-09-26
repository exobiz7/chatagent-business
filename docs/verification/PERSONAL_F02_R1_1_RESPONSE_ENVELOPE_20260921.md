# Personal F02-R1.1 — bounded response-envelope remediation

Date: 2026-09-21 KST. Prior Astra-audited implementation SHA: `70c6858b70a12b3cd8037b9ec1c67bf38f519ce8`. New implementation SHA is the commit containing this document.
Astra evidence (read-only): `/Users/macstudio/CodexReview/chatagent-personal/70c6858b70a12b3cd8037b9ec1c67bf38f519ce8-f02-r1-rereview/`, especially `02_REMAINING_FINDINGS.md`.
**Status: engineering candidate only. Independent Astra re-review and owner approval are NOT complete.**

## Narrow fix
- `scripts/l1/l1-file-transport.mjs`: on the four existing file mutation routes (create/write/replace/development copy), accept a successful L1 result only if its existing receipt contract contains `changed:true`, a nonnegative safe integer `bytes`, 64-character lowercase SHA-256, and a nonempty `path` or both `source` and `destination` for copy. Extra legitimate fields such as `commitMode` are passed through.
- A failed HTTP response must contain a sanitized uppercase error `code`. Optional `effect` must be `COMMITTED` or `UNCERTAIN` and must include `retryable:false`; optional `audit` must be `UNCERTAIN`; explicit retryable true is invalid. Valid known refusals and completed/uncertain audit results retain their original code and state.
- Empty/unrelated objects, wrong receipt field types, absent/invalid error codes, or conflicting effect fields now raise `L1_MUTATION_RESPONSE_UNCERTAIN`, `effect=UNCERTAIN`, `retryable=false`. This is **not** a claim that the file changed. No new retry, persistent idempotency mechanism, global lock, owner authorization change or new route.
## Regression and evidence limits
- Existing isolated `scripts/l1/personal-f02-r1-test.mjs` was expanded for all four routes with complete legitimate receipts, optional native `commitMode`, known refusal/error state, and negative mock objects/field types. The original adapter-failure tests and read-only audit tests remain.
- Local `npm test`: `PERSONAL_STANDALONE_SUITE=PASS count=34`, exit 0. Same 34 test files; this change expands assertions rather than adding another suite.
- Exact-SHA macOS Push/PR CI evidence must be recorded after committing. This document is part of that same commit.
- Evidence is mock-transport and existing isolated MCP fixtures, **not** a real malformed wire-response L0 MCP E2E, actual socket disconnection, disk/power failure, or real Personal Business chat E2E. Independent static/dynamic re-review is still required.
- F01 previously passed only its code/in-memory checks; actual intentionally split HTTP transport is UNVERIFIED. F03 concurrent CAS metadata and F04 async-copy reserved-action recovery remain P1 OPEN. Optional offline backup is a separate gate. Do not infer 32-tool or 33-tool beta approval.
