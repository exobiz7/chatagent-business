# ChatAgent Business v1.1 — B-S5A Distributed TEAM / Node-Security E2E Foundation

Date: 2026-10-12
Status: **ACCEPTED / CLOSED**
Production mutation: **NONE**
Staging mutation: **NONE**
Production v1.0 final migration: **NOT PERFORMED**

## 1. Scope

B-S5A establishes the distributed TEAM and node-security foundation required before remote Git/GitHub and final OpenAI canaries.

This unit intentionally uses three independent logical participants backed by the real PostgreSQL control/continuity contract:

- A = organization ADMIN + approved SHARED_NODE;
- B = organization MEMBER + approved PERSONAL_NODE;
- C = organization MEMBER + a different approved PERSONAL_NODE.

The test is not represented as three physical computers. Physical remote collaboration remains later B-S5 work.

## 2. Authority exercised

The E2E applies the accepted B-S1/B-S2 migrations to disposable PostgreSQL 16 and uses the authenticated public RPC surface with distinct `auth.uid()` identities.

It exercises:

- organization membership;
- SHARED_NODE enrollment/approval;
- PERSONAL_NODE owner binding and ADMIN approval;
- runtime list/status isolation;
- TEAM project registration;
- task/checkpoint continuity;
- bounded project context;
- history search;
- revision CAS under parallel mutation;
- handoff digest freshness;
- runtime revoke and replacement enrollment;
- local route authorization;
- B-S4 bounded project-authorization degraded lease.

No caller-supplied user/member ID is treated as authority.

## 3. Three-participant visibility

A SHARED_NODE and B/C PERSONAL_NODE identities were enrolled and approved.

Observed visibility:

- B runtime list = A SHARED_NODE + B PERSONAL_NODE;
- C runtime list = A SHARED_NODE + C PERSONAL_NODE;
- C direct status lookup of B PERSONAL_NODE = `BUSINESS_RUNTIME_NODE_DENIED`.

This proves PERSONAL_NODE discovery/authority remains caller-owner scoped while the approved SHARED_NODE is organization-visible.

## 4. TEAM continuity A -> B -> C

A created TEAM project `bs5-team`, started the task, and appended the first checkpoint with A SHARED_NODE recorded as `source_runtime_node_id`.

B then:

- opened bounded TEAM project context;
- found A's task;
- searched history for A's marker;
- appended the next checkpoint with B PERSONAL_NODE provenance.

C then:

- read the same TEAM task;
- observed revision 2;
- searched B's marker successfully.

The B checkpoint runtime provenance was independently verified in the private continuity table; the public task projection remains intentionally narrower and does not expose raw runtime-node provenance.

Result:

```text
BUSINESS_S5A_TEAM_CONTEXT_SEARCH=PASS
```

## 5. True parallel same-revision conflict

B and C launched separate PostgreSQL client sessions concurrently and both attempted a checkpoint append with `expectedTaskRevision=2` and distinct operation IDs.

Observed result:

- exactly one request committed revision 3;
- exactly one request failed with `BUSINESS_REVISION_CONFLICT`;
- final task revision = 3;
- total task checkpoints = 3.

This is an actual parallel database race, not a sequential mock of stale input.

Result:

```text
BUSINESS_S5A_PARALLEL_REVISION_CONFLICT=PASS
```

## 6. Stale handoff digest

A's handoff digest was captured immediately after A's first checkpoint.

After B's checkpoint and the B/C revision race, the current task was reassembled with the production handoff canonicalization.

Applying A's old digest to current state produced:

```text
freshness = STALE
freshnessReason = TASK_STATE_CHANGED
```

Result:

```text
BUSINESS_S5A_STALE_DIGEST=PASS
```

## 7. PERSONAL_NODE host isolation

B's approved PERSONAL_NODE route was accepted for B under the production runtime router.

The same node represented to C with `ownedByCaller=false` was rejected:

```text
BUSINESS_PERSONAL_NODE_OWNER_MISMATCH
```

This complements the PostgreSQL-side `BUSINESS_RUNTIME_NODE_DENIED` result and proves both cloud discovery and node-local route admission preserve owner isolation.

Result:

```text
BUSINESS_S5A_PERSONAL_NODE_ISOLATION=PASS
```

## 8. Revoke and replacement enrollment

ADMIN A revoked B's original PERSONAL_NODE.

Verified effects:

- lifecycle becomes `REVOKED`;
- B no longer receives active node authority;
- production router rejects the revoked node with `BUSINESS_RUNTIME_NODE_REVOKED`;
- the revoked node ID is terminal and cannot be re-enrolled;
- B enrolled a new replacement PERSONAL_NODE ID;
- ADMIN approved the replacement;
- B owns the replacement and route authorization succeeds.

Result:

```text
BUSINESS_S5A_REVOKE_REENROLL=PASS
```

## 9. B-S4 degraded-authority reuse

The B-S4 `BusinessProjectAuthorizationCache` was reused with participant B and `bs5-team`.

Verified behavior:

- fresh control-plane authorization -> `CONTROL_PLANE`;
- backend outage within TTL -> `CACHED_LEASE`;
- TTL expiry -> `BUSINESS_PROJECT_AUTH_LEASE_EXPIRED`.

The cache remains member+project scoped, memory-only and outage-only. It is not an offline continuity database and provides no open-ended authority.

Result:

```text
BUSINESS_S5A_DEGRADED_AUTHORITY_REUSE=PASS
```

## 10. Regression evidence

Targeted:

```text
npm run test:business:bs5a
BUSINESS_S5A_DISTRIBUTED_TEAM_NODE_SECURITY=PASS
```

Authoritative full suite:

```text
Node v24.21.0
npm run test:ci
TEST_CI_EXIT=0
```

The B-S5A marker is present in the full CI log and the process completed successfully.

## 11. Runtime / production non-mutation

After testing:

```text
Production 31850 = PID 8871
Staging    31861 = PID 83759
Tunnel     51961 = PID 99496
```

Staging health remained:

```text
safetyCanaryEnabled = false
processEffectTools   = []
mappingCount         = 0
```

No B-S5A Docker fixture remains.

## 12. What is not yet claimed

B-S5A does **not** claim completion of:

- a three-physical-device fleet;
- real remote B-node clone/map/edit/commit/push/PR collaboration;
- C fresh-chat verification against that remote Git result;
- live Supabase outage against the final integrated multi-node gateway;
- branch-protection/CI/review non-bypass E2E;
- the full mandatory OpenAI Developer Mode canary matrix.

Those remain required for later B-S5 units.

## 13. B-S5A verdict

```text
BUSINESS_S5A_THREE_LOGICAL_PARTICIPANTS=PASS
BUSINESS_S5A_TEAM_CONTEXT_SEARCH=PASS
BUSINESS_S5A_PARALLEL_REVISION_CONFLICT=PASS
BUSINESS_S5A_STALE_DIGEST=PASS
BUSINESS_S5A_PERSONAL_NODE_ISOLATION=PASS
BUSINESS_S5A_REVOKE_REENROLL=PASS
BUSINESS_S5A_DEGRADED_AUTHORITY_REUSE=PASS
BUSINESS_S5A=PASS
```

**B-S5A is ACCEPTED / CLOSED.**

B-S5 top-level remains IN_PROGRESS.

## 14. Next bounded unit

B-S5B — Remote Collaboration / GitHub E2E Foundation:

- bind a real STANDARD Git repository to participant B's PERSONAL_NODE workspace;
- clone/map/edit/stage/commit/fetch/ff-only pull/non-force push;
- create Draft PR under real provider policy;
- append TEAM checkpoint with commit/PR observation;
- verify participant C sees the latest TEAM continuity;
- verify branch protection / provider policy remains external authority and is not bypassed;
- retain production v1.0 frozen.
