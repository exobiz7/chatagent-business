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

## 6. Required Business configuration gate

For the AIspace private 33-tool test app, use the workspace/app permission mode equivalent to:

`Allow read actions`

This is the preferred test posture:
- reads do not require repeated approval;
- write/modify actions require an explicit ChatGPT confirmation prompt;
- destructive replace remains correctly marked and is not silently auto-approved.

Do not use `Allow all actions` merely to make the test pass. Do not disable safety controls. If the workspace exposes only admin-controlled action settings, the workspace admin should allow the `local_replace_file` action and keep write approval enabled.

After deploying this metadata change, refresh/rescan the private app because OpenAI documents that tool-definition updates must be refreshed/scanned before the app uses the latest action set.

## 7. Escalation if still blocked

If a correctly annotated `local_replace_file` under `Allow read actions` is still denied before MCP delivery, do not retry around the block.

The next compliant design is a narrower two-step contract:
1. a read-only preview/snapshot operation that identifies the exact file version and proposed modification;
2. a destructive commit operation scoped to that preview rather than an unrestricted fresh path selection.

This follows OpenAI's recommendation to split operations when permissions, safety, or confirmation requirements differ. It should be implemented only if the normal app-permission/confirmation path remains blocked.

No merge, beta, production promotion, or safety bypass is approved by this record.
