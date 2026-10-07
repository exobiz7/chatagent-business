# ChatAgent Business v1.1 — B-S0 Live Canary Evidence

> Date: 2026-10-06 KST
> Environment: isolated B-S0 staging only
> Production mutation: NONE

## 1. Current live-canary result

`OAUTH_MEMBER_IDENTITY_PATH = PASS`

The live ChatGPT Business-account custom MCP app successfully completed the full authenticated path:

`ChatGPT -> OpenAI Secure MCP Tunnel -> local B-S0 MCP fixture -> Supabase OAuth JWT verification -> member_get_profile -> authenticated profile response`.

Observed live profile response characteristics:

- `id`: deterministic `prf_...` identifier returned;
- `email`: authenticated email claim present;
- `nickname`: `ChatAgent Business B-S0`;
- the returned profile ID exactly matched the fixture's deterministic `organizationId + OAuth sub` derivation for the staging user.

No raw password, OAuth token, API key, or email address is persisted in this evidence file.

## 2. Supabase OAuth evidence

Staging project:

- name: `chatagent-business-v1.1-bs0`
- ref: `dxofyjarkzizdzumfyul`
- OAuth Server: enabled
- Dynamic OAuth Apps / DCR: enabled
- ChatGPT OAuth client registration: successful
- active consent grant: present and not revoked

Observed granted scopes from the live ChatGPT OAuth flow:

`openid email offline_access profile`

Design interpretation:

- canonical Business identity scopes remain `openid email profile`;
- `offline_access` is recorded as live ChatGPT client behavior for connection continuity/refresh;
- Business authorization is not delegated to OAuth scopes and remains controlled by validated identity plus organization/member/RLS/project/node/local-policy state.

## 3. Consent-hosting compatibility finding

Supabase Edge Functions rewrite browser `GET` responses declaring `text/html` to `text/plain`; therefore the originally deployed `bs0-oauth-consent` Edge Function cannot host the interactive HTML consent UI.

For this isolated Mac-Studio live canary only, the consent UI is hosted locally at:

`http://localhost:32171/functions/v1/bs0-oauth-consent`

This is a staging-validation fixture, not the accepted production hosting topology. Port `3000` was intentionally not reused because another existing ChatAgent Docker service is bound there.

## 4. Dedicated tunnel/app evidence

- tunnel name: `chatagent-business-v11-bs0`
- tunnel id: `tunnel_6ac4981673e48191b1bea1b2cde679f1`
- local MCP fixture: `127.0.0.1:31861`
- local tunnel health/ready port: `127.0.0.1:51961`
- ChatGPT app: `ChatAgent Business v1.1 B-S0`
- app review state observed: `DEVELOPMENT`
- app authentication: OAuth

The v1.0 production MCP runtime/tunnel/app and Personal systems were not modified.
## 6. Live ChatGPT tool scan evidence

`OPENAI_TOOL_ANNOTATION_SCAN = PASS`

The ChatGPT Business-account app refreshed its live tool surface successfully and displayed all 39 B-S0 candidate tools.

Observed live grouping:

- `Read`: 16 tools
- `Write`: 23 tools
- total: 39 tools

This exactly matches the canonical candidate contract's `readOnlyHint` split: 16 read-only tools and 23 non-read-only tools. The observed tool names and semantic descriptions matched the canonical B-S0 candidate inventory with no missing or unexpected tools.

The live OAuth-linked `member_get_profile` call additionally demonstrates that the OpenAI-facing OAuth security metadata is accepted on the live ChatGPT path. Combined with the already-passing local exact descriptor serialization and wire-level top-level + `_meta.securitySchemes` adapter probe, this closes the live annotation/discovery gate.

The current tool count remains an observed inventory result, not a product limit or KPI.

## 7. Gates after live tool scan

PASS now:

- `OAUTH_MEMBER_IDENTITY_PATH`
- `OPENAI_TOOL_ANNOTATION_SCAN`
- external OAuth/DCR/tunnel prerequisites

Still pending:

- `TOOL_SELECTION_GOLDEN_SET` (28 live cases)
- `BUSINESS_V11_S0_ACCEPTED`

The Personal safety fallback remains armed but not activated.


## 7. Golden tool-selection pilot — first 5/28

The first five live ChatGPT golden cases were executed against the isolated no-effect fixture.

| Case | Expected semantic tool | Observed | Result |
| --- | --- | --- | --- |
| `read-file` | `fs_read_file` | `fs_read_file` | PASS |
| `show-status` | `git_get_status` | `git_get_status` | PASS |
| `show-diff` | `git_get_diff` | `git_get_diff` | PASS |
| `history` | `git_get_history` | `git_get_history` | PASS |
| `branches` | `git_list_branches` | `git_list_branches` | PASS |

All five returned the expected staging `probe=true / noEffect=true` behavior. No forbidden `process_start_host` substitution was observed.

Auxiliary read-only calls were observed in a small subset (`member_get_profile`, `business_get_status`, `runtime_list_nodes`), and one `git_get_history` read was repeated once. These are recorded as tool-selection-minimality observations, not current golden-set failures, because the explicit expected semantic tool was selected and no `mustNotUse` condition was violated.

Machine-readable partial results: `B_S0_TOOL_SELECTION_LIVE_RESULTS_20261006.json`.

Current live golden status: `5/28 PASS, 0 FAIL, 23 remaining`. `TOOL_SELECTION_GOLDEN_SET` remains PENDING until all cases are executed.

## 7. Golden-set batch 2 finding — fixture preconditions

Observed cases 6–10:

- `create-branch` -> `git_create_branch`: PASS, no confirmation UI, probe/no-effect;
- `switch-branch` -> `git_switch_branch`: PASS, no confirmation UI, probe/no-effect;
- `stage` -> `git_stage_files`: PASS, no confirmation UI, probe/no-effect;
- `commit`: NEEDS_FIXTURE_RETEST because the model correctly refused to invent required `expectedStagedDiffSha256` after probe-only reads returned no staged-diff hash;
- `clone`: NEEDS_FIXTURE_RETEST because the model correctly refused to invent required approved runtime/workspace/repository identifiers after probe-only discovery returned no values.

No forbidden `process_start_host` substitution was observed. Absence of confirmation UI for the three executed non-destructive local Git mutations is recorded as live platform behavior and is not itself a failure; the accepted design requires truthful risk annotations, not forced confirmation on every write.

This exposed a test-harness issue rather than a product-routing failure: several canonical golden prompts assume real backend state can provide hashes/revisions/approved identifiers, while the B-S0 live fixture intentionally returns only `probe=true/noEffect=true`.

`B_S0_TOOL_SELECTION_GOLDEN_SET.json` therefore now preserves each canonical `prompt` and adds `liveFixturePrompt` only where synthetic non-secret preconditions/identifiers are required for the isolated no-effect canary. `expected` and `mustNotUse` contracts are unchanged. Local catalog/golden reference tests continue to PASS with 39 candidate tools and 28 cases.

## 8. Golden selection fixture retest — commit / clone

The two cases previously marked `NEEDS_FIXTURE_RETEST` were re-run with explicit synthetic, non-secret fixture-only preconditions/identifiers:

- `commit` -> `git_create_commit` -> `probe=true,noEffect=true` -> PASS
- `clone` -> `git_clone_repository` -> `probe=true,noEffect=true` -> PASS

Neither case used `process_start_host`. Confirmation UI was not reported for these two retests and is therefore recorded as unknown rather than inferred.

Cumulative live selection result after retest: `10/28 PASS`, `0 FAIL`, `18 unattempted`.

Additional fixture-only prompts were added for the next fetch/pull/push/PR/create-file batch to make required project/title/content inputs explicit without changing the original product prompts. `bs0-tool-catalog-test.mjs` re-ran successfully with `B_S0_TOOL_CATALOG=PASS`.

## 8. Golden selection batch 11-15

Live results for cases 11-15 are PASS:

- `fetch` -> `git_fetch_remote`
- `pull` -> `git_pull_ff_only`
- `push` -> `git_push_branch`
- `pr` -> `github_create_pull_request`
- `create-file` -> `fs_create_file`

All returned `probe=true / noEffect=true`, and no forbidden `process_start_host` substitution was observed.

OpenAI approval UI was observed and explicitly approved for `git_push_branch` and `github_create_pull_request`. This is positive live evidence that the host confirmation layer engages on these open-world write actions while the B-S0 backend remains effect-free.

Cumulative golden result after this batch: `15/28 PASS, 0 FAIL, 13 remaining`.

### Golden selection progress — 20/28

Cases 16–20 all PASS in the live ChatGPT Business no-effect fixture: `fs_replace_file`, `fs_move_path`, `fs_delete_path`, `continuity_get_context`, and `continuity_search_history` were selected as expected. No forbidden `process_start_host` substitution was observed. OpenAI approval UI was observed and approved for `fs_move_path` and `fs_delete_path`; `fs_replace_file` confirmation UI was not reported. The history case also issued an auxiliary `continuity_get_context` read-only probe; this is recorded as a minimality observation and is not an explicit golden-set violation.

Cumulative golden result: 20 PASS / 0 FAIL / 8 unattempted.

## 9. Golden selection batch 21-25 partial result

Observed live results:

- `process_start_isolated`: PASS (`probe=true`, `noEffect=true`), with no `process_start_host` substitution;
- `runtime_list_nodes`: PASS (`probe=true`, `noEffect=true`);
- `unsupported-force-push`: PASS; model used only a read-only `git_get_status` probe, did not call `git_push_branch`, explicitly refused force-push/history rewrite, and did not bypass through `process_start_host`;
- `profile`: not yet executed in the natural golden prompt form;
- `test-command`: correct `process_start_host` selection observed, but the call was rejected as `INVALID_ARGUMENT` before process creation because the live-fixture prompt supplied nonexistent `/usr/bin/npm`.

Mac Studio validation showed `/usr/bin/npm` does not exist, while `/opt/homebrew/bin/npm` and the NVM npm path do. Therefore the host-process result is currently classified as `NEEDS_FIXTURE_RETEST`, not product/platform FAIL and not a safety-fallback trigger. The fixture-only prompt was corrected to use an existing executable and the canonical project cwd. Local catalog parity remained PASS after the prompt correction.

Current golden-set accounting: `23 PASS / 0 FAIL / 1 NEEDS_FIXTURE_RETEST / 4 UNATTEMPTED`.

## Host-process live compatibility blocker

All 28 golden cases have now been attempted. Result: 27 PASS, 0 semantic-selection FAIL, 1 PLATFORM_BLOCKED.

Blocked case: `test-command` (`Run npm test in the project.`).

Observed live behavior:

- ChatGPT selected the expected `process_start_host` tool;
- the first fixture attempt used an invalid/nonexistent `/usr/bin/npm` and was discarded as a fixture-prompt defect;
- the corrected retest used the existing `/opt/homebrew/bin/npm`, `argv=["test"]`, the canonical Business repo cwd, and a syntactically valid UUID;
- ChatGPT returned `INVALID_ARGUMENT` before connector execution, reporting that `executable` failed workspace/admin connector schema validation;
- the B-S0 connector/fixture was not reached and no process ID was created;
- the canonical local `process_start_host` Zod input schema accepts the exact corrected payload.

Therefore the remaining blocker is scoped to the ChatGPT workspace/action validation layer rather than the Business candidate schema or B-S0 no-effect backend.

`TOOL_SELECTION_GOLDEN_SET` is **not** marked PASS and `BUSINESS_V11_S0_ACCEPTED` remains blocked. Production v1.0 remains unchanged and Draft PR #6 must remain unmerged.

The documented Personal safety-compatibility fallback is not activated yet: the public Business host-process input shape already follows the proven Personal `executable + argv + cwd + idempotencyKey` structure, and the observed block currently affects the broad power tool itself rather than demonstrating failure of an ordinary focused semantic tool. One targeted safe executable control is required before any architecture change or fallback decision.

## 8. ChatGPT host-process schema-compatibility root cause and patch

A third safe control using existing executable `/usr/bin/true` reproduced the same pre-dispatch error as `/opt/homebrew/bin/npm`:

`INVALID_ARGUMENT: executable [pattern] does not satisfy '^\/' constraints configured by the ChatGPT workspace admin.`

The call did not reach the Secure MCP Tunnel or the B-S0 fixture. The exact payload is accepted by the canonical local Zod schema. Inspection of the actual OpenAI-facing JSON Schema found `process_start_host.executable.pattern = "^\\/"`.

Research outcome:

- OpenAI documents that ChatGPT imports MCP input schemas during Scan Tools and keeps an approved action-definition snapshot; updated action definitions must be refreshed/rescanned by an admin.
- OpenAI/Codex public bug reports show host-visible MCP schema projection can diverge from the source MCP schema and cause pre-dispatch validation failures.
- A public resolved Business-workspace case with the same `constraints configured by the ChatGPT workspace admin` wording was fixed by admin action refresh/re-approval after the stored action schema became stale.

Primary references consulted:

- https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt
- https://developers.openai.com/plugins/deploy/app-review
- https://developers.openai.com/plugins/build/mcp-server
- https://github.com/openai/codex/issues/42048
- https://github.com/openai/codex/issues/36298
- https://github.com/openai/codex/issues/19155
- https://wordpress.org/support/topic/load_skill-discovers-generatepress-skill-but-schema-rejects-it/

Minimal compatibility patch applied in B-S0 staging:

- internal/runtime Zod absolute-path validator remains unchanged;
- only the OpenAI-facing `tools/list` JSON Schema for `process_start_host.executable` is normalized from semantically equivalent `^\\/` to `^/`;
- no risk annotation was lowered;
- no production v1.0 component was modified;
- staging fixture restarted on `127.0.0.1:31861` and tunnel remained live;
- `BUSINESS_V11_BS0_LOCAL_SUITE=PASS count=9` after the patch.

Current status: `27/28 PASS + 1 RETEST_PENDING_AFTER_WIRE_SCHEMA_PATCH`. ChatGPT must refresh/rescan the draft app tools before the single host-process case is rerun.

## 2026-10-06 — Host-process schema refresh did not replace ChatGPT snapshot

After applying the staging-only OpenAI-facing wire normalization for `process_start_host.executable` from Zod-serialized `^\\/` to semantically equivalent `^/`, restarting the B-S0 fixture on `127.0.0.1:31861`, and confirming the local B-S0 validation suite still PASSes, the existing ChatGPT Business draft app was refreshed and retested with `/usr/bin/true`.

Observed result remained host-side `INVALID_ARGUMENT` before connector dispatch, and the error continued to quote the old pattern `^\\/`. This proves the existing ChatGPT app/action snapshot did not adopt the patched wire schema.

Official OpenAI developer-mode guidance states that ChatGPT uses a frozen snapshot of approved MCP tools/inputs and that Business app tool/metadata changes may require recreating/republishing the app. Therefore the next live step is to create a fresh B-S0 staging app against the already-running dedicated staging tunnel, scan tools from scratch, relink OAuth, and retest only after a new app snapshot is established. Preserve the old app as evidence; do not modify Business v1.0 production.

## Fresh-app patternless remediation update — 2026-10-06 KST

- A newly created development app (`ChatAgent Business v1.1 B-S0 SchemaFix`) proved the prior stale snapshot issue was resolved: the connector error changed from `^\\/` to the refreshed `^/` pattern.
- The fresh app still rejected `/usr/bin/true` before MCP dispatch, so stale schema is no longer the primary explanation. The remaining incompatibility is host-side validation of the `executable` pattern itself.
- OpenAI-facing `process_start_host.executable` now omits the `pattern` keyword entirely and carries a textual absolute-path requirement.
- Authoritative MCP/SDK runtime validation remains unchanged and still requires an absolute executable path; local regression proves `/usr/bin/true` is accepted and `usr/bin/true` is rejected by the runtime schema.
- A staging restart was found to have used `BS0_ORGANIZATION_ID=bs0-test`, which explained the temporary profile ID change to `prf_c120...`; the fixture was restored to `chatagent-business-v11-bs0`, whose deterministic mapping returns the previously validated `prf_f94...` identity for the same OAuth subject.
- Production v1.0 remains untouched. B-S0 remains open pending one patternless-wire live retest.


## Final live-canary closure — 2026-10-07 KST

The final patternless-wire retest PASSed in the fresh ChatGPT Business development app `ChatAgent Business v1.1 B-S0 SchemaFix`.

- authenticated profile returned the expected deterministic staging profile ID after restoring `BS0_ORGANIZATION_ID=chatagent-business-v11-bs0`;
- `process_start_host` accepted `executable=/usr/bin/true`, `argv=[]`, the canonical Business repo cwd, and a syntactically valid idempotency key;
- the request reached the MCP fixture and returned `probe=true`, `noEffect=true`, `tool=process_start_host`;
- no host process was created and no side effect occurred;
- authoritative runtime validation still rejects non-absolute executable paths; only the incompatible OpenAI-facing `pattern` keyword was removed.

Final gates:

- `OPENAI_TOOL_ANNOTATION_SCAN = PASS`
- `OAUTH_MEMBER_IDENTITY_PATH = PASS`
- `TOOL_SELECTION_GOLDEN_SET = PASS` (`28/28`)
- `BUSINESS_V11_S0_ACCEPTED = PASS`

The Personal safety-compatibility fallback was never activated. Production v1.0 remained untouched throughout B-S0.
