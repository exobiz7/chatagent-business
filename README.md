# ChatAgent Business — SMB Edition

> Status: **PRODUCTION_ACTIVE_V1.0.0**
> Private AIspace workspace publish and post-publish production smoke completed successfully.

Canonical repo: `/Volumes/SSD 4T/z_proj/proj04_chatagent/chatagent_business`

## Foundation

- Seed: ChatAgent Personal main `9ac3d6df9d3e4616d85083719291af41350da016`
- Functional lineage: Personal v1.0.0 `d3279ee948f44f6b8bc66d446be52dc085983eee`
- Runtime baseline: Node `24.21.0`
- Release version: `1.0.0`
- GitHub: `exobiz7/chatagent-business` (Private)
- P7/P8/P9 remain read-only reference inputs; no wholesale P8 merge.

## Fixed v1.0.0 MCP contract — 17 tools

```text
business_status

list_directory
stat_path
read_file
hash_file

make_directory
create_file
replace_file
apply_patch

continuity_open
continuity_start_task
continuity_checkpoint
continuity_prepare_handoff
continuity_complete_task

exec_command
read_process
terminate_process
```

Authority remains server-side:

`projectId → registered canonical root → enabled state → stored profile → tool minimum profile`

Profiles are exactly `READ_ONLY / SAFE / STANDARD`.
The caller cannot supply a host root or elevate a profile.

## B5 STANDARD execution plane

The three exec tools are available only when the operator explicitly enables the B5
exec plane and the selected project has stored profile `STANDARD`.

Each `exec_command` runs in a disposable Linux arm64 Docker container.
The control plane invokes only a bounded, fixed Docker lifecycle; user command text is
never executed by the macOS host shell.

Current pinned base image:

```text
node@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6
image id: sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6
platform: linux/arm64
```

Docker CLI itself is operator-configured by canonical absolute path + SHA-256 and is
verified by Doctor before B5 startup.

### Isolation contract

Each disposable exec container is created with:

- selected registered project mounted at `/project` only
- project mount read/write for the accepted edit → test loop
- nested `/project/.git` read-only when Git metadata exists
- non-root numeric UID/GID
- read-only container root filesystem
- `--network none`
- `--cap-drop ALL`
- `no-new-privileges`
- PID limit 128
- memory limit 512 MiB
- CPU limit 2
- bounded 64 MiB `/tmp` tmpfs
- no Docker socket mount
- no control/deployment credential mount
- bounded explicit child environment
- package-manager network use disabled by environment defaults

Project preflight rejects unsupported Git indirection, Git symlinks/special files,
hard-linked files and unsupported special files before starting execution.

This is container isolation for the selected project execution plane. It is not a claim
that ChatAgent can sandbox an already-malicious process running as the same macOS host user.

### Process/session bounds

- one running exec session at a time per Business runtime
- maximum 32 retained session records
- maximum timeout 15 minutes
- maximum per-read output 512 KiB
- retained output window 2 MiB
- process output returned as base64 + sequence cursor
- explicit truncation / `hasMore`
- session/project ownership rechecked by `read_process` and `terminate_process`
- sessions are intentionally non-durable across control-plane recreation
- owned containers are cleaned on startup and shutdown

Docker Desktop on macOS can briefly lag after Personal-derived Darwin atomic file-swap
replacement. B6 release E2E reproduced one 0.5-second visibility miss, so the exec
container now waits 1.5 seconds after the bind mount starts before launching the user
command. This is internal transport settling; callers do not
need to add a delay between Safe Replace and a test rerun.

## B4 SAFE mode remains available

The B4 SAFE pilot remains unchanged when exec is not configured:

- `safePilotMode=true`
- exec disabled
- enabled `STANDARD` projects rejected by the B4 startup gate
- 14-tool B3/B4 surface only

B5 STANDARD mode requires:

- `safePilotMode=false`
- `exec.enabled=true`
- pinned Docker CLI path/SHA
- pinned exec image reference and image ID
- B1–B4 continuity/audit/native prerequisites

Doctor refuses a missing/mismatched Docker binary, wrong image ID/platform, or an attempt
to silently enable exec while still declaring SAFE-pilot mode.

## Audit / continuity / backup

B1–B4 guarantees remain in force.

Exec audit records bounded effect metadata only:
- `EXEC_START` for `exec_command`
- `EXEC_TERMINATE` for `terminate_process`
- organization/project/profile/tool/result metadata

Command text, process output and deployment credentials are not written to the audit ledger.

Operational backup records the non-secret pinned exec image identity when B5 is enabled,
but does not store the Docker executable absolute path or deployment credential.

## Operator commands

```text
ops/Start.command
ops/Stop.command
ops/Status.command
ops/Doctor.command
ops/Backup.command
ops/Restore.command
```

B5 Start/Stop uses the same PID + server path + runtime instance-id ownership contract
established in B4. Stop waits for exec cleanup and refuses unverified process ownership.

## Current boundary

B5 provides the accepted startup/dev-team loop:

```text
read source
→ safe edit / Safe Replace
→ isolated test
→ read output
→ repair
→ isolated rerun
```

Network remains `none` by default. B5 does not add a package installer, Internet egress,
Docker-control MCP tool, service-control plane, arbitrary host shell, arbitrary delete,
Git commit/push, root/sudo, or durable remote shell.

B6 local release-candidate hardening is complete: E1–E6, backup/restore, previous-B5
rollback rehearsal, exact 17-tool contract, release-candidate runtime Doctor/Start/Stop,
and effect-minimized local smoke all pass.

External release validation is complete. `exobiz7/chatagent-business` is the private GitHub
repository, tunnel `tunnel_6abe54973cb48191a1c54c50ede05748` is live for AIspace workspace
`d4b71d66-372a-4cff-ad5f-07a3cdbaa55c`, the Draft canaries passed, the final-icon app was
privately published, and the published app passed the effect-minimized production smoke.

Normative baseline:
`docs/approved/CHATAGENT_BUSINESS_ACCEPTED_BASELINE_v0.1.md`

Verification:
- `docs/verification/B1_PROJECT_BOUNDARY_VERIFICATION.md`
- `docs/verification/B2_SAFE_FILES_VERIFICATION.md`
- `docs/verification/B3_SHARED_CONTINUITY_VERIFICATION.md`
- `docs/verification/B4_AUDIT_OPS_SAFE_PILOT_VERIFICATION.md`
- `docs/verification/B5_ISOLATED_STANDARD_EXEC_VERIFICATION.md`
- `docs/verification/B6_FULL_E2E_AND_RELEASE_VERIFICATION.md`
- `docs/release/CHATAGENT_BUSINESS_RELEASE_CANDIDATE_v1.0.0-rc.1.md`
- `docs/release/CHATAGENT_BUSINESS_RELEASE_v1.0.0.md`
