# ChatAgent Personal — CORE-COPY-01 concurrency remediation

Date: 2026-09-26 KST

Branch: `feature/personal-async-copy-start-serialization`
Parent beta-readiness SHA: `5dd7b82d43b0ebfcf6fc1f27a33c908d8658ce48`

**Status:** engineering remediation candidate. Beta remains HOLD until this exact remediation SHA passes independent re-review.

## 1. Independent finding

The aggregate 33-tool beta-readiness review reproduced one new P2 blocker, `CORE-COPY-01`.

On a fresh broker state, two overlapping first `AsyncCopyJobs.start()` calls could both capture separate fallback arrays from:

`const entries = this.broker.state.copyJobs ?? []`

The calls then awaited filesystem preflight. Each could later append to its own array and assign that array to `broker.state.copyJobs`. Both starts could return process IDs while only the last-published copy ownership record survived. A returned process ID could therefore become `ASYNC_COPY_NOT_OWNED` for copy status/read/stop/stage reconciliation even though its sealed generic action still existed.

The independent review also demonstrated an overlapping identical-key variant. This is ordinary single-broker concurrency, not a hostile same-UID or physical power-loss hypothesis.

Independent report root:

`/Users/macstudio/CodexReview/chatagent-personal/5dd7b82d43b0ebfcf6fc1f27a33c908d8658ce48-33-core-beta-readiness/`

Original disposition:

- P0: 0
- P1: 0
- P2: 1
- beta: `BETA_HOLD_BLOCKER`

Safe Replace/F03 remained closed and is unrelated to this finding.

## 2. Minimal remediation

`AsyncCopyJobs` now owns one in-process FIFO start queue.

The public `start(request)` appends the request to that queue and calls the previous implementation as `startUnlocked(request)`. Whether a queued request succeeds or fails, the queue tail is reset to a resolved continuation so one rejection cannot poison later requests.

Only the **copy reservation / action start / copy-process binding** transaction is serialized.

The native copy itself still runs in a detached durable process. Once `startUnlocked()` has returned an owned process record, the next start can proceed while prior native workers continue copying concurrently.

Therefore this does **not** introduce:

- a global filesystem lock;
- a cross-process lock service;
- serialized file transfer throughput;
- a new durable state format;
- a new action/recovery protocol.

It uses the existing product invariant that one locked L1 broker process owns a given broker state directory. Existing locked-startup tests retain that invariant.

## 3. Why the queue closes both observed race forms

### Distinct keys

Request A completes preflight, reserves/publishes/binds its copy record before request B enters the mutable start transaction. Request B then observes the same shared broker state and appends its own record. Neither request can publish a stale fallback array.

### Identical key and identical intent

Request A completes the reservation/start/bind transaction first. Request B then finds the existing copy record, verifies source/destination/SHA identity and returns the same owned process state without a second process start.

### Identical key and conflicting intent

Request A commits the first key/intent association. Request B then sees that same key and fails `IDEMPOTENCY_KEY_CONFLICT`; it cannot create a second record or launch a second worker under that key.

### Capacity and reservation checks

Because the mutable start transaction is FIFO, record-capacity and existing-key checks are made against state after all earlier queued starts have completed their reservation/binding transaction.

## 4. Regression evidence

The expanded `l6-b05-async-copy-test.mjs` now adds isolated concurrency cases before the existing F04/recovery matrix.

### State-focused challenge

Using real `L1Broker`, `HostFileOps` and `AsyncCopyJobs` with a non-effecting process stub:

- fresh state + two concurrent distinct keys/destinations:
  - both succeed;
  - process IDs differ;
  - both copy ownership records persist;
  - both process IDs remain owned after reopen.
- fresh state + two concurrent identical-key/identical-intent requests:
  - both return the same process ID;
  - exactly one copy record persists;
  - process start is called exactly once.
- overlapping same key with different destinations:
  - exactly one succeeds;
  - exactly one returns `IDEMPOTENCY_KEY_CONFLICT`;
  - exactly one record persists.

### Real owned-runner integration

Using the actual `DurableHostProcesses`, actual native create-only copy helper and two simultaneous 1 MiB copy starts:

- both starts return distinct owned process IDs;
- both native workers reach `EXITED`;
- both destinations hash to the source digest;
- both output streams contain `COPY_DONE`;
- both copy ownership records remain present after reopening broker state.

### Existing recovery contracts

The same targeted test continues to PASS:

- owned 16 MiB create-only copy and digest verification;
- reopen + duplicate suppression;
- wrong source hash and existing destination refusal;
- sealed stage inspection and exact cleanup;
- F04 no-action seal / pre-config recovery / digest mismatch refusal;
- F04 real post-launch recovery and same-ID no-replay;
- unrelated process ID and ASK revocation denial;
- F04-R1 18 legacy config mutations rejected with intact same-ID recovery.

Additional focused tests after the code change:

- `personal-copy-sigkill-test.mjs`: PASS
- `personal-copy-e2e-kill-test.mjs`: PASS
- local full suite: `PERSONAL_STANDALONE_SUITE=PASS count=34`, exit 0 on the final remediation worktree.

## 5. Performance and scope

The queue guards only start-time metadata mutation and durable runner launch/bind. It does not wait for the copy payload to finish. Two large copy workers may execute concurrently after their respective start transactions complete.

This is intentionally lighter than file locks, distributed locks or a new transaction service and fits the single-owner/single-L1 architecture.

## 6. Acceptance gate

Before CORE-COPY-01 can be closed:

1. targeted async-copy concurrency and existing recovery suite PASS;
2. copy SIGKILL/recovery fixtures PASS;
3. full standalone suite PASS;
4. exact remediation SHA macOS CI PASS;
5. independent re-review reruns the original distinct-key and same-key reproducer against the exact SHA;
6. independent review confirms every returned copy process ID remains owned and no duplicate process is launched for the same key;
7. aggregate beta-readiness P0/P1/P2 and blocker disposition are updated.

Until then:

- 33-tool replace/F03 closure remains valid;
- the preferred candidate profile remains 33 tools;
- Beta remains HOLD solely because CORE-COPY-01 has not yet been independently closed;
- no merge/production approval is implied.
