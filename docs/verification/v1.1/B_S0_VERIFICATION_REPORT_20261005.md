# ChatAgent Business v1.1 — B-S0 Verification Report

> Phase: B-S0 — Accepted Design / Platform Capability
> Date: 2026-10-05 KST
> Design: R5
> Status: **B-S0 ACCEPTED / LIVE CHATGPT CANARY PASS (2026-10-07 KST)**
> Production mutation: **NONE**

## 1. Executive result

B-S0 local architecture, reuse, descriptor, authority and contract probes pass. The live ChatGPT Business canary is now complete: tool annotation/discovery scan PASS, OAuth member identity PASS, and the 28-case golden tool-selection set PASS. B-S0 is accepted/closed; production v1.0 remains unchanged.

No Business v1.0 production runtime, app, tunnel, release tag, Personal runtime, Personal Supabase project, or P8 reference was modified.

## 2. Frozen baseline evidence

- Business main baseline before B-S0 branch: `0f03ee039a0ff7926377f86b140cc8bf7c9792ed`.
- v1.0.0 release tag remains `d6373f8ffef4b3739134f4d14cc300918417553e`.
- production status reports `PRODUCTION_ACTIVE_V1.0.0`.
- Status: RUNNING / healthy.
- Doctor: all required checks PASS; tunnel check HTTP 200.
- tunnel: `health=live`, `ready=ready`.
- production continuity inventory only: PROJECT 1 / TASK 1 / CHECKPOINT 1 / event sequence 3.

## 3. Personal donor freeze

Personal donor is frozen at tag `v1.1.1`, commit `da391bf9c38697d706049b3b5d7bd2c2ba4ba28e`.

`B_S0_PERSONAL_DONOR_MANIFEST.json` records the reviewed source/test blob identities for:

- DurableHostProcesses and process lifecycle;
- semantic create/replace and native CAS boundaries;
- Supabase auth/session/runtime;
- Keychain token and backup-key custody;
- memory input/sensitive-text contract;
- Supabase memory store and logical backup;
- release-profile OpenAI annotation tests.

The Personal sensitive-text/Supabase store test was executed and passed on the donor code.

## 4. Design/audit findings found during B-S0

B-S0 intentionally found and corrected issues rather than treating the design document as infallible.

1. `process_terminate` violated the fixed `<domain>_<verb>_<object>` rule. Corrected to `process_terminate_job`.
2. remote-worker onboarding had clone but no explicit local project mapping action. Added `runtime_map_project` and `runtime_unmap_project`; `git_clone_repository` now clones only and never implicitly maps.
3. TEAM broad sharing lacked an explicit sensitive-text guard. Personal's validated guard is now mandatory before cloud continuity persistence.
4. logical project ID and node-local path mapping needed an explicit wrong-repository/mismatch boundary. Mapping is now local authority and revisioned/idempotent.
5. cloud-control outage versus node revocation created a potential indefinite authority ambiguity. Added bounded authorization lease semantics; expiry fails closed.
6. SHARED_NODE trusted-root semantics conflicted with unrestricted generic host shell. Generic host power is now disabled by default on SHARED_NODE and requires explicit ADMIN node-level opt-in.
7. candidate OAuth metadata incorrectly used custom scopes (`business.read/write/execute`). Supabase Auth currently does not support custom OAuth scopes. Replaced with supported identity scopes `openid email profile`; Business authorization stays in RLS/server/local policy.
8. installed MCP SDK registration does not emit OpenAI's top-level tool `securitySchemes`; `_meta.securitySchemes` survives. A minimal `tools/list` descriptor adapter was prototyped and wire-tested successfully while leaving SDK tool-call validation intact.
9. profile `outputSchema` was duplicated in the descriptor fixture rather than stored in the canonical catalog. It is now part of the catalog SSOT.

## 5. Current semantic tool inventory

The candidate inventory currently contains 39 focused tools. **39 is not a target, limit, KPI, or protected number.** It is only the current result of use-case decomposition.

The catalog, machine-readable manifest, Accepted Design inventory, exact descriptions/schemas/annotations and golden-set references are kept in parity by executable tests.

## 6. Local probe results

PASS:

- `BUSINESS_V11_BS0_ARCHITECTURE_PROBE`
- `B_S0_TOOL_CATALOG`
- `B_S0_OPENAI_SECURITY_SCHEME_ADAPTER`
- `B_S0_SUPABASE_CONTRACT`
- `B_S0_TEST_MATRIX`

Descriptor scan:

- exact SDK descriptor serialization: PASS;
- `_meta.securitySchemes`: PASS;
- profile `_meta["openai/profile"]` and output schema: PASS;
- installed SDK native top-level `securitySchemes`: known gap;
- wire-level catalog adapter emitting top-level + mirror: PASS.

## 7. OAuth/member identity decision

Accepted identity path:

`ChatGPT connection -> Supabase Auth OAuth 2.1/OIDC -> validated access token -> Business member -> organization/project/node policy`.

A caller/model-supplied member ID is never authority. OpenAI subject/session/organization metadata may be observability hints only.

Supabase's current OAuth server supports standard identity scopes, not custom Business permission scopes. Tool authorization therefore remains server-side and RLS/local-policy based.

## 8. Multi-node routing decision

Secure MCP Tunnel is transport, not the N-node member router.

Accepted routing architecture:

`Runtime Node -> outbound authenticated relay -> Business Gateway -> authenticated MCP request`.

PERSONAL_NODE accepts host work only for its owner. SHARED_NODE accepts authorized team/project work; generic host power additionally requires node-level ADMIN opt-in.

## 9. Supabase contract freeze

Machine-readable contract: `B_S0_SUPABASE_SCHEMA_RPC_CONTRACT.json`.

Control schema: `private_business_control`.
Continuity schema: `private_business_continuity`.

Continuity references `private_business_control.logical_projects`; it does not create a second logical-project master.

Migration-only `bc_import_snapshot` is temporary and must be retired after cutover.

## 10. Test matrix freeze

Machine-readable matrix: `B_S0_TEST_MATRIX.json`.

The matrix covers B-S0 through B-S6 and explicitly distinguishes:

- Personal reused behavior;
- Business-specific distributed-team behavior;
- OpenAI live selection/auth behavior;
- concurrency/CAS/idempotency;
- migration/backup/degraded mode;
- release and post-publish smoke.

## 11. Safety strategy decision

Primary strategy remains accepted:

- focused semantic tools for common actions;
- truthful annotations;
- `process_start_host` retained only as the power-tool / escape hatch;
- semantic-tool preference tested explicitly.

The Personal safety-compatibility fallback is **armed but not activated**. There is no local evidence yet that the new focused semantic surface requires fallback. A reproducible live ChatGPT safety/confirmation failure is required to trigger it.

## 12. Historical pre-live gates — all closed on 2026-10-07

The following gates required an actual ChatGPT Draft/Developer Mode connection and are now PASS:

- `OPENAI_TOOL_ANNOTATION_SCAN`;
- `TOOL_SELECTION_GOLDEN_SET`;
- `OAUTH_MEMBER_IDENTITY_PATH`;
- `BUSINESS_V11_S0_ACCEPTED`.

## 13. Live-canary prerequisites

A separate non-production validation environment is required:

1. dedicated Business Supabase project; Personal project must not be reused or modified;
2. Supabase OAuth 2.1 + consent flow for test users;
3. dedicated B-S0 OpenAI tunnel separate from the v1.0 production tunnel;
4. Draft/Developer Mode tool scan;
5. linked OAuth account/profile call;
6. full golden prompt set with selected tool, arguments, confirmation/block behavior and result recorded.

## 14. Regression status

On the exact B-S0 branch after the R5/tool-contract validation changes:

- `BUSINESS_V11_BS0_LOCAL_SUITE=PASS count=9`;
- `npm run test:ci` completed with exit 0;
- `PERSONAL_STANDALONE_SUITE=PASS count=34`;
- `BUSINESS_B1_PROJECT_BOUNDARY=PASS`;
- `BUSINESS_B2_SAFE_FILES=PASS`;
- `BUSINESS_B3_SHARED_CONTINUITY=PASS`;
- `BUSINESS_B4_AUDIT_OPS_SAFE_PILOT=PASS`;
- B5/B6 hosted-CI syntax/static gates passed as part of `test:ci`.

These tests do not substitute for the pending live ChatGPT OAuth/tool-selection canary.

## 15. Current phase decision

B-S0 status is:

`BUSINESS_V11_S0_ACCEPTED`.

B-S1 is no longer blocked by B-S0 validation gates. Production v1.0 nevertheless remains the frozen active baseline until a later accepted cutover; acceptance of B-S0 does not authorize a production migration or PR merge by itself.

### Live staging Supabase project created

- project: `chatagent-business-v1.1-bs0`
- ref: `dxofyjarkzizdzumfyul`
- region: `ap-northeast-2`
- status at creation: `ACTIVE_HEALTHY`
- incremental project cost reported by connector: `$0/month`
- Personal project remains untouched.

Public endpoint preflight on 2026-10-05 KST:

- OAuth authorization-server discovery: `404 feature_disabled` (expected before OAuth Server enablement)
- JWKS: one active `ES256` EC signing key; asymmetric signing prerequisite for OIDC is already satisfied

This narrows the remaining external setup to enabling OAuth 2.1 Server / consent UI and creating a dedicated B-S0 OpenAI tunnel/app.

### Staging consent fixture deployment

Supabase Edge Function `bs0-oauth-consent` is deployed and ACTIVE on staging project `dxofyjarkzizdzumfyul`. The function is intentionally public (`verify_jwt=false`) because it is the pre-authentication consent/sign-in surface; authorization decisions are executed only through the browser's authenticated Supabase Auth session using the OAuth SDK. No secret/service-role key is embedded.

Preflight evidence:

- GET body contains staging sign-up/sign-in and approve/deny flow
- security advisor: 0 findings
- performance advisor: 0 findings
- OAuth discovery remains `404 feature_disabled` until Dashboard OAuth Server enablement
- JWKS already exposes an ES256 asymmetric signing key

Dashboard-only prerequisite values are frozen in `B_S0_LIVE_CANARY_RUNBOOK.md`.

## 16. Live canary update — 2026-10-06 KST

The isolated ChatGPT Business-account B-S0 app completed live OAuth and authenticated profile retrieval.

PASS evidence:

- Supabase OAuth Server enabled on dedicated staging project `dxofyjarkzizdzumfyul`;
- DCR enabled and ChatGPT OAuth client registration completed;
- dedicated OpenAI tunnel `chatagent-business-v11-bs0` / `tunnel_6ac4981673e48191b1bea1b2cde679f1` ready;
- ChatGPT app `ChatAgent Business v1.1 B-S0` connected by OAuth in DEVELOPMENT state;
- active non-revoked ChatGPT OAuth consent exists in staging;
- live `member_get_profile` call returned the expected authenticated profile shape;
- deterministic returned profile ID matched the staging OAuth subject derivation exactly;
- `OAUTH_MEMBER_IDENTITY_PATH = PASS`.

Live compatibility observations:

- ChatGPT requested `offline_access` in addition to canonical identity scopes `openid email profile`; this is recorded as client runtime behavior, not a Business authorization scope.
- Supabase Edge Functions do not render browser HTML (`text/html` GET is rewritten to `text/plain`), so the live canary consent UI was moved to an isolated local staging-only host on `localhost:32171`. This does not define the production consent-hosting topology.

Evidence file: `B_S0_LIVE_CANARY_EVIDENCE_20261006.md`.

Remaining live gates:

- `OPENAI_TOOL_ANNOTATION_SCAN`;
- `TOOL_SELECTION_GOLDEN_SET` (28 cases);
- `BUSINESS_V11_S0_ACCEPTED`.

B-S0 is therefore now `LIVE_CANARY_IN_PROGRESS`, not yet accepted/closed.
### Live ChatGPT tool scan — 2026-10-06 KST

The Business-account Developer Mode app successfully refreshed and exposed the complete B-S0 candidate tool surface.

Observed live result:

- total tools: 39
- Read: 16
- Write: 23
- tool names/descriptions: matched canonical candidate inventory
- read/write split: exactly matched canonical `readOnlyHint` annotations
- authenticated `member_get_profile` call: successful through the live OAuth/tunnel path

Combined with the existing local descriptor serialization and wire-level OAuth `securitySchemes` adapter probes, this closes:

`OPENAI_TOOL_ANNOTATION_SCAN = PASS`

Remaining live gate: `TOOL_SELECTION_GOLDEN_SET` (28 cases).


## 16. Live golden-set status — host-process compatibility blocker (2026-10-06 KST)

All 28 live golden cases were attempted. Twenty-seven PASS with zero semantic-selection FAIL. One case remains platform-blocked:

- `test-command` correctly selected `process_start_host`;
- corrected live input used an existing `/opt/homebrew/bin/npm` and valid canonical schema values;
- ChatGPT rejected `executable` with `INVALID_ARGUMENT` at the workspace/action schema-validation layer before the connector was reached;
- the canonical local Business Zod schema accepts the exact corrected payload.

Current gate disposition:

- `OPENAI_TOOL_ANNOTATION_SCAN=PASS`
- `OAUTH_MEMBER_IDENTITY_PATH=PASS`
- `TOOL_SELECTION_GOLDEN_SET=BLOCKED_HOST_PROCESS_COMPATIBILITY`
- `BUSINESS_V11_S0_ACCEPTED=BLOCKED_HOST_PROCESS_COMPATIBILITY`

The safety fallback remains unactivated pending one targeted control using a harmless existing executable. B-S0 must not close and PR #6 must remain Draft until the blocker is resolved and affected live canary coverage is rerun.

### Live finding: OpenAI host-process wire-schema compatibility

The final live golden case exposed a reproducible pre-dispatch ChatGPT host validation defect for `process_start_host.executable`. Existing absolute paths `/opt/homebrew/bin/npm` and `/usr/bin/true` were both rejected against the stored pattern `^\/`, while the exact payload passed the canonical local Zod validator. The connector/backend was never reached.

Official OpenAI documentation confirms that ChatGPT imports tool input schemas during Scan Tools and retains action-definition snapshots that require admin refresh when definitions change. Public OpenAI/Codex reports also document host-side MCP schema projection/staleness failures. The narrow B-S0 remediation therefore keeps the internal absolute-path validation intact and normalizes only the OpenAI-facing wire pattern to the semantically equivalent `^/`.

Post-patch local suite: `BUSINESS_V11_BS0_LOCAL_SUITE=PASS count=9`.

B-S0 remains open pending admin tool refresh/rescan and one live `process_start_host` retest. Personal fallback remains armed, not activated, because the blocked Business input shape already follows the proven Personal host-process structure; changing wholesale to that same structure would not address the observed host-side schema projection issue.

## 19. Fresh-app host schema finding and patternless compatibility patch — 2026-10-06 KST

A newly created ChatGPT Business development app consumed the refreshed `^/` wire pattern, proving the previous `^\\/` frozen-snapshot issue was real but not the complete root cause. The fresh app still rejected a valid `/usr/bin/true` argument during connector schema validation before the MCP server was reached.

The compatibility fix therefore removes only `process_start_host.executable.pattern` from the OpenAI-facing `tools/list` descriptor. The internal Zod/runtime schema is unchanged and continues to enforce an absolute POSIX executable path. This preserves the security boundary while avoiding the ChatGPT Business host-side validation incompatibility.

A staging-only restart configuration drift (`BS0_ORGANIZATION_ID=bs0-test`) also explained the temporary profile-ID change observed in the fresh app. The canonical staging organization ID has been restored to `chatagent-business-v11-bs0`; production remains unchanged.

Current disposition: local suite PASS; 27/28 golden cases PASS; affected host-process case pending one live retest after the patternless wire schema is rescanned/refreshed in ChatGPT.


## 20. Final B-S0 closure — 2026-10-07 KST

Final live evidence closes every B-S0 gate.

- `OPENAI_TOOL_ANNOTATION_SCAN = PASS`
- `OAUTH_MEMBER_IDENTITY_PATH = PASS`
- `TOOL_SELECTION_GOLDEN_SET = PASS`
- `BUSINESS_V11_S0_ACCEPTED = PASS`
- golden selection result: `28/28 PASS`, `0 FAIL`
- safety fallback: armed but **not activated**
- production mutation: **NONE**

The final affected host-process path was validated in a fresh ChatGPT Business development app after removing only the incompatible `process_start_host.executable.pattern` from the OpenAI-facing `tools/list` schema. The authoritative server/runtime Zod schema still requires an absolute POSIX executable path. The final harmless `/usr/bin/true` control reached `process_start_host` and returned `probe=true / noEffect=true`.

The authenticated profile also returned the original deterministic staging identity after restoring `BS0_ORGANIZATION_ID=chatagent-business-v11-bs0`, confirming the temporary profile-ID drift was a staging restart configuration error rather than an OAuth identity failure.

Draft PR #6 remains Draft and unmerged pending an explicit source-review/commit/push/PR-readiness decision. B-S1 may be planned after this closure evidence is committed, but Business v1.0 production remains the active frozen baseline.
