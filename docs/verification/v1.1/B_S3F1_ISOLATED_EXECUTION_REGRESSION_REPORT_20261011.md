# ChatAgent Business v1.1 — B-S3F-1 Isolated Execution Regression Report

> Date: 2026-10-11 KST
> Scope: `process_start_isolated` + shared process follow-up contract + existing Business Docker sandbox
> Result: **ACCEPTED / CLOSED**
> Production mutation: **none**

## Purpose

B-S3F-1 closes the remaining B-S3 isolated-execution regression gate without replacing the proven Business v1 Docker sandbox.

The accepted architecture requires both execution modes to coexist truthfully:

```text
HOST_USER
ISOLATED
```

`HOST_USER` is broad logged-in macOS-user authority. `ISOLATED` is the existing bounded Docker plane. A SHARED_NODE may use ISOLATED even when broad shared host-power remains disabled.

## Reuse boundary

The existing `BusinessExecManager` in `scripts/business/business-exec.mjs` remains the execution engine.

Its container creation/isolation behavior was not reimplemented. B-S3F-1 adds only thin v1.1 integration seams:

- mapped Business OAuth/project/node routing;
- STANDARD-project admission;
- isolated process binding to actor/project/node/mapping revision;
- shared public process follow-up dispatch;
- common local-effect audit support for isolated start/terminate;
- a read-only `status()` method on the existing manager.

Existing Docker session semantics remain intentionally non-durable across control-plane recreation. This is not presented as HOST_USER durable-process parity.

## Public process contract

The published surface remains:

```text
process_start_host
process_start_isolated
process_get_status
process_read_output
process_terminate_job
```

Host process IDs remain UUIDs. Isolated process IDs retain the existing B5 namespace:

```text
xexec_<32 lowercase hex>
```

The shared follow-up dispatcher resolves the implementation server-side from this disjoint process-ID namespace. Public follow-up calls still accept only `processId`; they do not accept model-supplied member, project, node, owner or PID authority.

## Isolated authority path

The v1.1 isolated start path is:

```text
validated OAuth member
→ authorized logical project
→ project profile == STANDARD
→ B-S3A mapped runtime route
→ B-S1 node lifecycle / lease authority
→ existing BusinessExecManager
→ pinned Docker binary + pinned ARM64 Linux image
```

Unlike `process_start_host`, `process_start_isolated` does not require SHARED_NODE broad host-power opt-in. The Docker sandbox is the confinement boundary.

Every status/read/terminate call resolves the owner-private isolated binding, then revalidates:

- actor digest;
- logical project authorization;
- runtime node ID/type;
- exact mapping revision;
- current route authority.

A changed mapping revision therefore fails with `BUSINESS_PROCESS_ROUTE_STALE`.

## Owner-private isolated binding

New binding state:

```text
business-isolated-process-bindings.json
business-isolated-process-bindings.key
```

The registry is owner-private and HMAC sealed.

It persists only bounded authority metadata:

- actor digest;
- processId;
- projectId;
- runtimeNodeId;
- mappingRevision;
- nodeType;
- executionMode=`ISOLATED`;
- createdAt.

It does not persist command text, cwd, stdout/stderr, OAuth subject plaintext, credentials or host roots.

## Existing sandbox properties revalidated

The actual pinned Docker execution was exercised, not merely source-inspected.

Verified properties:

```text
non-root user
read-only container root filesystem
network mode = none
Docker socket absent
credential/secret-like environment absent
project-only writable bind mount
.git nested read-only bind mount when present
pids limit = 128
bounded CPU / memory / output / timeout
cap-drop ALL
no-new-privileges
/tmp only bounded tmpfs
```

The pinned image identity remained:

```text
node@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6
arm64/linux
```

## SHARED_NODE boundary

A synthetic APPROVED SHARED_NODE with:

```text
sharedHostPowerEnabled=false
```

was used for the v1.1 behavioral test.

Expected and observed:

```text
process_start_host     → BUSINESS_SHARED_HOST_POWER_DENIED
process_start_isolated → allowed for mapped STANDARD project
```

This proves the isolated path does not inherit generic HOST_USER authority and remains the supported bounded execution path on a shared node without broad host-power approval.

## Shared follow-up behavior

The v1.1 adapter successfully exercised:

```text
process_start_isolated
→ process_get_status
→ process_read_output
→ process_terminate_job
```

A completed isolated command returned the `xexec_...` process ID through the public adapter and was readable through the shared follow-up API.

A long-running isolated command emitted a known marker, remained RUNNING, was terminated through `process_terminate_job`, and reached `TERMINATED` without invoking the HOST_USER service.

Actor mismatch was denied and route revision change was denied before read/status access.

## Audit

`BusinessLocalEffectAudit` now also accepts the focused process events:

```text
process_start_isolated / EXEC_ISOLATED_START
process_terminate_job  / EXEC_ISOLATED_TERMINATE
```

The HMAC audit records authority/effect metadata only. Tests verified that it contains no command text, output marker, OAuth subject plaintext or absolute project root.

Existing filesystem/Git/GitHub audit records remain backward compatible; full B-S3C/D regression passed after the enum expansion.

## Existing B5 regression

The original `BUSINESS_B5_ISOLATED_STANDARD_EXEC` suite was rerun unchanged except for consuming the same source with the added read-only manager status method.

It passed all established behaviors, including:

- Docker/image Doctor verification;
- fixed B5 v1 contract;
- SAFE denial;
- cwd escape denial;
- caller env injection denial;
- real isolation probes;
- session/project ownership;
- timeout and output bounds;
- Safe Replace development loop;
- metadata-only audit;
- runtime-stop container cleanup;
- intentionally non-durable isolated sessions across restart;
- backup identity hygiene;
- image mismatch failure;
- SAFE-pilot isolation.

Result:

```text
BUSINESS_B5_ISOLATED_STANDARD_EXEC=PASS
```

## B-S3F-1 tests

Targeted results:

```text
BUSINESS_S3F1_ISOLATED_CONTRACT=PASS
BUSINESS_S3F1_ISOLATED_EFFECTS=PASS
BUSINESS_B5_ISOLATED_STANDARD_EXEC=PASS
```

The first full regression exposed one stale B-S3D-1 source-text assertion that required the local-audit tool regex to be exactly `fs|git|github`. The product behavior was not broken. The assertion was narrowed to prove those three existing domains remain accepted while allowing the new `process` domain.

Post-fix authoritative regression:

```text
Node v24.21.0
npm run test:ci
TEST_CI_EXIT=0
git diff --check=PASS
```

## Runtime / production freeze

No live project/node/control-plane mutation was used for B-S3F-1.

At closure the existing listeners remained:

```text
production 31850 = unchanged
staging    31861 = unchanged, all temporary B-S3D effect gates disabled
tunnel     51961 = unchanged
```

No production restart, staging effect activation, project mapping, Supabase mutation or canonical-repository effect occurred as part of the isolated regression.

## Deferred live OpenAI proof

B-S3F-1 proves the implementation and actual Docker isolation locally. It does not claim that a live ChatGPT OAuth invocation of `process_start_isolated` has already occurred.

That final platform/tool-selection behavior belongs to the next B-S3 safety canary, which must include `process_start_isolated` together with representative semantic and power-tool selections.

## Closure

B-S3F-1 is **ACCEPTED / CLOSED**.

The top-level gate is now:

```text
BUSINESS_S3_ISOLATED_REGRESSION=PASS
```

The only remaining B-S3 top-level gate is the OpenAI safety/tool-selection canary.
