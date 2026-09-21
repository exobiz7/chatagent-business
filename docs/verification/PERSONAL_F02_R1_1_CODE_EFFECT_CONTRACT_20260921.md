# Personal F02-R1.1 — known error-code/effect semantic validation

Date: 2026-09-21 KST. Previous Astra-reviewed implementation SHA: `2e0ca38202282cf4b0de26e2347a0b71611c6034`. The current implementation SHA is the commit containing this document; record its exact value in PR #5 after commit.
Previous independent findings (read-only): `/Users/macstudio/CodexReview/chatagent-personal/2e0ca38202282cf4b0de26e2347a0b71611c6034-f02-r1-1-rereview/`, especially `02_REMAINING_FINDINGS.md`.
**Engineering-only evidence — not independent Astra closure, owner acceptance, or beta authorization.**

## Scoped change
- `scripts/l1/l1-file-transport.mjs`: retain the existing receipt and field validation. For the four file mutation routes, `HOST_FILE_AUDIT_UNCERTAIN` requires `effect=COMMITTED,retryable=false`, consistent with the L1 completed-effect audit-failure path.
- Other error codes ending `_UNCERTAIN` require `effect=UNCERTAIN,retryable=false` (including `CAS_POSTCOMMIT_UNCERTAIN`). This describes *uncertainty*, not proof that the effect happened.
- Explicit precondition refusal codes `CAS_PRECONDITION_MISMATCH`, `PRECONDITION_MISMATCH`, `PRECONDITION_REQUIRED` forbid an effect field; all other codes cannot claim `COMMITTED` except the explicit completed-effect audit code. Unknown codes are not automatically treated as safe precommit denials.
- Missing or contradictory code/effect pairs are downgraded to sanitized `L1_MUTATION_RESPONSE_UNCERTAIN`, `effect=UNCERTAIN,retryable=false`. Complete legitimate L1 errors retain original code, effect and optional audit. No auto retry, permission escalation, global lock, new route or changes to native CAS, F03 or F04.
## Evidence
- Expanded `scripts/l1/personal-f02-r1-test.mjs`: four routes each assert missing/incorrect effect for known uncertainty and completed-audit codes, precondition + COMMITTED/UNCERTAIN contradictions, generic code + COMMITTED contradiction, legitimate precondition refusals, valid completed-audit and uncertain codes. In-process `fileEffectDetails` examples corroborate the L1 code/effect contract.
- Targeted test PASS. Local final `npm test`: `PERSONAL_STANDALONE_SUITE=PASS count=34`, exit 0; 34 existing suites, expanded assertions only. Exact-SHA Push/PR macOS CI results are recorded in the subsequent PR #5 evidence comment.
- These tests use injected mock L1 responses. They do not inject a malformed actual HTTP response into the running MCP path; no actual socket/transport disruption, disk/power failure, Personal Business E2E or cross-client retry behavior has been tested here. Do not treat these as PASS.
- F01 was independently PASS only for code/in-memory validation; actual intentional split HTTP transport is UNVERIFIED. F03 concurrent CAS metadata and F04 async-copy action/processId recovery remain P1 OPEN; separate optional backup is not a new core prerequisite. 32/33-tool beta entry remains on HOLD pending independent reassessment and the owner's explicit decision.
