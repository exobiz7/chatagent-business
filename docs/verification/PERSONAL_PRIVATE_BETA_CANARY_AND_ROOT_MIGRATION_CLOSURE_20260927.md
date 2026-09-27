# ChatAgent Personal — Private Beta Canary and Root Migration Closure

Date: 2026-09-27 KST

Current main branch at closure:
`main`

Bounded beta state before canary:
`BETA_ACTIVE_BOUNDED`

## 1. Private beta canary verdict

**PRIVATE_BETA_CANARY=PASS**

The canary was executed through the published Business workspace app `ChatAgent Personal beta` against one dedicated disposable fixture only.

No arbitrary user file, network action, shell interpreter, delete/cleanup action, async copy/hash action, or task completion was used.

### Access

Actual Business status:

- mode: `FULL_HOST`
- paired: true
- ownerIdentity: `LOCAL_PAIRED_OWNER`
- epoch: 5
- realFilesystemAccess: true
- realHostExec: true
- grantsEnforced: true

After canary completion the owner returned to ASK.

Independent local verification after rollback:

- mode: `ASK`
- epoch: 6
- paired: true
- realAccess: false

## 2. File create/read/hash

Original canary path at execution time:

`/Users/macstudio/ChatAgentPersonalCandidate/personal-f03-33-3951c07-q0OcnC/fixture-work/private-beta-canary-20260927.md`

Create receipt:

- bytes: 92
- changed: true
- commitMode: `DIRFD_O_EXCL`
- initial SHA-256:
  `8eec176732ed05cc6776f56cc75f20608a4610b61752db4eb69a1c08f484c4e0`

Initial read exactly matched the requested baseline content.

## 3. Safe Replace v2

The same existing file was replaced exactly once using the SHA returned by the preceding hash.

Actual Business receipt:

- changed: true
- bytes: 145
- commitMode: `DIRFD_DUAL_EXLOCK_RENAME_SWAP`
- final SHA-256:
  `c2d64d99f462f2736610844c26bc78d2107c14d0d3ff3c169dec8220dc306945`

Final Business read returned:

```text
# ChatAgent Personal Private Beta Canary
status: verified
purpose: bounded real-use validation
result: read-create-replace-process-memory passed
```

Business final hash matched the replace receipt.

Independent Mac-side verification confirmed the same content and SHA with:

- mode: 0600
- size: 145
- link count: 1
- owner: `macstudio`

## 4. Bounded host process

Only `/usr/bin/printf` was used.

Process ID:

`a280130c-315d-4437-b98d-4c615a7052ab`

Actual terminal result:

- state: `EXITED`
- exitCode: 0
- signal: null
- output:
  `[stdout] CHATAGENT_PERSONAL_PRIVATE_BETA_CANARY_20260927`

Independent local inspection confirmed the durable process manifest, config and output log.

## 5. Personal Memory

Project:

`private-beta-canary-20260927`

Project UUID:

`29c8549d-e500-46ab-a61b-814c39fd8770`

Task ID:

`0fe35055-fa2e-4e24-89bb-49757644879d`

Checkpoint ID:

`0e32c0d0-d942-4029-9ce8-f1be8e8e21da`

Resulting revision:

`1`

Business task/context/search calls all confirmed the checkpoint, and search returned a hit for the private-beta canary.

Independent read-only SQLite inspection confirmed exactly three durable chained events:

1. PROJECT
2. TASK
3. CHECKPOINT

The event hashes and predecessor hashes are present in the append-only event table.

The canary intentionally did not call `personal_task_complete`.

## 6. Scope discipline

The Business canary stopped at the specified endpoint.

Not invoked:

- cleanup/delete tools
- async copy/hash
- additional process execution
- shell interpreter
- network operation
- other filesystem targets
- `personal_task_complete`

No UNCERTAIN result or platform block occurred.

## 7. Operational root migration

After canary PASS and confirmed ASK rollback, the operational beta root was renamed from:

`/Users/macstudio/ChatAgentPersonalCandidate/personal-f03-33-3951c07-q0OcnC`

to:

`/Users/macstudio/ChatAgentPersonalBeta`

The migration was performed only after L1, L0 and the tunnel were stopped.

Operational owner-control scripts were changed to derive their root from the script directory rather than hard-code the old validation path.

Normal operator commands are now:

```bash
cd ~/ChatAgentPersonalBeta
./Status.command
```

```bash
cd ~/ChatAgentPersonalBeta
./EnableFullHost.command
```

```bash
cd ~/ChatAgentPersonalBeta
./ReturnAsk.command
```

No compatibility symlink was created.

Historical logs, completed durable process configuration and older E2E notes may retain the prior absolute path as immutable audit evidence.

## 8. Post-migration runtime verification

New root permissions:

- owner: `macstudio`
- mode: 0700

Owner/status command:

- paired: true
- mode: ASK
- epoch: 6
- pending: 0
- approvedRecords: 0

L1:

- ready: true
- paired: true
- realAccess: false
- port: 31841

L0:

- health: ok
- port: 31842

Tunnel profile doctor after L0 startup:

- MCP target reachable: PASS
- profile load: PASS
- tunnel ID: PASS
- result: `ok`

Restarted tunnel:

- same tunnel ID:
  `tunnel_6ab5204f29108191a16eee9b633f5a2a`
- health: 200
- ready: 200
- MCP session initialized
- control-plane tunnel metadata fetched

A runtime OAuth-discovery warning was logged while the published app continues to use the tested no-app-layer-OAuth configuration; tunnel readiness remained 200 and the MCP session initialized successfully.

## 9. Final disposition

**PRIVATE_BETA_CANARY=PASS**

**ROOT_MIGRATION=PASS**

**BETA_ACTIVE_BOUNDED**

The private beta is now operating from:

`~/ChatAgentPersonalBeta`

with ASK as the post-canary safe state.

Production/public release remains a separate gate.
