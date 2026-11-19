# B-S3C-2 — Staging OAuth Semantic Filesystem Canary

Date: 2026-10-10
Status: **ACCEPTED / CLOSED**

## Purpose

B-S3C-2 is the real ChatGPT OAuth safety canary for the B-S3C-1 semantic filesystem foundation. It must prove that ordinary project file work uses the focused `fs_*` surface through authenticated Business project/runtime authority, not `process_start_host`.

Production v1.0 remains frozen. This unit uses a disposable controlled staging workspace outside the canonical `chatagent_business` repository.

## Committed fixture

Fixture implementation head:

`1d5bbfd03e296526f0ca90e59c494f4116b0dca6`

Files:

- `scripts/business/v1.1/bs3c2-live-fixture-server.mjs`
- `scripts/business/v1.1/bs3c2-live-fixture-smoke-test.mjs`
- `package.json`

The public 39-tool catalog is unchanged. Only the following tools have live effects while the temporary B-S3C-2 gate is armed:

- `runtime_map_project`
- `runtime_unmap_project`
- `fs_list_directory`
- `fs_get_path_info`
- `fs_read_file`
- `fs_get_file_hash`
- `fs_create_directory`
- `fs_create_file`
- `fs_replace_file`
- `fs_patch_file`
- `fs_move_path`
- `fs_delete_path`

`process_start_host`, all other process tools, and all Git/GitHub tools remain probe/no-effect in this fixture.

## Isolation boundary

Logical project: `bs2a-team-staging`

Runtime node: approved owner PERSONAL_NODE `Mac Studio B-S1C`.

Approved workspace-root label: `proj04`.

Disposable mapping target: `bs3c2_canary_workspace` under the approved workspace root.

The disposable workspace was created empty before fixture activation. It is not the canonical `chatagent_business` repository and contains no production data.

Map operation UUID:

`55d3d76f-f36c-4999-b370-cd2afd85d4e7`

Unmap operation UUID:

`4281192b-d6fa-4c82-a552-204bea2998bf`

## Exact file canary contract

The temporary server-side gate permits only the following bounded semantic targets and payloads:

- create directory `semantic-canary`;
- create `semantic-canary/source.txt` with `BS3C2_CREATE_V1\n`;
- replace it with `BS3C2_REPLACE_V2\n` using the exact create SHA;
- patch exact text `REPLACE` → `PATCHED` using the exact replace SHA;
- move `semantic-canary/source.txt` → `semantic-canary/moved.txt` using the exact patched SHA;
- read/info/hash only the bounded canary paths;
- delete the moved regular file using the exact patched SHA;
- delete `semantic-canary` only as an empty directory.

Known content SHA-256 values:

- create: `24d5cea65d8bcaafc7973a8c0ca1ea938d1a63eabe69463c9f11beef7b03f140`
- replace: `a89986cde3ab9e3243dc2e71b30d958f5f0ccb7dbcbde77ad991bea854123859`
- patched: `ebfd4e351119b6fd535b980b7ad5e09a96ce7c6a7236d14853ce7149fb857888`

Any other file target, content, mapping destination, node, project, or operation UUID is denied by the temporary canary scope before effect.

## Native effect helpers

The staging fixture uses separately compiled owner-private helpers for create, replace, mkdir, move, and bounded delete. Their SHA-256 values are pinned in the owner-private launch configuration. No helper path or binary hash is exposed through public MCP responses.

Move uses descriptor-bound destination-exclusive rename. Delete supports only exact-SHA regular-file deletion or empty-directory deletion and provides no recursive delete contract.

## Local effect audit

A fresh owner-private `BusinessLocalEffectAudit` state was initialized for this canary. Before live OAuth effect:

- audit record count = `0`;
- mapping count = `0`;
- disposable workspace contents = empty.

Mutation audit stores HMAC-chained effect metadata only. It does not persist file contents, OAuth subject plaintext, bearer tokens, or absolute host paths.

## Pre-activation validation

Authoritative Node: `v24.21.0`.

Passed:

- `BUSINESS_S3C1_SEMANTIC_FILE_CONTRACT=PASS`
- `BUSINESS_S3C1_SEMANTIC_FILE_EFFECTS=PASS`
- `BUSINESS_S3C2_LIVE_FIXTURE_SMOKE=PASS`
- `git diff --check=PASS`
- full `npm run test:ci` → exit `0`

The smoke test proves path/secret-free health output, OAuth challenge before MCP use, all ten bounded semantic filesystem tools armed, and `processEffectTools=[]`.

## Staging activation evidence

Listeners immediately after activation:

- production `31850` remained on PID `8871`;
- B-S3C-2 staging `31861` started on PID `87151`;
- secure tunnel `51961` remained on PID `99496`.

Staging health immediately after activation:

- `status=live`;
- `fileCanaryEnabled=true`;
- `mappingCount=0`;
- `auditRecordCount=0`;
- `processEffectTools=[]`;
- ten semantic filesystem tools listed in `fileEffectTools`.

Unauthenticated `/mcp` returned HTTP `401` with OAuth protected-resource challenge.

No filesystem mutation had occurred at arm time.

## Closure requirements

Do not mark B-S3C-2 accepted until a real connected ChatGPT app completes all of the following through OAuth:

1. exact map to the disposable workspace;
2. focused semantic list/read/info/hash operations;
3. exact mkdir/create/replace/patch/move/delete sequence;
4. exact-revision unmap;
5. final mapped-project state empty;
6. independent Mac Studio verification that the disposable workspace is empty and the expected HMAC audit sequence exists;
7. no `process_start_host` fallback or other process effect;
8. no absolute host path disclosure;
9. temporary filesystem live-effect gate disabled after the pass.

Until those requirements are independently verified, authority remains **STAGING ARMED / LIVE OAUTH EFFECT PENDING**.

## Live OAuth closure evidence

Real ChatGPT OAuth canary completed all 16 requested steps through the connected ChatAgent Business staging app.

Observed public results:

- map: PASS; actual `mappingRevision=3`;
- initial root: empty (`total=0`, `entries=[]`);
- directory create: PASS;
- file create: PASS, 16 bytes;
- create SHA: `24d5cea65d8bcaafc7973a8c0ca1ea938d1a63eabe69463c9f11beef7b03f140`;
- exact-SHA replace: PASS, 17 bytes;
- replace SHA: `a89986cde3ab9e3243dc2e71b30d958f5f0ccb7dbcbde77ad991bea854123859`;
- exact-text patch: PASS, one occurrence;
- patched SHA: `ebfd4e351119b6fd535b980b7ad5e09a96ce7c6a7236d14853ce7149fb857888`;
- semantic move: PASS;
- moved file metadata: regular file, 17 bytes, mode `600`;
- moved content: exact `BS3C2_PATCHED_V2\n`;
- exact-SHA regular-file delete: PASS;
- empty-directory delete: PASS;
- final root: empty;
- exact-revision unmap: PASS with revision `3`;
- final project-filtered runtime list: no mapped node.

The live run used fourteen filesystem calls: `fs_list_directory` x2, `fs_create_directory` x1, `fs_create_file` x1, `fs_get_file_hash` x3, `fs_replace_file` x1, `fs_patch_file` x1, `fs_move_path` x1, `fs_get_path_info` x1, `fs_read_file` x1, `fs_delete_path` x2. It also used one each of `runtime_map_project`, `runtime_unmap_project`, and `runtime_list_nodes`. No process tool, Git/GitHub tool, continuity mutation, shell, or host-command fallback was reported. No connector safety block or absolute host-path disclosure was observed. Confirmation UI state is not observable from tool results.

## Independent Mac Studio verification

Independent post-run inspection confirmed:

- local mapping registry contains the exact MAP/UNMAP receipts for operation UUIDs `55d3d76f-f36c-4999-b370-cd2afd85d4e7` and `4281192b-d6fa-4c82-a552-204bea2998bf`;
- both receipts use `mappingRevision=3`;
- current mappings are empty and `nextMappingRevision=4`;
- disposable workspace is empty;
- no residual B-S3C-2 process exists;
- HMAC verification of the local effect audit passes;
- audit contains exactly 14 records: seven semantic mutations, each with one `ISSUED/PENDING` and one `COMPLETED/COMMITTED`;
- audit precondition digests exactly match the create/replace/patched SHA contracts;
- audit contains no canary file contents and no `/Volumes/` or `/Users/` absolute host path;
- actor identity is stored only as a SHA-256 digest;
- canonical repository remained clean at the pre-closure head;
- production `31850` and tunnel `51961` remained unchanged.

## Post-canary gate closure

After the independent verification, the owner-private staging launch configuration was changed from `BS3C2_ENABLE_FS_CANARY=1` to `0` and staging `31861` alone was restarted. Post-disable health reports:

- `fileCanaryEnabled=false`;
- `dbBackedMutations=[]`;
- `fileEffectTools=[]`;
- `processEffectTools=[]`;
- `mappingCount=0`;
- `auditRecordCount=14`.

The audit records are retained as owner-private evidence; the disposable filesystem target itself is clean. Production was not mutated.

Final decision: **B-S3C-2 ACCEPTED / CLOSED**. The top-level semantic filesystem gate and live local-effect-audit gate are PASS.

Post-disable validation under Node `v24.21.0`: targeted B-S3C-1/B-S3C-2 suites PASS and full `npm run test:ci` exits `0`.
