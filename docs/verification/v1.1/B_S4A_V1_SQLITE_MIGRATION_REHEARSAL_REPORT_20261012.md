# ChatAgent Business v1.1 — B-S4A v1 SQLite Migration Rehearsal Report

Status: **ACCEPTED / CLOSED**

Date: 2026-10-12

Scope: v1.0 SQLite logical export, logical-contract validation, one-time disposable PostgreSQL import, authenticated readback/reconciliation, v1 handoff digest preservation, temporary importer retirement.

Production final migration: **NOT PERFORMED**.

## 1. Accepted scope

B-S4A implements the migration foundation required by the Accepted Design without creating a dual-master state or importing production continuity early.

The bounded workflow is:

```text
v1 SQLite source
-> read-only HMAC/integrity verification
-> canonical organization logical bundle
-> empty-target one-time importer
-> disposable PostgreSQL 16 target
-> authenticated readback/export
-> count / identity / revision / contextDigest reconciliation
-> importer retirement
```

The real v1.0 production service remains active and untouched.

## 2. Cross-version handoff digest finding

During B-S4A, a cross-version compatibility gap was found in the v1.1 handoff helper.

v1.0 handoff digest basis did not include task `startedAt` or `completedAt`, while the initial v1.1 B-S2C basis did. That meant a semantically identical migrated task could produce a different `contextDigest` even when all continuity state had been preserved.

The v1.1 helper was corrected so:

- `startedAt` and `completedAt` remain present in the user-visible v1.1 handoff response;
- they are excluded from the digest basis to preserve the existing Business v1.0 digest contract;
- checkpoint `createdAt` remains in the digest basis because it was already part of the v1.0 contract.

Existing B-S2C response behavior remains compatible and cross-version digest parity is now explicitly tested.

## 3. v1 SQLite logical exporter

Implemented:

```text
scripts/business/v1.1/migration/v1-sqlite-logical-export.mjs
scripts/business/v1.1/migration/bs4-export-v1-continuity.mjs
```

The exporter:

- opens `memory.sqlite` read-only;
- verifies SQLite integrity and schema version;
- verifies the owner-private seal key and sealed head;
- verifies every HMAC-linked v1 event from genesis through the exact sealed head;
- refuses a source whose SQLite event count and signed head are not exactly reconciled;
- validates organization/project/task/checkpoint/operation identity;
- never exports local `hostRoot` values or the memory seal key;
- produces a stable canonical payload plus SHA-256 logical digest;
- exports project metadata, task/checkpoint identity and revisions, normalized continuity events, and per-task source handoff digests;
- refuses disabled v1 projects because v1.1 currently has no equivalent project-enabled state and silent semantic loss is forbidden.

The CLI creates a new output artifact with mode `0600` and refuses overwrite.

Operator form:

```text
npm run migrate:business:v1-export -- \
  --source-state-dir <ABSOLUTE_STOPPED_V1_STATE_DIR> \
  --output <NEW_PRIVATE_JSON_PATH>
```

The CLI prints only bounded organization/count/digest metadata and does not echo source host roots.

## 4. Migration normalization contract

v1 `PROJECT` memory events are not copied into the v1.1 continuity event chain.

They are normalized into v1.1 control-plane logical project rows. Therefore:

```text
source PROJECT event
-> target private_business_control.logical_projects
```

The v1 continuity mutations map one-to-one:

```text
TASK       -> TASK_STARTED
CHECKPOINT -> CHECKPOINT_APPENDED
COMPLETE   -> TASK_COMPLETED
```

Task IDs, checkpoint IDs, task revisions, objective/state content, arrays, task timestamps, checkpoint timestamps and completion state are preserved.

The importer reconstructs target operation input hashes and the target event hash chain using the v1.1 schema, rather than copying legacy HMAC hashes into PostgreSQL.

## 5. One-time importer

Implemented:

```text
scripts/business/v1.1/migration/bs4-one-time-import.sql
scripts/business/v1.1/migration/bs4-retire-one-time-import.sql
```

Temporary function:

```text
public.bc_import_snapshot(jsonb, uuid)
```

The importer requires:

- source organization slug equals the already-provisioned target organization slug;
- migration actor is an active ADMIN member;
- target logical-project and continuity state is empty;
- canonical payload and SHA-256 digest agree;
- project profiles and TEAM collaboration contract are representable;
- task/checkpoint revisions are internally consistent;
- source event ordering is monotonic;
- all generated target operations/events form a valid v1.1 event chain.

The function is explicitly revoked from:

```text
public
anon
authenticated
```

It is therefore not a normal ChatAgent runtime RPC. It is a migration-owner/admin SQL surface only.

After accepted import/readback, the retirement script drops the function entirely.

## 6. Disposable PostgreSQL 16 rehearsal

A disposable v1 fixture was created with:

- two logical projects;
- two tasks;
- two checkpoints;
- one completed task;
- five normalized continuity operations/events;
- seven raw v1 events including the two legacy `PROJECT` registration events.

The complete rehearsal passed:

```text
BUSINESS_S4A_MIGRATION_CONTRACT=PASS
BUSINESS_S4A_MIGRATION_POSTGRES=PASS
```

Verified properties:

- source `registry.json`, `memory-seal.key`, `memory-head.json` and `memory.sqlite` hashes are unchanged by export/rehearsal;
- repeated exports have the same canonical payload and logical digest;
- tampered payload is rejected by digest validation;
- CLI artifact is `0600` and no-overwrite;
- empty PostgreSQL target import succeeds;
- repeat import into the now non-empty target fails closed with `BUSINESS_MIGRATION_TARGET_NOT_EMPTY`;
- temporary importer is not executable by `authenticated`;
- target project/task/checkpoint identity and revisions match source;
- target event chain verifies;
- authenticated `bc_export_snapshot` counts reconcile with the normalized source;
- every migrated task reproduces the exact v1.0 handoff `contextDigest`;
- temporary importer can be retired and is absent afterward.

## 7. Production v1 read-only compatibility preflight

No production export/import was performed.

The active v1 production registry was inspected read-only only to determine whether the source shape is compatible with the new exporter.

Sanitized state:

```text
organizationId = release-org
registry revision = 4
projects = 3

 dev  = STANDARD / enabled
 docs = READ_ONLY / enabled
 ops  = SAFE / enabled
```

The live continuity store currently contains three raw events:

```text
PROJECT    1
TASK       1
CHECKPOINT 1
```

All current production projects are enabled, so the exporter's fail-closed disabled-project rule is not a current production blocker.

Important final-cutover requirement:

> The production v1.1 Supabase organization must be provisioned with organization slug `release-org` before the final one-time import.

The current staging organization slug is a staging identity and must not be treated as the production migration target identity.

## 8. Regression

Authoritative runtime:

```text
Node v24.21.0
```

Targeted:

```text
BUSINESS_S2C_HANDOFF_CONTRACT=PASS
BUSINESS_S2C_HANDOFF_CLIENT=PASS
BUSINESS_S4A_MIGRATION_CONTRACT=PASS
BUSINESS_S4A_MIGRATION_POSTGRES=PASS
```

Full regression:

```text
npm run test:ci
TEST_CI_EXIT=0
```

No B-S4A disposable PostgreSQL container remains.

## 9. Runtime / production effect

B-S4A performs no production migration and no staging Supabase import.

The existing production, staging and tunnel listeners were not replaced or reconfigured by this unit.

B-S3 staging remains with temporary safety effects disabled.

## 10. Gate decision

B-S4A itself is accepted and closed.

The migration rehearsal and context-digest preservation requirements are sufficiently proven on a disposable PostgreSQL 16 target:

```text
BUSINESS_S4_MIGRATION_REHEARSAL=PASS
BUSINESS_S4_CONTEXT_DIGEST_PRESERVED=PASS
```

This does **not** mean the production cutover has occurred. Final stopped-source export and production target import remain B-S6 cutover actions.

Remaining B-S4 top-level gates:

```text
BUSINESS_S4_BACKUP_RESTORE=PENDING_BS4B
BUSINESS_S4_DEGRADED_MODE=PENDING_LATER_UNIT
```

## 11. Next bounded unit

Next:

```text
B-S4B — Encrypted Logical Continuity Backup / Restore Foundation
```

Required scope:

- reuse/adapt the Personal AES-256-GCM logical backup pattern;
- keep backup encryption key in macOS Keychain, not in the backup artifact;
- backup v1.1 logical continuity rather than raw production database internals;
- verify artifact digest/authentication before restore;
- restore only into an explicitly controlled empty target;
- reconcile logical counts/IDs/revisions/context digests after restore;
- integrate the backup/restore contract without changing production v1.0.
