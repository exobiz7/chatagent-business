# ChatAgent Business v1.1 — B-S0 Session Continuity Handoff

> Captured: 2026-10-06 KST
> Purpose: hand off the current v1.1 design/validation state to a fresh ChatGPT session without losing product goals, quality gates, lessons, or exact operational state.
> Authority rule: this document is a continuity aid, not a substitute for the repository. The next session MUST inspect the actual repo read-only first and prefer newer accepted/current-state evidence if it exists.

## 1. Canonical product and repositories

Product: **ChatAgent Business — SMB Edition**

Canonical Business repo:
`/Volumes/SSD 4T/z_proj/proj04_chatagent/chatagent_business`

GitHub:
`exobiz7/chatagent-business` (private)

Current v1.1 validation branch:
`feat/business-v1.1-bs0-validation`

Source HEAD immediately before adding these handoff documents:
`f6f81999fbd69337b520883fc3c2e00da9668e0f`

The branch HEAD after handoff packaging will be a newer docs-only commit. Always verify the actual HEAD at session start.

Current `origin/main`:
`0f03ee039a0ff7926377f86b140cc8bf7c9792ed`

Draft PR:
`#6 — test: validate Business v1.1 B-S0 architecture`

PR state at handoff:
- OPEN
- DRAFT
- merge state CLEAN
- two hosted macOS CI runs SUCCESS

Frozen released baseline:
- release tag `v1.0.0`
- release commit `d6373f8ffef4b3739134f4d14cc300918417553e`
- status `PRODUCTION_ACTIVE_V1.0.0`

Personal donor/reference repo:
`/Volumes/SSD 4T/z_proj/proj04_chatagent/chatagent-personal`

Personal donor release:
- tag `v1.1.1`
- commit `da391bf9c38697d706049b3b5d7bd2c2ba4ba28e`

Do not modify ChatAgent Personal or P8 reference systems unless explicitly requested.

## 2. Read these documents first, in this order

The next session should read these before making any design or implementation decision:

1. `docs/approved/CHATAGENT_BUSINESS_V1_1_ACCEPTED_DESIGN_20261005.md`
   - current normative v1.1 Accepted Design
   - revision R5
   - supersedes conflicting older v1.1 planning assumptions

2. `docs/verification/v1.1/B_S0_VERIFICATION_REPORT_20261005.md`
   - actual B-S0 findings, corrections, local probe results, unresolved live gates

3. `docs/verification/v1.1/B_S0_GATE_STATE_20261005.json`
   - machine-readable gate state
   - includes current staging Supabase/fixture state

4. `docs/verification/v1.1/B_S0_LIVE_CANARY_RUNBOOK.md`
   - exact live ChatGPT/OAuth canary sequence and close conditions

5. `docs/verification/v1.1/B_S0_TOOL_CONTRACT_CANDIDATE.json`
   - current focused semantic tool inventory
   - current count 39, but count is explicitly not constrained

6. `docs/verification/v1.1/B_S0_TOOL_SELECTION_GOLDEN_SET.json`
   - 28 live model-selection cases

7. `docs/verification/v1.1/B_S0_SUPABASE_SCHEMA_RPC_CONTRACT.json`
   - B-S1/B-S2 Supabase schema/RPC naming freeze

8. `docs/verification/v1.1/B_S0_TEST_MATRIX.json`
   - 34 test/gate records spanning B-S0 through B-S6

9. `docs/verification/v1.1/B_S0_PERSONAL_DONOR_MANIFEST.json`
   - Personal v1.1.1 source/test donor freeze

10. `docs/verification/v1.1/B_S0_TUNNEL_PROFILE_TEMPLATE.yaml`
    - isolated staging tunnel profile template

11. `docs/product/CHATAGENT_BUSINESS_PRODUCT_SPECIFICATION_v1.0.0.md`
12. `docs/manual/CHATAGENT_BUSINESS_USER_MANUAL_v1.0.0.md`
13. `docs/release/CHATAGENT_BUSINESS_RELEASE_v1.0.0.md`

Historical v1.0 baseline:
`docs/approved/CHATAGENT_BUSINESS_ACCEPTED_BASELINE_v0.1.md`

Do not use older Supabase Shared Continuity handoffs as authority when they conflict with the R5 Accepted Design.

## 3. Product North Star — do not regress this

Business v1.1 is **not** a more restricted version of Personal.

Accepted product direction:

> **Personal-grade work freedom + Shared team memory + Distributed runtime + Existing organizational governance**

Operational principle:

> **Work freely on approved nodes. Share context broadly by default. Respect the user's OS authority. Govern shared integration points. Expose risky effects semantically and truthfully.**

The product is aimed at agile startups and SMBs, including remote workers using approved personal devices.

Do not reintroduce enterprise-style friction merely for the appearance of security.

Security must come primarily from truthful boundaries and existing governance:
- authenticated member identity;
- approved/revoked runtime nodes;
- project/node mapping;
- OS-user authority;
- TEAM/PRIVATE context policy;
- semantic tool effects and truthful annotations;
- Git/GitHub PR/CI/branch protection;
- RLS/server-side authorization;
- bounded leases/revocation behavior.

## 4. Collaboration model

Only two collaboration modes are required for v1.1:

- `TEAM` — **default**; broad history/search/context sharing, equivalent to the earlier `TEAM_EXTENDED` idea.
- `PRIVATE` — explicit exception for sensitive projects.

Do not resurrect `LOCAL_PRIVATE` as the default or add restrictive modes without concrete evidence that the product needs them.

TEAM continuity is shared organizational working memory within the approved project scope.

Broad sharing does **not** mean credentials/secrets may be persisted. Personal's validated sensitive-text guard is mandatory before cloud continuity persistence.

## 5. Runtime/device model

One organization may have N approved runtime nodes.

Node lifecycle:
`PENDING -> APPROVED -> REVOKED`

Node types:

### PERSONAL_NODE
- first-class BYOD/remote-worker node
- owner uses normal macOS user authority
- `HOST_USER` is the default normal execution model for the owner
- another member may not silently route host work to that personal node

### SHARED_NODE
- team/shared machine
- semantic file/Git and isolated work may be broadly available according to project/member policy
- generic `process_start_host` is **disabled by default**
- it may be enabled only with explicit ADMIN node-level opt-in confirming the underlying OS account itself is suitable for shared broad host authority

Reason for this exception: a generic host process cannot honestly be confined to `TRUSTED_ROOTS` merely by setting cwd. This is a correctness boundary, not enterprise over-restriction.

## 6. Execution model

Accepted execution modes:
- `HOST_USER` — primary for trusted development/knowledge work
- `ISOLATED` — optional sandboxed execution when desired

`process_start_host` remains available as a **power-tool / escape hatch**, not the preferred route for frequent common actions.

When a focused semantic tool exactly represents the request, model/tool routing should prefer that semantic tool.

## 7. Tool contract principles

There is **no minimum or maximum tool count**.

Never optimize for 17, 18, 25, 30, 39, 40, 100, or any other number.

Canonical rule:

> **Tool count is an output of use-case decomposition, never an input constraint.**

Public naming convention:
`<domain>_<verb>_<object>`

Each tool must have:
- one focused semantic action;
- specific action-oriented name;
- precise positive and negative description boundaries;
- input schema exposing the real action rather than hiding many actions behind a mode field;
- truthful `readOnlyHint`, `destructiveHint`, `openWorldHint`;
- clear distinction from similar tools.

Current B-S0 candidate contains **39 tools** only because that is the current decomposition result.

Current domains include:
- Business/member/runtime identity and mapping
- Filesystem
- Team Continuity
- Process/execution
- Git/GitHub

Important current names include:
- `business_get_status`
- `member_get_profile`
- `runtime_list_nodes`
- `runtime_map_project`
- `runtime_unmap_project`
- `fs_*`
- `continuity_*`
- `process_start_host`
- `process_start_isolated`
- `process_get_status`
- `process_read_output`
- `process_terminate_job`
- focused `git_*`
- `github_create_pull_request`

Do not recombine focused Git operations into ambiguous umbrella tools such as `git_inspect`, `git_prepare`, `git_sync`, or `git_publish` merely to reduce tool count.

## 8. Reuse-first mandate — Personal is the primary donor

This is mandatory, not advisory.

For capabilities already solved by Personal v1.1.1, classify before coding:

- `REUSE_AS_IS`
- `ADAPT_THINLY`
- `BUSINESS_NEW`
- `DO_NOT_EXPOSE`

Default for overlapping capability:
`REUSE_AS_IS` or `ADAPT_THINLY`

Do **not** write a second implementation first and compare it later.

Preferred sequence:
1. identify Personal donor implementation;
2. port/reuse relevant tests first;
3. reuse the implementation/primitives;
4. add only Business authority/member/node/team adaptations;
5. add Business-specific tests;
6. keep Personal read-only and independent at runtime.

High-value Personal donors already identified:
- semantic create-only / CAS replace
- HostFileOps list/read/stat/hash
- DurableHostProcesses start/status/read/stop
- async copy/hash patterns if later required
- Keychain refresh-token custody
- Supabase auth/session/runtime config
- input/sensitive-text contracts
- Supabase store retry/error/idempotency/CAS patterns
- task/context/search patterns
- encrypted logical backup
- tool annotation and safety-test lessons

Business-specific work should concentrate on:
- organization/member model
- TEAM/PRIVATE
- PERSONAL_NODE/SHARED_NODE
- member-to-node binding
- N-node routing
- project/local mapping
- Gateway/Relay
- Business continuity fields
- focused Git/GitHub semantics

## 9. OpenAI safety strategy

Primary strategy:
- semantic tools for common actions;
- `process_start_host` as escape hatch;
- truthful annotations/descriptions;
- no hiding destructive/open-world effects;
- no attempts to bypass platform safety.

Mandatory fallback:

If real ChatGPT Developer Mode demonstrates reproducible blocking or unusable confirmation behavior for legitimate common workflows **despite** truthful focused semantic tools, stop inventing new abstractions and reuse the already validated Personal tool surface/description/schema/annotation structure for the affected capability as directly as practical.

The fallback is currently **armed but not activated**.

Local evidence has not justified activation. Only the pending live canary may do so.

## 10. B-S0 discoveries and corrections already made

Do not rediscover or undo these without new evidence.

1. `process_terminate` violated the naming contract; corrected to `process_terminate_job`.
2. clone and local project mapping were incorrectly coupled; now `git_clone_repository` clones only, while `runtime_map_project` / `runtime_unmap_project` own mapping.
3. TEAM broad sharing lacked explicit sensitive-text rejection; Personal's validated guard is now mandatory.
4. cloud logical project identity and local filesystem path mapping needed separation; cloud project rows never grant host authority.
5. degraded cloud operation and revocation semantics required bounded authorization lease behavior; lease expiry fails closed.
6. SHARED_NODE trusted-root semantics conflicted with unrestricted generic host shell; generic host power is default-off on shared nodes.
7. proposed custom OAuth scopes `business.read/write/execute` were invalid because Supabase Auth currently supports standard identity scopes only; use `openid email profile` and enforce Business permissions with RLS/server/local policy.
8. current MCP SDK tool registration preserved `_meta.securitySchemes` but did not emit OpenAI's top-level `securitySchemes`; a minimal `tools/list` descriptor adapter was wire-tested successfully without replacing SDK call validation.
9. Secure MCP Tunnel is transport, not N-node member routing; Business Gateway + outbound Node Relay remains the accepted distributed routing direction.

## 11. B-S0 local validation result

Current official phase status:
`LOCAL_VALIDATION_PASS_LIVE_CANARY_PENDING`

Local suite:
`BUSINESS_V11_BS0_LOCAL_SUITE=PASS count=9`

Current tool-selection golden set:
- 28 cases

Current full B-S0..B-S6 test matrix:
- 34 records

Existing Business hosted-CI equivalent:
- PASS

Draft PR #6 hosted macOS CI at current HEAD:
- SUCCESS
- SUCCESS

B-S0 is **not closed** yet.

Pending mandatory live gates:
- `OPENAI_TOOL_ANNOTATION_SCAN`
- `TOOL_SELECTION_GOLDEN_SET`
- `OAUTH_MEMBER_IDENTITY_PATH`
- then `BUSINESS_V11_S0_ACCEPTED`

Do not start B-S1 as if these were implicitly passed.

## 12. Supabase staging — actual current state

Dedicated Business B-S0 project has been created.

Project:
- name: `chatagent-business-v1.1-bs0`
- ref: `dxofyjarkzizdzumfyul`
- region: `ap-northeast-2` (Seoul)
- status: `ACTIVE_HEALTHY`
- project URL: `https://dxofyjarkzizdzumfyul.supabase.co`

This is separate from Personal. Do not reuse or modify the Personal Supabase project.

B-S0 consent Edge Function:
- name: `bs0-oauth-consent`
- status: `ACTIVE`
- version 1
- intentionally `verify_jwt=false` because it is the pre-authentication sign-in/consent surface
- no service-role/secret key is embedded

Consent URL:
`https://dxofyjarkzizdzumfyul.supabase.co/functions/v1/bs0-oauth-consent`

Security advisor:
- 0 findings at staging creation/check time

Performance advisor:
- 0 findings at staging creation/check time

JWT/OIDC signing:
- ES256 asymmetric signing key is already exposed by JWKS

OAuth Server current state at handoff:
- **DISABLED**
- discovery endpoint returns HTTP 404 `feature_disabled`

Still required in Supabase Dashboard:
- Site URL: `https://dxofyjarkzizdzumfyul.supabase.co`
- Authentication -> OAuth Server: ENABLE
- Authorization Path: `/functions/v1/bs0-oauth-consent`
- Dynamic Client Registration: ENABLE for this isolated B-S0 staging project
- scopes: standard `openid email profile` only

Do not introduce custom `business.*` scopes.

## 13. OpenAI B-S0 tunnel/app — actual current state

A dedicated B-S0 tunnel has **not yet been created**.

Required tunnel name recommendation:
`chatagent-business-v11-bs0`

Never repoint or reuse the production v1.0 tunnel.

Template:
`docs/verification/v1.1/B_S0_TUNNEL_PROFILE_TEMPLATE.yaml`

Template isolation:
- fixture MCP port: `127.0.0.1:31861`
- tunnel health port: `127.0.0.1:51961`
- existing organization-scoped runtime API-key file is referenced by path; do not print/copy the key
- no production deployment-key header

At handoff:
- local effect-free fixture process is already running
- PID `15273`
- listening on `127.0.0.1:31861`
- `51961` has no listener because the staging tunnel does not exist/start yet

The fixture is intentionally no-effect. It exposes the candidate tool descriptors and OAuth profile path without performing real file/Git/process effects.

## 14. Exact next live-canary sequence

The new session should continue here, not restart B-S0.

1. Read-only reconfirm repo branch/head/status and newer evidence.
2. In Supabase Dashboard, enable the B-S0 OAuth Server settings listed above if still disabled.
3. Recheck discovery endpoint; it must no longer return `feature_disabled`.
4. Create a **new** OpenAI Secure MCP tunnel named `chatagent-business-v11-bs0`.
5. Put only the new tunnel ID into an isolated copy of `B_S0_TUNNEL_PROFILE_TEMPLATE.yaml`.
6. Do not expose runtime API keys or admin keys in chat/logs.
7. Start the staging tunnel; verify `51961/healthz` and `51961/readyz`.
8. In ChatGPT Developer Mode / Apps create a Draft app using the B-S0 tunnel.
9. Scan Tools.
10. Verify current candidate descriptors: names, descriptions, schemas, annotations, top-level `securitySchemes` and compatibility mirror.
11. Complete Supabase OAuth sign-in/consent using the staging consent UI.
12. Call `member_get_profile` and verify stable opaque identity derived from validated OAuth credentials, not caller-supplied member IDs.
13. Execute all 28 cases in `B_S0_TOOL_SELECTION_GOLDEN_SET.json`.
14. Record selected tool, arguments, confirmation UI, safety block, and effect-free response for every case.
15. Treat unnecessary `process_start_host` selection when a semantic tool exists as a failure unless evidence supports an exception.
16. If repeated legitimate workflows are blocked despite truthful semantics, activate the Personal Safety Compatibility Fallback and rerun the complete golden set.
17. Only when all four B-S0 close gates PASS should Draft PR #6 be prepared for acceptance/merge and B-S1 begin.

## 15. Production v1.0 actual state — do not disturb

Production root:
`/Users/macstudio/ChatAgentBusiness/production`

Release record:
- product version `1.0.0`
- status `PRODUCTION_ACTIVE_V1.0.0`
- release tag `v1.0.0`
- release commit `d6373f8ffef4b3739134f4d14cc300918417553e`

Current actual server listener at handoff:
- PID `8871`
- command: Business v1.0 MCP server
- listening on `127.0.0.1:31850`
- process start: 2026-10-02 14:37 KST

Production tunnel:
- tunnel ID `tunnel_6abe54973cb48191a1c54c50ede05748`
- tunnel health `127.0.0.1:51950/healthz` -> `live`
- tunnel ready `127.0.0.1:51950/readyz` -> `ready`
- current tunnel process observed running

Operational nuance:
`com.chatagent.business.server` LaunchAgent itself reports `not running` / last exit 0 because its Start command is a one-shot launcher; the actual child MCP server PID `8871` remains alive and listening. Do not misdiagnose this LaunchAgent state alone as production downtime.

Production local continuity remains tiny:
- SQLite event count: 3
- historically 1 project / 1 task / 1 checkpoint

Do not migrate production continuity during B-S0.

## 16. Git/branch rules

Current working tree was clean before creating this handoff.

The B-S0 validation work belongs on:
`feat/business-v1.1-bs0-validation`

Draft PR #6 remains unmerged until live B-S0 closes.

Do not move the `v1.0.0` tag.

Do not modify production v1.0 app/runtime/tunnel during B-S0.

Avoid broad destructive Git operations:
- no `git clean`
- no `git reset --hard`
- no broad checkout/reset that discards evidence
- no `git add .` or `git add -A` when a bounded file list can be staged

Prefer small, reversible commits and exact-path staging.

## 17. Supabase schema/RPC contract already frozen for later phases

Do not implement this in B-S0 merely because the names are frozen.

Control schema:
`private_business_control`

Continuity schema:
`private_business_continuity`

One organization per Supabase project.

Runtime `service_role` use is forbidden.

Caller-supplied member ID is never authoritative.

Cloud logical project metadata never grants host filesystem/exec authority.

Continuity does not duplicate the logical-project master.

RPC naming is frozen in:
`docs/verification/v1.1/B_S0_SUPABASE_SCHEMA_RPC_CONTRACT.json`

## 18. Roadmap after B-S0

### B-S1 — Cloud Foundation / Identity / Runtime Nodes
Implement/adapt:
- Supabase control schema
- member identity/profile
- node enroll/approve/status/revoke/session
- OAuth/auth/session/Keychain patterns
- Gateway/Relay authentication groundwork
- local project mapping persistence/authority

### B-S2 — TEAM Shared Continuity / Search
Implement:
- shared Supabase continuity store
- TEAM/PRIVATE reads
- task/checkpoint/complete/context/search
- CAS/idempotency/immutable completion
- sensitive-text guard
- Business decisions/facts/artifacts

### B-S3 — Distributed Runtime / Semantic Effects / HOST_USER
Implement/reuse:
- semantic filesystem tools
- Personal DurableHostProcesses
- HOST_USER + ISOLATED
- focused Git/GitHub tools
- node/project routing
- power-tool boundary

### B-S4 — Migration / Backup / Ops Integration
Implement/rehearse:
- v1 SQLite export/import/readback
- logical encrypted backup
- degraded continuity mode
- Doctor/status/operator integration
- no final production migration yet

### B-S5 — Real Multi-Node / Safety / Failure E2E
Validate:
- SHARED + multiple PERSONAL nodes
- remote worker clone/map/edit/commit/push/PR/checkpoint
- revocation
- outage/degraded mode
- real OpenAI descriptor selection/confirmation behavior

### B-S6 — Production Cutover / v1.1.0 Release
Only after all gates:
- exact-head regression
- stop v1.0 for final single-writer migration
- backup/export/reconcile/import/readback
- v1.1 install/start
- live canaries
- restart persistence
- rollback proof
- tag/release/docs

Production migration remains single-cutover, not dual-master.

## 19. Quality questions the next session must keep asking

For every design/implementation unit ask:

1. Does this preserve Personal-grade freedom on approved personal nodes?
2. Does it enable real team/remote collaboration rather than adding artificial local-only constraints?
3. Is host authority derived locally and from approved node/project policy rather than from cloud context rows?
4. Is the operation represented by the most focused semantic tool available?
5. Are name/description/schema/annotations truthful enough that an LLM can select it without ambiguity?
6. Are destructive/open-world effects explicitly represented rather than hidden?
7. Could this capability be reused from Personal instead of rebuilt?
8. If reused, were Personal tests/evidence reused too?
9. Is TEAM broad by default while secrets/credentials remain rejected?
10. Does PRIVATE remain an exception rather than becoming the product default?
11. Does PERSONAL_NODE ownership prevent accidental remote host execution by another member?
12. Does SHARED_NODE generic host power remain explicit and honest?
13. Does degraded cloud behavior preserve valid local work only while a bounded authorization lease remains valid?
14. Does lease expiry/revocation fail closed?
15. Does Git/GitHub governance remain the integration control point rather than building a second policy engine?
16. Is B-S0/B-S5 live ChatGPT evidence being used instead of assuming tool-selection/safety behavior?
17. Is any new complexity actually required by a user goal, or is it overdesign?

## 20. Hard invariants

- Business v1.0 production stays frozen until accepted final cutover.
- Personal/P8 references stay read-only unless explicitly authorized.
- No secret/service-role key in runtime code, chat, logs, or Git.
- Refresh-token/secret custody follows validated secure-storage patterns.
- No SQLite/cloud dual-master after cutover.
- No silent offline continuity write queue/replay unless separately designed and accepted.
- CAS/idempotency/immutable completion remain required.
- Continuity is context, never host authority.
- Cloud project rows never choose arbitrary local paths.
- Tool count is never a design constraint.
- Safety metadata must reflect real behavior.
- The platform safety layer is not to be bypassed.

## 21. Immediate next-session stopping condition

Do not claim B-S0 complete until live ChatGPT evidence proves:

`OPENAI_TOOL_ANNOTATION_SCAN=PASS`

`TOOL_SELECTION_GOLDEN_SET=PASS`

`OAUTH_MEMBER_IDENTITY_PATH=PASS`

`BUSINESS_V11_S0_ACCEPTED=PASS`

If any one is not PASS, keep PR #6 Draft and keep B-S1 blocked.
