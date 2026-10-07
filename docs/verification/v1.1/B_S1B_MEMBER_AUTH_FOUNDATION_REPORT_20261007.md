# ChatAgent Business v1.1 — B-S1B Member Identity / Auth Session Foundation

> Date: 2026-10-07 KST
> Phase: B-S1B — Member Identity / Auth Session Foundation
> Result: **LOCAL + STAGING DB + KEYCHAIN PASS / CHATGPT OAUTH LIVE PROFILE PENDING**
> Production v1.0 mutation: **NONE**

## Scope

This bounded unit extends the accepted B-S1A control foundation with authenticated Business member identity and Personal-derived session custody. Runtime-node enrollment/revocation remains deferred to B-S1C; B-S2 continuity is untouched.

Implemented:

- staging-only one-time organization/ADMIN bootstrap with no hardcoded Auth user UUID;
- private active-member resolver based only on `auth.uid()` + Business membership state;
- authenticated `bc_member_profile()`;
- deterministic opaque profile identity compatible with the B-S0 identity formula;
- authenticated `bc_schema_status()` now fails closed for non-members/revoked members;
- Personal-derived Supabase auth/session adapter using publishable-key runtime access only;
- Personal Keychain refresh-token wrapper + native helper reused byte-for-byte;
- owner-safe publishable-only runtime configuration loader;
- OAuth bearer -> `bc_member_profile` staging adapter for the existing ChatGPT development fixture.

## Staging database application

Dedicated staging project only: `dxofyjarkzizdzumfyul`.

Applied migration:

- `business_v11_bs1_member_identity` — recorded twice in migration history (`20261007080451`, `20261007080618`) because two bounded workers applied the same idempotent `CREATE OR REPLACE` migration nearly simultaneously. Live definitions were read back and match the repository migration. History rows are retained as evidence; no manual history rewrite was performed.

Bootstrap preconditions observed before execution:

- confirmed permanent Auth users: exactly 1;
- Business organizations: 0;
- Business members: 0.

The operator-only bootstrap script selects the eligible Auth identity from `auth.users`; it does not embed or accept a user UUID. It created exactly one organization and one ACTIVE ADMIN member.

Staging identity verification after bootstrap:

- organization count = 1;
- ACTIVE ADMIN count = 1;
- organization slug = `chatagent-business-v11-bs0`;
- DB-backed profile ID exactly matches the previously accepted B-S0 deterministic profile identity;
- profile nickname = `ChatAgent Business`;
- schema version = 1;
- contract version = 1;
- `organizationInitialized=true`.

The Auth UUID and user email are deliberately not persisted in this report.

## Authorization boundary

Live Postgres privilege checks after B-S1B:

- authenticated `bc_member_profile()` EXECUTE: allowed;
- anon `bc_member_profile()` EXECUTE: denied;
- authenticated private schema USAGE: denied;
- authenticated direct `organization_members` SELECT: denied;
- anon direct `organization_members` SELECT: denied.

The private membership helper is `SECURITY DEFINER` with an empty `search_path` and is not executable by client roles. Caller-supplied member identity is never authoritative.

`raw_user_meta_data.name` is used only as an optional display field in the standard profile response. Authorization derives only from `auth.uid()` plus `private_business_control.organization_members` state.

## Personal donor reuse

Frozen donor: ChatAgent Personal v1.1.1 (`da391bf9c38697d706049b3b5d7bd2c2ba4ba28e`).

Reused behavior:

- bounded Supabase session refresh and single-flight refresh serialization;
- refresh-token rotation through a token-store interface;
- local sign-out / token deletion semantics;
- strict publishable-key client configuration;
- macOS Keychain refresh-token custody;
- helper binary ownership/mode/SHA checks;
- secret input/output only through stdin/stdout, never argv/environment.

The Business copies of these two Keychain donor components match their frozen donor Git blobs exactly:

- `keychain-refresh-token-store.mjs`;
- `native-keychain-secret.c`.

Personal remains read-only and is not a Business runtime dependency.

## Keychain validation

Default test:

- native helper compiles with Security/CoreFoundation frameworks;
- pinned-SHA mismatch fails closed;
- publishable-only config rejects secret/service-role-like configuration;
- unsafe configuration permissions fail closed.

Explicit reversible live test (`BUSINESS_TEST_KEYCHAIN_LIVE=1`) also passed:

- synthetic refresh token write;
- read;
- delete;
- post-delete absence.

The synthetic Keychain item is removed during test cleanup.

## Auth/session validation

`BusinessSupabaseAuthSession` validation proves:

- Supabase URL + `sb_publishable_*` only;
- no persistent Supabase browser/local-storage session;
- refresh token is delegated to the token store;
- fresh access token remains in memory;
- eight concurrent near-expiry callers cause exactly one refresh rotation;
- restore rotates a stored refresh token;
- RPC namespace is restricted to `bc_*`;
- authenticated RPC sends the access token, never the refresh token;
- local sign-out clears the token store.

Dependency aligned to Personal donor:

- `@supabase/supabase-js = 2.117.2` exact.

## Validation

```text
BUSINESS_S1B_MEMBER_IDENTITY_CONTRACT=PASS
BUSINESS_S1B_MEMBER_IDENTITY_POSTGRES=PASS
BUSINESS_S1B_AUTH_RUNTIME=PASS
BUSINESS_S1B_KEYCHAIN_CONFIG=PASS
BUSINESS_S1B_LIVE_PROFILE_ADAPTER=PASS
BUSINESS_S1B_KEYCHAIN_LIVE_CUSTODY=PASS
```

Regression:

```text
npm run test:ci = PASS
BUSINESS_V11_BS0_LOCAL_SUITE=PASS count=9
git diff --check = PASS
```

Final verification should use the repo-supported Node 24.x range; Node v24.21.0 is installed on the release host.

## Staging fixture for final ChatGPT OAuth proof

The isolated staging fixture on `127.0.0.1:31861` is currently running with the B-S1 profile-RPC path enabled while retaining the same staging tunnel. Only `member_get_profile` changes behavior: it forwards the already validated OAuth access token to authenticated Supabase `bc_member_profile()` using the publishable key; all other tools remain no-effect probes. The accepted B-S0 fixture source itself has been restored unchanged, and `scripts/business/v1.1/bs1b-live-fixture-server.mjs` now preserves the B-S1B behavior as the reproducible source for later restarts.

Current listeners after restart:

- staging fixture: `127.0.0.1:31861` — live;
- staging tunnel health: `127.0.0.1:51961` — live;
- production v1.0 MCP: `127.0.0.1:31850` — unchanged.

The user-side ChatGPT Business invocation completed successfully against the DB-backed staging profile path. The returned opaque profile identity matched the accepted B-S0 deterministic identity, the nickname matched `ChatAgent Business`, and an email field was present. The email literal is intentionally not persisted in this evidence document. Therefore the end-to-end ChatGPT OAuth bearer → B-S1B fixture → Supabase `bc_member_profile()` path is PASS.

## Advisor review

Supabase Security Advisor after the migration:

- `rls_enabled_no_policy` INFO x9: intentional deny-by-default private-table design; client roles have no direct table/schema grants;
- authenticated `SECURITY DEFINER` WARN x2: intentional public authenticated RPC boundary for `bc_schema_status` and `bc_member_profile`; private helper itself is not client-executable;
- leaked-password protection disabled WARN x1: Supabase documents this feature as available on Pro plan and above. It remains plan-dependent hardening rather than a frozen B-S1 gate; enable it before release when the selected project plan supports it.

References:

- https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy
- https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
- https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

Performance Advisor has no unindexed-foreign-key finding; unused-index INFO is expected on this new low-data staging schema and is not a removal signal.

## Dependency security finding

`npm audit` reports one HIGH advisory against the pre-existing pinned `@modelcontextprotocol/sdk 1.30.0` (`GHSA-6qxp-vccf-f47h`). The advisory is not introduced by `@supabase/supabase-js`. A fix is available in newer MCP SDK versions, but B-S0's OpenAI descriptor/security compatibility was explicitly validated on 1.30.0.

Therefore this unit does **not** silently upgrade the MCP SDK. Track the SDK security/compatibility upgrade as a separate bounded pre-release work unit with B-S0 descriptor + OAuth regression.

## Gate disposition

B-S1B implementation, staging DB/auth/keychain foundation, and the final ChatGPT Business OAuth profile canary are accepted. The member-auth gate is closed:

```text
BUSINESS_S1B_CHATGPT_OAUTH_PROFILE=PASS
BUSINESS_S1_MEMBER_AUTH=PASS
```

The next bounded unit is B-S1C runtime-node lifecycle (`bc_runtime_enroll/status/list/revoke` + PERSONAL_NODE owner binding). PR #7 remains Draft and Business v1.0 production remains unchanged.
