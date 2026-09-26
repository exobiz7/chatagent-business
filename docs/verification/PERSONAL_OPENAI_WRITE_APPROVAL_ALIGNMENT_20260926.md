# ChatAgent Personal — OpenAI write-action approval alignment

Date: 2026-09-26 KST
Branch: `feature/personal-openai-write-approval`
Parent implementation SHA: `3951c072836287fd30687f9e15048e340ef918ff`

## 1. Why this follow-up exists

Safe Replace v2 itself passed independent review at P0 0 / P1 0 / P2 0 and local/native/MCP/CI verification. In the actual AIspace Business 33-tool E2E, the wrong-SHA negative replace reached ChatAgent and correctly returned `CAS_PRECONDITION_MISMATCH`, but the correct-SHA destructive replace was blocked by the OpenAI platform safety layer before the MCP call reached ChatAgent.

The target file remained unchanged. This follow-up does not weaken or bypass platform safety. It aligns the MCP surface with OpenAI's documented write-action and approval model so a legitimate destructive write can be presented for host confirmation.

## 2. OpenAI policy findings

Official OpenAI documentation reviewed on 2026-09-26:

- Developer mode / full MCP supports write and modify actions on ChatGPT Business, Enterprise and Edu.
- Secure MCP Tunnel is the documented way to connect a private/on-prem/local MCP server to supported OpenAI products.
- ChatGPT app permissions determine when app reads/writes require approval.
- `Allow read actions` allows reads without asking and asks before making changes.
- `Allow low-risk actions` may automatically approve low-risk actions, while higher-risk actions may require confirmation or be denied.
- Some especially risky actions may still be denied instead of receiving an approval prompt.
- Destructive tools must accurately declare `readOnlyHint:false`, `destructiveHint:true`, and the correct `openWorldHint`; incorrect/missing annotations are a documented review/rejection risk.
- OpenAI recommends using host confirmation for destructive actions and splitting operations when they have materially different permission/safety requirements.
- App permission settings do not override provider/workspace restrictions or platform safety protections.

Primary official references:
- https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt
- https://help.openai.com/en/articles/20001495-managing-app-permissions-in-chatgpt
- https://developers.openai.com/plugins/reference
- https://developers.openai.com/plugins/plan/tools
- https://developers.openai.com/plugins/app-guidelines
- https://developers.openai.com/plugins/guides/security-privacy

## 3. Diagnosis

The 33-tool candidate already marked `local_replace_file` as a destructive, closed-world write. However, the generic L0 registration helper marked every non-read-only operation as `destructiveHint:true`, including several create-only or stop/control operations that do not delete/overwrite user data. This overstated the app's destructive surface and did not meet the precision requested by current OpenAI guidance.

A permission query from the current ChatGPT account also reported the default permission mode as `Allow low-risk actions`, whose documented behavior includes possible denial of higher-risk actions. The exact AIspace Business private-app permission must be set and verified in that workspace; this account-level observation is supporting evidence, not proof of the Business workspace's setting.
## 4. Code alignment

The 33-tool count and Safe Replace v2 implementation are unchanged.

`scripts/l0-ui-probe.mjs` now:

- uses explicit per-tool `readOnlyHint`, `destructiveHint`, and `openWorldHint` values instead of assuming every write is destructive;
- marks create-only `local_write` in Personal Core as non-destructive;
- marks create-only async copy start/stop and async hash start/stop as non-destructive writes;
- keeps cleanup/delete and process-stop actions destructive;
- keeps `local_exec_start` destructive and open-world because the delegated process may access files/network;
- marks immutable `personal_task_complete` destructive while ordinary memory append/create operations remain non-destructive;
- keeps `local_replace_file` destructive and closed-world, adds the human-facing title `Replace existing file`, explicitly sets `idempotentHint:false`, and rewrites the description around user intent and host confirmation rather than implementation jargon.

The replace description now states that the tool:
- updates one existing regular file only when the current SHA-256 matches;
- overwrites previous contents;
- should be used only after explicit user intent and host confirmation;
- never creates a missing file;
- refuses unsupported ACL/special-flag metadata;
- must not be blindly retried after an UNCERTAIN result.

No confirmation boolean, fake approval token, hidden bypass, or automatic permission escalation was added.

## 5. Verification

Focused verification:
- semantic-write MCP annotation and behavior test: PASS;
- 33-tool native CAS MCP test: PASS;
- exact 33-tool inventory preserved;
- `local_replace_file` title/description/annotations verified;
- core create-only/async/non-destructive hints verified;
- host exec and process-stop destructive hints verified;
- task-complete immutable/destructive hint verified.

Full local regression:
- `PERSONAL_STANDALONE_SUITE=PASS count=34`
- exit 0.

## 6. Actual Business dev-mode configuration and corrected guidance

The actual AIspace Business dev-mode private app UI did **not** expose a per-app Permissions selector such as `Allow read actions`. The app showed development metadata, no connected account/authentication, `도구 새로 고침` (Refresh Tools), and workspace publication controls. The earlier assumption that this specific dev-mode app could set `Allow read actions` directly in its management screen was therefore incorrect and is superseded by this section.

The correct supported refresh path for this app was:

1. run the updated L0 metadata on the isolated candidate;
2. use the Business app's `도구 새로 고침`;
3. verify the 33-tool snapshot is refreshed;
4. execute the explicitly user-requested destructive action and allow ChatGPT's platform policy to decide whether additional confirmation is required.

After refresh, Business displayed the new `local_replace_file` description beginning with `Update the contents of one existing regular file only when its current SHA-256 exactly matches expectedSha256`, proving the `ab341c48...` metadata snapshot had been loaded. Tool inventory remained exactly 33 (Write 17 / Read 16).

No safety control was disabled, no permission escalation was added, and no hidden approval token or bypass was used.

## 7. Actual Business positive replace closure

The refreshed Business app then executed one explicitly requested disposable existing-file replacement successfully. No platform pre-call block occurred on this attempt. No separate confirmation card was reported, so this record does not claim that a confirmation UI was shown; it only records that the normal platform path accepted and delivered the action.

Target:
`/Users/macstudio/ChatAgentPersonalCandidate/personal-f03-33-3951c07-q0OcnC/fixture-work/business-33-replace-20260926.txt`

Precondition:
- content: `CHATAGENT_PERSONAL_33_E2E_BASE_20260926`
- SHA-256: `b456303d87327ffdb346be00030849ec7a0133b0a392a11311c74440643dd6c3`
- mode: `0600`

Actual Business `local_replace_file` success receipt:
- `changed: true`
- `bytes: 43`
- `sha256: 043dcdf39eeed3dc13a175acde923aa2ac0e3bfdb8841eb40db081f5d4c7a0d7`
- `commitMode: DIRFD_DUAL_EXLOCK_RENAME_SWAP`

Business post-read returned exactly:
`CHATAGENT_PERSONAL_33_E2E_REPLACED_20260926`

Business post-hash matched the replace receipt. Independent Mac-side verification then confirmed the same content and SHA, mode `0600`, link count 1 and owner `macstudio`.

The owner subsequently returned the candidate to ASK. Local L1 health confirmed `paired=true` and `realAccess=false`.

Therefore the previous platform-blocked positive-path state is superseded:
- metadata refresh: PASS;
- actual Business correct-SHA replace: PASS;
- Safe Replace v2 commit mode: PASS;
- Business post-read/hash: PASS;
- independent Mac post-state: PASS;
- post-effect ASK rollback: PASS.

The next gate is no longer write-action policy compatibility. It is aggregate 33-tool Core beta-readiness assessment and release/baseline governance.
