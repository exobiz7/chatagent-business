# ChatAgent Business v1.1 — B-S2C Handoff / Freshness / Export Verification

Date: 2026-10-08 KST
Branch: `feat/business-v1.1-bs2-continuity-foundation`
B-S2B base HEAD: `c69b43ce13be10045c65e17d5dd2f7880ad512d9`

## Scope

B-S2C completes the Business shared-continuity read/handoff contract without starting B-S3 runtime-effect work.

Implemented and verified:

- deterministic Business `contextDigest` using the existing v1 Business handoff basis;
- `FRESH / STALE / UNVERIFIED` freshness semantics;
- deterministic handoff pruning to an ordinary target of 8 KiB with a 24 KiB hard cap;
- tail-integrity status on bounded continuity reads;
- full event-chain verification before logical export;
- caller-authorized project-scoped `bc_export_snapshot`;
- public logical `projectId` key adapters for all seven frozen continuity RPC names;
- authenticated public surface lockdown so UUID overloads remain internal implementation details;
- `bc_import_snapshot` remains absent from the runtime surface and is deferred to B-S4 migration rehearsal/cutover work.

Production v1.0 was not changed.

## Digest and freshness contract

The handoff digest remains distinct from the Supabase event-chain hash and the logical export digest.

The digest basis contains only task-scoped continuity state and intentionally excludes unrelated organization/project sequence advancement. Therefore:

- unchanged task state + matching prior digest -> `FRESH / CONTEXT_DIGEST_MATCH`;
- related checkpoint/completion change + old digest -> `STALE / TASK_STATE_CHANGED`;
- unavailable backend or failed integrity verification -> `UNVERIFIED` with no trusted context digest.

The handoff package is context-only and grants no host authority.

## Size bounds

Validated contract:

```text
ordinary target = 8192 bytes
hard cap        = 24576 bytes
```

Optional `facts`, `artifacts`, and `decisions` are deterministically pruned before exceeding the target. Required task/current-state fields remain intact. A package that still exceeds the hard cap fails closed.

## PostgreSQL / staging verification

PostgreSQL 16 integration and isolated Business v1.1 staging both verified:

- `bc_task_get` and `bc_project_context` return an integrity-verification signal;
- project export verifies the complete event chain before returning data;
- export contains project metadata, tasks, checkpoints, operation receipts, events, counts, project event high-watermark and a logical digest;
- PRIVATE project export reuses the explicit-member authorization boundary and cannot bypass it;
- direct private-table client access remains denied;
- runtime `bc_import_snapshot` remains absent.

Staging migrations applied for this unit:

- `business_v11_bs2_handoff_export`
- `business_v11_bs2_project_key_rpc_adapters`
- `business_v11_bs2_public_rpc_surface_lockdown`

A temporary no-op migration-history marker accidentally created during verification was removed immediately. It made no schema or data changes and is absent from the final migration history.

## Public project identity alignment

A B-S2C pre-close review found that the ChatGPT-facing MCP contract uses logical project keys such as `dev`, while the initial Supabase RPC core used internal UUID project IDs. B-S2C resolves this mismatch without expanding the frozen RPC-name inventory:

```text
public MCP projectId key
-> authenticated text overload
-> organization-scoped project-key resolver
-> existing UUID core implementation
```

Final staging privilege state:

```text
authenticated UUID continuity overloads     0 executable
authenticated project-key overloads         7 executable
runtime bc_import_snapshot                  absent
```

The caller never supplies a member ID or internal project UUID as authority.

## Local validation

Node `v24.21.0`:

```text
BUSINESS_S2C_HANDOFF_CONTRACT          PASS
BUSINESS_S2C_HANDOFF_POSTGRES          PASS
BUSINESS_S2C_HANDOFF_CLIENT            PASS
BUSINESS_S2C_LIVE_CONTINUITY_ADAPTER   PASS
B-S2A regression                       PASS
B-S2B regression                       PASS
B-S1C regression                       PASS
npm run test:ci                        PASS
git diff --check                       PASS
B_S2C_FULL_REGRESSION                  PASS
```

The live adapter forwards only the OAuth access token and publishable Supabase key to bounded `bc_*` RPCs. It does not use a service-role credential.

## Advisor disposition

Performance advisor has only low-data staging `unused_index` INFO findings; no new unindexed-FK finding was introduced.

Security advisor continues to report the intentionally RPC-only design:

- private tables have RLS enabled with no direct client policies;
- authenticated `SECURITY DEFINER` RPCs are the deliberate bounded API boundary;
- leaked-password protection remains a separate pre-release Auth hardening item.

## Live canary status

B-S2C staging fixture is live on the existing isolated staging MCP endpoint. DB-backed read tools are:

- `member_get_profile`
- `runtime_list_nodes`
- `continuity_get_context`
- `continuity_prepare_handoff`
- `continuity_search_history`

Continuity mutation tools remain no-effect fixture probes.

One actual ChatGPT OAuth handoff/freshness canary remains before B-S2 can be closed. Until that canary passes:

```text
BUSINESS_S2_HANDOFF_FRESHNESS = PENDING_CHATGPT_OAUTH_LIVE
BUSINESS_S2_LOCAL             = IN_PROGRESS
```
