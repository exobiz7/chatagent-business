# ChatAgent Business v1.1 — B-S0 Verification Report

> Phase: B-S0 — Accepted Design / Platform Capability
> Date: 2026-10-05 KST
> Design: R5
> Status: **LOCAL VALIDATION PASS / LIVE CHATGPT CANARY PENDING**
> Production mutation: **NONE**

## 1. Executive result

B-S0 local architecture, reuse, descriptor, authority and contract probes pass. B-S0 is not closed yet because three items require an actual ChatGPT Draft/Developer Mode OAuth connection: tool scan, OAuth profile linking, and live golden tool-selection/confirmation behavior.

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

## 12. Gates still pending

The following cannot be honestly marked PASS without an actual ChatGPT Draft/Developer Mode connection:

- `OPENAI_TOOL_ANNOTATION_SCAN`;
- `TOOL_SELECTION_GOLDEN_SET` live execution;
- `OAUTH_MEMBER_IDENTITY_PATH` live OAuth/profile call;
- therefore `BUSINESS_V11_S0_ACCEPTED`.

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

`LOCAL_VALIDATION_PASS_LIVE_CANARY_PENDING`.

B-S1 implementation must not treat the live canary as implicitly passed. Production v1.0 remains the frozen active baseline until a later accepted cutover.
