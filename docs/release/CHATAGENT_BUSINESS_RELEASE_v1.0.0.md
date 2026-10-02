# ChatAgent Business — Release v1.0.0

> Product: ChatAgent Business — SMB Edition
> Version: `v1.0.0`
> Date: 2026-10-02 KST
> Status: **PRODUCTION_ACTIVE_V1.0.0**

## Release lineage

- Personal seed: `9ac3d6df9d3e4616d85083719291af41350da016`
- Personal functional lineage: `d3279ee948f44f6b8bc66d446be52dc085983eee`
- B0: `7b72e9967957523aa9d9a2483887f9f5d0be4dff`
- B1: `85d273a3f2509df84fbbef90aa22233a26d9f239`
- B2: `83f46b942fb612acd59bffc8d77c069d4811db21`
- B3: `c66d79a3253b4cf878ce45fd88550b840e5f604b`
- B4: `100b8b8d58dddf374deeef9df099408fc5b1c1aa`
- B5: `167df3aa33fc5c7191ab1768545ca8a8d7f74f82`
- RC tag: `v1.0.0-rc.1`

## External release identity

- GitHub: `exobiz7/chatagent-business` (Private)
- ChatGPT Business workspace: AIspace
- Workspace ID: `d4b71d66-372a-4cff-ad5f-07a3cdbaa55c`
- OpenAI organization: `org-7Hn67wnw1fS6FxQ79Rr4zLN4`
- App: `ChatAgent Business`
- Visibility: AIspace workspace private
- Secure MCP tunnel: `chatagent-business`
- Tunnel ID: `tunnel_6abe54973cb48191a1c54c50ede05748`

## Fixed v1.0.0 tool contract — 17

- `business_status`
- READ: `list_directory`, `stat_path`, `read_file`, `hash_file`
- SAFE: `make_directory`, `create_file`, `replace_file`, `apply_patch`
- Continuity: `continuity_open`, `continuity_start_task`, `continuity_checkpoint`, `continuity_prepare_handoff`, `continuity_complete_task`
- STANDARD: `exec_command`, `read_process`, `terminate_process`

No arbitrary delete, caller-controlled profile, Docker-control MCP tool, generic host shell,
package installer, root/sudo, service control, or automatic Git commit/push is exposed.

## Release gates

- G1 Contract: PASS
- G2 Security: PASS
- G3 Recovery: PASS
- G4 actual ChatGPT Business Draft fresh-chat canary: PASS
- G4 recreated final-icon Draft app read-only canary: PASS
- G5 private workspace publish: PASS
- G5 post-publish effect-minimized production smoke: PASS

Published-app post-publish smoke verified:
- `business_status`
- `docs/README.txt` read
- continuity digest freshness

Tunnel evidence recorded three production MCP commands at 14:17 KST for the published app.

## Production runtime

- Root: `~/ChatAgentBusiness/production`
- App: `~/ChatAgentBusiness/production/app`
- State: `~/ChatAgentBusiness/production/state`
- Projects: `~/ChatAgentBusiness/production/projects/{docs,ops,dev}`
- Control plane: `127.0.0.1:31850`
- Tunnel health: `127.0.0.1:51950`
- Server LaunchAgent: `com.chatagent.business.server`
- Tunnel LaunchAgent: `com.chatagent.business.tunnel`
- Tunnel mode: RunAtLoad + KeepAlive

Production credentials are separately provisioned, mode 0600, excluded from Git and operational backup.

## Backup / rollback

- RC pre-publish backup: `pre-publish-rc1`
- RC post-canary backup: `draft-canary-pass`
- Production pre-private-publish backup: `pre-private-publish`
- Previous-B5 rollback rehearsal: PASS
- Restored-state continuity verification: PASS

## Runtime pins

- Node: `v24.21.0`
- MCP SDK: `1.30.0`
- Zod: `4.4.3`
- Docker Desktop validation line: `29.7.2`
- Exec image: `node@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6`
- Exec platform: `linux/arm64`

## Severity closure

- P0 open: 0
- P1 open: 0
- P2 open: 0 known

## Operational rule

Do not reopen B0–B5 findings without new evidence.
All future changes start from a bounded maintenance/feature unit and must preserve the v1.0.0 authority, recovery, continuity, audit, and release contracts.
