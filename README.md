# ChatAgent Business — SMB Edition

> Current stage: B4 Audit + Ops + SAFE Pilot Gate implemented and locally verified.
> B5 Isolated STANDARD Exec has not started.

Canonical repo: `/Volumes/SSD 4T/z_proj/proj04_chatagent/chatagent_business`

## Foundation

- Seed: ChatAgent Personal main `9ac3d6df9d3e4616d85083719291af41350da016`
- Functional lineage: Personal v1.0.0 `d3279ee948f44f6b8bc66d446be52dc085983eee`
- Runtime baseline: Node `24.21.0`
- Development version: `0.1.0-dev.0`
- Git remote: intentionally unset pending user confirmation.
- P7/P8/P9 remain reference-only; no wholesale merge.

## Current MCP surface — SAFE pilot

B4 keeps the B3 14-tool contract. No exec tool is published yet.

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
```

All project operations still resolve
`projectId → registered root → enabled state → stored profile → tool minimum profile`.
No caller-selected host root or profile elevation exists.

## B4 audit

Effectful SAFE/continuity mutations write a lightweight owner-private JSONL ledger.

Stored fields are bounded metadata only:
request id, timestamp, organization/project, stored profile, tool, effect class,
relative target when applicable, precondition SHA when applicable, and result code.

File contents, continuity summaries/objectives and deployment credentials are not written.
Audit files use bounded internal rotation; there is no arbitrary-delete API.
A committed mutation whose audit append cannot be confirmed returns
`BUSINESS_AUDIT_UNCERTAIN`, `effect=COMMITTED`, `retryable=false`.

## Operator commands

Local wrappers are under `ops/`:

```text
Start.command
Stop.command
Status.command
Doctor.command
Backup.command
Restore.command
```

They use `CHATAGENT_BUSINESS_OPERATOR_CONFIG` when set, otherwise
`~/ChatAgentBusiness/operator.json`.

B4 Start is deliberately SAFE-pilot-only:
- `safePilotMode=true` is mandatory.
- Any enabled `STANDARD` project blocks startup.
- Runtime ownership is tied to PID + server path + unique instance id.
- Health must return the same instance id before the runtime is accepted as RUNNING.

Doctor checks Node pinning, repo/state identity and permissions, registry roots,
SAFE-pilot profile constraints, deployment credential validity, native helper hashes,
continuity, audit, runtime ownership/health, optional tunnel status, disk/log bounds,
and explicitly reports the exec plane as `NOT_IMPLEMENTED_B4`.

## Backup / restore

B4 backup is offline operational-state recovery, not credential escrow.

Included:
- project registry
- continuity SQLite + integrity material
- audit ledger/archives
- bounded non-secret operator policy manifest

Excluded:
- deployment credential / auth file
- external tunnel credential material

The continuity seal key is included because it is required to verify and reopen the
continuity event chain; therefore backup storage must remain owner-controlled/private.

Backup and restore use no-overwrite native directory publication.
Restore always targets a new state root and requires separately provisioned deployment
credentials/operator configuration before that restored state can run.

## Current release boundary

B4 local SAFE pilot has passed actual read/mutate/continuity/restart/audit/backup/restore
workflows on disposable projects. This is not yet the v0.9 private workspace publication:
B6 remains responsible for the final Business app E2E/release path.

No isolated STANDARD execution, root/sudo, Docker socket, generic host shell,
arbitrary delete, automatic Git push, multi-tenant SaaS, or autonomous agent transport
is present.

Normative baseline: `docs/approved/CHATAGENT_BUSINESS_ACCEPTED_BASELINE_v0.1.md`

Verification:
- `docs/verification/B1_PROJECT_BOUNDARY_VERIFICATION.md`
- `docs/verification/B2_SAFE_FILES_VERIFICATION.md`
- `docs/verification/B3_SHARED_CONTINUITY_VERIFICATION.md`
- `docs/verification/B4_AUDIT_OPS_SAFE_PILOT_VERIFICATION.md`
