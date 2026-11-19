# ChatAgent Business v1.1 — B-S3A Runtime Routing / Authority Foundation Verification

Date: 2026-10-08 KST
Branch: `feat/business-v1.1-bs3-runtime-routing`
Base accepted B-S2 HEAD: `1230f2bde8cb3257901c0c01b9827056b93d8c4c`

## Scope

B-S3A establishes distributed-runtime routing and local project-mapping authority before enabling actual HOST_USER process effects.

Implemented in this bounded unit:

- owner-private local workspace-root registry;
- real local core for `runtime_map_project` / `runtime_unmap_project`;
- explicit logical-project-to-node-local-path mapping;
- same logical project may map to different local paths on different runtime nodes;
- operation UUID idempotency for mapping mutations;
- monotonic mapping revision across map/unmap/remap, preventing ABA reuse;
- symlink, traversal, broad-root and local-state overlap denial;
- optional exact Git `origin` verification before mapping commit;
- authenticated project authorization before local mapping effect;
- caller-eligible runtime-node authorization before local mapping effect;
- 0 / 1 / 2+ eligible-node routing rule;
- PERSONAL_NODE owner isolation;
- SHARED_NODE generic `process_start_host` opt-in boundary;
- bounded cached authorization lease under control-plane outage;
- absolute host paths retained only in node-local internal state, never public mapping/route receipts.

Not implemented in B-S3A:

- actual HOST_USER process execution;
- production relay transport;
- semantic filesystem/Git effects;
- Business local effect audit.

Those remain later B-S3 bounded units.

## Authority order

`runtime_map_project` / `runtime_unmap_project` admission is:

```text
validated OAuth member session
-> authenticated logical-project authorization
-> caller-eligible runtime-node status
-> B-S1 node ownership / lifecycle / host-power authority
-> current local node identity match
-> approved node-local workspace root
-> local mapping mutation
```

Cloud project metadata does not supply or grant a host path. The local runtime owns the workspace-root/path mapping.

## Local mapping contract

Node-local state is owner-private and keeps the canonical absolute path internally. Public receipts contain only:

```text
projectId
runtimeNodeId
workspaceRootId
workspaceRelativePath
mappingRevision
```

Unmap requires exact `expectedMappingRevision`; it never deletes or changes repository files.

Idempotency receipts are not automatically pruned in this low-frequency control path. The same operation UUID can therefore never become eligible for blind re-execution after an arbitrary receipt-count threshold.

## Runtime routing contract

For a focused local-effect tool:

```text
0 eligible mapped nodes  -> BUSINESS_RUNTIME_NODE_UNAVAILABLE
1 eligible mapped node   -> sole route may be selected when runtimeNodeId is omitted
2+ eligible mapped nodes -> BUSINESS_RUNTIME_NODE_REQUIRED
```

An explicitly selected node still passes ownership, lifecycle, mapping and lease checks.

PERSONAL_NODE is owner-only. SHARED_NODE allows semantic mapped-project work according to later local policy, but generic `process_start_host` remains denied unless explicit shared host power is enabled.

## Personal donor freeze

B-S3 rechecked the frozen Personal v1.1.1 donor before HOST_USER integration:

```text
source commit: da391bf9c38697d706049b3b5d7bd2c2ba4ba28e
durable-host-processes blob: 27a872de687df1f43fd1ab0c4783ac11a181ba94
broker-server blob:          5ee4d6078207031c3b84bc7e238d5c8e3b27d331
```

Personal remains a read-only source donor, not a Business runtime dependency. Actual durable process reuse is deferred to B-S3B.

## Validation

Node `v24.21.0`:

```text
BUSINESS_S3A_RUNTIME_ROUTING_CONTRACT = PASS
BUSINESS_S3A_RUNTIME_ROUTING          = PASS
B-S3A live fixture syntax             = PASS
npm run test:ci                       = PASS
git diff --check                      = PASS
B_S3A_FULL_REGRESSION                 = PASS
B_S3A_CLOSURE_REGRESSION_V24          = PASS
```

Behavioral tests prove:

- two nodes may bind the same logical project to different local paths;
- public receipts do not disclose canonical host paths;
- same operation/same input replays the prior receipt;
- same operation/changed input fails with idempotency conflict;
- stale mapping revision fails closed;
- remap gets a higher mapping revision than the removed mapping;
- traversal/symlink/wrong Git remote/wrong local node fail before mapping effect;
- an unauthorized logical project fails before local mapping effect;
- PERSONAL_NODE wrong-owner route is denied;
- SHARED_NODE host power is denied by default;
- unexpired cached authorization lease works during control outage and expired lease fails closed.

## Live staging status

The B-S3A staging fixture is active on the existing isolated staging MCP endpoint. It DB-backs only:

- existing B-S2 read-only identity/continuity tools;
- `runtime_map_project`;
- `runtime_unmap_project`.

Publishable Supabase configuration is loaded from an owner-private `0600` local runtime-config file. The fixture no longer accepts the publishable key through its command-line environment. The local config is not committed or copied into evidence.

Activation proof:

```text
B-S3A fixture       127.0.0.1:31861 LIVE
mappingCount        0
workspace root      approved label/id only; absolute path not returned by health
production v1.0     127.0.0.1:31850 UNCHANGED
staging tunnel      127.0.0.1:51961 UNCHANGED
```

Therefore:

```text
BUSINESS_S3A_STAGING_FIXTURE       = PASS
BUSINESS_S3A_CHATGPT_OAUTH_MAPPING = PASS
B-S3A                              = ACCEPTED / CLOSED
B-S3                               = IN_PROGRESS
```

Production Business v1.0 remains unchanged.

## ChatGPT OAuth mapping canary closure

The live OAuth canary used one existing TEAM / STANDARD staging logical project and one caller-owned APPROVED PERSONAL_NODE. The public read path returned exactly one eligible node, no existing mappings, and one approved workspace-root ID/label without any absolute host path.

The map step then succeeded exactly once with fixed operation UUID semantics and returned:

```text
mapped          true
mappingRevision 1
```

A follow-up `runtime_list_nodes` call showed the logical project in `mappedProjects` with the same mapping revision and workspace-root ID, while still withholding the absolute host path. No process, filesystem, or Git mutation tool was called.

The exact-revision unmap step then succeeded exactly once:

```text
unmapped        true
mappingRevision 1
```

A final discovery read returned `mappedProjects=[]`. Node-local cross-check confirmed:

```text
mappingCount        0
targetMappingPresent false
unmapReceiptCount    1
```

The repository remained unchanged across the complete map/discover/unmap sequence:

```text
branch              feat/business-v1.1-bs3-runtime-routing
HEAD                2d7a9e83d045ba83766ea105d2116f77b80d75f9
status SHA-256      e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
working diff SHA-256 e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
staged diff SHA-256  e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
```

This closes B-S3A without enabling HOST_USER execution or semantic file/Git effects.

## Next bounded step

Proceed to B-S3B — Personal durable HOST_USER process core. Reuse the frozen Personal durable-process donor first, then bind start/status/output/terminate to the B-S3A route admission and B-S1 ownership/lease authority. Keep semantic file/Git effects and local effect audit in later B-S3 units.
