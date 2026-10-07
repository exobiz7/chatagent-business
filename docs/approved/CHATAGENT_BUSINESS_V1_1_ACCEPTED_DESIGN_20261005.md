# ChatAgent Business v1.1 — Accepted Design

> Product: **ChatAgent Business — SMB Edition**
> Target release: **v1.1.0**
> Design status: **ACCEPTED DESIGN — R5 B-S0 LOCALLY VALIDATED / LIVE CANARY PENDING**
> Design revision: **R5 — B-S0 local validation, focused project mapping, OAuth metadata adapter, Supabase contract freeze**
> Date: **2026-10-05 KST**
> Baseline production: **v1.0.0 / PRODUCTION_ACTIVE_V1.0.0**
> Baseline release tag: `v1.0.0`
> Baseline release commit: `d6373f8ffef4b3739134f4d14cc300918417553e`
> Canonical repo: `exobiz7/chatagent-business` / `/Volumes/SSD 4T/z_proj/proj04_chatagent/chatagent_business`

---

## 1. Purpose

This document is the canonical accepted design for ChatAgent Business v1.1.0.

It supersedes conflicting planning assumptions in the earlier v1.1 Supabase Continuity handoff/roadmap, especially assumptions that v1.1 must preserve:

- exactly 17 MCP tools;
- exactly five continuity tools;
- one organization = one local runtime;
- Docker-only STANDARD execution;
- network-off STANDARD execution;
- no continuity search;
- no Git mutation;
- no general project-local delete/rename.

Those earlier documents remain useful historical/reference material for Supabase transaction, migration, backup, and recovery design, but this Accepted Design controls when they conflict.

Business v1.0.0 production remains frozen until the final v1.1 cutover gate.

---

## 2. Product North Star

ChatAgent Business v1.1 is not a more restricted version of ChatAgent Personal.

It is defined as:

> **Personal-grade work freedom + Shared team memory + Distributed runtime + Existing organizational governance**

Short form:

> **Work freely on approved nodes. Share context broadly by default. Respect the user's OS authority. Govern shared integration points. Expose risky effects semantically and truthfully.**

The product should enable an agile startup/SMB team to work from office Macs, company laptops, approved personal devices, home offices, and remote locations without unnecessary enterprise-style friction.

Security is provided primarily by explicit trust boundaries, truthful tool semantics, identity/node approval, operating-system authority, and existing integration governance such as GitHub branch protection, PR review and CI — not by disabling ordinary work.

---

## 3. Accepted top-level decisions

| Area | Accepted v1.1 decision |
| --- | --- |
| Collaboration default | `TEAM` |
| Collaboration exception | `PRIVATE` |
| `TEAM` semantics | Broad history/search/context sharing equivalent to the previously discussed `TEAM_EXTENDED` |
| Project profiles | `READ_ONLY / SAFE / STANDARD` retained for compatibility |
| STANDARD meaning | General approved developer/knowledge-worker capability, not Docker-only |
| Execution modes | `HOST_USER` default where appropriate; `ISOLATED` optional |
| Personal device model | First-class `PERSONAL_NODE` |
| Shared machine model | `SHARED_NODE` |
| Runtime fleet | One organization = N approved runtime nodes |
| Shared context SSOT | Dedicated Business Supabase PostgreSQL |
| Code synchronization | Git/GitHub, not ChatAgent-specific file sync |
| Default development network | Normal host network under `HOST_USER` |
| Generic host exec | Retained as a power-tool / escape hatch |
| Common operations | Exposed through semantic tools with accurate risk annotations |
| Public MCP tool contract | Use-case-driven focused semantic tools; **no minimum or maximum tool-count constraint** |
| Search | `continuity_search_history` added |
| OpenAI safety | Tool annotations/descriptions must match real effects; no attempt to bypass platform safety |
| Safety fallback | If the semantic design still causes platform safety blocking, reuse the already validated Personal tool/annotation structure as the next implementation path |

---

## 4. System architecture

```text
                     ChatGPT Business Workspace
                              |
                    ChatAgent Business App
                              |
                              v
                    Business MCP Gateway
                    Focused semantic MCP surface
                              |
             +----------------+----------------+
             |                                 |
             v                                 v
      Cloud Collaboration                Runtime Routing
             |                                 |
             v                                 v
   Supabase Control + Continuity      Approved Runtime Nodes
                                   +---------+---------+
                                   |                   |
                                   v                   v
                             PERSONAL_NODE        SHARED_NODE
                                   |                   |
                              HOST_USER        HOST_USER / ISOLATED
                                   |                   |
                                   +---------+---------+
                                             |
                                             v
                                  Local files / Git /
                                  build / test / tools
```

Role split:

```text
Supabase
= organization/member/node control metadata + shared organizational working memory

Git/GitHub
= source-code synchronization, branch history, PR/CI/review governance

Runtime node
= actual local files, developer tools, local execution and credentials available to the logged-in OS user

Business Gateway
= ChatGPT ↔ organization context ↔ approved runtime routing

Local node policy
= what that specific device exposes

External platforms
= final integration policy and authorization
```

---

## 5. Authority model

Effective authority is an intersection, not a single cloud permission bit:

```text
Effective Authority
=
Organization/Project Policy
∩ Member/Node Trust
∩ Local Node Policy
∩ Logged-in OS User Permission
∩ External System Policy
```

Examples of external system policy include:

- GitHub repository permission;
- protected branch rules;
- required PR/review;
- CI checks;
- cloud IAM;
- package registry permissions;
- API/service permissions.

ChatAgent Business must not claim or manufacture authority that the OS user or external system does not already possess.

---

## 6. Minimal organization roles

v1.1 uses only the minimum role model needed for SMB distributed collaboration:

| Role | Responsibility |
| --- | --- |
| `ADMIN` | Organization bootstrap, node approval/revocation, top-level policy |
| `PM` | Project creation/configuration, ordinary project collaboration policy |
| `MEMBER` | Work on approved projects and owned/allowed runtime nodes |

Explicitly out of scope for v1.1:

- SCIM;
- enterprise directory hierarchy;
- complex role inheritance;
- dozens of permission bits;
- department-level ABAC;
- field-level ACL policy engines.

---

## 7. Runtime node model

Every runtime node has a lifecycle:

```text
PENDING -> APPROVED -> REVOKED
```

### 7.1 PERSONAL_NODE

A user's dedicated Mac or approved personal/company laptop.

Default properties:

```text
ownerMemberId = exactly one member
execution = HOST_USER
hostScope = MACOS_USER
```

A `PERSONAL_NODE` must not become a generic remote shell for other workspace members.

No other member may route host execution to that node unless a future explicit shared-node conversion/approval model is introduced.

### 7.2 SHARED_NODE

An organization-owned shared machine such as a Mac Studio, build host or team workstation.

Default properties:

```text
owner = organization
hostScope = TRUSTED_ROOTS
semantic file/Git = enabled according to project profile
ISOLATED = available according to project profile
generic HOST_USER power tool = disabled by default
```

Shared nodes may expose configured workspace roots to approved team workflows. Because a generic host process cannot truthfully be confined to `TRUSTED_ROOTS` merely by setting its cwd, `process_start_host` on a SHARED_NODE requires an explicit node-level ADMIN opt-in that confirms the underlying macOS account itself is a dedicated/trusted team execution account. Without that opt-in, broad host processes use ISOLATED or a PERSONAL_NODE instead. Semantic file/Git tools remain root-bounded.

### 7.3 BYOD principle

Device ownership is not the trust criterion.

An approved personal device is a normal first-class Business runtime node if:

- the member identity is valid;
- the node is enrolled and approved;
- the node is not revoked;
- its local policy permits the requested work.

---

## 8. Project collaboration contract

Collaboration modes are deliberately reduced to two.

| Mode | Meaning | Default |
| --- | --- | --- |
| `TEAM` | Broad shared project memory/history/search/context | **Yes** |
| `PRIVATE` | Explicit exception for sensitive projects | No |

`TEAM` means the broad sharing level previously discussed as `TEAM_EXTENDED`.

### 8.1 TEAM shares by default

Within one organization/project, TEAM context may include:

- task objective;
- active and completed tasks;
- checkpoints;
- current state;
- next actions;
- verification;
- decisions;
- facts;
- artifact references;
- tags;
- assignee metadata;
- project history;
- prepared handoffs;
- searchable continuity history;
- cross-chat context;
- cross-device context.

TEAM continuity is the organization's shared working memory.

It is still context, not host authority.

### 8.2 PRIVATE

Use only when there is an actual sensitivity reason, for example:

- M&A;
- payroll/HR;
- investment negotiation;
- litigation;
- executive-only material.

PRIVATE may still use cloud continuity, but member visibility must be explicitly constrained.

---

## 9. Project/local policy model

Project settings are intentionally kept simple.

### 9.1 Profiles

```text
READ_ONLY
SAFE
STANDARD
```

`STANDARD` in v1.1 means:

> An approved node may perform ordinary developer/knowledge-worker operations consistent with that node's execution mode and OS-user authority.

It no longer means Docker-only execution.

### 9.2 Execution mode

Only two execution modes are required:

```text
HOST_USER
ISOLATED
```

No independent network-policy axis is required for v1.1.

- `HOST_USER` uses the ordinary host network available to the logged-in macOS user.
- `ISOLATED` retains the existing Business Docker sandbox and defaults to network-off.

No separate ChatAgent Git policy engine is required in v1.1. STANDARD projects expose the semantic Git tools; the actual remote/branch/merge authority remains governed by Git/GitHub.

### 9.3 Typical development project

```text
profile       = STANDARD
collaboration = TEAM
execution     = HOST_USER
```

### 9.4 Sensitive project example

```text
profile       = SAFE
collaboration = PRIVATE
execution     = ISOLATED
```

---

## 10. HOST_USER execution model

HOST_USER is the primary execution mode for trusted development and normal knowledge-worker automation.

It operates as the logged-in macOS user and does not claim:

- sudo/root;
- TCC bypass;
- macOS security bypass;
- access to resources the user cannot access;
- bypass of external service authorization.

Node rule:

- `PERSONAL_NODE`: the owning member may use `process_start_host` at that logged-in user's normal macOS authority.
- `SHARED_NODE`: `process_start_host` is denied unless the node has explicit ADMIN-approved shared host-power enablement; cwd alone is never treated as a security sandbox.

Expected normal developer capabilities include, when already available to the user:

- build/test/lint;
- package installation;
- local development servers;
- Git/GitHub CLI;
- Python/Node/toolchains;
- API/CLI calls;
- ordinary file create/edit/delete/rename;
- branch/commit/push/PR workflows.

Personal's durable host-process implementation is the primary source donor for this component.

Reuse should preserve its proven properties:

- durable process identity;
- idempotency key handling;
- PID/start-token reconciliation;
- bounded output;
- bounded concurrency;
- timeout;
- owned-process termination;
- fail-closed recovery.

---

## 11. ISOLATED execution model

The current Business Docker execution plane is retained as an optional sandbox.

Use cases:

- untrusted repositories;
- suspicious packages/scripts;
- clean-room tests;
- reproducible sandbox verification;
- workflows that should not see host credentials/network.

The existing isolation properties should remain unless separately changed by an accepted design:

- non-root;
- read-only root filesystem;
- no Docker socket;
- no deployment credential;
- bounded CPU/memory/PID/output;
- project-scoped mount;
- network-off by default.

---

## 12. OpenAI safety compatibility principle

The Business tool surface must be designed to cooperate with OpenAI's confirmation/safety layer rather than trying to bypass it.

The key rule is:

> **Generic host exec is retained, but demoted to a power-tool / escape hatch. High-frequency operations must be exposed through semantic tools whose names, descriptions, schemas, and risk annotations accurately describe their real effects.**

This is a direct design lesson from ChatAgent Personal.

A single generic host-exec tool that can perform benign reads, file deletion, Git mutation, package installation, network calls and history-rewriting commands cannot truthfully present one low-risk annotation profile.

Therefore normal workflows should not be forced through one broad `destructive=true + openWorld=true` tool.

---

## 13. Safety Compatibility Fallback — mandatory directive

The primary v1.1 path is the semantic-tool architecture defined in this document.

However, implementation must not become trapped by a theoretically clean design that the ChatGPT/OpenAI host still blocks in real use.

### 13.1 Trigger condition

During B-S0/B-S5 Developer Mode and fresh-chat canaries, activate the fallback if there is reproducible evidence that one or more common, approved workflows cannot complete because of OpenAI safety/tool-classification behavior even though:

- the tool has a narrow semantic purpose;
- its schema is bounded;
- annotations match the actual effect;
- the user intent is explicit;
- Business authorization allows the operation;
- the backend itself is functioning correctly.

Examples include repeated host-side blocking or unusable confirmation behavior for ordinary create/replace/Git/process workflows.

### 13.2 Fallback action

If triggered, do **not** keep inventing new safety workarounds.

Instead, switch implementation strategy to:

> **Reuse the already safety-tested ChatAgent Personal tool surface, annotation mapping, semantic file boundaries and host-process structure as directly as practical, then add only the Business-specific organization/member/node/team-context adaptations required by this design.**

Primary Personal donor references include:

```text
scripts/l0-ui-probe.mjs
scripts/l1/durable-host-processes.mjs
scripts/l1/broker-server.mjs
scripts/l1/l1-semantic-write-test.mjs
scripts/l1/personal-native-cas-mcp-test.mjs
scripts/l1/memory/*
```

The fallback should preserve tested Personal semantics rather than renaming/recombining them unnecessarily.

Business-specific wrappers may add:

- organization identity;
- member identity;
- node ownership;
- TEAM/PRIVATE policy;
- runtime routing;
- Business audit;
- Business shared continuity.

### 13.3 What the fallback is not

The fallback is not permission to:

- weaken truthful risk annotations;
- hide destructive effects inside read-only tools;
- bypass OpenAI safety controls;
- give every team member access to another member's personal Mac;
- import Personal as a runtime dependency across repositories.

It is a **source/behavior reuse strategy** for already validated safety-compatible patterns.

---

## 14. Tool contract design rules — naming, scope and count

The public MCP tool surface is **not constrained by a target tool count**.

There is no architectural requirement to have 17, 18, 25, 30, 40, 100, or any other fixed number of tools.

> **Tool count is an output of use-case decomposition, never an input constraint.**

The governing rule is:

> Implement the capabilities required by the product goals and real user workflows. Split distinct actions into focused tools when doing so improves model selection, permission clarity, safety classification, confirmation behavior, or recoverability. Add or remove tools whenever the use-case design requires it.

This follows the OpenAI tool-design principle that distinct operations should be separated when they have different permissions, safety risks, or confirmation requirements.

### 14.1 Naming convention — fixed

Public Business MCP tool names use:

```text
<domain>_<verb>_<object>
```

Examples:

```text
fs_read_file
git_create_commit
continuity_search_history
process_start_host
github_create_pull_request
```

Names must be:

- stable;
- action-oriented;
- specific;
- plain-language;
- unique within the server;
- descriptive of exactly one coherent action;
- free of unexplained internal jargon.

Avoid ambiguous umbrella verbs such as:

```text
inspect
prepare
sync
publish
open
manage
handle
operate
```

when the actual action can be named explicitly.

### 14.2 Preferred verb vocabulary

Prefer a small consistent vocabulary where it accurately fits:

```text
get
list
read
search
create
replace
patch
move
copy
delete
start
add
complete
prepare
terminate
stage
commit
fetch
pull
push
```

A different verb is allowed when it is materially more precise.

### 14.3 Descriptions must define positive and negative boundaries

A tool description must state:

1. what user goal it serves;
2. when to use it;
3. important preconditions;
4. relevant side effects;
5. how it differs from similar tools;
6. when **not** to use it and which tool to use instead.

Example:

```text
fs_replace_file

Use when the user wants to replace the contents of one existing regular file
and the current SHA-256 is known.

Do not use to create a missing file; use fs_create_file.
Do not use to move or delete a path.
```

### 14.4 Input schemas must expose the semantic action

Do not hide materially different operations behind one `mode` field merely to reduce tool count.

Bad pattern:

```text
git_action(mode = status | commit | fetch | push | reset | ...)
```

Preferred pattern:

```text
git_get_status
git_create_commit
git_fetch_remote
git_push_branch
```

The same rule applies when permissions, safety risk, confirmation requirements, or external side effects differ.

### 14.5 Initial semantic capability inventory — not a fixed-count contract

The following names are the current **initial implementation inventory**. It is explicitly not a fixed-size contract. B-S0 use-case/evaluation work may add, remove, split, or consolidate tools when evidence supports the change.

#### Business/status and authenticated identity

```text
business_get_status
member_get_profile
runtime_list_nodes
runtime_map_project
runtime_unmap_project
```

`member_get_profile` is the authenticated read-only profile tool for the currently linked Business member. It must derive identity from validated OAuth credentials, accept no caller-supplied member identifier, return a stable opaque profile ID, and advertise `_meta["openai/profile"] = true` with the standard profile output schema.

`runtime_list_nodes` returns only the caller-eligible runtime nodes, their bounded readiness/status metadata, and the logical projects mapped on each node. It must not expose another member's private node details beyond what the caller is authorized to use.

`runtime_map_project` is the focused local-authority action that binds one existing Business logical project to one existing directory under an approved workspace root on one eligible node. It never clones a repository or derives a host path from cloud metadata. Mapping mutations use idempotency and return a mapping revision.

`runtime_unmap_project` removes only that local binding after exact mapping-revision validation. It does not delete, move, reset or otherwise mutate repository files and it does not delete the cloud logical project.

#### Filesystem

```text
fs_list_directory
fs_get_path_info
fs_read_file
fs_get_file_hash
fs_create_directory
fs_create_file
fs_replace_file
fs_patch_file
fs_move_path
fs_delete_path
```

Additional focused file operations such as safe copy or large async hash/copy jobs should be added when the supported use cases require them; they must not be forced through generic host execution merely to keep the surface small.

#### Team Continuity

```text
continuity_get_context
continuity_start_task
continuity_add_checkpoint
continuity_prepare_handoff
continuity_complete_task
continuity_search_history
```

#### Process / execution

```text
process_start_host
process_start_isolated
process_get_status
process_read_output
process_terminate_job
```

#### Git / GitHub

```text
git_get_status
git_get_diff
git_get_history
git_list_branches
git_create_branch
git_switch_branch
git_stage_files
git_create_commit
git_clone_repository
git_fetch_remote
git_pull_ff_only
git_push_branch
github_create_pull_request
```

Further focused Git/GitHub tools may be added if a real supported workflow requires them, for example PR lookup/update or remote-branch operations. They should be added because of a user goal, not because a target tool count has room available.

### 14.6 Runtime-node selection rule

Focused local-effect tools (filesystem, process, Git/GitHub operations that act through a runtime node) use the following routing rule:

```text
0 eligible mapped nodes  -> RUNTIME_NODE_UNAVAILABLE
1 eligible mapped node   -> server may resolve that sole node when runtimeNodeId is omitted
2+ eligible mapped nodes -> runtimeNodeId is required; otherwise RUNTIME_NODE_REQUIRED
```

An explicitly supplied `runtimeNodeId` must still pass member/node ownership, node approval, project mapping and local policy checks.

This rule minimizes friction for the common single-device user while preventing hidden routing to the wrong Mac when multiple nodes are available. `runtime_list_nodes` is the discovery tool when the caller/model needs to choose.

### 14.7 Tool-selection evaluation is part of the contract

B-S0 must maintain a golden prompt set covering:

- direct requests;
- indirect requests;
- ambiguous requests;
- negative/counterfactual requests;
- similar-tool boundaries;
- semantic-tool versus power-tool selection.

Representative expectations:

| User intent | Expected semantic tool/path |
| --- | --- |
| Read README | `fs_read_file` |
| Show working-tree state | `git_get_status` |
| Show exact changes | `git_get_diff` |
| Create feature branch | `git_create_branch` |
| Stage selected files | `git_stage_files` |
| Commit staged changes | `git_create_commit` |
| Clone an approved repository into an approved workspace | `git_clone_repository` |
| Map an existing Business project to this local checkout | `runtime_map_project` |
| Unmap a local checkout without deleting files | `runtime_unmap_project` |
| Fetch remote state | `git_fetch_remote` |
| Fast-forward pull | `git_pull_ff_only` |
| Push branch | `git_push_branch` |
| Create PR | `github_create_pull_request` |
| Show recent project context | `continuity_get_context` |
| Search old project decisions/history | `continuity_search_history` |
| Run `npm test` | `process_start_host` |
| Delete one approved project file | `fs_delete_path` |

A semantic tool existing for an operation but the model unnecessarily choosing `process_start_host` is normally a selection failure.

No numeric target for tool count is used as an evaluation metric.

---

## 15. Tool annotations — behavior first

Every published MCP tool must return explicit, truthful annotations matching its real behavior.

The exact matrix is derived per focused tool from these rules:

- `readOnlyHint=true` only if the tool cannot modify state;
- `destructiveHint=true` if it can delete, overwrite, revoke, irreversibly mutate, or otherwise cause difficult-to-reverse effects;
- `openWorldHint=true` when the tool accesses public/open-ended external entities or performs outward actions such as code push/public submission;
- `idempotentHint` may be used only where repeated identical calls have no additional effect.

Representative intended classes:

| Tool/example | readOnly | destructive | openWorld |
| --- | ---: | ---: | ---: |
| `business_get_status` | true | false | false |
| `member_get_profile` / `runtime_list_nodes` | true | false | false |
| `fs_read_file` / `fs_get_file_hash` | true | false | false |
| `fs_create_file` / `fs_create_directory` | false | false | false |
| `fs_move_path` | false | false | false |
| `fs_replace_file` / `fs_patch_file` / `fs_delete_path` | false | true | false |
| `continuity_get_context` / `continuity_search_history` / `continuity_prepare_handoff` | true | false | false |
| `continuity_start_task` / `continuity_add_checkpoint` | false | false | false |
| `continuity_complete_task` | false | true | false |
| `process_start_host` | false | true | true |
| `process_start_isolated` | false | true | false |
| `process_get_status` / `process_read_output` | true | false | false |
| `process_terminate_job` | false | true | false |
| Git read tools | true | false | false unless the implementation actually needs open-world access |
| local Git mutation tools | false | false | false |
| `git_clone_repository` / `git_fetch_remote` / `git_pull_ff_only` | false | false | true |
| `git_push_branch` / `github_create_pull_request` | false | false | true |

If implementation behavior differs from the table, annotations change to match reality. Risk hints must never be lowered solely to reduce confirmation friction.

---

## 16. Reuse-first implementation contract — Personal is the primary donor

ChatAgent Personal v1.1.1 is not merely a conceptual reference. For overlapping capabilities it is the **primary source donor and behavioral baseline**.

Personal v1.1.1 release profile has already validated a 33-tool operational surface, including semantic create/replace, durable host process behavior, process lifecycle operations, async copy/hash paths, and seven Supabase Personal Memory tools.

Business must not reimplement equivalent behavior from scratch unless there is a documented Business-specific reason.

### 16.1 Reuse rule

For every Business capability, implementation must classify it before coding:

```text
REUSE_AS_IS
ADAPT_THINLY
BUSINESS_NEW
DO_NOT_EXPOSE
```

The default for an overlapping Personal capability is `REUSE_AS_IS` or `ADAPT_THINLY`, not `BUSINESS_NEW`.

### 16.2 Primary reuse matrix

| Personal v1.1.1 donor | Business semantic surface | Reuse decision |
| --- | --- | --- |
| `HostFileOps` list/read/stat/hash | `fs_list_directory`, `fs_get_path_info`, `fs_read_file`, `fs_get_file_hash` | **ADAPT_THINLY** — preserve file behavior; add Business node/project authority |
| `local_create_file` + native create boundary | `fs_create_file` | **REUSE_AS_IS internally / rename publicly** |
| `local_replace_file` + native CAS replace | `fs_replace_file` | **REUSE_AS_IS internally / rename publicly** |
| Personal exact mutation/audit semantics | `fs_patch_file` and other semantic file mutation | **REUSE primitives**, Business-specific wrapper as needed |
| Personal async copy implementation/tests | future Business safe-copy tools if required | **REUSE_AS_IS/ADAPT**, do not rebuild large-copy engine |
| Personal async hash implementation/tests | future Business async-hash tools if required | **REUSE_AS_IS/ADAPT** |
| `DurableHostProcesses` | `process_start_host`, `process_get_status`, `process_read_output`, `process_terminate_job` | **REUSE core implementation**; add member/node/project/risk adapters |
| Personal `local_exec_start` metadata/annotation lessons | `process_start_host` | **REUSE behavioral/safety baseline**, improve Business public naming |
| Personal host-process + Git CLI execution primitives | `git_clone_repository` and focused Git/GitHub tools | **ADAPT_THINLY** — reuse execution/process primitives; add focused argument validation and Business node/project policy rather than building a second process engine |
| Personal memory auth/session/Keychain runtime | Business Supabase auth/runtime | **REUSE_AS_IS where semantics match** |
| `SupabasePersonalMemoryStore` RPC/retry/error pattern | Business continuity store | **ADAPT_THINLY** for organization/member/project schemas |
| Personal task start/checkpoint/complete | Business continuity task mutations | **ADAPT_THINLY**; retain transaction/idempotency/CAS structure |
| Personal task/context/search reads | `continuity_get_context`, `continuity_search_history` | **ADAPT_THINLY** for TEAM/PRIVATE and Business fields |
| Personal encrypted logical backup/Keychain patterns | Business continuity backup | **REUSE_AS_IS/ADAPT** |
| Personal access request/check model | node enrollment/admin flows where useful | **REUSE concepts/components**, not automatically the same public tools |
| Personal scratch/test-only tools | Business production public surface | **DO_NOT_EXPOSE by default** unless a Business use case requires them |
| Personal legacy umbrella write/copy variants hidden from release profile | Business public surface | **DO_NOT_REINTRODUCE** merely for compatibility |

### 16.3 What must remain Business-specific

The following are `BUSINESS_NEW` or substantial adaptations because Personal does not provide the same product semantics:

- organization/member roles;
- authenticated Business member profile wrapper and `runtime_list_nodes`;
- `PERSONAL_NODE` / `SHARED_NODE` ownership and routing;
- TEAM / PRIVATE collaboration;
- N-node distributed runtime routing;
- logical project identity across different local paths;
- Business decisions/facts/artifacts continuity fields;
- Business context digest and handoff semantics;
- local Business audit + cloud continuity event separation;
- member-to-node binding;
- Gateway/Relay when required;
- Business-specific Git/GitHub semantic tools where Personal has only generic host execution.

### 16.4 Reuse must include tests, not only code

When a Personal component is reused:

1. port/copy the proven implementation into the Business repository;
2. port the relevant Personal unit/integration/safety tests first;
3. prove equivalent behavior before adding Business wrappers;
4. add Business-specific authorization/routing tests;
5. keep Personal as a read-only donor/reference, not a runtime dependency.

Do not write a second implementation and then compare it to Personal afterward.

### 16.5 Public renaming versus proven safety metadata

Business may expose clearer public names such as `fs_replace_file` or `process_start_host` while preserving the Personal implementation and semantic boundaries.

Because names/descriptions also affect model selection, renamed Business tools require golden selection and real ChatGPT safety canaries.

If the renamed semantic surface still causes reproducible OpenAI host blocking or unusable confirmation behavior, the Safety Compatibility Fallback may restore the already validated Personal public name/description/schema/annotation pattern for the affected capability rather than inventing another new abstraction.

---

## 17. Focused semantic operations

### 17.1 Filesystem

Common file actions are exposed directly rather than hidden inside host execution.

`fs_move_path`:

- one source and one destination;
- same approved node/workspace boundary;
- destination overwrite forbidden unless a separate explicit replace contract exists;
- symlink/root escape denied;
- operation audited.

`fs_delete_path`:

- approved project/workspace path only;
- destructive annotation;
- bounded impact checks;
- no ordinary silent recursive mass deletion;
- workspace/repository-scale deletion is HIGH_IMPACT.

`fs_replace_file` and `fs_patch_file` retain exact precondition/fail-closed semantics. `UNCERTAIN` is never converted into optimistic success or blind retry.

### 17.2 Git / GitHub

Git/GitHub actions are split by real user intent rather than umbrella modes.

Read operations:

```text
git_get_status
git_get_diff
git_get_history
git_list_branches
```

Local mutation operations:

```text
git_create_branch
git_switch_branch
git_stage_files
git_create_commit
```

Remote synchronization/publication:

```text
git_clone_repository
git_fetch_remote
git_pull_ff_only
git_push_branch
github_create_pull_request
```

`git_clone_repository` may create a new working copy only inside an approved local workspace root. It must not choose an arbitrary destination outside the node's approved workspace mapping. Authentication and repository authorization remain those of the logged-in user/external Git provider.

Normal semantic tools do not provide:

- `git reset --hard`;
- `git clean -fdx`;
- force push;
- remote branch destructive deletion;
- shared-history rewrite;
- branch-protection bypass.

Those are either HIGH_IMPACT power-tool operations requiring explicit intent/approval or HARD_DENY when they would bypass external authorization.

---

## 18. Generic host exec as power tool / escape hatch

`process_start_host` is retained because semantic tools cannot and should not model every developer CLI operation.

It is deliberately the broad power tool rather than the preferred route for operations already represented semantically.

Preferred input shape follows the proven Personal model:

```text
executable
argv[]
cwd
timeoutMs
idempotencyKey
```

rather than an opaque raw shell string whenever practical.

This preserves the Personal durable-process implementation while allowing Business to add member/node/project/risk checks around it.

Shell interpreters such as `/bin/zsh -c ...` may remain available as an escape hatch, but inherit the broad destructive/open-world risk class.

### 18.1 Semantic-tool preference

When a focused semantic tool directly represents the requested action, the normal model/tool-routing preference is that semantic tool.

Examples:

```text
git status              -> git_get_status
git diff                -> git_get_diff
git commit              -> git_create_commit
git fetch               -> git_fetch_remote
git pull --ff-only      -> git_pull_ff_only
git push <branch>       -> git_push_branch
GitHub PR create        -> github_create_pull_request
simple file rename      -> fs_move_path
simple file deletion    -> fs_delete_path
recent team context     -> continuity_get_context
historical team search  -> continuity_search_history
```

The system should not build a brittle shell parser that tries to understand every possible command. The goals are:

- prefer clearer semantic tools;
- keep power-tool access for unsupported operations;
- preserve truthful risk separation;
- evaluate tool selection empirically.

## 19. Risk model

Risk is assessed by effect/impact, not merely command name.

### 19.1 NORMAL

May proceed within the approved authority and ordinary OpenAI confirmation behavior.

Examples:

- source edits;
- ordinary tracked-file deletion;
- rename/move;
- branch creation;
- commit;
- normal branch push;
- package install;
- test/build/lint;
- API calls permitted by the user's credentials;
- local development server.

### 19.2 HIGH_IMPACT

Requires explicit intent/approval or pre-approved project policy.

Examples:

- delete an entire repository/workspace;
- mass destructive cleanup;
- `git reset --hard` over valuable uncommitted work;
- `git clean -fdx`;
- force push / shared-history rewrite;
- remote repository/branch destructive deletion;
- destructive production database migration;
- production deployment destruction.

### 19.3 HARD_DENY

Cannot be approved through an ordinary project policy in v1.1.

Examples:

- OS privilege escalation/bypass;
- TCC/security bypass;
- credential/Keychain secret extraction to chat/logs;
- another organization's continuity/data access;
- use of a revoked node;
- arbitrary use of another member's PERSONAL_NODE;
- bypassing ChatAgent authentication/security state;
- bypassing GitHub/cloud authorization controls.

---

## 20. Cloud control and continuity architecture

The cloud layer should use two logical schemas to avoid conflating identity/control with team memory.

### 20.1 `private_business_control`

Recommended tables:

```text
schema_meta
organizations
organization_members
runtime_nodes
runtime_sessions
logical_projects
private_project_members
```

Responsibilities:

- organization identity;
- minimal member roles;
- node enrollment/approval/revocation;
- logical project metadata;
- TEAM/PRIVATE collaboration policy;
- member/node binding.

### 20.2 `private_business_continuity`

Recommended tables:

```text
organization_state
continuity_projects
continuity_tasks
continuity_checkpoints
operations
events
```

Responsibilities:

- task/checkpoint working memory;
- revision state;
- operation receipts;
- event/hash chain;
- continuity search corpus;
- logical export/backup.

Cloud rows must not become authoritative for a local filesystem path or macOS permission.

---

## 21. Continuity model

TEAM continuity is broad shared working memory, not a host-authorization mechanism.

### 21.1 Task model

Recommended logical fields:

```text
organization_id
project_id
task_id
objective
status
revision
created_by_member_id
assigned_to_member_id nullable
tags
started_at
completed_at
```

### 21.2 Checkpoint model

Must preserve existing Business information:

```text
summary
current_state
next_actions
verification
decisions
facts
artifacts
source_member_id
source_runtime_node_id
created_at
```

### 21.3 Completion

Completed tasks remain immutable.

### 21.4 Mutation correctness

Reuse the Personal v1.1 transaction pattern:

```text
member/node authorization
-> organization_state SELECT ... FOR UPDATE
-> operationId check
-> same operation + same input = prior receipt
-> same operation + different input = IDEMPOTENCY_CONFLICT
-> task revision CAS
-> mutation
-> event append
-> receipt
-> context sequence/hash update
-> COMMIT
```

Exactly one writer must win a same-revision race.

### 21.4 Shared-context sensitive-text guard

TEAM sharing is broad by default, but broad sharing must not turn credentials into organizational memory. Reuse the Personal sensitive-text/input-validation guard for all continuity mutations before cloud persistence.

At minimum, reject or explicitly sanitize content that appears to contain:

- access/refresh tokens;
- API keys or deployment credentials;
- private-key material;
- Keychain secret values;
- other configured credential patterns.

This guard applies to TEAM and PRIVATE continuity writes. It is a data-hygiene boundary, not a substitute for normal user authorization. Rejected secret-like content must not be copied into audit logs as part of the error.

---

## 22. Continuity search

`continuity_search_history` is a required v1.1 Business feature.

Initial implementation should remain simple and maintainable:

- project-scoped PostgreSQL full-text search;
- no vector database required;
- no embeddings required;
- no RAG/KG/Ontology project added as a side effect.

Searchable corpus includes:

- objective;
- summary;
- current state;
- next actions;
- verification;
- decisions;
- facts;
- artifact references;
- bounded task metadata.

TEAM projects expose broad project history.

PRIVATE projects respect explicit member visibility.

---

## 23. `continuity_get_context` and handoff

When no taskId is supplied, bounded project context may include:

- active tasks;
- recent tasks;
- recent decisions;
- recent facts;
- recent artifact references.

The handoff size contract remains:

```text
ordinary target ~= 8 KiB
hard cap         = 24 KiB
```

Older context should be retrieved through `continuity_search_history` rather than expanding the handoff indefinitely.

Freshness semantics remain:

```text
FRESH
STALE
UNVERIFIED
```

The following digests remain distinct concepts:

```text
Business contextDigest
!= Supabase event hash
!= logical backup digest
```

### 23.1 Explicit local project mapping

A cloud `organizationId + projectId` identifies the logical team project, but it never grants filesystem or execution access by itself. Each runtime node must maintain an explicit local mapping:

```text
organizationId + projectId
-> node-local approved path/workspace root
-> local profile/execution policy
```

Rules:

- no automatic host path is derived from a cloud project row;
- the same logical project may map to different absolute paths on different nodes;
- an unmapped project on a node is not executable there;
- changing a local mapping is a local-authority mutation performed through `runtime_map_project` / `runtime_unmap_project` (or an equivalent operator action during bootstrap) and must be audited;
- `runtime_map_project` requires an explicitly selected eligible node and approved workspace-root ID; it may optionally verify the Git remote before committing the mapping;
- mapping writes are idempotent and revisioned so stale unmap/update operations fail closed;
- `git_clone_repository` never creates the logical project mapping as a hidden side effect;
- when a Git remote is present, a remote/repository fingerprint may be recorded as advisory mismatch detection, but Git metadata does not itself grant host authority.

This prevents an identical `projectId` string from accidentally routing a team request into an unrelated local repository.

---

## 24. Multi-node routing architecture

Shared memory across nodes is straightforward through Supabase; safe host execution routing is a separate architectural concern and a B-S0 release blocker.

The system must reliably bind:

```text
organization member
-> authorized runtime session
-> approved runtime node
```

### 24.1 B-S0 identity decision — OAuth 2.1 user identity

B-S0 platform verification confirmed that ChatGPT MCP apps can authenticate end users with OAuth 2.1 and attach the resulting access token to MCP requests, while Secure MCP Tunnel preserves the OAuth discovery/authentication path. Supabase Auth can act as an OAuth 2.1/OIDC authorization server for MCP clients.

Therefore the accepted identity path is:

```text
ChatGPT user
-> Supabase Auth OAuth 2.1 / OIDC
-> validated access token on MCP request
-> stable Supabase auth user / Business member
-> organization/member policy
```

The MCP server validates issuer, audience/resource, expiry and the supported OIDC identity scopes before resolving the Business member. A model-supplied user/member ID is never authoritative.

Supabase Auth currently does not support arbitrary application-defined OAuth scopes. Therefore v1.1 does **not** use invented scopes such as `business.read`, `business.write`, or `business.execute`. The MCP descriptor requests the supported identity scopes `openid email profile`; actual Business authorization is enforced by organization/member state, RLS, project profile, node ownership/mapping and local OS/external-system policy. OAuth scope metadata is not used as a substitute for Business authorization.

OpenAI request metadata such as `_meta["openai/subject"]`, `_meta["openai/session"]` or `_meta["openai/organization"]` may be used only as correlation/observability hints where appropriate; Business authorization is based on validated OAuth credentials and Business control state.

`member_get_profile` is exposed as the standard authenticated profile tool so OpenAI can consistently recognize the connected Business profile.

#### 24.1.1 OAuth descriptor compatibility decision

OpenAI requires per-tool OAuth `securitySchemes` on the tool descriptor and documents `_meta.securitySchemes` as a compatibility mirror. B-S0 verified that the currently installed `@modelcontextprotocol/sdk` registration path preserves `_meta.securitySchemes` but does not emit the OpenAI top-level extension field.

The accepted v1.1 approach is therefore a minimal descriptor adapter:

- retain MCP SDK registration, input validation and `tools/call` handling;
- maintain one canonical Business tool catalog;
- replace only the SDK `tools/list` handler with a catalog-derived descriptor response;
- emit identical OAuth schemes at top-level `securitySchemes` and `_meta.securitySchemes`;
- retain `_meta["openai/profile"] = true` and the standard profile `outputSchema`;
- do not fork the MCP SDK or lower/omit security metadata to avoid compatibility work.

An isolated wire-level B-S0 probe proved that the adapter preserves top-level and compatibility-mirror schemes while normal SDK tool registration/call handling remains intact. Live ChatGPT Developer Mode discovery remains a required B-S0 canary before release implementation.

### 24.2 B-S0 routing decision — Business Gateway + outbound Node Relay

Secure MCP Tunnel provides a route to the configured private MCP server; it is not treated as the member-to-N-node runtime router. Multi-node execution therefore uses a Business routing layer:

```text
Runtime Node
-> outbound authenticated relay/poll channel
-> Business Gateway
-> authenticated ChatGPT MCP request
```

Nodes should not require arbitrary inbound Internet ports. The exact production relay transport is an implementation decision for B-S1/B-S3, but B-S0 has validated the ownership/routing semantics with an executable outbound-queue prototype.

The Gateway verifies:

- validated OAuth member identity;
- organization;
- node ownership/type;
- node approval/revocation state;
- bounded session/authorization lease;
- explicit project-to-local-path mapping;
- local project/node policy.

A PERSONAL_NODE may only accept its owning member's routed host work. A SHARED_NODE may accept only members/projects allowed by organization and local-node policy. Generic `process_start_host` additionally requires the shared node's explicit host-power opt-in; semantic file/Git operations do not inherit that broad authority.

This identity/routing property is non-negotiable before multi-node HOST_USER production release.

---

## 25. Supabase authentication and local secrets

Reuse the Personal v1.1 token-custody/session patterns, but use Business member OAuth identity rather than Personal single-owner pairing.

B-S0 selected Supabase Auth OAuth 2.1/OIDC as the primary identity-provider path because it supports authorization-code + PKCE, MCP-compatible discovery/client registration, refresh tokens, UserInfo/OIDC identity and JWT verification. This avoids implementing a custom authorization server.

Principles:

- publishable Supabase configuration only;
- no runtime `service_role` secret;
- refresh token in macOS Keychain;
- access token process-memory only;
- bounded refresh;
- bounded network/RPC timeout;
- node-specific token/account binding;
- separate Keychain key for backup encryption;
- no token values in logs/backup/project files;
- private/read-write tools declare OAuth `securitySchemes` explicitly and the server verifies the token on every invocation;
- profile identity is stable across token refresh/reconnection and is not derived from mutable email/display-name fields.

Personal source is a donor/reference, never a cross-repository runtime dependency.

---

## 26. Local and cloud audit split

Two audit mechanisms are intentional and not redundant.

### Cloud continuity event chain

Covers:

- continuity mutations;
- revision sequence;
- operation idempotency;
- event/hash state.

### Local effect audit

Covers bounded metadata for:

- file mutation;
- Git mutation;
- process start/termination;
- node-local effect result.

Do not combine them into one monolithic global ledger in v1.1.

Audit must avoid capturing secrets, arbitrary file contents, command output, or credential material.

---

## 27. Outage/degraded behavior

Supabase outage must not unnecessarily disable local work, but cloud-control outage must not create an indefinite authorization bypass.

A previously authenticated member/node route may continue only while its already-issued access token and bounded cached node-approval/session lease remain valid. No new enrollment, approval, role change, or lease refresh is accepted while the control plane is unavailable. Once the token/lease expires, new remotely routed effects fail closed until authoritative control state can be checked again.

Within an unexpired previously validated session/lease, if the node/Gateway path remains healthy:

```text
local file operations   AVAILABLE
HOST_USER execution     AVAILABLE
Git semantic tools      AVAILABLE
ISOLATED execution      AVAILABLE if local Docker healthy
local audit             AVAILABLE
continuity writes       FAIL CLOSED
continuity search       UNAVAILABLE
continuity read         UNVERIFIED / bounded unavailable
```

A revoked node must be rejected immediately whenever authoritative control state is reachable; cached authorization is bounded by the lease/token lifetime and is never indefinite.

No automatic SQLite write fallback.

No dual-write.

No CRDT/offline queue in v1.1.

---

## 28. Backup and restore

Business v1.1 backup includes:

- non-secret control metadata required for recovery;
- local node-policy metadata;
- local audit state;
- encrypted logical continuity export;
- counts/high-watermark;
- logical digest.

It excludes:

- Business deployment credential;
- Supabase refresh token;
- backup encryption key;
- Git credentials;
- Keychain contents;
- customer repository contents.

Use AES-256-GCM logical backup using a dedicated backup key stored in macOS Keychain.

Restore must not silently overwrite live cloud continuity.

Cloud restore requires:

```text
incident context
-> verify/decrypt snapshot
-> current cloud snapshot
-> reconciliation
-> explicit controlled restore
```

---

## 29. Personal v1.1 reuse strategy

The Business implementation should reuse proven Personal components aggressively where semantics match.

### 29.1 Reuse almost directly

- macOS Keychain refresh-token custody;
- macOS Keychain backup-key custody;
- native Keychain helper pattern;
- bounded Supabase Auth session;
- bounded token refresh and RPC/network timeout;
- input-validation primitives;
- canonical logical digest utilities;
- AES-256-GCM logical backup pattern;
- RPC retry/fail-closed pattern;
- durable host-process identity/lifecycle;
- process ownership and reconciliation;
- semantic create-vs-replace separation;
- OpenAI tool-annotation test patterns.

### 29.2 Reuse with Business adaptation

| Personal concept | Business adaptation |
| --- | --- |
| owner | organization + member |
| device | runtime node |
| Personal Memory project | logical Business project |
| Personal Memory store | SupabaseBusinessContinuityStore |
| FULL_HOST host process | STANDARD/HOST_USER on approved node |
| Personal local tool surface | Business semantic tools + node/team policy |

### 29.3 Business-specific implementation

Must be designed in Business rather than copied blindly:

- organization/member model;
- ADMIN/PM/MEMBER;
- TEAM/PRIVATE collaboration;
- PERSONAL_NODE/SHARED_NODE ownership;
- runtime routing/Gateway/Relay;
- project logical identity across different local paths;
- decisions/facts/artifacts preservation;
- continuity search;
- Business handoff digest/freshness integration;
- Business local/cloud audit split;
- distributed concurrency E2E.

### 29.4 Prohibited reuse pattern

Do not make Business depend at runtime on the Personal repository via cross-repo imports.

Reuse means copy/adapt reviewed source and tests into the Business codebase with provenance, not coupling production repositories.

---

## 30. Migration from Business v1.0 continuity

Production migration is single-cutover, not dual-master.

Before the final cutover, build and rehearse:

- v1 SQLite logical exporter;
- Business logical-contract validator;
- one-time Supabase importer;
- authenticated export/readback;
- count/identity/revision comparison;
- existing Business handoff-digest preservation test.

Final production sequence:

```text
v1.0 STOP
-> verified fresh v1 backup
-> final SQLite logical export
-> source counts/revisions/digest record
-> prove production Supabase target is empty/expected
-> one-time final import
-> authenticated readback/export
-> reconcile IDs/counts/revisions/contextDigest
-> retire one-time import surface
-> deploy/start v1.1
```

Do not import production continuity early and then continue writing to v1.0 SQLite.

No dual-write.

No production SQLite fallback after accepted cutover.

---

## 31. B-S0 — Accepted Design / Platform Capability

Production mutation: **none**.

Required work:

1. freeze/verify Business v1.0 repo/tag/production baseline;
2. adopt this document as the canonical v1.1 design;
3. inventory current continuity counts/high-watermark only;
4. freeze Personal v1.1.1 donor references and exact reusable test assets;
5. classify every overlapping capability as `REUSE_AS_IS / ADAPT_THINLY / BUSINESS_NEW / DO_NOT_EXPOSE` before implementation;
6. derive the current use-case-driven semantic tool inventory without any minimum/maximum count target;
7. validate the fixed naming rule `<domain>_<verb>_<object>` and positive/negative description boundaries;
8. build and run the tool-selection golden prompt set, including semantic-tool versus power-tool selection;
9. validate current tool names, schemas, descriptions and annotations with ChatGPT Developer Mode discovery;
10. verify shared-context sensitive-text rejection using the reused Personal guard;
11. verify explicit logical-project-to-local-path mapping and wrong-repository mismatch denial;
12. verify bounded authorization-lease behavior for Supabase/control-plane outage and expiry;
13. verify that SHARED_NODE trusted-root semantics cannot be bypassed through the generic host power tool unless explicit node-level host-power approval is present;
14. run semantic-vs-generic-exec safety probes;
15. verify OAuth 2.1 end-user identity through the OpenAI MCP path and bind validated Supabase Auth identity to Business member identity;
16. prototype Business Gateway/outbound Node Relay ownership and routing semantics, including PERSONAL_NODE owner denial and SHARED_NODE allowance;
17. freeze Supabase schema/RPC naming;
18. freeze the parity/safety/E2E test matrix;
19. decide whether Safety Compatibility Fallback is needed before B-S1/B-S3 tool implementation proceeds.

Gate:

```text
BUSINESS_V11_S0_ACCEPTED=PASS
BUSINESS_V10_PRODUCTION_UNCHANGED=PASS
OPENAI_TOOL_ANNOTATION_SCAN=PASS
TOOL_NAMING_CONTRACT=PASS
TOOL_SELECTION_GOLDEN_SET=PASS
PERSONAL_REUSE_MATRIX=PASS
SHARED_CONTEXT_SECRET_GUARD=PASS
LOCAL_PROJECT_MAPPING_CONTRACT=PASS
AUTH_LEASE_DEGRADED_MODE=PASS
SHARED_NODE_HOST_POWER_BOUNDARY=PASS
OAUTH_MEMBER_IDENTITY_PATH=PASS
NODE_ROUTING_LOGIC_PROBE=PASS
NODE_BINDING_ARCHITECTURE=PASS
SAFETY_STRATEGY_DECIDED=PASS
```

If safety compatibility fails on the primary semantic design, document the evidence and activate the Personal-structure fallback rather than weakening annotations.

### 31.1 B-S0 local validation status

Locally validated evidence at R5:

- v1.0 production baseline healthy and unchanged;
- Personal v1.1.1 donor source/test blob identities frozen;
- focused semantic inventory/catalog/design parity passes;
- current inventory includes explicit `runtime_map_project` / `runtime_unmap_project`; clone does not implicitly create a Business mapping;
- sensitive-text guard donor test passes;
- explicit project mapping, PERSONAL_NODE ownership, SHARED_NODE host-power boundary and authorization-lease prototypes pass;
- outbound Gateway/Node Relay ownership/routing semantics pass;
- exact descriptor schemas/descriptions/annotations serialize successfully;
- OpenAI `securitySchemes` wire adapter passes;
- Supabase schema/RPC naming and B-S0..B-S6 test matrix are frozen.

Still requiring live ChatGPT evidence before `BUSINESS_V11_S0_ACCEPTED=PASS`:

- Developer Mode tool scan of the exact candidate descriptor;
- OAuth linking/profile call through the actual ChatGPT MCP path;
- execution of the golden tool-selection set and confirmation/safety observations.

Therefore R5 is **locally validated but B-S0 is not yet closed**. No B-S1 production/cloud implementation may treat the live canary as implicitly passed.

---

## 32. B-S1 — Cloud Foundation / Identity / Runtime Nodes

Create a dedicated Business Supabase project.

Implement:

- `private_business_control` schema;
- organizations;
- organization_members;
- runtime_nodes;
- runtime_sessions;
- logical_projects;
- TEAM/PRIVATE metadata;
- ADMIN/PM/MEMBER minimal role model;
- node enrollment;
- node approval/revocation;
- PERSONAL_NODE owner binding;
- Keychain refresh-token custody;
- publishable-only runtime config;
- anonymous/direct-table denial;
- health/schema status;
- Gateway/Relay authentication handshake if required by B-S0.

B-S0 freezes the Supabase control schema as `private_business_control` with: `schema_meta`, `organizations`, `organization_members`, `control_state`, `runtime_nodes`, `runtime_sessions`, `logical_projects`, `private_project_members`, and `operations`.

The frozen control RPC names are:

```text
bc_schema_status
bc_member_profile
bc_runtime_enroll
bc_runtime_status
bc_runtime_list
bc_runtime_revoke
bc_project_register
bc_project_set_mode
bc_private_member_add
bc_private_member_remove
```

Do not implement full continuity CRUD yet.

Gate:

```text
BUSINESS_S1_LOCAL=PASS
BUSINESS_S1_SUPABASE_SCHEMA=PASS
BUSINESS_S1_MEMBER_AUTH=PASS
BUSINESS_S1_NODE_ENROLLMENT=PASS
BUSINESS_S1_NODE_REVOKE=PASS
BUSINESS_S1_PERSONAL_NODE_BINDING=PASS
```

---

## 33. B-S2 — TEAM Shared Continuity / Search

Implement:

- `private_business_continuity` schema;
- SupabaseBusinessContinuityStore;
- async BusinessContinuity adapter;
- TEAM default;
- PRIVATE visibility exception;
- the current focused continuity semantic inventory required by supported use cases;
- PostgreSQL full-text search;
- revision CAS;
- operation UUID idempotency;
- transactional event/head/context sequence;
- completion immutability;
- Business contextDigest;
- FRESH/STALE/UNVERIFIED;
- 8 KiB / 24 KiB handoff bounds.

B-S0 freezes `private_business_continuity` tables as `schema_meta`, `continuity_state`, `tasks`, `checkpoints`, `operations`, and `events`. Logical project identity is referenced from `private_business_control.logical_projects`; continuity does not maintain a second project master.

The frozen continuity RPC names are:

```text
bc_task_start
bc_checkpoint_append
bc_task_complete
bc_task_get
bc_project_context
bc_history_search
bc_export_snapshot
```

`bc_import_snapshot` is a temporary migration-only RPC and must be retired after accepted cutover.

Required concurrency validation:

```text
same revision + two writers
=> exactly one commit
=> exactly one REVISION_CONFLICT
```

Required idempotency validation:

```text
same operationId + same input
=> same prior receipt

same operationId + changed input
=> IDEMPOTENCY_CONFLICT
```

Gate:

```text
BUSINESS_S2_CONTINUITY_CONTRACT=PASS
BUSINESS_S2_TEAM_SEARCH=PASS
BUSINESS_S2_PRIVATE_ISOLATION=PASS
BUSINESS_S2_CAS_IDEMPOTENCY=PASS
BUSINESS_S2_HANDOFF_FRESHNESS=PASS
```

---

## 34. B-S3 — Distributed Runtime / Semantic Effects / HOST_USER

Reuse Personal durable host-process implementation as the default source donor.

Implement:

- PERSONAL_NODE;
- SHARED_NODE;
- HOST_USER;
- existing ISOLATED Docker backend;
- member/node routing;
- normal host network under HOST_USER;
- semantic file move/delete;
- focused semantic Git/GitHub actions using the fixed naming rule;
- generic `process_start_host` power tool;
- `process_start_isolated`;
- shared process read/terminate contract;
- NORMAL/HIGH_IMPACT/HARD_DENY effect classification;
- semantic-tool preference;
- Business local effect audit.

OpenAI compatibility verification is part of this phase, not an afterthought.

Gate:

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

If `BUSINESS_S3_OPENAI_SAFETY_CANARY` cannot pass due to platform/tool-classification behavior, activate the documented Personal-structure fallback and re-baseline the public tool surface before proceeding.

---

## 35. B-S4 — Migration / Backup / Ops Integration

Implement/rehearse:

- v1 SQLite logical exporter;
- one-time migration importer;
- disposable PostgreSQL integration;
- staging/live-empty target reconciliation;
- handoff digest preservation;
- encrypted logical continuity backup;
- Keychain backup key;
- Status integration;
- Doctor integration;
- Backup integration;
- Restore integration;
- degraded-continuity health state.

Production final migration is **not** performed in B-S4.

Gate:

```text
BUSINESS_S4_MIGRATION_REHEARSAL=PASS
BUSINESS_S4_CONTEXT_DIGEST_PRESERVED=PASS
BUSINESS_S4_BACKUP_RESTORE=PASS
BUSINESS_S4_DEGRADED_MODE=PASS
```

---

## 36. B-S5 — Real Multi-Node / Safety / Failure E2E

Use at least three logical nodes where practical:

```text
A = SHARED_NODE (Mac Studio)
B = PERSONAL_NODE (member B)
C = second PERSONAL_NODE (member C)
```

Validate end-to-end:

1. A creates TEAM task/checkpoint;
2. B opens shared continuity;
3. B searches project history;
4. B performs local Git development;
5. B commit/push/PR path succeeds under real repository policy;
6. B appends checkpoint;
7. C sees latest TEAM context;
8. B/C concurrent same-revision mutation yields one success + one conflict;
9. A opens an old digest and gets STALE;
10. C cannot route host execution to B's PERSONAL_NODE;
11. B node revoke blocks new node work;
12. replacement/re-enrollment works;
13. Supabase outage preserves local file/Git/HOST_USER work;
14. continuity mutation fails closed during outage;
15. ISOLATED Docker regression passes;
16. normal delete/rename works through semantic file tools;
17. high-impact destructive effect requires explicit intent/handling;
18. GitHub branch protection/CI/review cannot be bypassed;
19. actual ChatGPT Developer Mode canaries cover semantic and power tools.

Mandatory OpenAI canary matrix:

```text
business_get_status
fs_read_file
fs_create_file
fs_replace_file
fs_move_path
fs_delete_path
continuity_get_context
continuity_search_history
git_get_status
git_get_diff
git_create_branch
git_stage_files
git_create_commit
git_fetch_remote
git_pull_ff_only
git_push_branch
github_create_pull_request
process_start_host (benign unsupported-by-semantic-tools operation)
process_start_host (explicitly destructive test fixture)
process_start_isolated
```

For each, record:

- expected tool selection;
- actual tool selection;
- confirmation behavior;
- unexpected safety block, if any;
- whether the server call arrived;
- resulting effect and postcondition.

Gate:

```text
BUSINESS_S5_DISTRIBUTED_TEAM_E2E=PASS
BUSINESS_S5_REMOTE_COLLAB=PASS
BUSINESS_S5_NODE_SECURITY=PASS
BUSINESS_S5_FAILURE_RECOVERY=PASS
BUSINESS_S5_OPENAI_TOOL_BEHAVIOR=PASS
```

---

## 37. B-S6 — Production Cutover / v1.1.0 Release

Required sequence:

1. exact-head full regression;
2. GitHub/macOS CI;
3. production Status/Doctor;
4. maintenance window begins;
5. stop v1.0 production;
6. fresh verified source backup;
7. final SQLite logical export;
8. record source counts/revisions/digests;
9. prove production Supabase target state;
10. one-time final import;
11. authenticated readback/export;
12. reconcile IDs/counts/revisions/contextDigest;
13. retire one-time import RPC;
14. install v1.1 artifact;
15. start Gateway/runtime nodes;
16. verify exact published tool contract selected by the safety strategy;
17. TEAM continuity canary;
18. continuity_search_history canary;
19. HOST_USER / process_start_host canary;
20. semantic filesystem canary using current focused names;
21. Git/GitHub branch/stage/commit/fetch/pull/push/PR semantic canary;
22. multi-node fresh-chat canary;
23. restart persistence;
24. node revoke canary;
25. post-cutover encrypted backup;
26. recreate/update and privately publish the ChatAgent Business app as required by changed tool definitions;
27. post-publish production smoke;
28. merge release PR;
29. tag `v1.1.0`;
30. publish release artifact;
31. update Product Specification;
32. update User Manual;
33. create DevOps handoff.

Target final status:

```text
ChatAgent Business v1.1.0
PRODUCTION_ACTIVE_V1.1.0
```

Rollback before release acceptance:

```text
v1.1 STOP
-> restore retained v1.0 app/config
-> use untouched original v1 SQLite state
-> v1.0 START
-> mark imported Supabase target abandoned for that attempt
```

Do not treat a partially imported cloud target as a new dual-master source.

---

## 38. Explicit non-goals for v1.1

Do not add as part of this release:

- multi-customer SaaS tenancy;
- enterprise SCIM;
- enterprise SSO hierarchy;
- complex ABAC;
- field-level ACL engine;
- department hierarchy;
- vector database;
- embeddings/RAG/KG/Ontology;
- realtime collaborative UI;
- CRDT;
- offline continuity writes;
- SQLite/Supabase dual-write;
- custom Git hosting;
- custom CI platform;
- custom package registry;
- custom file-sync service;
- fleet-management platform beyond the minimum approved-node lifecycle;
- arbitrary inbound remote-shell exposure to personal devices.

---

## 39. Hard invariants

The following are not relaxed by the SMB/agile orientation:

1. A revoked node cannot perform new Business work.
2. Another member cannot use a member's PERSONAL_NODE as an arbitrary remote host.
3. OS privilege escalation/security bypass is not a normal Business capability.
4. Secrets/Keychain credentials must not be emitted into chat, logs, backups or shared continuity.
5. Organization data isolation is mandatory.
6. OpenAI safety controls are not bypassed by false annotations or hidden effects.
7. External platform authorization/policy is never bypassed.
8. `UNCERTAIN` mutation results are never blindly retried.
9. Continuity context never grants host/file/exec authority.
10. Production v1.0 remains recoverable until v1.1 release acceptance.

---

## 40. Architecture audit closure

The accepted architecture intentionally removes unnecessary policy axes and duplicated governance.

Removed/simplified from earlier drafts:

- `TEAM_EXTENDED` as a separate mode — its semantics become normal `TEAM`;
- separate project `NetworkPolicy` — HOST_USER uses normal host network, ISOLATED remains network-off by default;
- custom Git policy engine — use semantic Git tools plus actual GitHub policy;
- separate internal approval-workflow engine for ordinary work;
- Docker-only STANDARD execution;
- one-company/one-runtime assumption;
- generic-exec-only ordinary developer workflow;
- any fixed MCP tool-count target or ceiling.

Tool count is deliberately not optimized. Tool usefulness, semantic clarity, safety accuracy and model selection quality are optimized instead.

Complexity retained because it is necessary:

- minimal member identity;
- approved/revoked runtime nodes;
- PERSONAL_NODE vs SHARED_NODE;
- TEAM vs PRIVATE;
- HOST_USER vs ISOLATED;
- semantic risk-separated MCP tools;
- Supabase shared continuity;
- minimal authenticated runtime routing;
- local/cloud audit separation.

### 40.1 R3 self-audit findings and closure

The pre-B-S0 self-audit found no architectural contradiction requiring a redesign. Five concrete consistency gaps were corrected in R3:

1. stale public names (`continuity_open` / `continuity_search`) were aligned to the fixed naming contract;
2. `git_clone_repository` was added because remote/BYOD development requires repository acquisition as a normal focused workflow;
3. Personal's sensitive-text guard was promoted into the Business continuity-write contract so TEAM-wide sharing cannot silently persist credentials;
4. explicit per-node logical-project-to-local-path mapping was added so a cloud `projectId` can never grant or accidentally select host filesystem authority;
5. degraded-mode authorization now uses bounded existing token/session/approval leases, eliminating the contradiction between Supabase outage tolerance and node revocation authority.

Audit checks also confirmed:

- no fixed MCP tool-count target remains;
- the current initial semantic inventory has unique names and is allowed to grow/shrink with use cases;
- no stale umbrella Git/process public names remain;
- Personal reuse is the default for overlapping capabilities;
- TEAM/PRIVATE, HOST_USER/ISOLATED, local/cloud audit, and control/continuity separation have distinct responsibilities rather than duplicate policy ownership;
- no custom NetworkPolicy, Git policy engine, custom CI, or custom source-sync subsystem has been reintroduced.

R3 architecture audit result: **PASS — READY FOR B-S0 VALIDATION**.

---

## 41. Definition of Done

ChatAgent Business v1.1.0 may be declared complete only when all of the following are true:

- this Accepted Design is implemented or explicitly amended with evidence;
- the final published MCP tool contract is frozen and tested;
- OpenAI tool annotations match actual behavior;
- ordinary semantic workflows do not suffer unresolved platform safety blocking;
- if required, the Personal safety-compatibility fallback has been executed and revalidated;
- TEAM is the default broad shared collaboration mode;
- PRIVATE isolation works;
- continuity canonical state is Supabase;
- continuity search works;
- continuity writes reject configured secret/credential patterns before persistence;
- each node requires explicit logical-project-to-local-path mapping before host effects;
- degraded authorization never outlives the bounded authenticated token/session/approval lease;
- operation UUID idempotency and revision CAS pass under concurrency;
- completed-task immutability passes;
- multiple approved runtime nodes work;
- PERSONAL_NODE owner isolation passes;
- HOST_USER works at ordinary macOS-user authority;
- ISOLATED regression passes;
- semantic file delete/move works;
- normal Git/PR workflow works without bypassing GitHub policy;
- Supabase outage degrades continuity but preserves valid local work;
- encrypted backup/controlled restore passes;
- v1 continuity is migrated and reconciled;
- existing Business handoff digest semantics are preserved or intentionally versioned with accepted evidence;
- full release-host regression passes;
- GitHub CI passes;
- real ChatGPT Draft canaries pass;
- private workspace publish and post-publish smoke pass;
- restart persistence passes;
- v1.0 remains recoverable through release acceptance;
- Product Specification, User Manual and DevOps handoff are updated.

---

## 42. Change-control rule

This document is the v1.1 canonical design baseline.

Implementation may refine internal names and module boundaries without re-approval if product semantics remain unchanged.

The following require an explicit accepted-design amendment:

- changing TEAM/PRIVATE semantics;
- weakening PERSONAL_NODE ownership isolation;
- changing host privilege assumptions;
- changing the shared continuity authority model;
- changing migration/dual-write policy;
- changing hard invariants;
- adding a new security bypass or credential authority;
- materially changing supported use cases, authority semantics, or tool safety behavior without corresponding accepted evidence/design. Tool count itself is not a protected invariant.

The Safety Compatibility Fallback itself is already accepted and does not require a new product-design debate when its trigger is satisfied; it requires evidence, documentation of the trigger, and re-baselining/retesting of the actual tool surface.

---

## 43. Final accepted statement

ChatAgent Business v1.1 is designed for agile startups and SMBs, including remote and BYOD-heavy teams.

Its core product difference from Personal is not tighter restriction.

It is:

> **Personal-level practical work freedom on approved user devices, plus shared organizational memory, multi-node distributed work, and existing team governance at the points where work becomes shared organizational state.**

The implementation should prefer proven Personal components wherever they already solve host execution, semantic file safety, OpenAI annotation compatibility, Supabase authentication, Keychain custody, concurrency, backup and recovery.

Business-specific engineering should be concentrated on what Personal does not provide: organization/member identity, approved runtime-node routing, TEAM/PRIVATE collaboration, distributed shared continuity, and Business-specific audit/integration semantics.
