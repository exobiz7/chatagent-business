# ChatAgent Business v1.1 — B-S1C Runtime Node Lifecycle Verification

Date: 2026-10-07
Branch: `feat/business-v1.1-bs1-cloud-foundation`
Production mutation: **NONE**
Staging only: Business v1.1 isolated Supabase project and staging MCP fixture.

## 1. Scope

B-S1C implements the frozen B-S1 runtime-node control contract without adding new public RPC names:

- `bc_runtime_enroll`
- `bc_runtime_status`
- `bc_runtime_list`
- `bc_runtime_revoke`
- `PENDING -> APPROVED -> REVOKED` lifecycle
- `PERSONAL_NODE` owner binding
- ADMIN-only node approval/revocation
- ADMIN-only SHARED_NODE enrollment and explicit shared host-power approval
- bounded runtime-session authorization lease
- revoke-time session invalidation
- persistent local node identity
- operation UUID idempotency for enroll/approval/revoke mutations

B-S2 continuity and B-S1 project-management RPCs remain out of this unit.

## 2. Frozen-contract interpretation

The B-S0 contract freezes the four runtime RPC names above and does not define a separate `bc_runtime_approve` RPC. B-S1C therefore treats `bc_runtime_enroll` as the enrollment handshake:

1. first enrollment creates a `PENDING` node;
2. `p_approve=true` is the exact-node approval leg;
3. approval is accepted only from an active `ADMIN`;
4. the caller cannot supply an authoritative member/owner ID.

For `PERSONAL_NODE`, owner identity is derived only from the authenticated `auth.uid()` member who first enrolls the node. An ADMIN approving another member's node does not become its owner.

## 3. Database implementation

Migration:

`supabase/migrations/20261007190000_business_v11_bs1_runtime_node_lifecycle.sql`

Staging applied migration record:

`20261007090934 business_v11_bs1_runtime_node_lifecycle`

The migration adds:

- unique runtime-session identity `(organization_id, runtime_node_id, user_id)`;
- private canonical input digest helper;
- four frozen runtime RPCs;
- mutation receipts in the existing `operations` table;
- policy-revision increments on approval/revocation;
- bounded session lease renewal through `bc_runtime_status`;
- immediate session revocation when a node is revoked.

No service-role runtime path was introduced. Client roles continue to have no direct private-table access.

## 4. Authority rules validated

### PERSONAL_NODE

- initial owner = authenticated enrolling member;
- owner is not accepted as a model/client parameter;
- non-owner ordinary members cannot inspect or route to another member's PERSONAL_NODE;
- ADMIN may approve/revoke but approval does not transfer ownership;
- generic host authority remains the owning member's normal macOS user authority.

### SHARED_NODE

- enrollment requires ADMIN;
- owner remains organization-level (`owner_user_id = NULL`);
- broad host power remains disabled unless explicitly enabled in the ADMIN approval leg;
- setting shared host power outside that approval leg is rejected.

### Authorization lease

`bc_runtime_status` renews an ACTIVE session lease only for an APPROVED node the caller may route to. The lease duration comes from `control_state.authorization_lease_seconds` and remains bounded by the B-S1 schema contract.

The local authorization helper permits cached authority during control-plane unavailability only when:

- cached node status is APPROVED;
- session state is ACTIVE;
- the authorization lease has not expired;
- PERSONAL_NODE owner / SHARED_NODE host-power rules still hold.

Lease expiry fails closed.

## 5. PostgreSQL 16 integration proof

`BUSINESS_S1C_RUNTIME_NODE_POSTGRES=PASS`

Validated:

- PERSONAL_NODE enroll -> PENDING;
- same operation UUID + same input -> prior receipt;
- same operation UUID + changed input -> idempotency conflict;
- PENDING node does not mint a routing lease;
- MEMBER cannot enroll SHARED_NODE;
- ADMIN approval changes PERSONAL_NODE to APPROVED without stealing ownership;
- unrelated MEMBER cannot inspect another member's PERSONAL_NODE;
- owner status heartbeat creates/renews ACTIVE future lease;
- runtime list hides personal nodes from non-owners;
- SHARED_NODE enrollment and approval are ADMIN-only;
- shared host-power enablement requires the explicit ADMIN approval leg;
- MEMBER cannot revoke a node;
- ADMIN revoke changes lifecycle to REVOKED and revokes node sessions;
- revoked node disappears from eligible runtime list and its ID is terminal;
- anon execution and authenticated direct private-table access remain denied.

## 6. Runtime client / local identity proof

`BUSINESS_S1C_RUNTIME_CLIENT=PASS`

Implemented/validated:

- `BusinessRuntimeRegistry` thin RPC adapter;
- owner-private persistent random runtime-node identity;
- node identity file mode `0600` under owner-private parent;
- bounded cached authorization helper;
- PERSONAL_NODE owner mismatch denial;
- SHARED_NODE generic host-power denial without opt-in;
- cached authorization lease expiry denial.

## 7. Isolated staging live proof

The staging project began B-S1C with zero runtime nodes and zero runtime sessions.

A real Mac Studio staging PERSONAL_NODE was then:

1. assigned a persistent local node identity;
2. enrolled as PENDING through the authenticated ADMIN member;
3. approved through the ADMIN approval leg;
4. observed as APPROVED and `ownedByCaller=true`;
5. refreshed through `bc_runtime_status`, producing the configured bounded lease;
6. returned by `bc_runtime_list` as the caller-eligible runtime node.

The concrete node UUID is intentionally not required in this report; the local identity file remains the canonical staging-node identifier source.

A separate disposable staging node verified revocation without revoking the persistent Mac Studio node:

- disposable lifecycle -> REVOKED;
- disposable runtime session -> REVOKED;
- one persistent APPROVED node remains;
- one ACTIVE session remains for the persistent node;
- control policy revision advanced through approval/revocation mutations.

Current privilege boundary:

- authenticated: EXECUTE allowed on the four `bc_runtime_*` RPCs;
- anon: EXECUTE denied on all four;
- authenticated direct SELECT on `runtime_nodes` and `runtime_sessions`: denied.

## 8. ChatGPT live fixture

The staging MCP fixture on `127.0.0.1:31861` now runs:

`scripts/business/v1.1/bs1c-live-fixture-server.mjs`

DB-backed tools:

- `member_get_profile`
- `runtime_list_nodes`

All other candidate tools remain no-effect probes. The existing staging tunnel remains on `127.0.0.1:51961`. Business v1.0 production MCP remains unchanged on `127.0.0.1:31850`.

The final B-S1C live gate is one user-side ChatGPT Business invocation of `runtime_list_nodes`. Expected result: exactly the persistent APPROVED Mac Studio PERSONAL_NODE, `ownedByCaller=true`; the revoked disposable node must not appear.

## 9. Local regression

Node runtime: `v24.21.0`

```text
BUSINESS_S1C_RUNTIME_NODE_CONTRACT=PASS
BUSINESS_S1C_RUNTIME_NODE_POSTGRES=PASS
BUSINESS_S1C_RUNTIME_CLIENT=PASS
BUSINESS_S1C_LIVE_RUNTIME_LIST_ADAPTER=PASS
npm run test:ci=PASS
git diff --check=PASS
```

B-S0/B-S1A/B-S1B regressions remain PASS.

## 10. Advisor review

Security Advisor after B-S1C:

- RLS-enabled/no-policy INFO x9: intentional deny-by-default private-table design;
- authenticated SECURITY DEFINER WARN x6: intentional authenticated RPC boundary (`bc_schema_status`, `bc_member_profile`, four runtime RPCs);
- leaked-password-protection disabled WARN x1: retained as pre-release hardening item.

References:

- https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy
- https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
- https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

Performance Advisor reports only expected unused-index INFO on the low-data staging schema; no unindexed-FK remediation is outstanding.

## 11. Gate disposition before final ChatGPT runtime-list canary

```text
BUSINESS_S1_NODE_ENROLLMENT=PASS
BUSINESS_S1_NODE_REVOKE=PASS
BUSINESS_S1_PERSONAL_NODE_BINDING=PENDING_CHATGPT_RUNTIME_LIST_LIVE
BUSINESS_S1_LOCAL=IN_PROGRESS
```

After the one live `runtime_list_nodes` canary proves the owner-bound eligible-node view through the real ChatGPT OAuth path, B-S1C and the overall B-S1 gate may close. The next phase is B-S2 TEAM Shared Continuity / Search.
