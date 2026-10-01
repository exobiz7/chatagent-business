# B6 Full Business E2E + Release Verification

> Date: 2026-10-01 KST
> Baseline: B5 `167df3aa33fc5c7191ab1768545ca8a8d7f74f82`
> Branch: `feat/business-b6-release-e2e`
> Candidate version: `1.0.0-rc.1`
> Result: **LOCAL RELEASE CANDIDATE PASS / EXTERNAL RELEASE BLOCKED**

## 1. Gate summary

| Gate | Result | Evidence |
| --- | --- | --- |
| G1 Contract | PASS | exact 17-tool candidate surface; strict profile/project contract |
| G2 Security | PASS | path/profile/stale-write/delete/SAFE-exec denials; B1-B5 security suites |
| G3 Recovery | PASS | restart, continuity, concurrent CAS, process cleanup, backup/restore, previous-B5 rollback rehearsal |
| G4 Business E2E | LOCAL PASS | E1-E6 actual local MCP canary; real ChatGPT Business Draft app not configured |
| G5 Production | LOCAL RC PASS / EXTERNAL BLOCKED | RC Doctor/Start/Stop/read-only smoke/backup PASS; private workspace publish not configured |

The product is **not declared RELEASED** because the external publication requirements in
the accepted release plan are not currently satisfiable from this repository/environment.

## 2. Actual B6 E1-E6

A disposable organization with three registered projects was used:

- `docs` → READ_ONLY
- `ops` → SAFE
- `dev` → STANDARD

### E1 Read — PASS
`business_status → list_directory → read_file → hash_file`

### E2 SAFE mutation — PASS
`create_file → replace_file(expected SHA) → hash_file → host postcondition`

### E3 Shared Continuity — PASS
Conversation A:
`continuity_start_task → continuity_checkpoint → continuity_prepare_handoff`

Fresh stateless Conversation B:
`continuity_open(taskId + contextDigest) → FRESH`

### E4 STANDARD dev loop — PASS
`read → failing npm test → hash → Safe Replace repair → immediate isolated npm test PASS`

B6 additionally repeated four immediate same-file Safe Replace inode swaps followed by
isolated container reads with **no caller-side delay**.

### E5 Safety — PASS
- stale replace → `BUSINESS_WRITE_CONFLICT`
- `../` escape → denied
- SAFE project exec → `BUSINESS_PROFILE_DENIED`
- profile header elevation → denied before dispatch
- `delete_file` absent from tool contract and no effect

### E6 Restart — PASS
Control-plane Stop/Start followed by
`continuity_open(taskId + original digest) → FRESH`.

## 3. Release-hardening finding closed

B6 initially reproduced one macOS Docker Desktop bind-mount propagation miss after
Darwin Safe Replace: a 0.5-second internal settling window occasionally allowed a newly
created exec container to observe the replaced path as temporarily absent.

The product was hardened from 0.5 to **1.5 seconds internal transport settling** before
the container launches the user command.

After the change:
- B6 E4 passed,
- four additional immediate Safe Replace → exec stress cycles passed,
- no caller-side delay was required.

This is a transport hardening change, not a relaxation of Safe Replace semantics.

## 4. Recovery and rollback — PASS

B6 performed:

1. runtime Stop,
2. verified operational-state Backup,
3. disposable Restore into a new state root,
4. restored registry/profile verification,
5. restored continuity digest verification,
6. checkout of the previous B5 commit into a temporary detached Git worktree,
7. Doctor/Start/Status/Stop using that previous B5 code against the restored state.

Result: previous B5 stable code successfully booted and stopped against restored
operational state. This is the release rollback rehearsal required by the accepted plan.

## 5. Production-style local RC smoke — PASS

Persistent RC root:

`~/ChatAgentBusiness/release-candidate-v1.0.0-rc.1`

The RC runtime was prepared with one READ_ONLY, one SAFE and one STANDARD project.

Doctor: PASS
Start: PASS
Status: RUNNING / healthy
MCP tools: 17
Version: `1.0.0-rc.1`

Effect-minimized smoke:
- `business_status`
- `continuity_open` on the SAFE project
- `read_file` on a known harmless READ_ONLY fixture

Result: PASS.

The runtime was then stopped and verified backup
`pre-publish-rc1` was created.

## 6. External release blockers

Current environment evidence:
- Business Git remote count: 0
- no Business app/workspace identifier environment setting
- no Business-specific tunnel profile
- RC operator config has `tunnelHealthUrl = null`

Therefore these accepted release gates remain **NOT RUN / EXTERNAL_RELEASE_BLOCKED**:

- actual ChatGPT Business Draft app scan
- actual ChatGPT Business fresh-chat canary through the published app
- private workspace publish
- post-publish production smoke
- final `v1.0.0` release declaration/tag
- GitHub push/PR/merge

No remote, workspace app or tunnel resource was invented or created.

## 7. Severity closure

Local implementation evidence at RC boundary:

- P0 open: **0**
- P1 open: **0**
- P2 open: **0 known**

External publication gates are release prerequisites, not implementation defects.

## 8. Final-release rule

Do **not** relabel this RC as `v1.0.0 RELEASED` until the external gates above pass.
The appropriate local tag is `v1.0.0-rc.1`.

Once the user supplies/confirms the Business GitHub destination and ChatGPT Business
workspace/app/tunnel target, resume from this RC rather than reopening B0-B5.
