# ChatAgent Business — Product Specification v1.0.0

> **Document type:** Product / Technical Specification
> **Product:** ChatAgent Business — SMB Edition
> **Version:** v1.0.0
> **Status:** `PRODUCTION_ACTIVE_V1.0.0`
> **Release scope:** One-organization private ChatGPT Business deployment
> **Last updated:** 2026-10-02 KST
> **Canonical repository:** `exobiz7/chatagent-business` (Private)
> Final release commit: `d6373f8ffef4b3739134f4d14cc300918417553e`
> Final tag: `v1.0.0`

---

## 1. Purpose of this document

This document is the product-level specification for ChatAgent Business v1.0.0.

It defines:

- what the product is,
- the supported deployment model,
- the fixed MCP tool contract,
- authorization and project-boundary rules,
- file mutation and execution safety semantics,
- shared continuity behavior,
- audit / backup / restore behavior,
- operational requirements,
- explicit non-goals and limitations,
- the release boundary that DevOps and future maintenance must preserve.

This document describes the **released product**, not a future roadmap.

For implementation proof and release evidence, refer to:

- `docs/release/CHATAGENT_BUSINESS_RELEASE_v1.0.0.md`
- `docs/verification/B6_FULL_E2E_AND_RELEASE_VERIFICATION.md`
- `docs/approved/CHATAGENT_BUSINESS_ACCEPTED_BASELINE_v0.1.md`

---

## 2. Product summary

ChatAgent Business is a private MCP application for small and medium-sized organizations that allows ChatGPT Business to:

1. work inside explicitly registered local projects,
2. read files and metadata within those project boundaries,
3. perform bounded SAFE file changes,
4. continue shared task context across chats,
5. execute bounded development commands inside isolated Docker containers for STANDARD projects,
6. leave a lightweight operational audit trail,
7. support simple local Start / Stop / Status / Doctor / Backup / Restore operations.

The product is intentionally smaller than a general enterprise automation platform.

### Product one-liner

> **Secure project-scoped local execution and shared continuity for ChatGPT Business teams.**

---

## 3. Target customers and users

### 3.1 Target organizations

Primary target:

- startups,
- small businesses,
- small and medium-sized enterprises,
- approximately 3–100 users,
- teams without a dedicated platform-security or DevOps organization.

### 3.2 Primary personas

**Organization administrator / technical owner**

- registers local projects,
- assigns project profiles,
- operates the local runtime,
- performs backup / restore,
- controls deployment credentials.

**Developer / technical lead**

- reads and edits registered source projects,
- runs isolated tests or scripts in STANDARD projects,
- uses continuity to resume work across chats.

**Operations / marketing / business user**

- reads project files,
- performs approved SAFE edits,
- continues shared project tasks,
- does not need direct shell access.

---

## 4. Product goals

v1.0.0 is designed to provide the smallest useful Business edition that preserves strong boundaries.

Core goals:

1. **Project scope instead of arbitrary host access**
   - every operation is anchored to a registered `projectId`,
   - callers use relative paths only.

2. **Server-side authority**
   - READ_ONLY / SAFE / STANDARD is stored in the registry,
   - the caller or model cannot elevate its own profile.

3. **Safe mutation semantics**
   - create and replace are distinct operations,
   - replacement requires an expected SHA-256,
   - mutation failures are fail-closed,
   - uncertain post-commit states are explicit and non-retryable.

4. **Shared cross-chat continuity**
   - project-scoped tasks,
   - revisioned checkpoints,
   - deterministic handoff digest,
   - explicit FRESH / STALE / UNVERIFIED state.

5. **Bounded isolated execution**
   - disposable Docker containers,
   - non-root,
   - network disabled,
   - bounded resources,
   - no Docker socket,
   - no deployment credential mount.

6. **Simple operations**
   - one deployment per company,
   - small operator command surface,
   - offline operational-state backup and restore.

---

## 5. Explicit non-goals

ChatAgent Business v1.0.0 is **not**:

- a multi-tenant SaaS control plane,
- an enterprise IAM / SCIM / SSO / full RBAC platform,
- a general host shell,
- a remote root / sudo execution system,
- a Docker administration API,
- a package-installation service,
- a general Internet automation layer,
- a native service-control plane,
- an arbitrary delete / move / chmod API,
- an automatic Git commit / push agent,
- an autonomous agent-to-agent transport,
- a workflow builder,
- a fleet-management platform,
- a RAG / vector / graph knowledge platform,
- a public marketplace application.

These boundaries are intentional product constraints.

---

## 6. Deployment model

### 6.1 One company = one deployment

v1.0.0 uses a dedicated deployment model:

```text
One organization
    ↓
One local ChatAgent Business runtime
    ↓
One state root
    ↓
One deployment credential
    ↓
One secure tunnel
    ↓
One private ChatGPT Business app/workspace deployment
```

The product does not multiplex unrelated companies in the same state root.

### 6.2 Released production identity

Current production deployment:

- workspace: **AIspace**
- workspace ID: `d4b71d66-372a-4cff-ad5f-07a3cdbaa55c`
- MCP tunnel: `chatagent-business`
- tunnel ID: `tunnel_6abe54973cb48191a1c54c50ede05748`
- production root: `~/ChatAgentBusiness/production`
- local control plane: `127.0.0.1:31850`
- local tunnel health listener: `127.0.0.1:51950`

### 6.3 Production process supervision

macOS LaunchAgents:

- `com.chatagent.business.server`
- `com.chatagent.business.tunnel`

The tunnel agent uses `RunAtLoad + KeepAlive`.

---

## 7. System topology

```text
ChatGPT Business user
        │
        ▼
Private ChatAgent Business app
        │
        ▼
OpenAI secure MCP tunnel
        │
        ▼
ChatAgent Business control plane
  127.0.0.1:31850
        │
        ├── Project Registry
        ├── Safe File Broker
        ├── Shared Continuity Store
        ├── Audit Ledger
        └── STANDARD Exec Manager
                 │
                 ▼
        Disposable Docker container
```

The ChatGPT app does not receive an arbitrary host root from the caller.

---

## 8. Authority model

### 8.1 Authority chain

The authoritative admission chain is:

```text
deployment credential
    ↓
organization deployment
    ↓
projectId
    ↓
Project Registry
    ↓
enabled state
    ↓
stored profile ceiling
    ↓
tool minimum profile
    ↓
effect admission / denial
```

The caller cannot supply or override the profile.

### 8.2 Profiles

| Profile | Intended capability |
| --- | --- |
| `READ_ONLY` | status, directory/file metadata, file read/hash, read-only continuity |
| `SAFE` | READ_ONLY + bounded file mutation + continuity mutation |
| `STANDARD` | SAFE + isolated command execution |

Exactly these three profiles exist in v1.0.0.

There is no `AUTONOMOUS` profile.

### 8.3 Project Registry

Each registered project has:

- `projectId`
- display name
- canonical host root
- stored profile
- enabled/disabled state

The canonical host root is server-side state and is not accepted from MCP tool arguments.

---

## 9. Fixed MCP contract — 17 tools

The v1.0.0 tool surface is fixed at 17 tools.

| Tool | Minimum profile | Effect | Purpose |
| --- | --- | --- | --- |
| `business_status` | READ_ONLY | Read | bounded product/project readiness status |
| `list_directory` | READ_ONLY | Read | list one project directory |
| `stat_path` | READ_ONLY | Read | read one path's metadata |
| `read_file` | READ_ONLY | Read | bounded UTF-8 file read |
| `hash_file` | READ_ONLY | Read | SHA-256 + size |
| `make_directory` | SAFE | Create | create one new directory |
| `create_file` | SAFE | Create | create one new UTF-8 file only |
| `replace_file` | SAFE | Replace | expected-SHA Safe Replace |
| `apply_patch` | SAFE | Patch | exact-text single-file patch via Safe Replace boundary |
| `continuity_open` | READ_ONLY | Read | open task context and freshness |
| `continuity_start_task` | SAFE | Write | start one shared task |
| `continuity_checkpoint` | SAFE | Write | append revision-checked checkpoint |
| `continuity_prepare_handoff` | READ_ONLY | Read | deterministic bounded handoff |
| `continuity_complete_task` | SAFE | Write | immutable task completion |
| `exec_command` | STANDARD | Execute | start bounded isolated command |
| `read_process` | STANDARD | Read | read owned exec session state/output |
| `terminate_process` | STANDARD | Execute | terminate owned exec session |

No runtime `set_profile` tool exists.

---

## 10. Project/path security contract

### 10.1 Relative-path-only access

MCP file APIs use:

```text
projectId + relativePath
```

They do not accept arbitrary absolute host paths.

### 10.2 Denied path behavior

The implementation rejects or fails closed on:

- absolute path injection,
- `..` traversal,
- root escape,
- symlink escape,
- unsupported special files,
- unsafe project-root replacement,
- direct `.git` mutation.

### 10.3 Project disable behavior

Disabling a project prevents new admitted operations on that project.

---

## 11. SAFE file semantics

### 11.1 Create is not replace

`create_file`:

- succeeds only when the target does not exist,
- never overwrites an existing file.

`replace_file`:

- succeeds only for an existing regular file,
- requires an exact `expectedSha256`,
- does not act as create-if-missing.

### 11.2 Safe Replace contract

The release preserves the Personal-grade Safe Replace model:

```text
read/hash current file
      ↓
expected SHA-256 precondition
      ↓
atomic replacement boundary
      ↓
postcondition verification
      ↓
verified success
   or explicit UNCERTAIN
```

A stale expected hash is refused before replacement.

If the effect may have committed but final confirmation is not trustworthy, the result is **UNCERTAIN** and must not be blindly retried.

### 11.3 Patch semantics

`apply_patch`:

- is single-file,
- requires the current SHA,
- requires exact text context,
- uses the same replacement safety boundary,
- does not provide arbitrary delete/rename behavior.

---

## 12. Shared continuity model

### 12.1 Purpose

Continuity preserves bounded project/task context across independent ChatGPT conversations.

It is **context**, not authority.

Opening a prior task never grants additional file or execution permissions.

### 12.2 Data model

Continuity includes:

- project scope,
- task ID,
- objective,
- revision,
- checkpoints,
- current state,
- next actions,
- verification,
- optional decisions/facts/artifact references,
- completion state,
- deterministic handoff digest.

### 12.3 Concurrency / idempotency

Mutating continuity operations use:

- operation UUIDs for idempotency,
- exact task revision checks,
- immutable completion semantics.

### 12.4 Freshness

`continuity_open` may report:

- `FRESH` — supplied context digest matches the authoritative continuity state,
- `STALE` — task/checkpoint state has advanced,
- `UNVERIFIED` — integrity/freshness cannot be established safely.

`FRESH` means continuity-state freshness only.

It does **not** mean:

- the Git working tree is unchanged,
- files are unchanged,
- an execution is safe to replay,
- current authorization is the same as before.

All real effects must re-check their own current authority and preconditions.

### 12.5 Storage

Continuity uses owner-private SQLite state with integrity material inherited from the Personal memory implementation.

Canonical handoff content is bounded and deterministically pruned toward the 8 KiB target.

---

## 13. STANDARD isolated execution

### 13.1 Eligibility

Execution tools are admitted only for registered, enabled `STANDARD` projects.

A SAFE or READ_ONLY project attempting `exec_command` receives a profile denial before execution effect.

### 13.2 Execution environment

Each `exec_command` runs in a disposable Linux ARM64 Docker container.

Isolation contract:

- selected registered project mounted at `/project`,
- project mount read/write for edit → test workflows,
- nested `/project/.git` read-only when present,
- non-root numeric UID/GID,
- read-only container root filesystem,
- network: `none`,
- `--cap-drop ALL`,
- `no-new-privileges`,
- PID limit: 128,
- memory limit: 512 MiB,
- CPU limit: 2,
- bounded `/tmp` tmpfs: 64 MiB,
- no Docker socket mount,
- no deployment credential mount,
- bounded explicit child environment.

### 13.3 Runtime bounds

- one running exec session at a time per Business runtime,
- maximum command timeout: 15 minutes,
- maximum per-read output: 512 KiB,
- retained session output window: 2 MiB,
- maximum retained session records: 32,
- exec sessions are intentionally non-durable across control-plane recreation.

### 13.4 Network policy

The default and released execution plane has no network access.

v1.0.0 does not provide a package-installation or arbitrary Internet-egress capability.

---

## 14. Audit model

Audit is lightweight and local.

### 14.1 Storage

- owner-private append-only JSONL,
- bounded internal rotation,
- default rotation threshold: approximately 1 MiB.

### 14.2 Recorded information

Effectful audit records contain bounded metadata such as:

- organization/project,
- profile,
- tool,
- effect class,
- target relative path when applicable,
- precondition digest when applicable,
- result code.

### 14.3 Information deliberately excluded

Audit does not intentionally record:

- file contents,
- continuity objective/summary contents as general payload capture,
- exec command text,
- exec output,
- deployment credentials.

---

## 15. Backup and restore

### 15.1 Backup purpose

Backup is an **operational-state backup**, not a complete credential escrow / bare-metal disaster-recovery product.

### 15.2 Included state

The backup boundary contains the operational state required to reproduce the Business control state, including:

- project registry,
- continuity state and integrity material,
- audit state,
- non-secret operator policy/metadata,
- pinned exec image identity when applicable.

### 15.3 Excluded state

The backup intentionally excludes:

- deployment credential,
- secret runtime/API keys,
- Docker executable absolute path,
- customer project file contents.

### 15.4 Restore behavior

Restore:

- verifies the backup bundle,
- restores into a separate destination state root,
- does not overwrite an existing state root,
- still requires separate credential provisioning.

---

## 16. Operator surface

Exactly six user-facing local operator wrappers are released:

```text
ops/Start.command
ops/Stop.command
ops/Status.command
ops/Doctor.command
ops/Backup.command
ops/Restore.command
```

### 16.1 Doctor

Doctor checks key layers independently, including:

- Node version,
- repository/app path,
- state privacy,
- project registry,
- profiles,
- deployment credential file,
- pinned native helpers,
- continuity,
- audit,
- runtime directories,
- control-plane health,
- tunnel health when configured,
- disk/log state,
- Docker executable and pinned exec image.

Doctor fails closed on required preflight failures.

---

## 17. Production state layout

Released production root:

```text
~/ChatAgentBusiness/production/
├── app/
├── app-v1.0.0-rc.1/        # rollback source retained at release
├── state/
│   ├── registry.json
│   ├── continuity/
│   └── audit/
├── projects/
│   ├── docs/
│   ├── ops/
│   └── dev/
├── bin/
├── runtime/
├── logs/
├── backups/
├── restores/
├── deployment.key
├── operator.json
├── RELEASE_STATUS.json
└── RELEASE_STATUS.md
```

Sensitive production files are owner-private.

---

## 18. Runtime / dependency baseline

Validated release baseline:

- macOS production host,
- Node.js: `v24.21.0`,
- `@modelcontextprotocol/sdk`: `1.30.0`,
- Zod: `4.4.3`,
- Docker Desktop validation line: `29.7.2`,
- exec image:
  `node@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6`,
- exec platform: `linux/arm64`.

Node major/minor drift and Docker/image identity changes require explicit maintenance validation.

---

## 19. Key error / denial semantics

Representative fail-closed conditions include:

| Code / state | Meaning |
| --- | --- |
| `BUSINESS_PROFILE_DENIED` | stored project profile is below tool requirement |
| `BUSINESS_PROJECT_UNKNOWN` | projectId is not registered |
| `BUSINESS_PROJECT_DISABLED` | registered project is disabled |
| `BUSINESS_WRITE_CONFLICT` | expected SHA no longer matches |
| `UNCERTAIN` | effect may have committed but confirmation is not trustworthy |
| `EXEC_SESSION_UNKNOWN` | requested exec session is no longer retained/known |
| `UNVERIFIED` | continuity freshness/integrity cannot be safely verified |

Callers must not convert these into optimistic success.

---

## 20. Release acceptance boundary

v1.0.0 passed:

- G1 Contract,
- G2 Security,
- G3 Recovery,
- G4 actual ChatGPT Business Draft canary,
- recreated final-icon Draft canary,
- G5 private workspace publish,
- G5 post-publish production smoke,
- full release-host regression including Docker B5/B6 E2E,
- GitHub hosted macOS CI,
- backup / restore / rollback rehearsal.

Final finding state:

- P0 open: **0**
- P1 open: **0**
- P2 open: **0 known**

---

## 21. Release artifact and provenance

Final tag:

`v1.0.0`

Final release commit:

`d6373f8ffef4b3739134f4d14cc300918417553e`

Release artifact:

`chatagent-business-v1.0.0.tar.gz`

SHA-256:

`31149dd9f6ccf053da0a48a0eb0ca231487512e79f33c9a42d0788e4c7d82f11`

Personal v1.0.0 seed-lineage tag retained in Business history:

`personal-v1.0.0` → `d3279ee948f44f6b8bc66d446be52dc085983eee`

---

## 22. Maintenance invariants

Future DevOps and maintenance work must preserve these invariants unless a new approved product version intentionally changes them:

1. capability is not authority;
2. caller/model input cannot elevate the stored project profile;
3. arbitrary host paths are not MCP inputs;
4. create is not replace;
5. Safe Replace requires a fresh explicit precondition;
6. UNCERTAIN is never treated as safe-to-retry;
7. continuity context never grants authority;
8. STANDARD execution remains project-scoped and isolated;
9. no Docker socket or deployment credential is exposed to exec containers;
10. audit remains bounded and avoids content/secret capture;
11. backup remains operational-state backup unless explicitly redesigned;
12. closed B0–B5 findings are not reopened without new evidence;
13. release claims require real E2E and post-publish evidence, not only unit tests.

---

## 23. Versioning rule

`v1.0.0` is the frozen production baseline.

Any future change that alters:

- the 17-tool contract,
- authority semantics,
- project/path boundary,
- mutation semantics,
- continuity freshness semantics,
- isolation guarantees,
- backup contract,
- authentication / tenant model,

must be treated as a new bounded product-change unit and versioned deliberately.

Routine operational maintenance that does not change product behavior should preserve this specification and record evidence separately.
