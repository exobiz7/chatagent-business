# ChatAgent Business v1.1 — B-S4 Migration / Backup / Ops Integration Closure

Date: 2026-10-12

Status: **B-S4 ACCEPTED / CLOSED**

Production mutation: **NONE**

Production final migration: **NOT PERFORMED**

## Closure basis

B-S4 was defined by four top-level Accepted Design gates:

```text
BUSINESS_S4_MIGRATION_REHEARSAL=PASS
BUSINESS_S4_CONTEXT_DIGEST_PRESERVED=PASS
BUSINESS_S4_BACKUP_RESTORE=PASS
BUSINESS_S4_DEGRADED_MODE=PASS
```

All four now pass.

## B-S4A — Migration foundation

Accepted evidence:

- read-only v1.0 SQLite/HMAC logical exporter;
- logical contract validation;
- one-time migration importer unavailable to authenticated runtime;
- disposable PostgreSQL 16 import/readback/reconciliation;
- v1.0 task/checkpoint identity and revision preservation;
- v1.0 -> v1.1 `contextDigest` parity;
- one-time import surface retirement;
- production v1 source compatibility preflight without export/cutover.

Report:

`docs/verification/v1.1/B_S4A_V1_SQLITE_MIGRATION_REHEARSAL_REPORT_20261012.md`

## B-S4B — Encrypted backup / restore foundation

Accepted evidence:

- Business logical continuity snapshot contract;
- AES-256-GCM encrypted logical archive;
- dedicated macOS Keychain 32-byte backup key;
- native Keychain live create/read/delete canary;
- operator-private logical export/restore functions;
- empty-target restore only;
- member/runtime-node prerequisite validation;
- atomic rollback on missing prerequisite;
- project/private membership/task/checkpoint/operation/event preservation;
- event-chain and logical-digest preservation;
- per-task `contextDigest` preservation;
- wrong-key/tamper/overwrite denial.

Report:

`docs/verification/v1.1/B_S4B_ENCRYPTED_LOGICAL_BACKUP_RESTORE_REPORT_20261012.md`

## B-S4C — Operator integration / degraded continuity

Accepted evidence:

- schemaVersion 2 v1.1 operator configuration;
- existing Status/Doctor/Backup/Restore wrappers dispatch v1 vs v1.1 without breaking v1.0;
- OAuth/publishable-key continuity health separated from operator-only maintenance database access;
- fixed-operation PostgreSQL maintenance adapter using `pg@8.23.1`;
- remote maintenance TLS requirement;
- encrypted operator Backup flow;
- incident/digest/organization/actor-confirmed Restore flow;
- exact empty-target inspection;
- post-restore logical re-export/digest reconciliation;
- Status `NORMAL`/`DEGRADED_CONTINUITY` distinction;
- Doctor backup/continuity/maintenance readiness checks;
- member+project-scoped in-memory project authorization lease;
- actual filesystem, Git and HOST_USER local effects during simulated continuity/control outage;
- continuity mutation fail-closed during outage;
- continuity read explicit `UNVERIFIED / CONTINUITY_UNAVAILABLE`;
- bounded authorization expiry ending degraded local authority;
- no offline continuity queue and no SQLite fallback.

Report:

`docs/verification/v1.1/B_S4C_OPS_DEGRADED_CONTINUITY_REPORT_20261012.md`

## Full regression

Authoritative environment:

```text
Node v24.21.0
npm run test:ci
TEST_CI_EXIT=0
```

B-S4 targeted markers:

```text
BUSINESS_S4A_MIGRATION_CONTRACT=PASS
BUSINESS_S4A_MIGRATION_POSTGRES=PASS
BUSINESS_S4B_BACKUP_CONTRACT=PASS
BUSINESS_S4B_BACKUP_POSTGRES=PASS
BUSINESS_S4C_OPS_CONTRACT=PASS
BUSINESS_S4C_OPS_POSTGRES=PASS
BUSINESS_S4C_DEGRADED_CONTINUITY=PASS
```

## Operational safety result

B-S4 did not:

- stop or modify production v1.0;
- perform final production SQLite export/import;
- mutate production Supabase continuity;
- restore production cloud state;
- create a dual-write path;
- reinstate SQLite as a v1.1 fallback authority;
- widen the authenticated runtime RPC surface for backup/restore;
- merge PR #9 or publish v1.1.

The maintenance database credential is not stored in the operator config. The backup encryption key remains in macOS Keychain and is not stored in the backup archive.

## Runtime state at closure

The existing processes remain unchanged by B-S4C:

```text
Production 31850 = PID 8871
Staging    31861 = PID 83759
Tunnel     51961 = PID 99496
```

Staging remains no-effect for the prior B-S3G canary surface.

## Dependency note

B-S4C introduced exact runtime dependency `pg@8.23.1` for concrete fixed-operation PostgreSQL maintenance access.

`npm audit --omit=dev` reports no advisory attributable to `pg`. The single HIGH result is the pre-existing `@modelcontextprotocol/sdk@1.30.0` OAuth advisory. It is retained as a separate maintenance/revalidation concern rather than silently changing the already-tested MCP/OAuth stack during B-S4 closure.

## Final B-S4 decision

```text
B_S4_ACCEPTED_CLOSED
```

Proceed to Accepted Design B-S5 — Real Multi-Node / Safety / Failure E2E.

The first bounded unit is:

> **B-S5A — Distributed TEAM / Node-Security E2E Foundation**

It should establish A=SHARED_NODE and B/C=PERSONAL_NODE logical participants where practical, then validate TEAM continuity/search visibility, same-revision conflict behavior, PERSONAL_NODE cross-member host isolation, node revoke/re-enrollment, and reuse the B-S4 bounded degraded-authority primitive before the broader Git/GitHub/OpenAI matrix.

Production remains frozen until B-S6 cutover authorization.
