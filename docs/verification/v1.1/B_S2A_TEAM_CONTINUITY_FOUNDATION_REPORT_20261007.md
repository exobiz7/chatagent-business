# ChatAgent Business v1.1 — B-S2A TEAM Shared Continuity Foundation

Date: 2026-10-07 KST
Branch: `feat/business-v1.1-bs2-continuity-foundation`
Base accepted B-S1 HEAD: `63de5e25a6af5b2b4ea8846ef166e104cb305d0d`
Production v1.0 mutation: **NONE**

## Scope

B-S2A implements the minimum cloud continuity foundation required before search/context/handoff work:

- exact frozen `private_business_continuity` six-table schema;
- real TEAM default / PRIVATE explicit-member authorization using the control plane;
- task start, checkpoint append, and task read core;
- operation UUID idempotency receipts;
- task revision CAS;
- transactional event/head/context sequence;
- Personal-derived sensitive-text guard before RPC persistence plus server-side revalidation;
- RLS/direct-table deny and authenticated RPC-only client boundary;
- PostgreSQL 16 integration and isolated staging proof.

Explicitly deferred from B-S2A:

- `bc_task_complete`;
- `bc_project_context`;
- `bc_history_search` / PostgreSQL full-text search;
- `bc_export_snapshot`;
- temporary migration-only `bc_import_snapshot`;
- Business handoff/contextDigest/FRESH-STALE-UNVERIFIED and 8 KiB / 24 KiB handoff bounds.

Those remain B-S2B/B-S2C work. B-S3 execution semantics are not part of this unit.

## Project-policy prerequisite completion

During B-S2A preflight, the frozen B-S0 contract was rechecked. The following control RPC names had been frozen but were not yet physically implemented by B-S1 migrations:

- `bc_project_register`
- `bc_project_set_mode`
- `bc_private_member_add`
- `bc_private_member_remove`

B-S1 accepted gates remain closed; they are not reopened. B-S2A completes these as a prerequisite because TEAM/PRIVATE continuity cannot be truthfully validated without the real control-plane policy boundary.

Implemented behavior:

- project create/configure requires ADMIN or PM;
- project registration defaults to `TEAM`;
- PRIVATE registration explicitly binds the creating manager as a private member;
- PRIVATE visibility is explicit membership based, not implicit ADMIN/PM content bypass;
- project-policy mutation uses operation UUID idempotency and policy revisions;
- direct private-table access remains denied.

## Frozen continuity schema

Exactly six tables are created under `private_business_continuity`:

1. `schema_meta`
2. `continuity_state`
3. `tasks`
4. `checkpoints`
5. `operations`
6. `events`

No second logical-project master is created. `tasks`, `checkpoints`, and `events` reference `private_business_control.logical_projects`.

## Mutation correctness

The B-S2A transaction core follows the Personal v1.1 pattern adapted for Business organization/project policy:

1. derive authenticated member from `auth.uid()`;
2. resolve TEAM/PRIVATE project access from the control plane;
3. reject sensitive input before persistence;
4. lock organization continuity state;
5. check operation UUID receipt;
6. same operation + same input returns prior receipt;
7. same operation + changed input returns `BUSINESS_IDEMPOTENCY_CONFLICT`;
8. checkpoint append locks task and enforces exact expected revision;
9. exactly one same-revision concurrent writer commits;
10. loser returns `BUSINESS_REVISION_CONFLICT`;
11. append hash-linked continuity event;
12. advance `context_seq` and head hash in the same transaction.

## Sensitive-text guard reuse

The Business client guard reuses the validated Personal credential-pattern behavior for:

- `sk-*` style tokens;
- GitHub token prefixes;
- Bearer token text;
- `password=` / `password:`;
- `api_key=` / `api-key:` style material;
- PEM private-key headers;
- disallowed control characters.

Both TEAM and PRIVATE continuity writes use the same hygiene boundary. Rejected values are not inserted into continuity tables or event payloads. Server RPCs revalidate independently so a client cannot bypass the guard.

## PostgreSQL 16 integration

PASS:

```text
BUSINESS_S2A_CONTINUITY_CONTRACT=PASS
BUSINESS_S2A_CONTINUITY_POSTGRES=PASS
BUSINESS_S2A_CONTINUITY_CLIENT=PASS
```

Validated with synthetic ADMIN/MEMBER/outsider identities:

- TEAM task is readable by another active organization member;
- PRIVATE task is denied to an active organization member without explicit private membership;
- adding explicit PRIVATE membership permits use;
- removing that membership immediately removes PRIVATE task access;
- same task-start operation and input returns identical receipt;
- changed task-start input with same operation UUID fails idempotency;
- same checkpoint operation and input returns identical receipt;
- changed checkpoint input with same operation UUID fails idempotency;
- two concurrent checkpoint writers at the same expected revision yield exactly one commit and one revision conflict;
- synthetic credential-like task/checkpoint content is rejected before persistence;
- direct continuity-table access by `authenticated` is denied;
- anon execution of continuity RPCs is denied;
- event count equals continuity context sequence and the head hash is valid.

## Isolated staging proof

Supabase project: `chatagent-business-v1.1-bs0` staging project (`ap-northeast-2`).

Applied migrations:

- `20261007142542 business_v11_bs2_project_policy_prereqs`
- `20261007142643 business_v11_bs2_continuity_foundation`
- `20261007142954 business_v11_bs2_continuity_fk_indexes`

Observed structure:

```text
continuity tables          6
RLS-enabled tables         6/6
anon/auth table grants     0
frozen project RPCs        4/4
B-S2A continuity RPCs      3/3
```

Staging data proof uses synthetic B-S2A projects only:

```text
TEAM project               TEAM
PRIVATE project            PRIVATE
PRIVATE explicit members   1
continuity tasks            2
checkpoints                 1
operation receipts          3
events                      3
contextSeq                  3
head hash                   valid
```

The staging transaction also passed same-input replay, changed-input conflict, stale-revision conflict, and synthetic sensitive-text rejection. No user email, OAuth token, profile identifier, or runtime-node identifier is persisted in this report.

## Advisor review

Security Advisor:

- RLS-enabled/no-policy INFO is intentional because private tables have no direct client grants and the public RPCs are the authorization boundary;
- authenticated SECURITY DEFINER warnings are expected for the intentionally exposed bounded RPC layer;
- leaked-password protection remains a separate pre-release Auth hardening item.

References:

- https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy
- https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
- https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

Performance Advisor initially identified nine unindexed continuity foreign keys. A separate follow-up migration added covering indexes; the unindexed-FK finding count is now **0**. Remaining `unused_index` findings are expected INFO on a newly created low-data staging schema.

Reference:

- https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys

## Regression

Node runtime: `v24.21.0`

```text
npm run test:business:bs2a    PASS
npm run test:business:bs1c    PASS
npm run test:ci               PASS
git diff --check              PASS
B_S2A_FULL_REGRESSION         PASS
```

Business v1.0 production runtime/tunnel/data remain unchanged.

## Gate disposition

B-S2A is accepted as a bounded sub-unit:

```text
BUSINESS_S2A_SCHEMA_FOUNDATION=PASS
BUSINESS_S2A_PROJECT_POLICY_PREREQ=PASS
BUSINESS_S2A_TEAM_PRIVATE_BOUNDARY=PASS
BUSINESS_S2A_CAS_IDEMPOTENCY=PASS
BUSINESS_S2A_SENSITIVE_TEXT_GUARD=PASS
BUSINESS_S2A_STAGING_APPLY=PASS
```

Overall B-S2 remains **IN_PROGRESS** because full-text history search, task completion, context/handoff/freshness, and export/import work are not yet complete.

Next bounded unit: **B-S2B — Task Completion + Project Context + PostgreSQL History Search**, including TEAM broad search and PRIVATE search isolation. Handoff/contextDigest freshness is kept for B-S2C.
