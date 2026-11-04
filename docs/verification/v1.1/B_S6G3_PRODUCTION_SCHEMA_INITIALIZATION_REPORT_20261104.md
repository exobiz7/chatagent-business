# B-S6G-3 — Dedicated Business v1.1 Production Schema Foundation

Date: 2026-11-04 KST
Decision: SCHEMA FOUNDATION PASS / APPLICATION AUTH BOOTSTRAP PENDING / CUTOVER NO-GO.
Initial source commit: 4243881d323902be55003fee79cb372d3990bfa0.
Target: dedicated KAI Org Business Production project in Seoul (PostgreSQL 17.11, ACTIVE_HEALTHY).
This is a public-safe report. No private project ref, user UUID, credentials or SQL result payloads are stored.

## Dashboard error diagnosis
- The dashboard screenshot showed 38/38 Postgres requests in error in its rolling window.
- Independently retrieved Supabase Postgres logs repeatedly reported missing relation realtime.subscription until 2026-11-04T12:17:57Z; realtime.schema_migrations was missing once at about 12:18:55Z.
- Those Realtime tables now exist; application-independent read-only SQL succeeds. A single supabase_migrations.schema_migrations missing-relation entry during schema-install startup preceded migration history creation. Current migration history exists.
- This supports a transient initialization issue, not a blanket failure of every new SQL request. Not every dashboard request was independently mapped. No Realtime internal object was manually altered.

## Canonical B-S1/B-S2 schema installation
- Eleven committed SQL migration source files in supabase/migrations were applied sequentially using connected Supabase apply_migration, each returning success. New Supabase migration-history versions were assigned at execution time 20261104122938 through 20261104123252, retaining original source filenames as descriptive names.
- Control schema_meta version 1 / contract 1; Continuity schema_meta version 1 / contract 1.
- Fifteen private tables, 15/15 with RLS enabled.
- Zero anonymous-executable public bc_* RPC functions out of 24, and no direct anon/authenticated USAGE on either private Business schema. Seventeen authenticated business RPC functions exist as designed.
- All source-data target rows are zero: business organizations, members, projects, controls, runtime nodes/sessions, continuity state, tasks, checkpoints, events and operations.
- auth.users count is zero, so an authenticated application ADMIN does not exist yet. Schema metadata alone contains one seeded row in each private schema.
- One-time importer function public.bc_import_snapshot(jsonb,uuid) is absent. No SQLite source export/import or production app deployment occurred.

## Advisor assessment
- Security INFO rls_enabled_no_policy ×15: private RLS deny-by-default; direct client schema access is denied. This alone does not prove all RPC authorization.
- Security WARN authenticated_security_definer_function_executable ×17: these authenticated RPCs are an intended part of the accepted application boundary. Do not blanket-revoke. Independent authenticated project/member isolation checks must still PASS before release.
- Performance INFO unused_index ×26: no workloads have used a new empty project's indexes; do not drop them without evidence.
- Reference: https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable

## Remaining 5 target proof checks / operator boundary
The current evidence validator reports 6/11 PASS. Pending: applicationOrgSlug, migrationAdmin, importerPrivilegeIsolation (post-install negative test), authenticatedReadbackPlan, runtimeSecretCustody. The release decision remains NO-GO.

Owner participation is necessary exactly once to establish one real confirmed, non-anonymous Supabase Auth user in this PROJECT, distinct from the Supabase Dashboard organization account. When the user exists, the guarded one-time bootstrap is available as scripts/business/v1.1/control/bs6g3-production-bootstrap-single-admin.sql; it sets application slug release-org, derives Auth user ID without hardcoding and fails closed on multiple users or existing org/members. NOT EXECUTED. Never run the staging bootstrap unchanged on Production.

Follow-on verification: exactly one ACTIVE ADMIN, signed-in member profile, member/project isolation, secure publishable-key-only runtime config and credential custody. No final Source SQLite migration, PR Ready/merge, v1.1 tag or app republish is authorized.
