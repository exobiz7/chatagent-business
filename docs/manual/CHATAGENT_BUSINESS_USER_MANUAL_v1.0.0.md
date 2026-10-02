# ChatAgent Business — User Manual v1.0.0

> **Product:** ChatAgent Business — SMB Edition
> **Version:** v1.0.0
> **Status:** `PRODUCTION_ACTIVE_V1.0.0`
> **Intended users:** workspace users, project administrators, local operators, DevOps maintainers
> **Last updated:** 2026-10-02 KST

---

## 1. What ChatAgent Business does

ChatAgent Business connects ChatGPT Business to explicitly registered local projects through a private MCP application.

It allows users to:

- read registered project files,
- inspect file metadata and hashes,
- create files and directories in SAFE/STANDARD projects,
- safely replace existing files with SHA-256 preconditions,
- apply bounded single-file patches,
- carry project/task context across new chats,
- run isolated commands in STANDARD projects,
- inspect or terminate owned execution sessions.

It does **not** give ChatGPT arbitrary access to the whole computer.

---

## 2. Current production deployment

Current released deployment:

- App: **ChatAgent Business**
- Version: **1.0.0**
- Workspace: **AIspace**
- GitHub: `exobiz7/chatagent-business`
- Tunnel: `chatagent-business`
- Tunnel ID: `tunnel_6abe54973cb48191a1c54c50ede05748`
- Production status: `PRODUCTION_ACTIVE_V1.0.0`

The app is privately published to the Business workspace.

---

## 3. Before using the app

### 3.1 User prerequisites

You need:

1. access to the AIspace ChatGPT Business workspace,
2. access to the private **ChatAgent Business** app,
3. at least one project registered by the organization administrator.

### 3.2 Project permissions are profile-based

Each project has one stored server-side profile:

| Profile | What you can do |
| --- | --- |
| `READ_ONLY` | read/list/stat/hash + read continuity |
| `SAFE` | READ_ONLY + create/replace/patch + continuity writes |
| `STANDARD` | SAFE + isolated command execution |

The profile is attached to the registered project.

You cannot request a higher profile from ChatGPT.

---

## 4. Quick start for normal users

### Step 1 — Open a new ChatGPT Business chat

In the AIspace workspace, select the **ChatAgent Business** app.

### Step 2 — Ask for project status

Example:

```text
ChatAgent Business의 등록 프로젝트와 각 profile 상태를 확인해 줘.
```

The app uses `business_status`.

### Step 3 — Work by projectId

Typical registered projects in the current release fixture are:

- `docs` — READ_ONLY
- `ops` — SAFE
- `dev` — STANDARD

Actual production/customer deployments may register different project IDs.

### Step 4 — Always use project-relative paths

Correct:

```text
projectId: dev
relativePath: src/index.js
```

Do not use host absolute paths in MCP requests.

---

## 5. Recommended interaction model

For reliable work, structure requests around:

```text
projectId
→ inspect/read
→ verify current state
→ perform bounded effect
→ verify postcondition
```

For edits:

```text
read/hash
→ get current SHA-256
→ replace/patch with expected SHA
→ re-read/re-hash
```

For execution:

```text
read
→ safe edit
→ exec in STANDARD project
→ read_process
→ fix if necessary
→ rerun
```

---

## 6. Tool reference

## 6.1 Status

### `business_status`

Purpose:

- display product version,
- organization metadata,
- registered project IDs,
- stored profiles,
- enabled/available state,
- readiness for SAFE/continuity/audit/exec.

Example request:

```text
ChatAgent Business의 현재 버전과 등록 프로젝트 상태를 보여 줘.
```

---

## 6.2 Read tools

### `list_directory`

Lists one registered project directory.

Typical inputs:

- `projectId`
- optional `relativePath`
- optional pagination

Example:

```text
dev 프로젝트의 src 디렉터리 파일 목록을 보여 줘.
```

### `stat_path`

Reads bounded metadata for one project path.

Example:

```text
dev 프로젝트의 package.json 파일 상태를 확인해 줘.
```

### `read_file`

Reads bounded UTF-8 content from one regular file.

Example:

```text
docs 프로젝트의 README.txt를 읽어 줘.
```

### `hash_file`

Returns SHA-256 and file size.

Use this before replacement.

Example:

```text
ops 프로젝트의 config/app.json SHA-256을 계산해 줘.
```

---

## 6.3 SAFE file tools

SAFE tools require a SAFE or STANDARD project.

### `make_directory`

Creates exactly one new directory.

It does not silently succeed over an existing directory.

Example:

```text
ops 프로젝트에 reports 디렉터리를 새로 만들어 줘.
```

### `create_file`

Creates a new UTF-8 file only.

Important:

- target must not already exist,
- it never overwrites.

Example:

```text
ops 프로젝트에 reports/weekly.md 파일을 새로 만들고
내용은 "# Weekly Report"로 해 줘.
```

### `replace_file`

Safely replaces one existing regular file.

Required flow:

1. read/hash the current file,
2. obtain the current SHA-256,
3. call `replace_file` with that SHA,
4. verify final content/hash.

Example prompt:

```text
ops 프로젝트의 settings.json을 읽고 SHA-256을 확인한 다음,
현재 SHA를 precondition으로 사용해서 내가 요청한 새 내용으로 안전하게 교체해 줘.
교체 후 다시 hash_file로 검증해.
```

### If the SHA is stale

The operation fails.

Do not force a replacement.

Re-read the file, determine what changed, and decide again.

### If the result is UNCERTAIN

Do **not** blindly retry.

First inspect the actual file state with read/hash.

### `apply_patch`

Applies one exact-text replacement inside one file.

It requires:

- current expected SHA,
- exact old text,
- replacement text,
- optionally an expected occurrence count.

Recommended for small targeted modifications.

Example:

```text
dev 프로젝트의 config.js에서
"DEBUG = false"를 "DEBUG = true"로 바꾸되,
먼저 현재 SHA를 확인하고 apply_patch를 사용해.
수정 후 다시 읽어서 검증해.
```

---

## 7. File-safety rules users should know

ChatAgent Business rejects unsafe path/effect patterns.

Do not expect these to work:

- absolute host paths,
- `../` project escape,
- symlink escape,
- direct `.git` modification,
- arbitrary delete,
- arbitrary move/rename,
- chmod/chown,
- write outside a registered project.

These are product boundaries, not missing prompts.

---

## 8. Shared Continuity

Continuity lets a team resume a task in a fresh chat without depending on hidden conversation history.

Five tools are available:

- `continuity_open`
- `continuity_start_task`
- `continuity_checkpoint`
- `continuity_prepare_handoff`
- `continuity_complete_task`

---

## 9. Starting a shared task

Use a SAFE or STANDARD project.

Example:

```text
ops 프로젝트에서 새 continuity task를 시작해.

objective:
Prepare October product launch checklist

작업 시작 후 taskId와 revision을 알려 줘.
```

The system creates a task ID.

Keep the returned `taskId` when you want to explicitly refer to that task later.

---

## 10. Adding a checkpoint

A checkpoint captures the bounded current state.

Example:

```text
현재 continuity task에 checkpoint를 추가해.

summary:
Landing page copy completed

currentState:
Copy reviewed; image assets still pending

nextActions:
- finalize hero image
- verify tracking links

verification:
Copy reviewed in current workspace file

현재 task revision을 정확히 사용해.
```

Checkpoint writes are revision-checked.

If another chat already advanced the task, a stale revision must not overwrite the newer state.

---

## 11. Preparing a handoff

Example:

```text
현재 task를 다음 채팅에서 이어갈 수 있도록
continuity_prepare_handoff를 실행하고
taskId와 contextDigest를 알려 줘.
```

The handoff is deterministic and bounded.

---

## 12. Opening the task in a fresh chat

In a new ChatGPT chat:

```text
ChatAgent Business로 아래 continuity task를 열어 줘.

projectId: ops
taskId: <TASK_ID>
expectedContextDigest: <CONTEXT_DIGEST>
```

Possible freshness results:

| Result | Meaning |
| --- | --- |
| `FRESH` | continuity state matches the supplied digest |
| `STALE` | task state changed after the prior handoff |
| `UNVERIFIED` | integrity/freshness could not be safely verified |

Important:

`FRESH` means only that the continuity state matches.

It does not prove that project files or Git state are unchanged.

---

## 13. Completing a task

Example:

```text
현재 continuity task가 완료됐어.
현재 revision을 확인하고 continuity_complete_task로 완료 처리해.
```

Completion is immutable.

Do not use task completion as a casual status toggle.

---

## 14. STANDARD execution

Execution is available only in STANDARD projects.

### Typical use

```text
dev 프로젝트에서 테스트를 실행해.

command:
npm test
```

ChatAgent Business starts the command inside the isolated exec plane.

It does not run arbitrary command text directly in the macOS host shell.

---

## 15. Reading process output

If `exec_command` returns a running session:

```text
방금 exec_command로 시작한 sessionId의 상태와 출력을
read_process로 확인해.
terminal 상태까지 필요한 만큼 확인해.
```

Do not poll forever.

Terminal states should end the status loop.

---

## 16. Terminating an execution

Example:

```text
dev 프로젝트의 해당 sessionId 실행을 terminate_process로 종료해.
```

Only an owned STANDARD session can be terminated.

---

## 17. Execution isolation users should expect

STANDARD commands run with the following released constraints:

- Linux ARM64 disposable container,
- selected project mounted at `/project`,
- project files writable,
- `.git` read-only,
- root filesystem read-only,
- network disabled,
- non-root user,
- no Docker socket,
- no deployment credential,
- bounded memory / CPU / PID / output / timeout.

### Practical consequence

A command such as:

```text
npm install
```

is not expected to work as a network package-install operation in the released STANDARD plane.

Dependencies required for isolated tests should already be available in the project/container workflow.

---

## 18. Recommended development loop

For STANDARD projects:

```text
1. read_file / hash_file
2. replace_file or apply_patch
3. exec_command
4. read_process
5. inspect failure
6. safe edit
7. rerun
8. verify
```

This is the intended v1.0.0 developer workflow.

---

## 19. Common denial examples

### SAFE project attempts exec

Expected:

`BUSINESS_PROFILE_DENIED`

This is correct behavior.

### READ_ONLY project attempts file creation

Expected:

profile denial.

### Replacement with old SHA

Expected:

`BUSINESS_WRITE_CONFLICT`

Re-read before deciding what to do.

### Unknown projectId

Expected:

`BUSINESS_PROJECT_UNKNOWN`

Ask the administrator to inspect the registry.

### Disabled project

Expected:

`BUSINESS_PROJECT_DISABLED`

An administrator must re-enable it.

### Old exec session

Expected:

`EXEC_SESSION_UNKNOWN`

Execution sessions are intentionally bounded and not permanently retained.

---

## 20. Prompt patterns for end users

### Read-only review

```text
docs 프로젝트의 <relative path> 파일을 읽고 핵심 내용을 요약해.
파일은 수정하지 마.
```

### Safe file edit

```text
ops 프로젝트의 <file>을 먼저 read_file + hash_file로 확인한 뒤,
현재 SHA를 precondition으로 사용해 요청한 변경을 replace_file로 수행해.
변경 후 다시 read/hash해서 검증해.
```

### Small patch

```text
dev 프로젝트의 <file>에서 정확히 <old text>만 <new text>로 변경해.
현재 SHA 확인 후 apply_patch를 쓰고 결과를 재검증해.
```

### Dev test loop

```text
dev 프로젝트의 관련 파일을 확인하고,
필요한 SAFE 수정 후 STANDARD exec로 테스트해.
실패하면 출력 근거를 보고 다시 수정하되,
각 replace 전에 현재 SHA를 다시 확인해.
```

### Cross-chat handoff

```text
현재 작업을 continuity checkpoint로 저장하고
prepare_handoff를 실행해 taskId와 contextDigest를 알려 줘.
```

---

# Part II — Administrator Guide

## 21. Administrator responsibilities

The organization administrator controls:

- organization initialization,
- project registration,
- project profile selection,
- enable/disable state,
- production operator configuration,
- deployment credential lifecycle,
- backup/restore,
- tunnel/app publication.

These are not end-user MCP authority controls.

---

## 22. Production paths

Current reference production layout:

```text
~/ChatAgentBusiness/production/
```

Important files:

```text
operator.json
deployment.key
state/registry.json
RELEASE_STATUS.json
RELEASE_STATUS.md
```

Do not place these files in Git.

---

## 23. Project administration CLI

The low-level project admin script is:

```text
scripts/business/business-admin.mjs
```

It requires:

```text
CHATAGENT_BUSINESS_STATE_DIR
```

For the current production deployment:

```bash
export CHATAGENT_BUSINESS_STATE_DIR="$HOME/ChatAgentBusiness/production/state"
```

### Initialize organization

For a new deployment only:

```bash
node scripts/business/business-admin.mjs   organization init   <organizationId>   "<displayName>"
```

Do not reinitialize an existing production state root.

### Add a project

```bash
node scripts/business/business-admin.mjs   project add   <projectId>   "<displayName>"   "/absolute/canonical/project/root"   READ_ONLY
```

Profile may be:

- `READ_ONLY`
- `SAFE`
- `STANDARD`

Example:

```bash
node scripts/business/business-admin.mjs   project add   website   "Corporate Website"   "/Users/example/projects/website"   SAFE
```

### List projects

```bash
node scripts/business/business-admin.mjs project list
```

### Inspect one project

```bash
node scripts/business/business-admin.mjs project inspect website
```

### Disable a project

```bash
node scripts/business/business-admin.mjs project disable website
```

### Enable a project

```bash
node scripts/business/business-admin.mjs project enable website
```

---

## 24. Selecting project profiles

Use the lowest profile that supports the actual job.

### READ_ONLY

Use for:

- documentation repositories,
- source review,
- audit/reference folders,
- repositories ChatGPT should never modify.

### SAFE

Use for:

- content projects,
- operational documents,
- controlled configuration edits,
- projects that need file mutation but not code execution.

### STANDARD

Use only when isolated command execution is actually required.

Examples:

- software development,
- test execution,
- local build scripts that work without network access.

Do not assign STANDARD simply for convenience.

---

# Part III — Operator / DevOps Guide

## 25. Operator configuration

The six `.command` wrappers use:

```text
CHATAGENT_BUSINESS_OPERATOR_CONFIG
```

If not set, they default to:

```text
~/ChatAgentBusiness/operator.json
```

Current production config is:

```text
~/ChatAgentBusiness/production/operator.json
```

Recommended shell setup:

```bash
export CHATAGENT_BUSINESS_OPERATOR_CONFIG="$HOME/ChatAgentBusiness/production/operator.json"
```

Production app root:

```text
~/ChatAgentBusiness/production/app
```

---

## 26. Status

Run:

```bash
"$HOME/ChatAgentBusiness/production/app/ops/Status.command"
```

Expected healthy production signals include:

- `state = RUNNING`
- `healthy = true`
- `safeFilesReady = true`
- `continuityReady = true`
- `auditReady = true`
- `execReady = true`
- `execHealthy = true`

---

## 27. Doctor

Run:

```bash
"$HOME/ChatAgentBusiness/production/app/ops/Doctor.command"
```

Expected release-host result:

```text
ok = true
runtime = RUNNING / healthy
tunnel = HTTP_200
exec_plane = READY_B5
```

Use Doctor before:

- production start after maintenance,
- app/tunnel republish,
- Node/Docker upgrades,
- backup/restore cutover,
- release smoke.

---

## 28. Start

Run:

```bash
"$HOME/ChatAgentBusiness/production/app/ops/Start.command"
```

Start performs preflight checks before launching the runtime.

Do not bypass a Doctor/preflight failure by manually starting the Node server.

---

## 29. Stop

Run:

```bash
"$HOME/ChatAgentBusiness/production/app/ops/Stop.command"
```

Stop verifies owned process identity before termination.

It also cleans owned exec containers.

Do not kill a process by PID alone as a normal operating procedure.

---

## 30. Backup

### Named backup

```bash
"$HOME/ChatAgentBusiness/production/app/ops/Backup.command"   before-maintenance-20261002
```

### Automatic-name backup

```bash
"$HOME/ChatAgentBusiness/production/app/ops/Backup.command"
```

Expected success includes:

- `verified = true`
- `excludesDeploymentCredential = true`

### Recommended times to back up

- before product upgrades,
- before state migration,
- before changing project registry structure,
- before credential/tunnel reconfiguration,
- before restore/cutover tests.

---

## 31. Restore

Restore syntax:

```bash
"$HOME/ChatAgentBusiness/production/app/ops/Restore.command"   <backupName>   <restoreName>
```

Example:

```bash
"$HOME/ChatAgentBusiness/production/app/ops/Restore.command"   before-maintenance-20261002   restore-validation-20261002
```

Restore does not overwrite the existing production state.

It creates a separate restored state directory under the configured restore root.

### Important

A restored state still needs a separately provisioned deployment credential before it can be promoted into an independent deployment.

---

## 32. Production tunnel checks

Current health endpoints:

```bash
curl -fsS http://127.0.0.1:51950/healthz
curl -fsS http://127.0.0.1:51950/readyz
```

Healthy values:

```text
live
ready
```

The production tunnel LaunchAgent is:

```text
com.chatagent.business.tunnel
```

---

## 33. LaunchAgent checks

### Server

```bash
launchctl print "gui/$(id -u)/com.chatagent.business.server"
```

### Tunnel

```bash
launchctl print "gui/$(id -u)/com.chatagent.business.tunnel"
```

Both should be loaded.

The tunnel should be running under normal operation.

---

## 34. Release status files

Production release identity is recorded in:

```text
~/ChatAgentBusiness/production/RELEASE_STATUS.json
~/ChatAgentBusiness/production/RELEASE_STATUS.md
```

These files are owner-private.

For v1.0.0 they should identify:

- `PRODUCTION_ACTIVE_V1.0.0`
- tag `v1.0.0`
- release commit `d6373f8ffef4b3739134f4d14cc300918417553e`

---

## 35. Git / release verification

Canonical repo:

```text
/Volumes/SSD 4T/z_proj/proj04_chatagent/chatagent_business
```

Expected production baseline:

```bash
git branch --show-current
# main

git status --short
# no output

git rev-parse HEAD
# d6373f8ffef4b3739134f4d14cc300918417553e

git rev-list -n1 v1.0.0
# d6373f8ffef4b3739134f4d14cc300918417553e
```

---

## 36. Test commands

### Full release-host suite

Requires the production-class Mac environment with Docker available.

```bash
npm test
```

This includes:

- Personal inherited regression,
- B1 boundary tests,
- B2 safe-file tests,
- B3 continuity tests,
- B4 audit/ops tests,
- B5 real Docker isolated exec E2E,
- B6 release E2E.

### GitHub hosted macOS suite

```bash
npm run test:ci
```

This runs:

- Personal inherited suite,
- B1–B4,
- B5/B6 syntax/static gates.

The hosted macOS runner does not provide the production Docker Desktop daemon used by the B5/B6 exec E2E.

---

## 37. Upgrade safety checklist

Before changing Node, Docker, tunnel-client, native helpers, or release source:

1. run `Status.command`,
2. run `Doctor.command`,
3. create a verified backup,
4. record current Git SHA/tag,
5. keep a rollback source,
6. apply one bounded maintenance change,
7. run relevant tests,
8. run full release-host tests when runtime behavior can change,
9. restart production,
10. confirm Doctor,
11. confirm tunnel `live/ready`,
12. run an effect-minimized ChatGPT Business smoke,
13. record the maintenance evidence.

---

## 38. Incident response — first checks

If users report that the app is unavailable:

### 1. Check production status

```bash
"$HOME/ChatAgentBusiness/production/app/ops/Status.command"
```

### 2. Run Doctor

```bash
"$HOME/ChatAgentBusiness/production/app/ops/Doctor.command"
```

### 3. Check tunnel

```bash
curl -fsS http://127.0.0.1:51950/healthz
curl -fsS http://127.0.0.1:51950/readyz
```

### 4. Check LaunchAgents

```bash
launchctl print "gui/$(id -u)/com.chatagent.business.server"
launchctl print "gui/$(id -u)/com.chatagent.business.tunnel"
```

### 5. Do not immediately change state

Collect evidence first.

Avoid:

- deleting state directories,
- deleting unknown process records,
- broad `git clean`,
- broad `git reset --hard`,
- deleting backups,
- replacing deployment credentials without a recovery plan.

---

## 39. Troubleshooting table

| Symptom | First interpretation | First action |
| --- | --- | --- |
| App cannot see a project | unknown/disabled/unavailable project | `business_status` + admin `project inspect` |
| SAFE edit denied | profile below SAFE or project disabled | inspect registry profile/state |
| Replace conflict | file changed since hash | re-read + re-hash |
| Result is UNCERTAIN | commit confirmation incomplete | inspect postcondition; do not blind retry |
| Continuity STALE | task advanced | reopen current task state |
| Continuity UNVERIFIED | integrity/freshness uncertain | stop relying on prior digest; investigate state |
| Exec denied | project is not STANDARD | inspect project profile |
| Exec session unknown | session retention expired/restarted | treat session as unavailable; do not infer success |
| Tunnel not ready | tunnel/backend/control-plane issue | Doctor + health/ready + LaunchAgent |
| Doctor fails exec plane | Docker binary/image/pin mismatch | do not Start until resolved |

---

## 40. Backup / credential distinction

A successful Backup does not mean the deployment credential is backed up.

This is intentional.

Operational state and deployment identity are separate responsibilities.

Never assume a restored backup can authenticate automatically without separately provisioning the required credential.

---

## 41. Security guidance for administrators

- Register only project roots that actually need ChatAgent access.
- Prefer READ_ONLY unless writes are required.
- Prefer SAFE unless command execution is required.
- Do not register `/`, the user home root, or overly broad roots.
- Do not expose deployment credentials in project files.
- Do not mount secrets into STANDARD project directories just to make them accessible to exec.
- Do not add the Docker socket to the execution environment.
- Do not weaken `.git` read-only behavior for convenience.
- Do not convert path/profile denials into prompt-side workarounds.

---

## 42. What users should do when a tool is denied

A denial is often the correct outcome.

Recommended response:

1. identify the actual reason,
2. inspect project/profile/state,
3. decide whether the requested effect is genuinely needed,
4. if necessary, ask an administrator to make an explicit registry change,
5. retry only after the authoritative state is changed.

Do not ask the model to “ignore” the restriction.

---

## 43. What users should do when context and files disagree

Continuity is context, not the source of truth for project files.

If a checkpoint says one thing but the current file says another:

1. treat the current file/project state as current evidence,
2. investigate why continuity is stale,
3. checkpoint the corrected current state,
4. prepare a new handoff.

Do not execute a stale plan simply because continuity is FRESH relative to an old task digest.

---

## 44. Recommended team operating pattern

A small team can use:

### READ_ONLY project

For:

- policies,
- reference docs,
- finalized specs.

### SAFE project

For:

- operational documents,
- content,
- configuration with controlled edits.

### STANDARD project

For:

- software development,
- automated tests,
- local build/verification.

This keeps authority proportional to the actual workflow.

---

## 45. Release / rollback references

Current final release:

`v1.0.0`

Final commit:

`d6373f8ffef4b3739134f4d14cc300918417553e`

Final source artifact SHA-256:

`31149dd9f6ccf053da0a48a0eb0ca231487512e79f33c9a42d0788e4c7d82f11`

Retained release-time rollback source:

```text
~/ChatAgentBusiness/production/app-v1.0.0-rc.1
```

Release-time operational backups include:

- `pre-private-publish`
- `pre-v1.0.0-code-deploy`

---

## 46. Support boundary for v1.0.0

Supported:

- registered-project read,
- SAFE file mutation,
- shared continuity,
- STANDARD isolated exec,
- audit,
- operator start/stop/status/doctor,
- operational backup/restore,
- private workspace MCP deployment.

Not supported:

- multi-tenant SaaS,
- arbitrary delete,
- arbitrary host shell,
- privileged execution,
- Internet/package installation,
- Git commit/push automation,
- per-user RBAC,
- SSO/SCIM,
- autonomous agent transport.

Requests outside these boundaries should be treated as product-change proposals, not normal operator actions.

---

## 47. DevOps handoff rule

After v1.0.0:

- do not restart B0–B6 feature development by default,
- do not reopen closed findings without new evidence,
- treat production incidents as evidence-first maintenance work,
- keep changes small and reversible,
- preserve authority, mutation, continuity, isolation, audit and recovery contracts,
- record release/maintenance evidence separately from product intent.

The canonical product behavior is defined by:

1. this manual,
2. `docs/product/CHATAGENT_BUSINESS_PRODUCT_SPECIFICATION_v1.0.0.md`,
3. `docs/release/CHATAGENT_BUSINESS_RELEASE_v1.0.0.md`,
4. the tagged `v1.0.0` source.
