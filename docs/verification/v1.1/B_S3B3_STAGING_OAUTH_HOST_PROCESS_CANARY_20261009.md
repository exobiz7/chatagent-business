# ChatAgent Business v1.1 — B-S3B-3 Staging OAuth HOST_USER Canary

Date: 2026-10-09 KST
Branch: `feat/business-v1.1-bs3-runtime-routing`
Canary fixture code HEAD: `3c741a9ff951e0e10a323e6599ea4697659d55a9`
Parent accepted bounded unit: **B-S3B-2 — ACCEPTED / CLOSED**

## Current disposition

**B-S3B-3 — STAGING ARMED / LIVE CHATGPT OAUTH EFFECT PENDING**

This document does not mark B-S3B-3 accepted or closed. The isolated staging fixture is ready for the final platform-mediated OAuth process calls, but no OAuth-authenticated host process effect has yet been executed.

## Scope

The canary is restricted to the four B-S3B public process tools:

```text
process_start_host
process_get_status
process_read_output
process_terminate_job
```

Existing B-S3A authenticated reads and `runtime_map_project` / `runtime_unmap_project` remain available for setup/cleanup. Semantic filesystem/Git effects, production relay work, B-S4 work, production cutover, PR Ready transition and merge remain out of scope.

## Pre-activation validation

Authoritative runtime:

```text
/Users/macstudio/.nvm/versions/node/v24.21.0/bin/node
v24.21.0
```

Before staging activation:

```text
BUSINESS_S3B3_LIVE_FIXTURE_SMOKE=PASS
BUSINESS_S3B2_HOST_PROCESS_CONTRACT=PASS
BUSINESS_S3B2_HOST_PROCESS_ADAPTER=PASS
npm run test:ci=PASS
```

The full regression retained B-S0 through B-S3B-2 accepted gates and the Personal standalone suite.

## Temporary live-effect gate

The staging process canary is intentionally narrower than the production Business process contract.

The temporary gate requires:

- existing logical project `bs2a-team-staging`;
- the caller-owned approved staging PERSONAL_NODE;
- the accepted local mapping root `proj04`;
- project-relative cwd `.`;
- exactly the pinned Node v24.21.0 executable;
- one of two exact benign argv fixtures;
- one of two fixed canary idempotency UUIDs held in owner-private local canary state;
- the normal OAuth member, project, B-S3A route, B-S1 node lifecycle/ownership/lease and OS-user checks.

The short fixture only emits a known marker and exits. The long fixture emits a known readiness marker and idles until explicit termination or its bounded timeout.

The temporary idempotency UUIDs and map/unmap operation UUIDs are not committed to repository evidence. They are retained in the owner-private staging canary parameter file.

## Staging activation

The previous B-S3A fixture on `127.0.0.1:31861` was replaced only after verifying its exact staging process identity. The production `127.0.0.1:31850` listener and the staging tunnel `127.0.0.1:51961` were not restarted or modified.

Post-activation health:

```text
status                live
processCanaryEnabled  true
mappingCount           0
processBindingCount    0
hostPathLeaked         false
unauthenticated /mcp   HTTP 401
```

Real process-effect tools reported by health are exactly:

```text
process_start_host
process_get_status
process_read_output
process_terminate_job
```

No process effect or project mapping has occurred at the time of this evidence capture.

## Owner-private staging state

The B-S3B-3 canary state is outside the repository under the existing ChatAgent Application Support hierarchy. It contains:

- the bounded fixture launch configuration;
- non-credential canary operation/idempotency parameters;
- durable process broker state after the first real effect;
- HMAC-sealed Business process binding state after the first real effect.

Permissions are owner-only. The Supabase publishable key remains in the pre-existing owner-private public runtime config; access and refresh tokens are not persisted by this canary fixture.

## Required live closure sequence

The remaining platform-mediated proof is:

```text
actual ChatGPT OAuth member
-> runtime_list_nodes
-> runtime_map_project for bs2a-team-staging
-> process_start_host short fixture
-> process_get_status
-> process_read_output and verify BS3B3_OAUTH_SHORT_OK
-> process_start_host long fixture
-> process_read_output and verify BS3B3_OAUTH_LONG_READY
-> process_get_status
-> process_terminate_job
-> process_get_status until TERMINATED
-> exact-revision runtime_unmap_project
-> verify final mappingCount=0
-> verify production/repository unchanged
```

The local B-S3B-2 suite already proves durable restart/crash reconciliation, no blind replay and exact owned termination. A live staging restart may be added between long-fixture start and status/termination if platform closure evidence requires a second end-to-end restart proof; it is not needed to re-prove the donor core itself.

## Platform boundary

The actual ChatGPT Developer Mode app invocation must originate from the connected ChatGPT OAuth app so that OpenAI tool selection/confirmation/pre-dispatch behavior and the real bearer path are exercised. A local direct HTTP substitute is not accepted as equivalent evidence.

The current engineering environment can arm and verify the staging MCP service but does not expose that custom Developer Mode app as a callable tool to this agent session. Therefore the final OAuth effect is deliberately left pending rather than replaced with synthetic credentials, service-role authority, browser-token extraction, or a non-ChatGPT local bearer shortcut.

## Safety statement

No credential was copied into repository evidence or chat logs. No service-role path was used. No production process was restarted. No repository file effect was performed by the staging canary.

## Gate state

```text
BUSINESS_S3B3_LIVE_FIXTURE_SMOKE = PASS
BUSINESS_S3B3_STAGING_ARMED      = PASS
BUSINESS_S3B3_CHATGPT_OAUTH_PROCESS = PENDING_USER_SIDE_OAUTH_INVOCATION
B-S3B-3 = IN_PROGRESS
B-S3B   = IN_PROGRESS
B-S3    = IN_PROGRESS
```

The next action is closure of this same bounded unit using the real connected ChatGPT Business staging app; do not advance to later B-S3 semantic filesystem/Git work until this live process canary is accepted.
## ChatGPT OAuth discovery checkpoint — 2026-10-09 KST

The recreated development plugin `ChatAgent Business v1.1 B-S3B-3` successfully exposed the canonical 39-tool catalog (23 write / 16 read) and completed authenticated member/profile and runtime-node discovery through the live ChatGPT OAuth path. The authenticated account identifier is intentionally not persisted in repo evidence.

Observed eligible runtime node:

```text
nodeId       ad610e88-e671-4b7d-818d-a2f1f2eb2de1
nodeName     Mac Studio B-S1C
nodeType     PERSONAL_NODE
lifecycle    APPROVED
ownedByCaller true
workspaceRoot proj04
mappedProjects none
```

The discovery response carried an expired historical lease timestamp. This is not treated as HOST_USER readiness evidence and is not a blocker by itself. The B-S3B-3 effect path intentionally calls authenticated `bc_runtime_status` immediately before mapping and again before process routing, which is the authoritative control-plane heartbeat/lease check. Therefore the current disposition is:

```text
BUSINESS_S3B3_CHATGPT_OAUTH_DISCOVERY = PASS
BUSINESS_S3B3_CHATGPT_OAUTH_PROCESS   = EFFECT_PENDING
B-S3B-3                               = IN_PROGRESS
```

No mapping, process, filesystem, Git, or production mutation occurred in this discovery checkpoint.
