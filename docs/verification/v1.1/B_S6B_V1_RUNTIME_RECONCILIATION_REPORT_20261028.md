# B-S6B — v1.0 Production Runtime Reconciliation: Diagnostic Evidence and Recovery Plan

Date: 2026-10-28 KST
Scope: production read-only diagnosis, deterministic regression, and proposed bounded operator recovery.
Result: **DIAGNOSIS ACCEPTED / PRODUCTION RECOVERY NOT AUTHORIZED / B-S6 CUTOVER NO-GO**
Normative cutover authority: Accepted Design §37.
Owner mutation approval: NOT GRANTED.

## 1. Proven causal sequence and remaining uncertainty

- Production runtime record was durably written **2026-10-02 14:37:01 KST** (recorded PID 8871, port 31850).
- Mac Studio host rebooted **2026-10-14 09:25:45 KST**, after that record was written. This was verified with the OS boot timestamp and reboot history.
- Installed v1.0 operator Status now returns **STALE_RECORD / healthy=false**, recorded PID 8871. The actual process is absent.
- Server LaunchAgent reports **not running**, last exit code **1**. Launch stderr last modified Oct 14 13:12 and contains **OPS_RUNTIME_RECONCILIATION_REQUIRED**.
- Production server port 31850 is unreachable, while its separate tunnel health 51950 responds HTTP 200.
- The v1.0 implementation explicitly checks a durable runtime record against a real PID, OS user, executable path, server path and business instance ID. If the recorded process is absent or not the same instance, Status returns STALE_RECORD. Start refuses any prior state other than STOPPED with OPS_RUNTIME_RECONCILIATION_REQUIRED. It does **not** silently overwrite the record or start a second server.

**Diagnosis:** The host reboot left an old process identity record, so the LaunchAgent's subsequent start failed closed. Classification: STALE_AFTER_HOST_REBOOT_CONSISTENT. This explains the present refusal to start. Evidence does not establish the original process's last termination signal or fully exclude additional environmental faults. No runtime failure should be described as data corruption based solely on this evidence.

## 2. Source / backup preservation findings

- v1.0 original source SQLite file exists, regular, owner-private; WAL and SHM sidecars also exist.
- Initial immutable, read-only inspection of the base SQLite reported PRAGMA quick_check = ok, 2 tables. This validates basic database-file structure, **not** full logical continuity, WAL reconciliation, backup correctness, or successful restore.
- Existing production backup directories: pre-private-publish, pre-v1.0.0-code-deploy. Directory presence does not prove that either is current, authentic, or restorably complete.
- The source SQLite modification time remained unchanged in the B-S6A diagnostic. B-S6B did not alter SQLite, sidecars, runtime record, LaunchAgents, credentials, logs or provider settings.
- No raw config, key, OAuth subject, backup contents, runtime instance ID or private host path is included in this public-repository report.
- Do not open production SQLite in write mode, checkpoint its WAL, vacuum, copy it inconsistently with sidecars, or perform restore during read-only diagnosis.

## 3. Repeatable evidence tool

Script: scripts/business/v1.1/bs6b-runtime-reconciliation-probe.mjs
Contract: scripts/business/v1.1/bs6b-runtime-reconciliation-contract-test.mjs

Run on the authorized production Mac Studio:
    npm run probe:business:bs6b

The probe reads only operator config metadata, runtime record, process identity, current boot timestamp, LaunchAgent status, localhost health, and source/backup existence. It emits sanitized enums/counts and exits nonzero when recovery is required. It cannot mutate or repair the runtime. The contract test uses disposable mock records and proves output classification while preserving record/config bytes and mtime.

Expected current observation:
- diagnosis = STALE_AFTER_HOST_REBOOT_CONSISTENT
- verdict = NO_GO_RECONCILIATION_REQUIRED
- repairPerformed = false
- cutoverPerformed = false

## 4. Separately approved bounded recovery runbook (NOT EXECUTED)

**Approval gate R0 — explicit owner authorization for v1.0-only maintenance.** Record the exact intended operation and approved window; distinguish this from any later B-S6 cutover approval. Protect source SQLite, backup archives and production credential. Do not enable v1.1 or migrate.

**R1 — fresh read-only identity / exclusivity check.**
1. Confirm installed v1.0 Status is STALE_RECORD; exact recorded PID is absent or has no matching uid/node path/server path/instance ID. An existing unknown/occupied PID, open 31850 listener, or matching live instance is an immediate STOP, not a reason to force termination.
2. Read LaunchAgent state/exit code; establish tunnel and host boot identity; ensure no second v1.0 process exists for the recorded instance.
3. Confirm expected operator config, binary version v24.21.0 and launch pin hashes/permissions. No change to any credential or production data.

**R2 — capture reversible evidence before any record mutation.**
1. Produce an owner-private, authenticated incident snapshot of the *stale record and relevant config metadata*, with source and recorded SHA-256 and explicit original file mode/owner. Record verified source SQLite plus WAL/SHM identity and a logically consistent source backup through approved operator mechanisms as appropriate.
2. Preserve the original runtime record bytes. Do not delete, zero, truncate or replace it in place.
3. Protect the incident artifacts from automatic cleanup or public Git commit; verify access permissions and hashes.

**R3 — exact reversible reconciliation only after R0/R1/R2 all PASS.**
1. Stop/suspend any automatic v1.0 server re-launch for this one bounded maintenance window if required; retain tunnel.
2. Atomically quarantine **only** the confirmed stale runtime record by exclusive same-filesystem rename into owner-private incident custody, with a unique non-overwriting destination and directory sync. No broad cleanup, no filesystem reset, no SQLite touch.
3. Verify no application process or port occupancy; ask installed v1.0 Status to return STOPPED, not STALE_RECORD. Any discrepancy STOP; do not try start repeatedly.

**R4 — controlled start and postconditions.**
1. Invoke the approved installed v1.0 operator Start exactly once under the original app/config, not v1.1. If it returns an uncertain effect, inspect owned process and durable identity first; never blindly retry.
2. Require Status RUNNING + healthy, exact new process/instance binding, the v1.0 /health endpoint ready, LaunchAgent process ownership checked, and full required Doctor checks PASS (not just tunnel health).
3. Run read-only published-app smoke/continuity digest check; confirm original SQLite continuity remains unmodified except for documented, explicitly approved runtime needs.
4. Verify restart persistence via a separate approved test only after base recovery PASS. Do not assume a single healthy start proves reboot-safe recovery.

**R5 — abort / rollback.** If R3 completed but R4 failed, do not blindly restore old stale record over any live process. First prove exact process/port/record state, preserve evidence, stop only an owned process by approved operator controls, then return to the recorded safe baseline or require a new incident authorization. An old stale record is not itself a healthy rollback state. Stop and request operator review if data/digest integrity is uncertain.

No part of R0–R5 is currently authorized or executed. An approved R3/R4 restores v1.0 only; **it is not authority for B-S6 migration, PR merge, release tagging, public app publication or production cutover.**

## 5. Acceptance and subsequent pre-cutover gate

B-S6B diagnostic can close after successful no-effect regression with a NO-GO production state. Production recovery closure requires R0 approval and independent R1–R4 evidence including source preservation and verified v1.0 healthy Status/Doctor. Then rerun B-S6A exact-head preflight; only after all requirements of §37 are satisfied may the owner separately approve a B-S6 cutover window.

Do not substitute prior B-S4 migration rehearsals or B-S5 live canaries for fresh production recovery and one-time final source verification.

## 6. Validation and package hygiene

Authoritative Node: v24.21.0.

- B-S6B deterministic disposable record contract: PASS.
- Mac Studio release-host full test:ci: PASS, 98 seconds, including real Docker/PostgreSQL E2E.
- Mac Studio test:ci:hosted: PASS, 73 seconds.
- Canonical GitHub-hosted push/PR CI for this new documentation/probe commit must be independently rechecked after push.
- Precommit syntax/JSON/diff and added-line credential scan are mandatory before publishing.
