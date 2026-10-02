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
| G4 Business E2E | PASS | local E1-E6 plus actual ChatGPT Business Draft fresh-chat canary PASS |
| G5 Production | PRODUCTION ROOT READY / PUBLISH PENDING | production root + tunnel Doctor/Start/Status/backup PASS; private workspace publish/post-publish smoke pending |

The product is **not yet declared RELEASED** because private workspace publish and the
post-publish production smoke have not yet been completed.

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

## 6. External Draft canary and production promotion

Configured external resources:
- GitHub: `exobiz7/chatagent-business` (Private)
- ChatGPT Business workspace: AIspace / `d4b71d66-372a-4cff-ad5f-07a3cdbaa55c`
- OpenAI organization: `org-7Hn67wnw1fS6FxQ79Rr4zLN4`
- Secure MCP tunnel: `chatagent-business` / `tunnel_6abe54973cb48191a1c54c50ede05748`
- production root: `~/ChatAgentBusiness/production`
- tunnel health: `http://127.0.0.1:51950/healthz`

Actual ChatGPT Business Draft fresh-chat canary: **PASS**.

Observed and independently verified evidence:
- `business_status`: version `1.0.0-rc.1`; docs=READ_ONLY, ops=SAFE, dev=STANDARD
- READ: `docs/README.txt` = `RELEASE_RC_READ_ONLY\n`
- SAFE create initial SHA: `de95c45356f26efff88bc924572e46bd7679188efc57a57cd3b33743053ab7e4`
- SAFE replace final SHA: `9e1588e0fa194093398239fc620ff73e81172a939fe163aead08a5f7d237378d`
- continuity task: `2d054085-cfab-4ceb-b20e-cfbfe8b4d82c`
- continuity digest: `sha256:b54d83ba629d5491d94c0b7c9fd4fd3e4e07b32c62700602afa54fc4d166e3a4`
- continuity result: `FRESH / CONTEXT_DIGEST_MATCH`
- STANDARD exec: completed with exit 0 and marker `CHATGPT_BUSINESS_DRAFT_EXEC_OK`
- SAFE exec denial: `BUSINESS_PROFILE_DENIED`
- audit independently records create/replace/continuity/exec success and SAFE exec denial

After the canary, the verified state was backed up and restored into a separate production
root. Production project roots were rebound to `~/ChatAgentBusiness/production/projects/*`,
a fresh production deployment credential was provisioned, and the same tunnel ID was moved
to the production credential. Production Doctor reports runtime healthy, exec READY_B5, and
tunnel HTTP_200. Backup `pre-private-publish` is verified.

Remaining release gates:
- private workspace publish
- post-publish effect-minimized production smoke
- final PR merge to `main`
- final `v1.0.0` tag/release declaration

## 7. Severity closure

Local implementation evidence at RC boundary:

- P0 open: **0**
- P1 open: **0**
- P2 open: **0 known**

External publication gates are release prerequisites, not implementation defects.

## 8. Final-release rule

Do **not** relabel this RC as `v1.0.0 RELEASED` until the external gates above pass.
The appropriate local tag is `v1.0.0-rc.1`.

Resume from this production-promoted RC. Do not reopen B0-B5 without new evidence.
