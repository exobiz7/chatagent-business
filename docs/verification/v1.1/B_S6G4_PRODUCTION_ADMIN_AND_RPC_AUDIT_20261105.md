# ChatAgent Business v1.1 — B-S6G-4 Production ADMIN Bootstrap and RPC Audit

Date: 2026-11-05 KST
Result: **B-S6G-4 DB ADMIN INITIALIZATION PASS; DB ROLE-SIMULATED RPC PASS; LIVE SIGNED JWT E2E PENDING**
Release decision: **B-S6 PRODUCTION CUTOVER NO-GO / NOT STARTED / NOT AUTHORIZED**.
Target: dedicated KAI Org Business v1.1 Production Supabase project, Seoul ap-northeast-2; 11/11 B-S1/B-S2 migrations installed.
No private Auth identifiers, email addresses, tokens, connection URIs or raw database receipts are retained in public repository.

## 1. Independently observed preconditions

Before initialization:
- Supabase management API reported target ACTIVE_HEALTHY, PostgreSQL 17.11.
- Exactly 1 auth.users record; exactly 1 confirmed, non-anonymous eligible Auth user; 0 other users.
- private_business_control.organizations / organization_members / control_state = 0 each.
- Project, continuity, task, checkpoint, event data = 0.
- Control and Continuity schema versions = 1; no one-time importer function; existing 11 migrations unchanged.
- Mac Studio repo and remote were clean and matched source HEAD 7ad26c2e8268da96184d349ad1fd681bd6162ff4. The operator-only SQL source was read and SHA-256 checked.
- Reviewed source file: scripts/business/v1.1/control/bs6g3-production-bootstrap-single-admin.sql.
- **SHA-256 of SQL source at execution:** d9c729a99e98b4cfd1aa78716daada1243cfa3d74b93082a65c95bedd8d273e4. Only the executed-status COMMENT in the canonical file was later updated to discourage accidental replay.

## 2. Authorized one-time DB initialization

Via the connected Supabase execute_sql tool against the exact dedicated Production project:
- One bounded execution of the canonical guarded production bootstrap; zero retries and no migration-history registration for data initialization.
- SQL read the single confirmed, non-anonymous Auth user itself rather than accepting or embedding a user ID.
- Created exactly one application-level organization slug release-org, one ACTIVE ADMIN membership, and one control_state row.
- The staged environment slug chatagent-business-v11-bs0 was not used.
- The guard fails closed if eligible Auth count is not exactly one or if organization/membership already exists. Never rerun after success.

Read-back, in a fresh READ ONLY transaction:
- 1 total organization, 1 matching release-org, 1 ACTIVE/confirmed ADMIN, 1 organization member, 1 control_state.
- auth.users=1, 1 confirmed, non-anonymous.
- Project, private memberships, runtime nodes/sessions, continuity, tasks, checkpoints, events and operation rows remain 0.
- One-time importer absent; 11 schema migrations remain unchanged. No customer data import/export.

## 3. Real DB privilege / RPC evidence

Executed on the actual Production database, using read-only transactions with temporary SET LOCAL ROLE and synthetic request.jwt.claims; **these are database role/claim simulations, NOT real signed JWT HTTP requests**.

PASS — ADMIN role simulation:
- bc_member_profile returns a well-formed opaque profile ID, expected nickname, and an email field (email value suppressed).
- bc_schema_status confirms organizationInitialized=true, organizationSlug=release-org, role=ADMIN, schemaVersion=1.
- Seven profile/status boolean assertions returned true.

PASS — negative tests:
- Synthetic nonmember claim: bc_member_profile, bc_schema_status and bc_project_context rejected with BUSINESS_MEMBER_NOT_FOUND.
- Anonymous role: bc_member_profile and bc_schema_status were rejected with insufficient privilege.
- ADMIN role could not access nonexistent project key through bc_project_context (BUSINESS_PROJECT_NOT_FOUND).
- Authenticated role could not directly query the private organization_members table (insufficient privilege).
- PostgreSQL catalog audit: 24 public Business RPC signatures; zero executable by anon; 17 executable by authenticated; both private Control/Continuity schema USAGE denied to anon/authenticated; 15/15 private-table RLS enabled.
- These probes did not create Auth users, project rows, roles, operations or continuity events.

NOT PROVEN:
- A real user-signed JWT forwarded over the production HTTPS Supabase Data API into bc_member_profile/bc_schema_status, and any ChatGPT-to-v1.1 Gateway end-to-end OAuth path.
- Cryptographic runtime token / publishable key Keychain custody bound to this NEW production project.
- The approved migration operator's future signed identity, importer lifecycle grant/deny under actual Cutover, and multi-user TEAM/PRIVATE isolation on this target. Accepted local Docker contract/integration tests are supporting evidence, not a replacement for target-specific E2E.

## 4. Supabase Security Advisor / residual warnings

- INFO: 15 RLS-enabled private tables with no row policies. Intentional deny-by-default private tables, alongside blocked client schema USAGE.
- WARN: 17 authenticated SECURITY DEFINER RPCs. Accepted authenticated RPC surface, but needs real-JWT and membership-policy canaries before release; do not blanket-revoke.
- WARN: leaked-password protection disabled or unavailable on the current plan. Review plan/policy before enabling password-based production login; this unit did not purchase a plan or change Auth providers.
- Official refs:
  https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy
  https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
  https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

## 5. Release gating and next unit

B-S6G evidence **7/11 PASS** (applicationOrgSlug newly PASS; existing six project/schema/empty-target proofs remain PASS). Keep these four as PENDING:
- migrationAdmin: DB membership verified, but the future approved MIGRATION OPERATOR credential/session/actor identity is not yet independently bound.
- importerPrivilegeIsolation: importer intentionally not installed; must test privilege lifecycle in approved cutover sequence.
- authenticatedReadbackPlan: DB role simulation PASS but real signed JWT/HTTPS/Gateway readback remains PENDING.
- runtimeSecretCustody: v1.1 Production publishable-only + Keychain runtime credentials and rotation not deployed or proved.

Owner already supplied the required one-time human Auth confirmation. No further human action is required for this DB bootstrap unit. Next B-S6G-5: nonproduction Gateway-to-production Supabase authenticated read-only canary with an owner-approved secure login, production runtime config/secret custody and operator identity checks, separate release/rollback review. Never ask users to paste a token, password, OTP or invite link into chat.

Existing v1.0 Production app remains active and was not stopped/reconfigured. No source SQLite export or import, no app republish, no PR Ready/merge, no tag, no real macOS reboot. B-S6 remains NO-GO.

## 6. Independent local validation at release-candidate source

- Mac Studio full npm run test:ci: PASS, 99.17 seconds.
- Mac Studio local hosted npm run test:ci:hosted: PASS, 73.61 seconds.
- Isolated Docker/PostgreSQL B-S1B member identity regression: PASS. Covers single-user bootstrap guard, idempotent second-run refusal, profile ID contract, mutable display metadata isolation, nonmember, revoked member, anonymous and direct-table fail-closed.
- B-S6G target evidence contract: PASS 7/11; injected forged owner approval/import mutations rejected and evaluator never authorizes cutover.
- Public repository secret-pattern scan, exact changed-file allowlist, and unchanged protected v1.0/cutover state assertions: PASS.
- GitHub exact-head hosted CI is independent and must be re-queried after the B-S6G-4 commit is pushed; do not substitute this local success for GitHub required checks.
