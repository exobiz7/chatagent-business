# ChatAgent Business v1.1 — B-S4B Encrypted Logical Backup / Restore Foundation

Status: **ACCEPTED / CLOSED**

Date: 2026-10-12

Production mutation: **NONE**

Staging runtime mutation: **NONE**

Production cloud backup/restore: **NOT PERFORMED**

## 1. Scope

B-S4B implements and rehearses the encrypted logical continuity backup foundation required by Accepted Design section 28 / B-S4:

- Business logical continuity snapshot contract;
- deterministic logical digest;
- AES-256-GCM encrypted archive;
- dedicated macOS Keychain backup key custody;
- operator-private logical export;
- explicit empty-target restore;
- restore prerequisite validation;
- post-restore logical/event-chain/access/contextDigest reconciliation.

This unit intentionally does **not** yet claim the full `BUSINESS_S4_BACKUP_RESTORE` top-level gate. Status/Doctor/Backup/Restore operator integration remains B-S4C work.

## 2. Reuse-first donor provenance

The implementation reuses the frozen Personal v1.1.1 patterns identified in `B_S0_PERSONAL_DONOR_MANIFEST.json`:

- `personal-memory-logical-backup.mjs` — AES-256-GCM envelope pattern;
- `keychain-backup-key-store.mjs` — independent 32-byte backup-key custody pattern;
- `keychain-refresh-token-store.mjs` — pinned native helper wrapper;
- `native-keychain-secret.c` — macOS Security.framework helper.

Business already contained blob-exact copies of the refresh-token Keychain wrapper and native helper. B-S4B adds only a Business-specific backup-key adapter on top of those proven components.

There is no runtime import from the Personal repository.

## 3. Business logical snapshot contract

New contract module:

` scripts/business/v1.1/backup/business-continuity-logical-contract.mjs `

Logical format:

`chatagent-business-continuity-logical-v1`

The canonical snapshot contains:

- organization slug;
- continuity context sequence and head SHA-256;
- logical project IDs/keys/display names/modes/profiles/policy revisions;
- PRIVATE project memberships;
- task identities/status/revisions/ownership/timestamps/tags;
- checkpoint identities/revisions/state/decisions/facts/artifacts/source identity;
- operation identities/input hashes/receipts;
- complete event-chain metadata;
- exact counts.

The validator enforces:

- UUID/project-key/profile/mode contracts;
- project/task/checkpoint referential integrity;
- unique task/checkpoint/operation identities;
- unique task checkpoint revisions;
- event sequence continuity;
- previous-hash link continuity;
- final head SHA match;
- count reconciliation;
- bounded 64 MiB logical snapshot size.

Canonical digest:

`sha256(stable-json(normalized-logical-snapshot))`

The logical digest is independent of encrypted archive nonce/ciphertext and is identical after exact restore/readback.

## 4. Encrypted archive contract

New module:

` scripts/business/v1.1/backup/business-continuity-logical-backup.mjs `

Archive format:

`chatagent-business-continuity-backup-v1`

Cryptography:

- AES-256-GCM;
- independent 32-byte archive key;
- fresh 12-byte random nonce per archive;
- format string used as authenticated AAD;
- 16-byte GCM authentication tag;
- bounded encrypted payload;
- exclusive `wx` archive creation;
- owner-private `0600` file mode;
- parent directory must be owner-private and non-symlink.

Encrypted package contains authenticated metadata, canonical logical snapshot, per-entry SHA-256 manifest and the logical digest.

The archive does not include the backup key.

Validation proves:

- known continuity plaintext is not visible in archive text;
- backup-key Base64 is not present in archive;
- wrong key fails authentication;
- ciphertext bit tamper fails authentication;
- existing archive path cannot be overwritten;
- decrypted logical digest exactly matches source digest.

## 5. Dedicated Keychain backup key

New adapter:

` scripts/business/v1.1/control/keychain-backup-key-store.mjs `

Default service:

`chatagent-business.continuity-backup`

The adapter:

- uses the existing pinned Business Keychain wrapper/native helper;
- stores one random 32-byte secret as strict Base64;
- reads back and timing-safe verifies newly created keys;
- keeps backup-key service/account separate from Supabase Auth refresh-token custody;
- never stores the backup key in archive/config/repository.

### Native live Keychain canary

A reversible synthetic macOS Keychain canary was executed with the real compiled pinned native helper:

- initial read: missing;
- create 32-byte key: PASS;
- readback equality: PASS;
- delete: PASS;
- final read: missing.

The synthetic Keychain item was deleted during test cleanup.

Result:

`BUSINESS_S4B_KEYCHAIN_LIVE_CUSTODY=PASS`

## 6. Operator-private PostgreSQL backup/restore foundation

New SQL fixture/foundation:

` scripts/business/v1.1/backup/bs4b-logical-backup-restore.sql `

Internal functions:

- `private_business_continuity._backup_export(text)`
- `private_business_continuity._restore_empty(jsonb,uuid)`

Both are revoked from:

- `public`;
- `anon`;
- `authenticated`.

No new `public.bc_backup_*` or `public.bc_restore_*` RPC is added. The frozen authenticated runtime RPC contract remains unchanged.

### Backup export

The operator-private export:

- resolves one organization slug;
- requires the source event chain to verify;
- exports organization-wide logical project/continuity state;
- exports project and PRIVATE membership metadata needed for recovery;
- exports no deployment credential, refresh token, backup key, Git credential, Keychain content or repository content.

### Restore

Restore is permitted only when:

- organization slug already exists;
- restore actor is an ACTIVE ADMIN;
- target logical projects are empty;
- target PRIVATE membership rows are empty;
- target continuity state/tasks/checkpoints/operations/events are empty;
- all referenced organization members already exist;
- all referenced runtime nodes already exist.

Restore preserves:

- project UUIDs and project policy metadata;
- PRIVATE membership rows;
- task/checkpoint/operation/event IDs;
- task/checkpoint revisions;
- task/checkpoint/user/runtime-node references;
- timestamps;
- exact event chain and head SHA;
- logical digest;
- Business handoff `contextDigest`.

A second restore attempt is refused with `BUSINESS_RESTORE_TARGET_NOT_EMPTY`.

## 7. Disposable PostgreSQL 16 rehearsal

The B-S4B integration test creates a disposable PostgreSQL 16 target with:

- ADMIN/member/outsider identities;
- one APPROVED SHARED_NODE;
- TEAM project;
- PRIVATE project;
- PRIVATE membership grant;
- active task and completed task;
- checkpoints referencing the runtime node;
- continuity operation/event chain.

Before backup, PRIVATE outsider access is denied.

The test then:

1. exports the operator-private logical snapshot;
2. validates and hashes the normalized snapshot;
3. encrypts the archive;
4. verifies wrong-key/tamper/no-overwrite behavior;
5. decrypts and validates the archive;
6. deletes only disposable project/continuity data to simulate continuity loss;
7. removes the referenced runtime node and proves restore fails atomically;
8. proves failed restore leaves zero project rows;
9. restores the prerequisite runtime node;
10. restores the logical snapshot into the empty target;
11. refuses a second restore;
12. re-exports the restored logical state;
13. compares the complete logical snapshot and digest;
14. verifies event-chain integrity;
15. verifies TEAM access and PRIVATE outsider denial;
16. verifies every pre-backup Business handoff `contextDigest` is unchanged.

Results:

`BUSINESS_S4B_BACKUP_POSTGRES=PASS`

## 8. Context and logical digest preservation

Two distinct digest contracts are preserved:

1. organization logical backup digest — exact before/after restore;
2. per-task Business handoff `contextDigest` — exact before/after restore.

This builds on the B-S4A cross-version handoff-digest correction and does not alter the v1.0 production store.

## 9. Public/runtime safety boundary

B-S4B does not add ChatGPT MCP tools or authenticated runtime RPCs.

The restore path is intentionally operator-private because cloud restore is a controlled incident operation, not an ordinary assistant capability.

The archive excludes:

- Business deployment credential;
- Supabase refresh token;
- backup encryption key;
- Git credentials;
- Keychain contents;
- customer repository contents.

## 10. Validation

Authoritative Node:

`v24.21.0`

Targeted:

`BUSINESS_S4B_BACKUP_CONTRACT=PASS`

`BUSINESS_S4B_KEYCHAIN_LIVE_CUSTODY=PASS`

`BUSINESS_S4B_BACKUP_POSTGRES=PASS`

Full regression:

`npm run test:ci`

`TEST_CI_EXIT=0`

Disposable Docker cleanup:

`chatagent-business-bs4b-* = 0 residual containers`

## 11. Runtime state

Production/staging/tunnel listeners remained unchanged through the unit:

- production `31850` — existing v1.0 runtime;
- staging `31861` — existing B-S3G-1 fixture, canary disabled;
- tunnel `51961` — existing staging tunnel.

Staging final health:

- `safetyCanaryEnabled=false`;
- `processEffectTools=[]`;
- `mappingCount=0`.

No production database, v1 SQLite state, staging Supabase state, or repository content outside this branch was mutated.

## 12. Gate decision

B-S4B foundation gates:

- `BUSINESS_S4B_LOGICAL_CONTRACT=PASS`
- `BUSINESS_S4B_AES256_GCM_BACKUP=PASS`
- `BUSINESS_S4B_KEYCHAIN_BACKUP_KEY=PASS`
- `BUSINESS_S4B_KEYCHAIN_LIVE_CUSTODY=PASS`
- `BUSINESS_S4B_EMPTY_TARGET_RESTORE=PASS`
- `BUSINESS_S4B_LOGICAL_DIGEST_RECONCILIATION=PASS`
- `BUSINESS_S4B_CONTEXT_DIGEST_RECONCILIATION=PASS`
- `BUSINESS_S4B_PRIVATE_ACCESS_RECONCILIATION=PASS`

Top-level B-S4 remains in progress:

`BUSINESS_S4_BACKUP_RESTORE=IN_PROGRESS_BS4C_OPS_INTEGRATION`

`BUSINESS_S4_DEGRADED_MODE=PENDING_BS4C`

## 13. Next unit

B-S4C — Ops Integration / Degraded Continuity:

- integrate encrypted continuity backup into Business operator Backup flow;
- integrate explicit controlled empty-target restore flow;
- expose backup/continuity readiness in Status;
- verify backup/key prerequisites in Doctor;
- add degraded-continuity health state;
- prove Supabase/control outage leaves local filesystem/Git/HOST_USER work available while continuity mutation fails closed;
- rerun full regression without production v1.0 mutation.
