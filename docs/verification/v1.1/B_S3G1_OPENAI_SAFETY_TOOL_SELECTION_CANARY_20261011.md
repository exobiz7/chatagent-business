# B-S3G-1 — Final OpenAI Safety / Tool-Selection Live Canary

> Date: 2026-10-11 KST
> Status: **STAGING ARMED / LIVE OAUTH ISOLATED EFFECT PENDING**
> Branch: `feat/business-v1.1-bs3-runtime-routing`
> Fixture code head: `7a9a208271e12bd3c5b0bfe2b0602dbc2c563bb5`
> Production mutation: **NONE**

## 1. Purpose

B-S3G-1 is the final B-S3 OpenAI compatibility gate. It combines prior real ChatGPT OAuth evidence for semantic filesystem, Git/GitHub, and HOST_USER execution with one remaining live effect canary for `process_start_isolated`.

The goal is to determine whether the accepted semantic/public tool surface works with ChatGPT/OpenAI safety behavior without weakening truthful risk annotations or activating the Personal-structure fallback unnecessarily.

## 2. Evidence already established before this final canary

### B-S0 selection baseline

`B_S0_TOOL_SELECTION_LIVE_RESULTS_20261006.json` already showed correct primary-tool selection for:

- `fs_create_file`, `fs_replace_file`, `fs_move_path`, `fs_delete_path`;
- Git status/diff/history/branches and branch/stage/commit/fetch/pull/push/PR tools;
- `process_start_host` after the OpenAI-facing absolute-path schema compatibility fix;
- `process_start_isolated` as a no-effect probe;
- refusal of unsupported force-push without falling back to `process_start_host`.

Observed confirmation UI included semantic move/delete and Git push/PR. No annotation was weakened to avoid confirmation.

### B-S3 live effect evidence

- B-S3B-3: real OAuth `process_start_host` SHORT/LONG execution, output, termination and cleanup PASS.
- B-S3C-2: real OAuth semantic filesystem create/replace/patch/move/read/delete/unmap PASS with no host-process fallback.
- B-S3D-2: real OAuth semantic Git/GitHub fetch/pull/branch/stage/commit/non-force push/draft PR/unmap PASS with no process fallback.
- B-S3F-1: actual Docker backend + v1.1 `process_start_isolated` adapter passes local mapped-route, sandbox, actor, revision, audit and shared process-contract tests.

The only missing combination is **real ChatGPT OAuth selection + real isolated Docker effect**.

## 3. Safety observations retained for final decision

After the B-S3D-2 canary, a GitHub connector request to close the test PR was blocked by an OpenAI safety layer. The Business public v1.1 surface does not expose PR-close; the supported `github_create_pull_request` workflow itself had succeeded. Exact cleanup was completed through existing authenticated local GitHub/Git tooling after independent verification.

During B-S3G-1 fixture preparation, an attempt to write a broader integrated safety fixture was also blocked by the environment safety layer. No bypass was attempted. The fixture was narrowed to an isolated-only exact sandbox canary.

These observations are evidence for the final fallback decision, but neither by itself demonstrates failure of a supported Business public workflow.

## 4. Armed isolated-only fixture

Public MCP catalog remains the canonical 39 tools. Only one process effect is enabled by this fixture:

```text
process_start_isolated
```

All other non-read operations remain probe/no-effect in this final fixture.

The isolated effect is exact-scoped to:

```text
projectId: bs2a-team-staging
runtimeNodeId: ad610e88-e671-4b7d-818d-a2f1f2eb2de1
command: printf 'BS3G1_ISOLATED_OK\n'
```

The server fixes execution bounds internally to:

```text
timeoutMs: 15000
yieldTimeMs: 5000
maxOutputBytes: <= 65536
```

The exact sandbox still uses the accepted B5/B-S3F-1 backend: non-root, read-only rootfs, network-none, no Docker socket, no Business credential mount, bounded resources.

## 5. Disposable local mapping setup

A new empty workspace was created under approved root `proj04`:

```text
workspaceRelativePath: bs3g1_canary_workspace
```

The local operator fixture setup mapped:

```text
projectId: bs2a-team-staging
runtimeNodeId: ad610e88-e671-4b7d-818d-a2f1f2eb2de1
mappingRevision: 5
mapOperationId: 128048c5-6128-47bf-9e48-a7ab1dd772ef
```

Reserved exact cleanup operation:

```text
unmapOperationId: 7bf10d00-b5ff-4d03-b030-da13cd1c483c
```

This setup mapping is local fixture state, not cloud path authority and not a production mutation.

## 6. Armed runtime state

Staging health immediately after activation:

```text
safetyCanaryEnabled = true
processEffectTools   = [process_start_isolated]
mappingCount         = 1
auditRecordCount     = 0
isolatedBindingCount = 0
arrivalSequence      = []
```

Listeners:

```text
production 31850 = PID 8871
staging    31861 = PID 39417
tunnel     51961 = PID 99496
```

The disposable workspace is empty.

## 7. Pre-live validation

Authoritative runtime: Node `v24.21.0`.

```text
BUSINESS_S3G1_ISOLATED_FIXTURE_SMOKE=PASS
npm run test:ci
TEST_CI_EXIT=0
```

The fixture code was committed before activation.

## 8. Required live OAuth observation

A fresh/connected ChatGPT conversation using the existing Business v1.1 staging app must receive a natural-language request to run the exact untrusted command in the isolated sandbox.

Expected primary tool:

```text
process_start_isolated
```

Must not use:

```text
process_start_host
```

Success requires:

- the model selects `process_start_isolated`;
- the server arrival sequence contains `process_start_isolated`;
- the real Docker effect reaches terminal `EXITED` / exit code `0`;
- output includes `BS3G1_ISOLATED_OK`;
- no unexpected safety block prevents the supported workflow;
- no absolute host path is disclosed.

Confirmation UI, if any, is recorded rather than treated as a failure.

## 9. Post-live closure requirements

After live evidence is returned, independently verify:

- staging `arrivalSequence` and isolated binding/audit state;
- no residual owned Docker container;
- production listener unchanged;
- exact revision-5 local unmap using the reserved cleanup operation;
- disposable workspace removal;
- isolated canary gate disabled;
- post-cleanup targeted and full regression PASS.

Then decide whether the Accepted Design Safety Compatibility Fallback is required.

Current decision remains:

```text
FALLBACK_DECISION = PENDING_FINAL_ISOLATED_LIVE_EVIDENCE
BUSINESS_S3_OPENAI_SAFETY_CANARY = LIVE_EFFECT_PENDING
```
