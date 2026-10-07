# ChatAgent Business v1.1 — B-S1A Control Foundation Report

> Date: 2026-10-07 KST
> Phase: B-S1A — Control Schema Foundation
> Status: **PASS**
> Base: B-S0 accepted HEAD `2975be54502a89dd92949c57521bacb071d49bac`
> Production v1.0 mutation: **NONE**

## Scope

This bounded unit implements only the first B-S1 cloud-control foundation. It intentionally does **not** implement member bootstrap/profile, node mutation RPCs, B-S2 continuity CRUD, or production cutover.

Implemented:

- `private_business_control` schema;
- exact nine-table inventory frozen by B-S0;
- one-organization-per-Supabase-project structural invariant;
- `ADMIN` / `PM` / `MEMBER` role constraint;
- `PENDING` / `APPROVED` / `REVOKED` node lifecycle storage;
- `PERSONAL_NODE` / `SHARED_NODE` ownership constraints;
- `TEAM` / `PRIVATE` project mode with TEAM default;
- `READ_ONLY` / `SAFE` / `STANDARD` project profile constraint;
- runtime-session lease storage foundation;
- operations/idempotency receipt storage foundation;
- RLS enabled on every private control table;
- direct private schema/table access denied to `anon` and `authenticated`;
- authenticated read-only `public.bc_schema_status()` RPC;
- covering indexes for all foreign keys identified by the Supabase performance advisor.

Deferred to later B-S1 units:

- organization/admin bootstrap;
- `bc_member_profile`;
- Personal auth/session + Keychain thin reuse;
- runtime enroll/status/list/revoke RPCs;
- project/private-member mutation RPCs;
- Gateway/Relay production handshake.

## Canonical implementation files

- `supabase/migrations/20261007161000_business_v11_bs1_control_foundation.sql`
- `supabase/migrations/20261007162500_business_v11_bs1_control_fk_indexes.sql`
- `scripts/business/v1.1/bs1-control-contract-test.mjs`
- `scripts/business/v1.1/bs1-control-postgres-integration-test.mjs`

A separately generated broader foundation draft was preserved under `/Volumes/SSD 4T/z_proj/proj04_chatagent/chatagent_business_handoffs/working/B_S1B_MEMBER_PROFILE_FOUNDATION_DRAFT_20261007.sql`. It is **non-authoritative and must not be applied** because its column layout differs from the schema already applied to staging. It is retained only as B-S1B design/reference material.

## Frozen-contract parity

The canonical migration matches `B_S0_SUPABASE_SCHEMA_RPC_CONTRACT.json` for the control table inventory:

`schema_meta`, `organizations`, `organization_members`, `control_state`, `runtime_nodes`, `runtime_sessions`, `logical_projects`, `private_project_members`, `operations`.

Only the frozen `bc_schema_status` control RPC is implemented in B-S1A. The remaining frozen B-S1 RPC names remain deferred. No `private_business_continuity` schema or B-S2 RPC is created.

## Local validation

`npm run test:business:bs1a` passes both layers:

```text
BUSINESS_S1A_CONTROL_CONTRACT=PASS
BUSINESS_S1A_POSTGRES_INTEGRATION=PASS
```

Coverage includes:

- exact nine-table frozen inventory;
- RLS enabled on all nine private tables;
- role/node/project constraints;
- one-organization invariant;
- PERSONAL_NODE owner requirement;
- SHARED_NODE personal-owner denial;
- TEAM default;
- authenticated RPC-only boundary;
- anon RPC denial;
- authenticated direct-table denial;
- nine covering FK indexes;
- explicit absence of later B-S1/B-S2 RPCs.

The PostgreSQL integration test applies both migrations to a disposable PostgreSQL 16 container and validates the constraints against real PostgreSQL rather than text matching alone.

## Staging Supabase application

Applied only to dedicated Business v1.1 staging project `dxofyjarkzizdzumfyul`:

1. `business_v11_bs1_control_foundation` — migration version `20261007071941`
2. `business_v11_bs1_control_fk_indexes` — migration version `20261007072117`

Observed live catalog:

- control tables: 9;
- RLS enabled: 9/9;
- `anon` / `authenticated` direct table grants: 0;
- `bc_schema_status()` returns `schemaVersion=1`, `contractVersion=1`, `tableCount=9`;
- `organizationInitialized=false`, expected before B-S1B bootstrap.

Observed privilege boundary:

- authenticated `bc_schema_status` EXECUTE: allowed;
- anon `bc_schema_status` EXECUTE: denied;
- authenticated private schema USAGE: denied;
- anon private schema USAGE: denied;
- authenticated direct `organizations` SELECT: denied;
- anon direct `organizations` SELECT: denied.

## Advisor review

Security advisor observations:

- `rls_enabled_no_policy` INFO on 9 private tables is intentional at this stage: client schema/table grants are absent and access is RPC-only.
- `authenticated_security_definer_function_executable` WARN on `bc_schema_status()` is intentional for the explicitly exposed authenticated read-only RPC. It has a fixed `search_path` and returns no secret-bearing data.
- leaked-password protection is currently disabled at the staging Auth project level; this is carried as a B-S1B member-auth hardening action, not ignored.

References:

- https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy
- https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
- https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

Performance advisor:

- initial unindexed foreign keys: 9;
- after the follow-up index migration: 0;
- remaining `unused_index` INFO is expected for a newly created empty schema and is not evidence that the indexes should be removed.

Reference:

- https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys

## Gate disposition

```text
BUSINESS_S1A_CONTROL_CONTRACT=PASS
BUSINESS_S1A_POSTGRES_INTEGRATION=PASS
BUSINESS_S1A_STAGING_SCHEMA_APPLY=PASS
BUSINESS_S1A_PRIVILEGE_BOUNDARY=PASS
BUSINESS_S1_SUPABASE_SCHEMA=PASS
```

B-S1 overall remains **IN PROGRESS** because member auth/session and runtime-node lifecycle gates are not yet implemented.

Production v1.0 remains the active frozen baseline.
