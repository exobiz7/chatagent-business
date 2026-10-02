# B4 Audit + Ops + SAFE Pilot Gate — Verification Record

> Date: 2026-10-01 KST
> Baseline: B3 `c66d79a3253b4cf878ce45fd88550b840e5f604b`
> Branch: `feat/business-b4-audit-ops-safe-pilot`
> Result: LOCAL IMPLEMENTATION / VERIFICATION PASS

## Scope implemented

B4 adds only the accepted SAFE-pilot operations layer:

- owner-private lightweight audit ledger
- bounded audit/log rotation
- `Start.command`
- `Stop.command`
- `Status.command`
- `Doctor.command`
- `Backup.command`
- `Restore.command`
- verified operational-state backup/restore
- local SAFE pilot gate

B4 does **not** implement `exec_command`, `read_process`, `terminate_process`,
isolated execution, general shell, package installation, Internet egress control,
native service management or any B5 STANDARD-exec feature.

## Audit contract

Audit is a local append-oriented JSONL ledger; no new service/database is introduced.

Effectful operations audited:
- `make_directory`
- `create_file`
- `replace_file`
- `apply_patch`
- `continuity_start_task`
- `continuity_checkpoint`
- `continuity_complete_task`

Recorded metadata:
- request id / timestamp
- organization id
- project id
- authoritative stored profile
- tool / effect class
- bounded relative path when applicable
- precondition SHA-256 when applicable
- result code

Not recorded:
- file contents
- continuity objectives/summaries/current state
- deployment credential
- arbitrary headers or prompts

Read-only tools and handoff reads are not ledgered in B4.

If the primary mutation commits but audit persistence fails, the response becomes
`BUSINESS_AUDIT_UNCERTAIN` with `effect=COMMITTED`, `retryable=false` and
`audit=UNCERTAIN`. The committed mutation is not replayed automatically.

## Operator runtime ownership

The operator runtime uses an owner-private runtime record containing PID and a random
instance id. Start launches:

`node business-mcp-server.mjs --business-instance=<instanceId>`

A process is treated as owned only when same-UID process observation matches:
- pinned Node executable
- exact Business server path
- recorded instance id in argv

The health endpoint must independently return the same instance id.
Stop refuses unknown/stale/identity-mismatched records instead of terminating an
unverified process.

## SAFE pilot gate

B4 requires:
- `safePilotMode=true`
- continuity enabled
- audit enabled
- no enabled `STANDARD` project
- pinned native helper hashes
- valid private deployment credential
- valid registered project roots

Tests verified:
- `safePilotMode=false` is rejected before runtime effect
- enabled `STANDARD` project is rejected before runtime effect
- B4 MCP still exposes exactly 14 B3 tools
- no exec tool exists
- `business_status.exec = NOT_IMPLEMENTED_B4`

## Doctor coverage

Doctor verifies or reports:
- exact Node version
- canonical repo/server identity
- state-root ownership/permissions
- project registry and enabled roots
- SAFE pilot profile gate
- deployment credential format/permissions
- four pinned native helper hashes
- continuity state
- audit state
- runtime/log/backup/restore directories
- owned runtime status
- HTTP control-plane health
- optional tunnel health
- free disk/log size
- exec plane as explicitly `NOT_IMPLEMENTED_B4`

An intentionally incorrect native helper SHA was detected as
`OPS_NATIVE_HELPER_HASH_MISMATCH` without credential disclosure.

## Backup / restore boundary

Backup is offline and requires the managed Business runtime to be stopped.

Included:
- `registry.json`
- continuity SQLite snapshot + signed head + continuity seal key
- audit JSONL/rotated archives
- non-secret operator-policy manifest
- SHA-256 manifest for backed-up files

Explicitly excluded:
- deployment credential/auth file
- credential path
- state/runtime absolute-path configuration
- tunnel secrets

The continuity seal key is integrity/recovery material required to reopen the event chain;
the backup must therefore be stored in owner-controlled private storage.

Both backup publication and restore publication use the pinned no-overwrite native
directory publisher. Restore only creates a new state root; an existing destination is
refused.

The restored state was reopened and verified for:
- same organization/project registry
- same SAFE project profile
- same continuity task/checkpoint and context digest
- audit ledger availability

A restored state was then started as a separate B4 runtime using an externally
provisioned deployment credential; the credential was not recovered from the backup.

## Actual SAFE pilot workflow

The B4 focused E2E performed:

```text
Doctor stopped preflight
→ Start
→ Status RUNNING / B4
→ tools/list = 14 / no exec
→ SAFE create
→ Safe Replace
→ READ_ONLY mutation denial
→ continuity start/checkpoint/handoff
→ audit verification / secret-content absence
→ forced audit-write failure after committed create
→ explicit COMMITTED + audit UNCERTAIN / no replay
→ Stop
→ Start
→ continuity resume
→ new checkpoint/handoff
→ Stop
→ verified Backup
→ disposable Restore
→ restored registry/continuity/audit verification
→ restored B4 runtime Start
→ restored continuity_open FRESH
→ Stop
→ broken Doctor fixture detection
→ SAFE-pilot mode false denial
→ enabled STANDARD project denial
→ all six clickable operator command wrappers
→ final Doctor
```

All disposable fixtures and runtimes were cleaned.

## Focused result

`npm run test:business:b4`

Result:

`BUSINESS_B4_AUDIT_OPS_SAFE_PILOT=PASS`

## Full regression

Final B4 full-suite run before closure:

- inherited Personal standalone suite: `34/34 PASS`
- B1 Organization + Project Boundary: PASS
- B2 Safe Files: PASS
- B3 Shared Continuity: PASS
- B4 Audit + Ops + SAFE Pilot Gate: PASS
- process exit: 0

The full suite was run again after the final runtime-ownership tightening
(PID + server path + instance-id ownership), SAFE-pilot-mode enforcement, and
actual execution coverage for all six clickable operator command wrappers.
That final exact-worktree run also passed with process exit code 0.

## Residual / deferred

- No production Business tunnel/private app publication yet.
- No v0.9 private workspace pilot publication yet.
- No STANDARD isolated execution yet.
- No per-user RBAC/SSO.
- No credential escrow/bare-metal disaster recovery.
- No automatic backup scheduling.
- No arbitrary cleanup/delete API.
- Failed outer backup/restore stages are retained as owner-private reconciliation
  evidence rather than recursively deleted through a general cleanup facility.

## Next unit

`B5 Isolated STANDARD Exec`

The SAFE-pilot operational boundary is frozen here; B5 may add only the accepted
three isolated execution tools and must not weaken B1–B4 authority/recovery contracts.

## Rollback

Return to B3 commit `c66d79a3253b4cf878ce45fd88550b840e5f604b`
to remove the complete B4 unit without modifying Personal or P8.
