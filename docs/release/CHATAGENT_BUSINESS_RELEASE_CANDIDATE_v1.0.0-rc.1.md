# ChatAgent Business — Release Candidate Manifest v1.0.0-rc.1

> Product: ChatAgent Business — SMB Edition
> Candidate: `v1.0.0-rc.1`
> Date: 2026-10-01 KST
> Status: **LOCAL RELEASE CANDIDATE — NOT YET EXTERNALLY RELEASED**

## Lineage

- Business seed: ChatAgent Personal main `9ac3d6df9d3e4616d85083719291af41350da016`
- Personal functional lineage: v1.0.0 `d3279ee948f44f6b8bc66d446be52dc085983eee`
- B0 foundation: `7b72e9967957523aa9d9a2483887f9f5d0be4dff`
- B1 project boundary: `85d273a3f2509df84fbbef90aa22233a26d9f239`
- B2 safe files: `83f46b942fb612acd59bffc8d77c069d4811db21`
- B3 shared continuity: `c66d79a3253b4cf878ce45fd88550b840e5f604b`
- B4 audit/ops/safe pilot: `100b8b8d58dddf374deeef9df099408fc5b1c1aa`
- B5 isolated STANDARD exec: `167df3aa33fc5c7191ab1768545ca8a8d7f74f82`
- B6 candidate commit: resolved by local tag `v1.0.0-rc.1` after final verification

## Runtime pins

- Node: `v24.21.0`
- MCP SDK: `1.30.0`
- Zod: `4.4.3`
- macOS target: Apple Silicon
- Docker Desktop test line: `29.7.2`
- Exec image: `node@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6`
- Exec image ID: `sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6`
- Exec platform: `linux/arm64`

## Fixed v1 candidate tool snapshot — 17

### Status
- `business_status`

### READ
- `list_directory`
- `stat_path`
- `read_file`
- `hash_file`

### SAFE
- `make_directory`
- `create_file`
- `replace_file`
- `apply_patch`

### CONTINUITY
- `continuity_open`
- `continuity_start_task`
- `continuity_checkpoint`
- `continuity_prepare_handoff`
- `continuity_complete_task`

### STANDARD
- `exec_command`
- `read_process`
- `terminate_process`

No arbitrary delete, caller profile setter, Docker-control tool, package installer,
service-control tool, Git commit/push tool, root/sudo tool or generic host-shell tool exists.

## Authority model

`projectId → registered canonical root → enabled state → stored profile → tool minimum profile`

Profiles: READ_ONLY / SAFE / STANDARD.
No caller/model/header elevation is accepted.

## Core safety invariants

- Create != replace
- Safe Replace = expected SHA → atomic commit → postcondition verification
- `UNCERTAIN` is fail-closed / non-retryable
- Continuity is context, never authority
- Project-relative paths only
- `.git` mutation blocked in file tools and read-only in STANDARD exec
- STANDARD exec is disposable, network-none, non-root, capability-dropped
- no Docker socket/credential mount
- audit stores metadata, not content/command/output/credential

## Operator surface

- `Start.command`
- `Stop.command`
- `Status.command`
- `Doctor.command`
- `Backup.command`
- `Restore.command`

## RC operational root

`~/ChatAgentBusiness/release-candidate-v1.0.0-rc.1`

State at manifest time:
- runtime: stopped after local read-only smoke
- Doctor: PASS
- pre-publish backup: `pre-publish-rc1`
- deployment credential: separately provisioned and excluded from backup
- tunnel: `chatagent-business` / `tunnel_6abe54973cb48191a1c54c50ede05748`
- Git remote: `https://github.com/exobiz7/chatagent-business.git`
- ChatGPT Business workspace: AIspace / `d4b71d66-372a-4cff-ad5f-07a3cdbaa55c`
- production root: `~/ChatAgentBusiness/production`
- production pre-publish backup: `pre-private-publish`

## Release gates

- G1 Contract: PASS
- G2 Security: PASS
- G3 Recovery: PASS
- G4 local E1-E6 equivalent: PASS
- G4 actual ChatGPT Business Draft app fresh-chat canary: PASS
- G4 recreated final-icon Draft app read-only canary: PASS
- G5 local RC Doctor/Start/Smoke/Backup/Rollback: PASS
- G5 production root/tunnel promotion: PASS
- G5 private workspace publish/post-publish smoke: PENDING

## Severity at local RC boundary

- P0 open: 0
- P1 open: 0
- P2 open: 0 known

## External prerequisites before final v1.0.0

1. Publish the verified ChatAgent Business Draft app to the AIspace private workspace.
2. Run effect-minimized post-publish production smoke.
3. Confirm production backup/rollback boundary once more.
4. Merge approved RC to Business `main`.
5. Create/push final `v1.0.0` tag and mark RELEASED.

Until those pass, this manifest authorizes only `v1.0.0-rc.1`, not final `v1.0.0 RELEASED`.
