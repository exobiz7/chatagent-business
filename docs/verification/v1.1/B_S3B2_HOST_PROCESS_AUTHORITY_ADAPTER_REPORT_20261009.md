# ChatAgent Business v1.1 — B-S3B-2 Host Process Authority / Registry Adapter Verification

Date: 2026-10-09 KST
Branch: `feat/business-v1.1-bs3-runtime-routing`
Parent accepted bounded unit: **B-S3B-1 — ACCEPTED / CLOSED**
Scope: local Business authority/process-registry adapter only; no staging OAuth process effect and no production mutation.

## Result

**B-S3B-2 — ACCEPTED / CLOSED**

B-S3 remains IN_PROGRESS. The next bounded unit is B-S3B-3 isolated staging OAuth canary.

## Implemented boundary

The frozen Personal `DurableHostProcesses` engine remains byte-identical to the accepted donor. Business-specific authority is implemented outside that core.

Admission is now modeled as:

```text
validated OAuth-derived member key (server internal)
-> logical project authorization
-> B-S3A runtime route / local project mapping
-> B-S1 node ownership, lifecycle, shared-host-power and bounded lease
-> Business ephemeral host-start admission
-> logged-in macOS user / OS permission
-> frozen DurableHostProcesses core
```

Personal `FULL_HOST` pairing/grant state is not used as Business authorization.

## New Business adapters

### BusinessDurableProcessBroker

`business-durable-process-broker.mjs` reuses the frozen L1 action journal but replaces Personal pairing/grant access decisions with an ephemeral Business admission seam.

The permit exists only during the synchronous pre-await admission portion of `DurableHostProcesses.start()`. It is not persisted and is not an independent grant.

A direct donor-core start through this Business broker without Business admission fails with:

```text
BUSINESS_HOST_PROCESS_AUTH_REQUIRED
```

### BusinessProcessRegistry

`business-process-registry.mjs` provides server-owned durable binding:

```text
idempotencyKey
inputSha256
actorDigest
projectId
runtimeNodeId
mappingRevision
nodeType
executionMode = HOST_USER
state = RESERVED | BOUND
processId
createdAt / updatedAt
```

It deliberately does not persist:

```text
executable
argv
cwd
process output
OAuth token
refresh token
host PID as public authority
```

The registry is owner-private and HMAC sealed with a separate owner-only key. Tampering fails closed with `BUSINESS_PROCESS_STATE_INTEGRITY_FAILED`.

### BusinessHostProcessService

The service binds the four public B-S3B process tools to the accepted Business authority model:

```text
process_start_host
process_get_status
process_read_output
process_terminate_job
```

`process_get_status`, `process_read_output`, and `process_terminate_job` accept only `processId` publicly. Member/project/node/mapping authority is restored from the server-owned registry and revalidated before the durable core is touched.

## Contract-gap decisions

### 1. maxBytes 524288 vs donor 16384

The donor core stays unchanged at a maximum single read of 16 KiB.

The Business adapter composes sequential donor reads, preserving donor cursors, up to the public 512 KiB bound.

Validated:

```text
public request maxBytes=32768
-> multiple <=16384 donor reads
-> returned cursor=32768
-> hasMore preserved
```

The accepted public maximum remains 524288 bytes.

### 2. waitMs

The frozen donor read remains immediate.

Business implements bounded polling outside the core:

```text
0 <= waitMs <= 30000
```

Polling exits when:

- new output is available;
- the process reaches terminal/recovery-required state; or
- the wait deadline is reached.

When using cached authorization, the effective wait is capped by the remaining lease lifetime.

### 3. cwd / host-path privacy

Public Business `process_start_host.cwd` is now explicitly defined as a **project-relative working directory** inside the already mapped logical project, for example:

```text
.
subdir
```

Absolute cwd input is denied with:

```text
BUSINESS_PROCESS_CWD_MUST_BE_PROJECT_RELATIVE
```

The adapter resolves the relative path to the node-local canonical absolute path only after route authorization. Symlink/traversal escape is denied.

This preserves B-S3A host-path privacy. It does not claim that cwd is a security sandbox; generic HOST_USER still has the logged-in OS user's ordinary authority after admission.

The Zod schema shape and risk annotations did not change. Only the public cwd field description was clarified, and the full B-S0 local descriptor suite passed afterward.

### 4. processId-only authority

A process ID is never enough by itself.

The registry binds it to the authenticated member digest, logical project, runtime node, mapping revision, node type and execution mode.

Wrong-member and unknown-process lookups both fail as:

```text
BUSINESS_PROCESS_NOT_OWNED
```

No caller-supplied member ID, owner ID or host PID is accepted by the public process tools.

### 5. restart / crash window

Start ordering is:

```text
Business route authorization
-> Business RESERVED binding
-> durable donor start/idempotency fence
-> Business BOUND processId binding
```

A simulated crash after durable start but before Business processId binding left the Business record `RESERVED`. Reopening both the durable broker and Business registry, then retrying the exact same idempotency key/input, reconciled the same durable process and changed the Business record to `BOUND`.

Evidence proved one and only one donor action record for that key. No blind effect replay occurred.

## Node / authority behavior

Validated locally:

- PERSONAL_NODE non-owner cannot resolve another member's process binding;
- explicit SHARED_NODE generic host execution fails with `BUSINESS_SHARED_HOST_POWER_DENIED` unless host power is enabled;
- implicit routing treats a non-host-power SHARED_NODE as ineligible;
- node lifecycle `REVOKED` fails closed;
- expired cached authorization lease fails closed;
- valid unexpired cached lease remains usable within its bound;
- changed mapping revision fails with `BUSINESS_PROCESS_ROUTE_STALE`;
- restart reloads process binding and durable process state;
- arbitrary processId is rejected before it reaches the donor stop/status/read primitive.

## Termination

Termination revalidates the server-owned member/project/node/mapping binding before calling the donor core.

The donor then signals only its independently verified owned supervisor; arbitrary PID input is not part of the Business public API.

## Public safety metadata

The four process tools preserve their accepted annotations:

```text
process_start_host      readOnly=false destructive=true  openWorld=true
process_get_status      readOnly=true  destructive=false openWorld=false
process_read_output     readOnly=true  destructive=false openWorld=false
process_terminate_job   readOnly=false destructive=true  openWorld=false
```

No annotation was weakened to reduce confirmation friction.

## Tests

Authoritative runtime:

```text
/Users/macstudio/.nvm/versions/node/v24.21.0/bin/node
v24.21.0
```

New gates:

```text
BUSINESS_S3B2_HOST_PROCESS_CONTRACT=PASS
BUSINESS_S3B2_HOST_PROCESS_ADAPTER=PASS
```

Behavioral proof includes:

- exact frozen donor blob provenance;
- direct donor start denied without Business ephemeral admission;
- project authorization before process reservation/effect;
- processId member/project/node/mapping binding;
- no argv/cwd/output persistence in Business registry;
- HMAC registry tamper denial;
- 16 KiB donor read composition to public 512 KiB;
- bounded waitMs polling;
- relative cwd/internal canonical resolution;
- idempotency replay and conflict;
- restart binding recovery;
- simulated crash-before-Business-bind recovery with no duplicate action;
- PERSONAL/SHARED node authority behavior;
- revoke/lease/mapping-revision fail-closed behavior;
- exact owned termination.

Full `npm run test:ci` passed under pinned Node after implementation. The B-S0 local validation suite also passed after the cwd descriptor clarification.

## Production / staging impact

```text
production v1.0 mutation: NONE
staging OAuth process effect: NONE
staging mapping mutation: NONE
production cutover: NONE
PR Ready/merge: NONE
```

B-S3A staging remains the active live fixture until B-S3B-3 explicitly activates a bounded HOST_USER staging canary.

## Remaining B-S3B work

B-S3B-2 proves the local authority and durable registry adapter. It does not by itself prove the real ChatGPT OAuth call path.

Next bounded unit:

> **B-S3B-3 — isolated staging OAuth HOST_USER canary**

The canary should use one exact approved PERSONAL_NODE/project mapping and benign executable, prove start/status/read/terminate plus restart reconciliation as appropriate, close any temporary live-effect gate immediately, return mapping state to its prior clean condition, and verify production v1.0/repository state remain unchanged.
