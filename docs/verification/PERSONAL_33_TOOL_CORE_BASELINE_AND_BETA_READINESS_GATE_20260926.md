# ChatAgent Personal — 33-tool Core Candidate Baseline and Beta Readiness Gate

Date: 2026-09-26 KST

## 1. Candidate baseline decision

The preferred product candidate baseline is now the **33-tool Personal Core** including `local_replace_file` Safe Replace v2.

The previous 32-tool profile remains a rollback/reference baseline, not the target final product profile, because a chat-based executor without existing-file modification is functionally incomplete for normal code/document work.

This is a candidate-baseline decision, not merge/beta/production approval.

## 2. Evidence already closed

The following should no longer be treated as current blockers merely because older documents list them as OPEN/UNVERIFIED:

- F03 final check -> rename race: CLOSED by Safe Replace v2 independent re-review.
- inherited stage ACL residual: CLOSED.
- 33-tool local MCP inventory and positive native replace: PASS.
- actual AIspace Business 33-tool scan: PASS.
- Business ASK denial / FULL_HOST status / ASK rollback: PASS.
- wrong-SHA replace no-effect contract: PASS.
- correct-SHA Business existing-file replace: PASS.
- post-replace Business read/hash and independent Mac verification: PASS.
- OpenAI platform pre-call block encountered in the first attempt: resolved by standards-compliant tool metadata correction and Business tool refresh; positive execution subsequently PASS.
- F02 response/effect handling and F04 reconciliation retain their earlier independent PASS status unless a new aggregate audit finds a regression.

## 3. Historical documents

Earlier documents that say `33-tool OFF`, `F03 OPEN`, `Business E2E UNVERIFIED`, or `Beta HOLD` are historical evidence and must not be read as the current status without the newer closure records.

Do not rewrite those files merely to erase history. The current-state index is this document plus:
- `PERSONAL_F03_SAFE_REPLACE_V2_20260926.md`
- `PERSONAL_OPENAI_WRITE_APPROVAL_ALIGNMENT_20260926.md`
- `PERSONAL_33_TOOL_BUSINESS_REPLACE_E2E_CLOSURE_20260926.md`

## 4. Items that still require aggregate beta-readiness judgement

The next independent review must distinguish defects from residual/environmental limits. At minimum reassess:

1. **F01 actual deliberately split HTTP transport** — code/in-memory UTF-8 split handling previously passed; actual raw socket chunk-split execution was historically UNVERIFIED because an attempted command was safety-blocked. Determine whether this remains a beta blocker or a documented residual given current transport coverage; do not bypass a platform safety block.
2. **Physical fault boundaries** — sudden disk/power loss, all possible filesystem implementations, and adversarial same-UID raw writers are not universally proven. Determine which are ordinary documented residuals versus release blockers for the bounded Personal threat model.
3. **Concurrent independent clients / retry behavior** — current idempotency, ownership and fail-closed contracts have extensive isolated tests, but aggregate review should identify any still-unproven duplicate-effect path at the exposed 33-tool surface.
4. **Release artifact provenance/signing** — development native helpers are hash-pinned and tested, but production packaging/signing/toolchain provenance may remain a release-engineering gate distinct from beta functionality.
5. **Node/runtime and Personal Memory release posture** — verify the current Node/SQLite/runtime assumptions and whether any experimental-runtime qualification is beta-blocking or merely release packaging work.
6. **Optional offline backup/archive** — keep separate from Core unless beta requirements explicitly include it; do not convert optional backup custody work into an unrelated blocker.
7. **Runtime cleanup / rollback baseline** — 33 candidate remains ASK after E2E; 32 listeners are preserved as rollback baseline. Decide the clean operational topology for beta rather than keeping redundant test runtimes indefinitely.

## 5. Required next review output

Run an independent aggregate review against the exact post-closure source SHA and produce:
- current P0/P1/P2 counts;
- stale historical finding reconciliation;
- beta blocker vs bounded residual matrix;
- 33-tool candidate baseline verdict;
- exact remaining actions before a user beta can start;
- explicit statement that merge/production are separate decisions.

No blocker should be invented solely because an old document used `OPEN` or `UNVERIFIED`; equally, no unresolved high-impact issue should be silently waived because the Business E2E passed.
