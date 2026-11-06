# B-S6C — v1.0 Production Runtime Recovery / Independent Closure

Date: 2026-10-28 KST
Status: V1_PRODUCTION_RECOVERY_ACCEPTED_CLOSED
Authority: explicit user instruction to proceed with B-S6C after the bounded recovery proposal.
Scope: **v1.0 runtime record quarantine, official verified backup, single v1.0 Start, postcondition verification**.
Release status: **B-S6 CUTOVER NOT STARTED / v1.1 NOT RELEASED**.
Prohibited and not performed: v1.1 data import, Supabase target mutation, v1.1 install, PR #9 Ready/merge, release tagging, public app republish, v1.0 code change, destructive record deletion.

## 1. Root cause evidence and bounded action

The v1.0 production runtime record was created on Oct 2 and held PID 8871. Mac Studio rebooted Oct 14; the old PID was no longer present. The installed v1.0 operator correctly refused to Start in STALE_RECORD state (OPS_RUNTIME_RECONCILIATION_REQUIRED). The original process's terminating cause is not proven; the reboot-to-record-mismatch mechanism is strongly evidenced.

Before any effect:
- Confirmed the exact v1.0 installed business-ops code matches canonical file SHA.
- Confirmed server PID 8871 absent, port 31850 free and no v1.0 business-mcp-server process.
- Confirmed production LaunchAgent not running; no active v1.0 process or untracked port owner.
- Confirmed existing backup snapshots pre-private-publish and pre-v1.0.0-code-deploy have matching manifest SHA for their seven listed files each. Presence/hash alone does not prove full restore.
- Confirmed pinned Node v24.21.0, Docker daemon reachable and expected production app/runtime ownership.
- Captured original record bytes and SHA-256, configuration hash, and SQLite/WAL/SHM/registry/audit file digests into owner-private incident evidence before mutation.

Exactly one stale record was then atomically renamed from the runtime directory into an owner-private incident directory on the same filesystem; the original record bytes were independently copied and preserved. A directory fsync and inode/byte comparison verified the reversible quarantine.

Owner-private incident identifier: bs6c-recovery-20261028T062223Z-071b2525. This is not a public path, and its sensitive files are not tracked by Git.

## 2. Official pre-start backup / Doctor / Start

After exact Status STOPPED:
- Installed v1.0 operator Backup called once.
- Backup identifier: bs6c-v1-prestart-20261028T0624Z.
- Official product backup returned verified=true and excludesDeploymentCredential=true.
- Manifest and all 7 listed file SHA-256 values independently matched the backup contents.
- Installed v1.0 Doctor before Start passed all 15 required checks; the optional tunnel check also passed HTTP 200.
- Installed v1.0 operator Start called **exactly once** and returned RUNNING, healthy=true, phase=B5, execReady=true.
- No start retry, no PID kill, no reset, no database restore.

## 3. Independent post-start verification

- New v1.0 owned PID **38634**; PID is different from stale record 8871.
- Installed v1.0 Status: RUNNING / healthy=true; safeFilesReady=true, continuityReady=true, auditReady=true, execReady=true, execHealthy=true.
- OS process UID, Node binary, server module and exact instance marker matched the new durable runtime record.
- Production /health on TCP 31850 returned ready=true, phase=B5, matching instance ID and readiness fields.
- Installed v1.0 Doctor after Start passed **all 15 required checks**; tunnel health 51950 HTTP 200.
- Official pre-start backup SHA-256 values remained valid.
- Both owner-private copies of the prior stale record still match; the live runtime record now contains the new process identity.
- B-S6A exact-head preflight on pre-B-S6C HEAD 28ad25e32e0c2096e7dc6bb700b7dc6d04e4010c returned PRECHECKS_ELIGIBLE_NOT_CUTOVER_AUTHORIZED, blockers=[]; canonical and canary main protection, two hosted check-runs, and PR #9 DRAFT all verified.

## 4. Residual and non-claims

- An actual ChatGPT Business published-app fresh-chat post-recovery smoke was **not** performed in this unit. Local production /health, operator Doctor and continuity/audit readiness passed.
- Full machine reboot and restart persistence are **not verified**. The v1.0 operator currently prevents unsafe reuse of a stale PID, but may again need approved reconciliation after an unexpected host reboot. Do not bypass or auto-delete the record.
- Manifest-verified backup does not independently prove end-to-end restore; prior B6 rollback rehearsal remains distinct historical evidence.
- A healthy v1.0 service does not authorize v1.1 migration/cutover. Accepted Design §37 still requires an explicitly approved maintenance window, final source backup/export/reconciliation, target proof, app publication, release approval and subsequent canaries.
- The initial incident source hash, runtime credentials, private source files and original instance ID are retained in owner-private custody, never in public GitHub.

## 5. Accepted scope and follow-up

Recovery gate: V1_PRODUCTION_RECOVERY_PASS. Cutover gate: IN_PROGRESS / NOT_AUTHORIZED.
No automatic changes to release PR, published app, tags, v1.0 source or GitHub governance.
Next bounded unit: B-S6D production fresh-chat read-only smoke and cutover-ready release dossier assessment, then request separate explicit cutover approval. Reboot-safety policy should be considered before v1.1 production acceptance.

## 6. Regression evidence

- Authoritative Node: v24.21.0.
- Mac Studio release-host npm run test:ci: PASS, exit 0, 100 seconds. Existing Docker/PostgreSQL effect gates retained.
- Mac Studio npm run test:ci:hosted: PASS, exit 0, 74 seconds.
- B-S6A and B-S6B targeted contract regressions: PASS.
- New release HEAD hosted GitHub Actions must pass independently after this closure report commit.
- Private operational source/incident and full backup materials remain outside Git.
