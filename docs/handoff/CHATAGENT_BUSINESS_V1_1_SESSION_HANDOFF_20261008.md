# ChatAgent Business v1.1 — Session Handoff

> Captured: 2026-10-08 KST
> Handoff base HEAD: `de7cb4bf7469cf3e2a5d4d777e24c805ee1946f5`
> Branch: `feat/business-v1.1-bs3-runtime-routing`
> Current phase: **B-S3 — IN_PROGRESS**
> Latest accepted bounded unit: **B-S3A — ACCEPTED / CLOSED**
> Next bounded unit: **B-S3B — Durable HOST_USER Process Core**
> Production v1.0 mutation during B-S0..B-S3A: **NONE**

---

## 0. Authority and takeover rule

This handoff is a continuity aid, not a higher authority than the repository.

At the start of the next session use this precedence:

1. **actual current repo / current branch / current HEAD / worktree**;
2. latest accepted gate/report artifacts under `docs/verification/v1.1/`;
3. canonical normative design: `docs/approved/CHATAGENT_BUSINESS_V1_1_ACCEPTED_DESIGN_20261005.md`;
4. this handoff/current-state package;
5. prior chat text or pasted historical state.

If the repo has progressed beyond this handoff, do **not** repeat an already accepted phase. Continue from the newest accepted authority.

The Accepted Design remains normative even though its header contains the historical 2026-10-05 B-S0 progress wording. Later gate-state files supersede its progress/status lines; they do not supersede its architecture and safety rules.

---

## 1. Product North Star

Target product: **ChatAgent Business v1.1.0**.

Release-facing naming direction:

- primary: **ChatAgent Business**
- short: **ChatAgent Biz**
- `SMB Edition` is legacy/internal wording, not the preferred final user-facing name.

Accepted product definition:

> **Personal-grade work freedom + Shared team memory + Distributed runtime + Existing organizational governance**

Short operating principle:

> Work freely on approved nodes. Share context broadly by default. Respect the logged-in OS user's real authority. Govern shared integration points. Expose risky effects semantically and truthfully.

v1.1 is deliberately not an enterprise IAM/fleet-management project and not a restricted clone of Personal.

---

## 2. Canonical repo / frozen production baseline

Canonical repo:

```text
GitHub: exobiz7/chatagent-business
Local:  /Volumes/SSD 4T/z_proj/proj04_chatagent/chatagent_business
```

Frozen production baseline:

```text
release             v1.0.0
status              PRODUCTION_ACTIVE_V1.0.0
release commit      d6373f8ffef4b3739134f4d14cc300918417553e
production MCP      127.0.0.1:31850
```

Production v1.0 must remain untouched until an explicitly accepted B-S6 cutover.

Never use broad destructive cleanup such as:

```text
git reset --hard
git clean -fdx
git add .
git add -A
```

Use evidence-first diagnosis, exact-path staging, small reversible units, and explicit pre/postconditions.

---

## 3. Actual Git state at handoff capture

Verified directly on Mac Studio:

```text
branch       feat/business-v1.1-bs3-runtime-routing
local HEAD   de7cb4bf7469cf3e2a5d4d777e24c805ee1946f5
remote HEAD  de7cb4bf7469cf3e2a5d4d777e24c805ee1946f5
worktree     CLEAN
```

Latest key closure commits:

```text
B-S0  2975be54502a89dd92949c57521bacb071d49bac  docs: record B-S0 PR acceptance state
B-S1  63de5e25a6af5b2b4ea8846ef166e104cb305d0d  test: close Business v1.1 B-S1 runtime gates
B-S2  1230f2bde8cb3257901c0c01b9827056b93d8c4c  test: close Business v1.1 B-S2 continuity gates
B-S3A de7cb4bf7469cf3e2a5d4d777e24c805ee1946f5 test: close Business v1.1 B-S3A routing gates
```

This handoff package may be committed on top of the B-S3A closure HEAD. Therefore the next session must always run `git rev-parse HEAD` rather than assuming the capture HEAD is still the branch tip.

---

## 4. PR topology — do not flatten or merge implicitly

Verified with GitHub CLI at capture:

```text
PR #6  OPEN / Ready / MERGEABLE
       feat/business-v1.1-bs0-validation -> main
       head 2975be54502a89dd92949c57521bacb071d49bac

PR #7  OPEN / Draft / MERGEABLE
       feat/business-v1.1-bs1-cloud-foundation -> B-S0 branch
       head 63de5e25a6af5b2b4ea8846ef166e104cb305d0d

PR #8  OPEN / Draft / MERGEABLE
       feat/business-v1.1-bs2-continuity-foundation -> B-S1 branch
       head 1230f2bde8cb3257901c0c01b9827056b93d8c4c

PR #9  OPEN / Draft / MERGEABLE
       feat/business-v1.1-bs3-runtime-routing -> B-S2 branch
       head de7cb4bf7469cf3e2a5d4d777e24c805ee1946f5
```

Rules:

- **Do not merge PR #6/#7/#8/#9 without separate explicit user authorization.**
- Do not mark PR #7/#8/#9 Ready without explicit authorization.
- B-S3 work continues on the B-S3 branch/PR unless the actual repo shows a newer accepted branch strategy.

---

## 5. Current phase status

```text
B-S0  Platform / Tool / OAuth / Safety validation       ACCEPTED / CLOSED
B-S1  Cloud Foundation / Identity / Runtime Nodes       ACCEPTED / CLOSED
B-S2  TEAM Shared Continuity                            ACCEPTED / CLOSED
B-S3A Distributed Runtime Routing / Mapping Authority   ACCEPTED / CLOSED
B-S3B Durable HOST_USER Process Core                    NEXT
B-S3  Distributed Runtime / Semantic Effects            IN_PROGRESS
B-S4  Migration / Backup / Ops Integration              PENDING
B-S5  Real Multi-Node / Safety / Failure E2E            PENDING
B-S6  Production Cutover / v1.1.0 Release               PENDING
```

Do not reopen a closed B-S0/B-S1/B-S2/B-S3A finding without **new evidence**.

---

## 6. Non-negotiable architecture invariants

### 6.1 Effective authority is an intersection

```text
Effective Authority
= Organization/Project Policy
∩ Member/Node Trust
∩ Local Node Policy
∩ Logged-in OS User Permission
∩ External System Policy
```

Cloud metadata never manufactures host authority.

### 6.2 Collaboration

```text
TEAM     default; broad shared task/history/search/context
PRIVATE  explicit sensitivity exception
```

Continuity is context only. It never grants filesystem/process/Git authority.

### 6.3 Runtime nodes

```text
PENDING -> APPROVED -> REVOKED
```

`PERSONAL_NODE`:

- exactly one owning member;
- HOST_USER is first-class;
- other members must never route host execution to it.

`SHARED_NODE`:

- semantic root-bounded work may be allowed by policy;
- generic `process_start_host` is denied unless ADMIN explicitly enabled shared host power for a trusted/dedicated team OS account;
- **cwd is never a security sandbox by itself**.

### 6.4 OAuth / identity

- Supabase Auth OAuth 2.1/OIDC is the identity path.
- Requested identity scopes: `openid email profile`.
- No invented Business OAuth scopes such as `business.execute`.
- Caller-supplied member/user IDs are never authority.
- Runtime authorization is organization/member/project/node/local policy, not scope strings.
- Runtime `service_role` is forbidden.
- refresh token: Keychain; access token: process memory; publishable config only.

### 6.5 Public tool design

- use `<domain>_<verb>_<object>` naming;
- tool count is use-case-driven, never a target metric;
- focused semantic tools are preferred over generic host exec;
- annotations must reflect real effects;
- `process_start_host` remains `destructiveHint=true`, `openWorldHint=true` power tool;
- if platform safety blocks an otherwise truthful bounded semantic design, use the documented Personal-structure fallback; do not weaken annotations or disguise effects.

### 6.6 Audit split

Cloud continuity event chain and local effect audit are intentionally separate.

```text
cloud event chain = continuity mutations/revision/idempotency/hash
local effect audit = file/Git/process effect metadata
```

Do not log arbitrary file content, command output, tokens or credential material in audit.

---

## 7. B-S0 — accepted facts that must not regress

Canonical gates are PASS, including:

```text
OPENAI_TOOL_ANNOTATION_SCAN
OAUTH_MEMBER_IDENTITY_PATH
TOOL_SELECTION_GOLDEN_SET (28/28)
BUSINESS_V11_S0_ACCEPTED
```

Important live compatibility lesson:

- ChatGPT pre-dispatch rejected valid absolute `process_start_host.executable` values while the OpenAI-facing JSON Schema carried a regex `pattern`.
- Accepted fix: remove only that wire-schema `pattern` for `process_start_host.executable`.
- Keep the authoritative server/Zod absolute-path validation.
- Do not lower the destructive/open-world annotations.

Safety Compatibility Fallback remains armed but has **not** been activated.

Candidate MCP inventory currently includes 39 focused tools; the count is not normative.

---

## 8. B-S1 — accepted cloud / identity / runtime foundation

Canonical control schema:

```text
private_business_control
```

Frozen control tables:

```text
schema_meta
organizations
organization_members
control_state
runtime_nodes
runtime_sessions
logical_projects
private_project_members
operations
```

Minimal roles:

```text
ADMIN / PM / MEMBER
```

Runtime lifecycle and types:

```text
PENDING / APPROVED / REVOKED
PERSONAL_NODE / SHARED_NODE
```

Key accepted properties:

- identity derives from `auth.uid()` + ACTIVE organization membership;
- no caller-supplied member identity authority;
- private tables have no direct client grants;
- RLS deny-by-default design is intentional;
- runtime RPCs: `bc_runtime_enroll/status/list/revoke`;
- `bc_runtime_enroll` carries both enrollment and exact-node ADMIN approval leg; no extra public approve RPC was invented;
- PERSONAL_NODE owner derives from authenticated enrolling member;
- SHARED_NODE enrollment/approval is ADMIN-controlled;
- runtime sessions are bounded leases;
- revoke invalidates associated runtime sessions;
- cached local authorization is allowed only while the previously validated token/lease remains unexpired.

Current frozen donor for auth/keychain/session patterns is Personal v1.1.1.

---

## 9. B-S2 — accepted TEAM Shared Continuity

Canonical continuity schema:

```text
private_business_continuity
```

Exactly six tables:

```text
schema_meta
continuity_state
tasks
checkpoints
operations
events
```

The project master remains `private_business_control.logical_projects`; do not create a second project master.

Accepted continuity properties:

- TEAM broad access / PRIVATE explicit-member isolation;
- task revision CAS;
- operation UUID idempotency;
- same op + same input => prior receipt;
- same op + changed input => `BUSINESS_IDEMPOTENCY_CONFLICT`;
- same revision + two writers => exactly one commit and one revision conflict;
- completion immutability;
- PostgreSQL FTS, not vector DB/embeddings/RAG;
- sensitive-text guard before cloud persistence;
- deterministic `contextDigest`;
- `FRESH / STALE / UNVERIFIED`;
- handoff target about 8 KiB, hard cap 24 KiB;
- `bc_export_snapshot` project-scoped/authenticated;
- runtime `bc_import_snapshot` is **not exposed**; migration-only import remains B-S4 work.

Public project identity lesson:

- MCP `projectId` is a logical project key such as `bs2a-team-staging`.
- internal UUID core RPCs remain internal only;
- authenticated public continuity RPC surface uses project-key adapters.
- never make caller-supplied internal project UUID authoritative.

Live OAuth freshness proof is closed:

```text
FRESH at revision 1
-> one controlled OAuth checkpoint
-> revision 2 / context sequence advanced
-> old digest read returns STALE / TASK_STATE_CHANGED
```

Important bug/lesson:

- user-facing `bc_member_profile()` intentionally does not carry organization authority metadata;
- B-S2C originally tried to read `organizationSlug` from it and returned `BUSINESS_CONTINUITY_CONFIG_INVALID`;
- accepted fix: organization identity for handoff comes from authenticated `bc_schema_status()` while the profile contract stays narrow.

Do not impersonate OAuth identity through direct SQL for live authorization proofs. Use the actual OAuth path, and if a mutation canary is needed, scope it to one exact project/task/revision/operation and close the gate immediately afterward.

---

## 10. B-S3A — accepted distributed routing / local mapping authority

B-S3A is **ACCEPTED / CLOSED**.

Implemented:

- owner-private local workspace-root registry;
- `runtime_map_project` / `runtime_unmap_project` real local effects;
- authenticated project authorization before local mapping;
- caller-eligible node authorization before mapping;
- node-local logical-project → host-path authority;
- operation UUID idempotency;
- monotonic mapping revision (prevents ABA reuse);
- exact-revision unmap;
- traversal/symlink/broad-root/state-root-overlap denial;
- optional exact Git `origin` verification;
- 0/1/2+ eligible-node routing;
- PERSONAL_NODE owner isolation;
- SHARED_NODE host-power boundary;
- bounded cached authorization lease;
- public mapping/route receipts omit canonical absolute host paths.

Routing rule:

```text
0 eligible mapped nodes  -> BUSINESS_RUNTIME_NODE_UNAVAILABLE
1 eligible mapped node   -> implicit sole-node selection allowed
2+ eligible mapped nodes -> BUSINESS_RUNTIME_NODE_REQUIRED
```

Live OAuth map/discover/unmap canary passed:

```text
initial mappings 0
-> map TEAM staging project to approved workspace root
-> mappingRevision 1
-> discovery shows mapped project, no absolute host path
-> exact-revision unmap
-> final mappings 0
```

Repository branch/HEAD/status/working diff/staged diff were unchanged across the live mapping canary.

Low-frequency mapping idempotency receipts are deliberately **not auto-pruned**; an old operation UUID must never later become eligible for blind re-execution.

---

## 11. Current staging/runtime state at capture

Verified listeners:

```text
production v1.0 MCP   127.0.0.1:31850   PID may change; listener active
B-S3A staging MCP     127.0.0.1:31861   active
staging tunnel health 127.0.0.1:51961   active
```

B-S3A health endpoint is:

```text
GET http://127.0.0.1:31861/healthz
```

Do **not** use `/health`; that route returns 404 on the B-S3A fixture.

Health at capture:

```text
status          live
mappingCount    0
workspace root  proj04 / "proj04 workspace"
DB-backed reads member_get_profile, runtime_list_nodes,
                continuity_get_context, continuity_prepare_handoff,
                continuity_search_history
DB-backed local mutations runtime_map_project, runtime_unmap_project
```

Owner-private staging files:

```text
/Users/macstudio/Library/Application Support/chatagent/business-v11-bs3a/public-runtime-config.json
/Users/macstudio/Library/Application Support/chatagent/business-v11-bs3a/workspace-mappings.json
```

Both were verified owner-only `0600` at capture.

**Do not print or copy the publishable key value into chat/evidence.** The file contains publishable-only configuration; service-role/refresh/access tokens must never be introduced there.

Staging fixture process command uses the explicitly pinned Node runtime:

```text
/Users/macstudio/.nvm/versions/node/v24.21.0/bin/node scripts/business/v1.1/bs3a-live-fixture-server.mjs
```

---

## 12. Node/toolchain authority — important lesson

`package.json` requires Node `>=24.15.0 <25`.

The accepted regression authority is:

```text
/Users/macstudio/.nvm/versions/node/v24.21.0/bin/node
/Users/macstudio/.nvm/versions/node/v24.21.0/bin/npm
```

During this session the shell's default `node` changed between unrelated installations/contexts (v26 was observed once; v24.13.1 was later observed). Therefore:

> **Never use an unpinned default `node` as release/gate evidence.**

For authoritative tests use:

```text
export PATH=/Users/macstudio/.nvm/versions/node/v24.21.0/bin:$PATH
node -v   # must print v24.21.0
```

Then run the relevant suite.

---

## 13. Hosted CI infrastructure note

The code-bearing B-S3A head `2d7a9e83d045ba83766ea105d2116f77b80d75f9` passed hosted macOS CI for both push and PR runs.

The docs-only B-S3A closure head `de7cb4bf...` had GitHub Actions failures that occurred **before runner allocation**. Two attempts showed:

```text
steps       []
runner_id   0
runner_name empty
duration    about 5 seconds
```

No test step ran. This was recorded as hosted macOS runner provisioning failure, not a product/test failure.

Do not erase this distinction. If a later run obtains a runner and fails a real step, treat that as new evidence and diagnose normally.

---

## 14. Known pre-release security/dependency item

Current direct versions verified at capture:

```text
@modelcontextprotocol/sdk 1.30.0
@supabase/supabase-js     2.117.2
```

There is a known HIGH advisory tracked for MCP SDK 1.30.0 (`GHSA-6qxp-vccf-f47h`, affected range previously observed `<1.31.0`). A fix exists in newer SDK versions.

Do **not** silently upgrade it during B-S3B. B-S0 descriptor/OAuth behavior was explicitly validated on 1.30.0. Treat the SDK upgrade as a separate bounded compatibility/security unit requiring descriptor, OAuth, golden-selection and live safety regression.

Supabase leaked-password protection was also a pre-release Auth-hardening item if supported by project plan/config.

---

## 15. Personal donor — exact provenance for B-S3B

Canonical manifest:

```text
docs/verification/v1.1/B_S0_PERSONAL_DONOR_MANIFEST.json
```

Frozen donor:

```text
ChatAgent Personal v1.1.1
commit da391bf9c38697d706049b3b5d7bd2c2ba4ba28e
```

Important frozen blobs:

```text
scripts/l1/durable-host-processes.mjs
27a872de687df1f43fd1ab0c4783ac11a181ba94

scripts/l1/broker-server.mjs
5ee4d6078207031c3b84bc7e238d5c8e3b27d331
```

Policy:

> Personal is a read-only source donor and behavioral baseline. Business must not depend on the Personal repository at runtime.

Reuse means copy/adapt reviewed source and tests into Business with provenance.

---

## 16. B-S3B — exact next bounded unit

### 16.1 Goal

Implement the **durable HOST_USER process core** by reusing the frozen Personal durable process engine first, then bind it to the accepted Business authority/routing model.

Public tools in scope:

```text
process_start_host
process_get_status
process_read_output
process_terminate_job
```

Keep out of B-S3B unless strictly required for the process core:

```text
semantic filesystem effects
semantic Git/GitHub effects
Business local effect audit
production relay transport
final B-S3 OpenAI safety matrix
B-S4 migration/backup
```

`process_start_isolated` should remain the existing isolated backend and is a later B-S3 regression concern unless a shared process-record abstraction requires a thin compatibility seam now.

### 16.2 Reuse boundary

Reuse from Personal:

- durable process UUID/identity;
- idempotency reservation/fingerprint semantics;
- runner PID + start-token reconciliation;
- fail-closed crash recovery;
- bounded concurrency;
- bounded output retention/read;
- timeout;
- owned supervisor termination;
- terminal-state reconciliation.

Do **not** reuse Personal's `FULL_HOST` pairing/grant model as Business authorization.

Business authority must be:

```text
validated OAuth member
-> authorized logical project
-> B-S3A project-to-node mapping / route
-> B-S1 node lifecycle + ownership + bounded lease
-> local node policy
-> logged-in macOS user authority
-> durable process core
```

### 16.3 Process ownership / route record requirement

The public read/terminate tools accept only `processId`.

Therefore Business must retain an owner-private process record that is sufficient to resolve and revalidate, at minimum:

```text
processId
member/session ownership identity (opaque, not caller-supplied authority)
projectId
runtimeNodeId
mapping revision or equivalent route-binding evidence
execution mode
idempotency fingerprint/key linkage
started/updated state needed for routing/recovery
```

The exact schema is an implementation choice, but these properties are mandatory:

- status/read/terminate never accept arbitrary host PID as authority;
- processId is resolved to the original node/server-owned process record;
- another member cannot use a guessed processId to inspect/terminate a PERSONAL_NODE process;
- termination signals only a verified owned durable supervisor/runner;
- route/node revocation behavior is explicit and tested.

### 16.4 Public contract gaps that must be resolved deliberately

Do not code around these silently:

1. **`process_read_output.maxBytes`**: public schema currently allows up to 524288 bytes, while the frozen Personal donor's single durable read is bounded to 16384 bytes. Decide and test a thin Business adapter (for example bounded composition/paging) or deliberately re-baseline the public schema. Do not silently widen the donor core.

2. **`process_read_output.waitMs`**: public schema has bounded wait support, while the donor read method is immediate. Implement a bounded poll/wait adapter or re-baseline the schema with evidence; do not pretend wait semantics exist.

3. **`cwd` semantics / host-path privacy**: the Personal donor requires an absolute cwd. B-S3A deliberately does not expose canonical host paths. The Business adapter must define how normal mapped-project execution chooses/resolves cwd without leaking a host path, while still truthfully preserving broad HOST_USER authority. `cwd` alone must never be treated as a SHARED_NODE sandbox.

4. **Generic power-tool authority**: PERSONAL_NODE owner may use the logged-in user's ordinary host authority. SHARED_NODE generic host exec remains denied unless explicit shared host-power is enabled. Do not accidentally make root-bounded semantic policy equivalent to generic host-process confinement.

5. **Process status after restart**: prove the process record + durable runner can reconcile through fixture/server restart without blind re-execution or arbitrary PID trust.

Any public descriptor/schema change requires B-S0 descriptor/tool-selection regression and may require a fresh ChatGPT app/tool refresh. Prefer a thin adapter when it truthfully satisfies the accepted contract.

---

## 17. Mandatory B-S3B verification questions

Before declaring B-S3B PASS, answer with evidence:

1. Do the Personal donor commit/blob hashes still match the frozen manifest?
2. Was the proven durable core reused before Business wrappers were added, rather than reimplemented independently?
3. Does `process_start_host` validate OAuth member/project/node route before any local process effect?
4. Does a PERSONAL_NODE reject a non-owner even if the caller knows node/project/process identifiers?
5. Does a SHARED_NODE deny generic host exec unless `sharedHostPowerEnabled` is explicitly true?
6. Does control-plane outage permit only an unexpired previously validated lease and fail closed after expiry?
7. Does same idempotency key + same input return/reconcile the same prior process instead of starting another one?
8. Does same idempotency key + changed input fail with an idempotency conflict?
9. Is the crash window between reservation, runner launch and PID/start-token binding fail-closed?
10. Can an unknown/stale/reused PID ever be signaled? Expected answer: **no**.
11. Are status/read/terminate authorized from the server-owned process binding, not caller-supplied node/member/PID metadata?
12. Are retained output, per-read output, argv, timeout and concurrency bounded?
13. Is output treated as data and excluded from audit/credential logs?
14. Is `cwd` resolution truthful and compatible with B-S3A host-path privacy?
15. Are `maxBytes` and `waitMs` semantics aligned between the public schema and the durable core?
16. Does restart reconciliation preserve owned process state without blind replay?
17. Does termination affect exactly the owned durable job and return bounded terminal/pending state?
18. Does the implementation preserve `process_start_host` destructive/open-world annotations?
19. Does an ordinary operation already covered by a semantic filesystem/Git tool remain preferred semantically rather than routed through host exec?
20. Does production v1.0 remain completely unchanged?

---

## 18. Recommended B-S3B implementation sequence

Use small gates, not one large HOST_USER implementation:

### B-S3B-1 — donor parity / local durable core

- re-hash donor sources;
- port/reuse relevant Personal tests first;
- validate process lifecycle/idempotency/recovery locally under Node v24.21.0;
- no OAuth/staging effect yet.

### B-S3B-2 — Business authority + process registry adapter

- bind start to `resolveBusinessRuntimeRoute` / B-S1 lease authority;
- add owner-private Business process-to-node/member/project binding;
- implement processId-only status/read/terminate routing;
- resolve `cwd`, `maxBytes`, `waitMs` contract gaps;
- add PERSONAL_NODE/SHARED_NODE/outage/revocation tests.

### B-S3B-3 — isolated staging OAuth canary

Use a benign bounded fixture first, for example a process that emits known small output and exits or a controlled long-running process that can be terminated.

Canary should prove:

```text
map project if needed
-> process_start_host through real OAuth
-> process_get_status
-> process_read_output
-> process_terminate_job when applicable
-> restart/reconciliation canary if required
-> cleanup/unmap
-> verify repo/worktree unchanged
```

If a temporary live-effect gate is used, constrain it by exact project/node/executable/idempotency fixture and close it immediately after proof.

Do not use a destructive real-world command as the first live HOST_USER canary.

---

## 19. B-S3 phase gate after B-S3B

B-S3B will not close all of B-S3.

Full B-S3 gate remains:

```text
BUSINESS_S3_HOST_USER=PASS
BUSINESS_S3_PERSONAL_NODE_ISOLATION=PASS
BUSINESS_S3_SHARED_NODE_ROOT_POLICY=PASS
BUSINESS_S3_SEMANTIC_FILE_EFFECTS=PASS
BUSINESS_S3_GIT_SEMANTICS=PASS
BUSINESS_S3_GENERIC_EXEC=PASS
BUSINESS_S3_ISOLATED_REGRESSION=PASS
BUSINESS_S3_OPENAI_SAFETY_CANARY=PASS
```

Likely later bounded units should cover:

- semantic filesystem move/delete and existing Personal file primitives;
- focused Git/GitHub semantics;
- Business local effect audit;
- isolated backend regression;
- full OpenAI safety/tool-selection canary and fallback decision.

Do not prematurely mark B-S3 accepted after B-S3B alone.

---

## 20. Safety / secret hygiene

Never reveal or persist in repo/evidence:

- OAuth access token;
- OAuth refresh token;
- bearer token;
- Supabase service-role key;
- production runtime API key;
- Keychain values;
- private-key material;
- publishable key value unless operationally necessary (and never gratuitously in chat/evidence);
- staging email/Auth UUID/live node UUID unless a bounded live step genuinely requires it.

The staging publishable config is owner-private and must not be committed.

Use synthetic credentials in tests.

Sensitive-text guard applies before TEAM **and PRIVATE** cloud continuity persistence.

---

## 21. Concurrency / parallel-agent hygiene

Earlier phases observed overlapping work from another process/agent.

Rules:

- inspect unknown changes before touching them;
- never broad-reset/clean;
- check current HEAD immediately before commit;
- exact-path stage only intended files;
- run `git diff --cached --check`;
- run a sensitive literal scan on staged changes;
- if another agent already committed intended work, inspect and accept/reconcile rather than overwriting it.

---

## 22. Must-read source-of-truth order in the next session

Read directly from the repo, in this order:

1. `docs/handoff/LATEST_SESSION_HANDOFF.txt`
2. `docs/handoff/CHATAGENT_BUSINESS_V1_1_CURRENT_STATE_20261008.json`
3. `docs/handoff/CHATAGENT_BUSINESS_V1_1_SESSION_HANDOFF_20261008.md`
4. `docs/approved/CHATAGENT_BUSINESS_V1_1_ACCEPTED_DESIGN_20261005.md`
   - especially §§2–18, 24–30, 34–38
5. `docs/verification/v1.1/B_S3_GATE_STATE_20261008.json`
6. `docs/verification/v1.1/B_S3A_RUNTIME_ROUTING_FOUNDATION_REPORT_20261008.md`
7. `docs/verification/v1.1/B_S2_GATE_STATE_20261008.json`
8. `docs/verification/v1.1/B_S1_GATE_STATE_20261007.json`
9. `docs/verification/v1.1/B_S0_GATE_STATE_20261005.json`
10. `docs/verification/v1.1/B_S0_PERSONAL_DONOR_MANIFEST.json`
11. `docs/verification/v1.1/B_S0_SUPABASE_SCHEMA_RPC_CONTRACT.json`
12. `scripts/business/v1.1/bs0-tool-catalog.mjs`
13. `scripts/business/v1.1/runtime/business-runtime-router.mjs`
14. `scripts/business/v1.1/runtime/business-runtime-mapping-service.mjs`
15. `scripts/business/v1.1/runtime/local-workspace-registry.mjs`
16. `scripts/business/v1.1/control/runtime-authorization-lease.mjs`
17. `scripts/l1/durable-host-processes.mjs`
18. `scripts/l1/durable-process-runner.mjs`
19. `scripts/l1/broker-core.mjs`
20. `scripts/l1/broker-server.mjs`
21. relevant Personal durable-process tests under `scripts/l1/`
22. `package.json`

Do not rely only on this handoff's summaries of those files; inspect the current content.

---

## 23. Mandatory takeover preflight

Before modifying code in the next session:

```text
1. verify current branch/HEAD/remote/worktree;
2. verify whether a newer B-S3 gate/report exists;
3. verify PR #6/#7/#8/#9 current states;
4. verify production 31850 still listening and untouched;
5. verify staging 31861 + 51961 state;
6. call GET /healthz, not /health, for the B-S3A fixture;
7. verify mappingCount remains 0 unless newer accepted work says otherwise;
8. pin Node v24.21.0 explicitly;
9. re-hash Personal donor files before reuse;
10. report any mismatch before coding.
```

If all match, begin **B-S3B-1 donor parity / durable core**. Do not redo B-S3A.

---

## 24. Final continuity statement

The project has moved beyond planning-only v1.1 work. B-S0, B-S1, B-S2 and B-S3A are evidence-backed accepted baselines.

The immediate objective is no longer to redesign Business broadly. It is to extend the accepted system one bounded capability at a time while preserving:

- Personal-proven behavior where overlap exists;
- Business-specific member/node/team authority;
- real OS/external-system authority;
- truthful OpenAI safety metadata;
- deterministic validation and live OAuth evidence;
- frozen production v1.0 until the final cutover.

The next session should start from **B-S3B**, not from B-S0/B-S1/B-S2/B-S3A feature development.
