# ChatAgent Business v1.1 — B-S3B-1 Durable Process Donor Parity Verification

Date: 2026-10-08 KST
Branch: `feat/business-v1.1-bs3-runtime-routing`
Parent accepted bounded unit: **B-S3A — ACCEPTED / CLOSED**
Bounded unit: **B-S3B-1 — donor parity / local durable core**

## Scope

This unit verifies and freezes the Personal v1.1.1 durable HOST_USER process engine before any Business OAuth/runtime authority adapter is added.

In scope:

- frozen Personal donor provenance;
- exact durable process core reuse;
- local durable lifecycle, idempotency, crash/restart recovery and owned termination tests;
- CI-visible donor parity contract.

Out of scope:

- Business OAuth/member/project/node process authorization adapter;
- processId -> member/project/node registry;
- public `maxBytes` / `waitMs` adaptation;
- mapped-project `cwd` adapter;
- live staging HOST_USER effects;
- semantic filesystem/Git effects;
- local effect audit;
- production relay or production cutover.

## Frozen donor verification

Read-only donor repo:

```text
/Volumes/SSD 4T/z_proj/proj04_chatagent/chatagent-personal
```

Frozen source:

```text
Personal tag       v1.1.1
Tag object         fcc7ff4d27f2df7b429bdca6cebba7ab3bd7685c
Source commit      da391bf9c38697d706049b3b5d7bd2c2ba4ba28e
```

Verified frozen blobs:

```text
scripts/l1/durable-host-processes.mjs  27a872de687df1f43fd1ab0c4783ac11a181ba94
scripts/l1/durable-process-runner.mjs  7e6d6dc4a9302e7d8126cd34ff489c00d722e344
scripts/l1/broker-core.mjs             f03bb640bbe1e5f9a3f7d9d00dfbab0b21f7cf4d
scripts/l1/l6-durable-worker.mjs       478d7037f1597dc8a57c983dd5efd1b892878e56
```

The existing Business `durable-host-processes.mjs` differed from the frozen donor only by whitespace in the first import line. B-S3B-1 replaced that file with the exact frozen donor bytes; its Git blob now exactly matches `27a872...`.

`durable-process-runner.mjs`, `broker-core.mjs`, and `l6-durable-worker.mjs` were already exact donor blobs and were not changed.

## Broker-server disposition

The frozen donor `broker-server.mjs` blob is:

```text
5ee4d6078207031c3b84bc7e238d5c8e3b27d331
```

The Business copy is intentionally not overwritten in B-S3B-1. Its differences are in unrelated Personal memory wiring that evolved after the Business baseline was forked. Importing the whole donor server would mix memory/runtime concerns into this bounded process-core unit.

Instead, the B-S3B-1 contract verifies that the Business local HTTP seam still:

- imports `DurableHostProcesses`;
- enables it only behind `L1_DURABLE_PROCESS_ENABLED`;
- dispatches `start/status/read/input/stop` to the selected process backend.

Business authorization replacement of the Personal FULL_HOST model is deferred to B-S3B-2, as required by the Accepted Design.

## Durable core invariants frozen by test

The new contract test verifies the exact donor blob and static invariants including:

- durable action reservation before effect;
- idempotency fingerprint/key binding;
- runner PID + start-token reconciliation;
- `RECOVERY_REQUIRED` fail-closed state;
- `MAX_RUNNING=4`;
- donor single-read bound `MAX_READ=16384`;
- retained output bound `MAX_OUTPUT=1 MiB`;
- termination targets only the verified owned supervisor;
- public `process_start_host` remains destructive/open-world;
- public `process_read_output.maxBytes<=524288` and `waitMs<=30000` remain unchanged for B-S3B-2 adaptation.

## Runtime validation

Authoritative runtime:

```text
/Users/macstudio/.nvm/versions/node/v24.21.0/bin/node
Node v24.21.0
```

Executed locally:

```text
node scripts/business/v1.1/bs3b1-durable-process-donor-parity-test.mjs
node scripts/l1/l6-durable-physical-test.mjs
node scripts/l1/l6-durable-http-test.mjs
```

Observed results:

```text
BUSINESS_S3B1_DURABLE_DONOR_PARITY=PASS
L6_DURABLE_PHYSICAL_TEST=PASS
L6_DURABLE_HTTP_RESTART=PASS
```

Full pinned-Node regression was also executed after the bounded changes:

```text
npm run test:ci
exit code 0
PERSONAL_STANDALONE_SUITE=PASS count=34
BUSINESS_B1_PROJECT_BOUNDARY=PASS
BUSINESS_B2_SAFE_FILES=PASS
BUSINESS_B3_SHARED_CONTINUITY=PASS
BUSINESS_B4_AUDIT_OPS_SAFE_PILOT=PASS
BUSINESS_S1A/S1B/S1C gates=PASS
BUSINESS_S2A/S2B/S2C gates=PASS
BUSINESS_S3A_RUNTIME_ROUTING_CONTRACT=PASS
BUSINESS_S3A_RUNTIME_ROUTING=PASS
BUSINESS_S3B1_DURABLE_DONOR_PARITY=PASS
L6_DURABLE_PHYSICAL_TEST=PASS
L6_DURABLE_HTTP_RESTART=PASS
```

The behavioral tests prove:

- a detached owned supervisor survives the disposable broker/client SIGKILL;
- output remains readable after manager restart;
- terminal state is reconciled and sealed;
- same idempotency key + same input resolves the original process and never re-executes;
- same idempotency key + changed input conflicts;
- owned stop terminates the owned supervisor/descendant group;
- unknown process IDs are denied;
- killed supervisor becomes `RECOVERY_REQUIRED` rather than false success/replay;
- HTTP broker restart retains process ownership and stdout and does not duplicate the effect.

## Production / staging impact

```text
production v1.0 mutation   NONE
staging process effect     NONE
OAuth process effect       NONE
mapping mutation           NONE
```

B-S3B-1 is entirely local/test-only.

## Result

```text
B-S3B-1 = ACCEPTED / CLOSED
B-S3B   = IN_PROGRESS
B-S3    = IN_PROGRESS
```

## Next bounded unit

Proceed to **B-S3B-2 — Business authority + process registry adapter**.

It must bind the reused durable core to:

```text
OAuth member
-> authorized logical project
-> B-S3A runtime route/mapping
-> B-S1 node ownership/lifecycle/bounded lease
-> local node policy
-> logged-in OS user authority
-> durable process core
```

B-S3B-2 must also resolve, with tests:

- server-owned `processId -> member/project/node/mapping` binding;
- PERSONAL_NODE non-owner denial;
- SHARED_NODE generic host-power opt-in;
- bounded cached-lease behavior;
- mapped-project `cwd` semantics without public host-path disclosure;
- public `maxBytes` versus donor 16 KiB reads;
- public `waitMs` semantics;
- restart/reconciliation of the Business process registry.
