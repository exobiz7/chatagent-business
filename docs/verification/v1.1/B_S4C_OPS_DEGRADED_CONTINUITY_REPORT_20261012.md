# ChatAgent Business v1.1 — B-S4C Ops Integration / Degraded Continuity Report

Date: 2026-10-12

Status: **ACCEPTED / CLOSED**

Production mutation: **NONE**

Production final migration: **NOT PERFORMED**

## 1. Scope

B-S4C closes the operational integration work left after B-S4A/B-S4B:

- Status integration for v1.1 local/runtime and cloud continuity health;
- Doctor integration for runtime, continuity, backup key, backup directory, and maintenance SQL readiness;
- encrypted logical Backup operator flow;
- explicit empty-target Restore operator flow with post-restore reconciliation;
- degraded-continuity behavior under control/continuity backend outage;
- bounded cached project authorization for local filesystem/Git/HOST_USER work;
- compatibility dispatch from the existing Status/Doctor/Backup/Restore command wrappers.

B-S4C does not perform the B-S6 production cutover and does not import or restore production continuity.

## 2. v1.1 operator architecture

A separate v1.1 operator path was added rather than changing the v1.0 local SQLite SAFE-pilot semantics in `scripts/business/business-ops.mjs`.

The existing wrappers remain the stable user entry points:

- `ops/Status.command`
- `ops/Doctor.command`
- `ops/Backup.command`
- `ops/Restore.command`

They dispatch by operator config `schemaVersion`:

- schemaVersion `1` -> existing v1.0 `business-ops.mjs`;
- schemaVersion `2` -> `scripts/business/v1.1/ops/business-v11-ops-cli.mjs`.

`Start.command` and `Stop.command` were not modified in B-S4C.

## 3. Operator configuration and credential separation

The v1.1 operator config is an owner-controlled schemaVersion 2 file.

It contains only non-secret operational references:

- expected Node version;
- node binary and repo root;
- existing Business Supabase auth-config path;
- organization slug;
- local runtime `/healthz` URL;
- backup directory;
- Keychain backup-key service name;
- the *name* of the environment variable containing the maintenance database URL.

The maintenance PostgreSQL connection string is not persisted in the operator config.

The runtime OAuth path remains publishable-key + refresh-token-Keychain based. Backup-key custody uses a distinct Keychain service/account. Maintenance restore/export is a separate operator path and is not a public ChatGPT/MCP capability.

## 4. Concrete maintenance PostgreSQL transport

B-S4C adds `BusinessV11MaintenancePostgres` using exact dependency `pg@8.23.1`.

The transport intentionally exposes only four fixed operations:

- maintenance readiness probe;
- target empty-state inspection;
- operator-private logical continuity export;
- operator-private empty-target restore.

It does not expose an arbitrary SQL method to the operator surface.

Remote PostgreSQL URLs require TLS (`sslmode=require` or `verify-full`). Insecure PostgreSQL is accepted only for explicit localhost disposable test mode.

The maintenance connection string is bounded and never returned by Status, Doctor, Backup, or Restore.

## 5. Backup integration

The v1.1 Backup operator flow is:

```text
maintenance readiness
-> operator-private logical snapshot export
-> Business logical-contract normalization
-> dedicated Keychain backup key load/create
-> AES-256-GCM archive creation
-> logical digest/count receipt
```

It reuses the accepted B-S4B archive contract:

- AES-256-GCM;
- fresh 12-byte nonce;
- authenticated format AAD;
- exclusive `0600` archive creation;
- backup key never embedded in the archive.

Backup returns bounded receipt metadata only. It does not return database credentials, Keychain secrets, raw snapshot contents, or absolute source paths.

## 6. Restore integration

Restore requires all of the following explicit preconditions:

- archive name;
- incident reference;
- expected logical digest;
- exact organization confirmation;
- explicit restore actor UUID;
- existing backup key;
- operator-private restore function readiness;
- completely empty logical project/continuity target.

The flow is:

```text
verify/decrypt archive
-> verify expected logical digest and organization
-> inspect current cloud target
-> require EMPTY target
-> controlled restore
-> authenticated/operator logical re-export
-> exact logical digest reconciliation
```

A second restore to the now non-empty target is rejected.

If the restore commits but post-restore readback cannot establish the resulting state, the operator returns non-retryable committed-effect uncertainty rather than recommending a blind retry.

## 7. Degraded-continuity authority gap found and fixed

B-S3 already had a bounded runtime-node authorization lease, but live service composition still refreshed project authorization from Supabase before each local filesystem/Git/HOST_USER operation.

That meant a Supabase outage could block local work before the runtime-node lease was evaluated.

B-S4C adds `BusinessProjectAuthorizationCache` as an independent runtime primitive.

Properties:

- in-memory only;
- bounded TTL (default 300 seconds; allowed 30–3600 seconds);
- bounded entry count;
- keyed by authenticated member + project;
- stores only projectId/projectProfile/organizationId/expiry;
- refreshes from the control/continuity authority whenever it is reachable;
- falls back only for exact `BUSINESS_BACKEND_UNAVAILABLE`;
- never falls back for authorization denial, PRIVATE membership denial, revocation, malformed input, or other hard failures;
- expires fail-closed with `BUSINESS_PROJECT_AUTH_LEASE_EXPIRED`.

The cache is a product primitive for the integrated B-S5 gateway/runtime composition. It is not an offline continuity database and does not create a second source of truth.

## 8. Degraded continuity semantics

When continuity/control backend is unavailable but both bounded project authority and node authorization leases are still valid:

```text
local filesystem   AVAILABLE
local Git          AVAILABLE
HOST_USER          AVAILABLE
cloud continuity mutation  FAIL_CLOSED
continuity context          UNVERIFIED / CONTINUITY_UNAVAILABLE
```

No offline task/checkpoint queue is created.

No SQLite fallback is reintroduced.

After the cached project authorization lease expires, local project effects stop rather than becoming open-ended authority.

## 9. Status / Doctor behavior

Status distinguishes:

- `NORMAL`;
- `LOCAL_RUNTIME_UNAVAILABLE`;
- `DEGRADED_CONTINUITY`;
- `DEGRADED_UNAVAILABLE`.

It separately reports:

- local work availability;
- continuity readiness;
- continuity-mutation availability/fail-closed state;
- backup-key initialization state.

Doctor checks:

- exact Node/repo identity;
- local runtime readiness;
- OAuth continuity readiness;
- private backup directory;
- backup-key Keychain accessibility;
- maintenance backup/restore SQL readiness.

A degraded continuity backend produces an explicit unhealthy Doctor result rather than falsely reporting full readiness.

## 10. Contract verification

`BUSINESS_S4C_OPS_CONTRACT=PASS`

Verified:

- cached project authority only on backend outage;
- member/project scoping;
- TTL expiry;
- hard authorization failures never use cache fallback;
- Status `NORMAL` vs `DEGRADED_CONTINUITY`;
- continuity mutation `FAIL_CLOSED` during degradation;
- Backup/Restore explicit confirmation requirements;
- remote maintenance TLS requirement;
- localhost test-only insecure mode;
- schemaVersion 2 wrapper dispatch while retaining schemaVersion 1 compatibility;
- macOS `plutil` correctly reads JSON `schemaVersion`.

## 11. Concrete PostgreSQL operator E2E

`BUSINESS_S4C_OPS_POSTGRES=PASS`

Disposable PostgreSQL 16 verified the concrete `pg` maintenance adapter:

```text
create v1.1 continuity
-> operator backup
-> record source logical digest
-> simulate project/continuity loss
-> inspect target = empty
-> explicit incident-bound restore
-> post-restore export
-> exact logical snapshot/digest reconciliation
-> second restore denial
```

Status/Doctor were also exercised against the operator core, including transition to `DEGRADED_CONTINUITY`.

No disposable PostgreSQL container remains after the test.

## 12. Actual local degraded-effect E2E

`BUSINESS_S4C_DEGRADED_CONTINUITY=PASS`

The regression used the real B-S3 local service implementations rather than mocks for effects.

With Supabase/continuity simulated unavailable and bounded cached authority still valid:

- `BusinessSemanticFileService.createFile` committed successfully;
- `BusinessSemanticGitService.createBranch` committed successfully;
- `BusinessHostProcessService.startHost` executed a bounded Node process and returned `HOST_OFFLINE_OK`;
- continuity `taskStart` failed `BUSINESS_BACKEND_UNAVAILABLE`;
- continuity read returned `freshness=UNVERIFIED`, `freshnessReason=CONTINUITY_UNAVAILABLE`;
- project-authority lease expiry subsequently denied local access.

This establishes the required degraded-mode split without dual-master behavior.

## 13. Dependency audit

`pg` is pinned exactly to `8.23.1`.

`npm audit --omit=dev` reported one HIGH advisory, but it is on the pre-existing direct dependency `@modelcontextprotocol/sdk@1.30.0`, not on `pg`.

The existing advisory is not auto-fixed in B-S4C because changing the MCP SDK can alter the already-verified OAuth/MCP behavior and therefore requires a separate bounded maintenance/revalidation decision.

## 14. Full regression

Authoritative runtime:

```text
Node v24.21.0
npm run test:ci
TEST_CI_EXIT=0
```

The full suite includes B-S0/B-S1/B-S2/B-S3/B-S4A/B-S4B plus all three B-S4C suites.

## 15. Runtime / production state

B-S4C made no production or staging runtime mutation.

At closure verification:

```text
Production 31850 = PID 8871
Staging    31861 = PID 83759
Tunnel     51961 = PID 99496
```

Staging remains the disabled B-S3G fixture:

```text
safetyCanaryEnabled = false
processEffectTools   = []
mappingCount         = 0
```

Production v1.0 remains frozen and active.

## 16. Gate result

B-S4C is accepted:

```text
BUSINESS_S4C_OPS_CONTRACT=PASS
BUSINESS_S4C_OPS_POSTGRES=PASS
BUSINESS_S4C_DEGRADED_CONTINUITY=PASS
```

Together with accepted B-S4A/B-S4B evidence, this satisfies:

```text
BUSINESS_S4_MIGRATION_REHEARSAL=PASS
BUSINESS_S4_CONTEXT_DIGEST_PRESERVED=PASS
BUSINESS_S4_BACKUP_RESTORE=PASS
BUSINESS_S4_DEGRADED_MODE=PASS
```

B-S4 may therefore close without performing production migration.
