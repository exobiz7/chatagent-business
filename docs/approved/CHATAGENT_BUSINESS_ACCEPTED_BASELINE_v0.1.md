# ChatAgent Business (SMB Edition) — Accepted Baseline v0.1

> Accepted: 2026-09-29 KST | Status: ACCEPTED | Scope: normative B0–B6 boundary

## Foundation and target
SMB/startup product for teams without a dedicated platform/security team.
Repository seed = Personal main `9ac3d6df9d3e4616d85083719291af41350da016`.
Functional lineage = Personal v1.0.0 `d3279ee948f44f6b8bc66d446be52dc085983eee`.
P7/P8/P9 are selective references only; Personal/P8 production remains read-only.

## Deployment and authority
One company = one deployment/state root/tunnel/private app; no multi-tenant SaaS.
Projects are admin-registered; external access uses `projectId + relativePath`.
Authority is stored per project: `READ_ONLY / SAFE / STANDARD`.
Published tool contract is stable; server admission resolves project + profile on every call.
No caller/model/tool/header elevation, runtime `set_profile`, or `AUTONOMOUS`.

## Candidate v1 tool contract — 17
Read: `business_status, list_directory, stat_path, read_file, hash_file`.
Safe: `make_directory, create_file, replace_file, apply_patch`.
Continuity: `continuity_open, continuity_start_task, continuity_checkpoint, continuity_prepare_handoff, continuity_complete_task`.
Standard: `exec_command, read_process, terminate_process`.

## Invariants and release path
Create != replace. Mutation = precondition + atomic commit + postcondition verification.
`UNCERTAIN` is fail-closed and not blindly retryable. Memory/continuity never grants authority.
No arbitrary delete, host-root selection, unrestricted shell, root/sudo, Docker socket, .git mutation or automatic push.
File URLs used as filesystem paths must use `fileURLToPath()`.
Freshness means continuity-state freshness, not execution authorization; Git observation is informational.
Backup/Restore v1 covers operational state, not bare-metal credential/secret recovery.
Order: B0 → B1 Org/Projects → B2 Safe Files → B3 Continuity → B4 Audit/Ops + v0.9 SAFE pilot → B5 STANDARD Exec → B6 full E2E/v1.0.
Scope expansion triggers STOP → bounded amendment → explicit user approval.
