# ChatAgent Business v1.1 — B-S2B Context/Search Verification Report

Date: 2026-10-07 KST
Scope: **B-S2B — Task Completion + Project Context + PostgreSQL History Search**
Status: **PASS — B-S2C remains pending**

## Scope

B-S2B adds only the next bounded continuity slice on top of accepted B-S2A:

- `bc_task_complete`;
- bounded `bc_project_context`;
- PostgreSQL full-text `bc_history_search`;
- TEAM broad search/context;
- PRIVATE explicit-member search/context isolation;
- completion immutability;
- thin client methods for completion/context/search.

B-S2B deliberately does **not** implement contextDigest, FRESH/STALE/UNVERIFIED, handoff size semantics, export/import, or B-S3 execution behavior.

## PostgreSQL FTS design

PostgreSQL 16 reports `array_to_string(text[])` as `STABLE`, so B-S2B does not mis-declare it as immutable merely to satisfy an expression index. Instead, private `search_text` columns are materialized in `tasks` and `checkpoints`, backfilled for B-S2A rows, and maintained by the existing task/checkpoint mutation RPCs.

GIN indexes are then validly defined as:

```text
GIN(to_tsvector('simple', search_text))
```

Search uses `websearch_to_tsquery('simple', query)`. No vector database, embeddings, RAG, KG, or ontology side-project is introduced.

Search corpus covers task objective/tags and checkpoint summary, current state, next actions, verification, decisions, facts and artifact references.

## Completion correctness

`bc_task_complete` preserves the Personal-derived mutation contract:

```text
project authorization
-> continuity state lock
-> operation UUID receipt check
-> task row lock
-> exact revision CAS
-> terminal mutation
-> TASK_COMPLETED event/head/contextSeq advance
-> operation receipt
```

Verified:

- same completion operation + same input returns the prior receipt;
- changed input with the same operation UUID returns `BUSINESS_IDEMPOTENCY_CONFLICT`;
- stale task revision returns `BUSINESS_REVISION_CONFLICT`;
- completed tasks reject later checkpoints with `BUSINESS_TASK_COMPLETED`;
- a second completion using a new operation UUID is rejected;
- completed history remains searchable.

## Bounded context

`bc_project_context(projectId, limit)`:

- defaults to 10 tasks;
- accepts 1..20 only;
- prioritizes ACTIVE tasks, then recent completed tasks;
- returns one latest checkpoint per selected task;
- returns current continuity `contextSeq`;
- reuses `_require_project_access()` for TEAM/PRIVATE authorization.

The 8 KiB target / 24 KiB hard handoff cap remains B-S2C work.

## TEAM / PRIVATE search authorization

PostgreSQL16 integration with synthetic ADMIN/MEMBER/outsider identities proves:

- a normal active organization member can search and read TEAM continuity;
- a non-member of a PRIVATE project cannot call context or history search;
- an explicit PRIVATE member can search the PRIVATE project;
- there is no implicit ADMIN content bypass added to `_require_project_access()`.

## PostgreSQL16 integration

```text
BUSINESS_S2B_SEARCH_CONTRACT=PASS
BUSINESS_S2B_CONTINUITY_POSTGRES=PASS
BUSINESS_S2B_CONTINUITY_CLIENT=PASS
```

Additional proof:

- pre-existing B-S2A task/checkpoint rows are backfilled into the FTS corpus;
- both GIN indexes exist;
- task-objective search returns TASK results;
- decisions/facts/artifacts participate in CHECKPOINT search;
- completed history remains discoverable;
- context/search limits above 20 fail closed;
- anon execution remains denied.

## Isolated staging proof

Applied only to the dedicated Business v1.1 staging Supabase project.

Migration:

```text
20261007145024 business_v11_bs2_completion_context_search
```

Observed:

```text
FTS GIN indexes             2
B-S2A task backfill         PASS
B-S2A checkpoint backfill   PASS
TASK_COMPLETED event        PRESENT
TEAM query result           PRESENT
PRIVATE member query        PRESENT
bounded context result      2 tasks
```

The staging proof does not persist user email, OAuth token, profile identifier, runtime-node identifier, or Supabase secret in verification evidence.

## Advisor review

Performance Advisor has no unindexed-foreign-key finding after B-S2A remediation. Remaining findings are `unused_index` INFO expected on low-data staging, including the newly created GIN indexes.

Reference: https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index

Security Advisor continues to report RLS-without-policy INFO and authenticated SECURITY DEFINER warnings. This is intentional for the RPC-only deny-by-default design: private schemas/tables have no direct client grants and only bounded authenticated RPCs are exposed.

References:

- https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy
- https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
- https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

Leaked-password protection remains a separate pre-release Auth hardening item.

## Regression

Node runtime: `v24.21.0`

```text
npm run test:business:bs2a    PASS
npm run test:business:bs2b    PASS
npm run test:business:bs1c    PASS
npm run test:ci               PASS
git diff --check              PASS
B_S2B_FULL_REGRESSION         PASS
```

Business v1.0 production runtime, data, tag and tunnel remain unchanged.

## Gate disposition

```text
BUSINESS_S2B_TASK_COMPLETION=PASS
BUSINESS_S2B_PROJECT_CONTEXT=PASS
BUSINESS_S2_TEAM_SEARCH=PASS
BUSINESS_S2_PRIVATE_ISOLATION=PASS
BUSINESS_S2_CAS_IDEMPOTENCY=PASS
```

Overall B-S2 remains **IN_PROGRESS** because B-S2C still owns contextDigest, FRESH/STALE/UNVERIFIED, handoff bounds and final continuity export/closure work.
