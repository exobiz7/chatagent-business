# ChatAgent Business v1.1 — Session Handoff Package Index

Captured: 2026-10-08 KST

This package is the session-transfer set after **B-S3A ACCEPTED / CLOSED** and before **B-S3B Durable HOST_USER Process Core**.

## 1. Handoff package files

| File | Purpose |
| --- | --- |
| `docs/handoff/LATEST_SESSION_HANDOFF.txt` | Stable latest-handoff pointer and first reading order |
| `docs/handoff/CHATAGENT_BUSINESS_V1_1_CURRENT_STATE_20261008.json` | Machine-readable current phase/Git/PR/runtime/next-unit snapshot |
| `docs/handoff/CHATAGENT_BUSINESS_V1_1_SESSION_HANDOFF_20261008.md` | Full context: goals, accepted decisions, discoveries, lessons, safety boundaries, B-S3B verification questions |
| `docs/handoff/CHATAGENT_BUSINESS_V1_1_NEXT_SESSION_BOOTSTRAP_PROMPT_20261008.txt` | Copy/paste first prompt for the next session |
| `docs/handoff/CHATAGENT_BUSINESS_V1_1_HANDOFF_PACKAGE_INDEX_20261008.md` | This index |
| `docs/handoff/CHATAGENT_BUSINESS_V1_1_HANDOFF_SHA256_MANIFEST_20261008.json` | SHA-256 integrity record for the handoff package |

## 2. Normative architecture source

The canonical accepted design is:

```text
docs/approved/CHATAGENT_BUSINESS_V1_1_ACCEPTED_DESIGN_20261005.md
```

It controls architecture, authority, product scope, safety, reuse strategy and B-S0..B-S6 gates.

Its header contains historical 2026-10-05 progress text. Later gate files below supersede progress/status only; they do not supersede the design's normative architecture.

## 3. Latest phase authority

Read the latest phase evidence in descending relevance:

```text
docs/verification/v1.1/B_S3_GATE_STATE_20261008.json
docs/verification/v1.1/B_S3A_RUNTIME_ROUTING_FOUNDATION_REPORT_20261008.md

docs/verification/v1.1/B_S2_GATE_STATE_20261008.json
docs/verification/v1.1/B_S2C_HANDOFF_FRESHNESS_REPORT_20261008.md
docs/verification/v1.1/B_S2B_CONTEXT_SEARCH_REPORT_20261007.md
docs/verification/v1.1/B_S2A_TEAM_CONTINUITY_FOUNDATION_REPORT_20261007.md

docs/verification/v1.1/B_S1_GATE_STATE_20261007.json
docs/verification/v1.1/B_S1C_RUNTIME_NODE_LIFECYCLE_REPORT_20261007.md
docs/verification/v1.1/B_S1B_MEMBER_AUTH_FOUNDATION_REPORT_20261007.md
docs/verification/v1.1/B_S1A_CONTROL_FOUNDATION_REPORT_20261007.md

docs/verification/v1.1/B_S0_GATE_STATE_20261005.json
docs/verification/v1.1/B_S0_VERIFICATION_REPORT_20261005.md
docs/verification/v1.1/B_S0_LIVE_CANARY_EVIDENCE_20261006.md
docs/verification/v1.1/B_S0_TOOL_SELECTION_LIVE_RESULTS_20261006.json
```

## 4. Frozen contract / donor authority

```text
docs/verification/v1.1/B_S0_PERSONAL_DONOR_MANIFEST.json
docs/verification/v1.1/B_S0_SUPABASE_SCHEMA_RPC_CONTRACT.json
docs/verification/v1.1/B_S0_TOOL_CONTRACT_CANDIDATE.json
docs/verification/v1.1/B_S0_TOOL_SELECTION_GOLDEN_SET.json
```

The frozen Personal donor is:

```text
ChatAgent Personal v1.1.1
commit da391bf9c38697d706049b3b5d7bd2c2ba4ba28e
```

Personal is read-only donor/reference and must not become a Business runtime dependency.

## 5. Code that B-S3B must inspect before modification

```text
scripts/business/v1.1/bs0-tool-catalog.mjs
scripts/business/v1.1/runtime/business-runtime-router.mjs
scripts/business/v1.1/runtime/business-runtime-mapping-service.mjs
scripts/business/v1.1/runtime/local-workspace-registry.mjs
scripts/business/v1.1/control/runtime-authorization-lease.mjs
scripts/business/v1.1/bs3a-live-fixture-server.mjs

scripts/l1/durable-host-processes.mjs
scripts/l1/durable-process-runner.mjs
scripts/l1/broker-core.mjs
scripts/l1/broker-server.mjs
```

Also inspect the relevant durable-process tests under `scripts/l1/` and port/reuse tests before adding Business wrappers.

## 6. Handoff snapshot baseline

At handoff creation, before adding the handoff files:

```text
branch       feat/business-v1.1-bs3-runtime-routing
HEAD         de7cb4bf7469cf3e2a5d4d777e24c805ee1946f5
remote HEAD  same
worktree     clean
```

The handoff package may be committed on top of this closure HEAD. The next session must verify the actual current HEAD.

## 7. Current accepted progress

```text
B-S0   ACCEPTED / CLOSED
B-S1   ACCEPTED / CLOSED
B-S2   ACCEPTED / CLOSED
B-S3A  ACCEPTED / CLOSED
B-S3B  NEXT
B-S3   IN_PROGRESS
```

Do not restart closed feature work without new evidence.

## 8. Production / staging snapshot

Production remains frozen v1.0.0:

```text
127.0.0.1:31850
release commit d6373f8ffef4b3739134f4d14cc300918417553e
```

Staging at capture:

```text
B-S3A MCP     127.0.0.1:31861
health        GET /healthz
staging tunnel health 127.0.0.1:51961
mappingCount  0
```

Owner-private B-S3A files:

```text
/Users/macstudio/Library/Application Support/chatagent/business-v11-bs3a/public-runtime-config.json
/Users/macstudio/Library/Application Support/chatagent/business-v11-bs3a/workspace-mappings.json
```

Both were `0600` at capture. Do not copy credential/config values into evidence.

## 9. PR stack snapshot

```text
#6 OPEN / Ready / mergeable
#7 OPEN / Draft / mergeable
#8 OPEN / Draft / mergeable
#9 OPEN / Draft / mergeable
```

No PR merge or Draft→Ready transition is authorized by this handoff.

## 10. Test/runtime authority

Use Node v24.21.0 explicitly:

```text
export PATH=/Users/macstudio/.nvm/versions/node/v24.21.0/bin:$PATH
node -v
```

Do not use an unpinned default Node as gate evidence.

## 11. Next unit focus

B-S3B must implement only the durable HOST_USER process core first:

```text
process_start_host
process_get_status
process_read_output
process_terminate_job
```

The handoff documents deliberately flag unresolved adapter questions around:

- public `maxBytes` vs donor single-read bound;
- public `waitMs` vs immediate donor read;
- `cwd` semantics vs host-path privacy;
- processId-only server-side node/member/project binding;
- durable crash/restart reconciliation.

These must be resolved with evidence rather than silently approximated.

## 12. Package integrity

After all handoff files are written, verify hashes against:

```text
docs/handoff/CHATAGENT_BUSINESS_V1_1_HANDOFF_SHA256_MANIFEST_20261008.json
```

If a handoff file is intentionally updated later, regenerate the manifest rather than treating an old checksum as current authority.
