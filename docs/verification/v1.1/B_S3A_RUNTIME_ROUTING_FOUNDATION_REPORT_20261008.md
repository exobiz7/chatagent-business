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

A B-S3A staging fixture is implemented and syntax-validated. It DB-backs only:

- existing B-S2 read-only identity/continuity tools;
- `runtime_map_project`;
- `runtime_unmap_project`.

The fixture activation is intentionally not forced through an unsafe credential-injection workaround. The existing B-S2C staging fixture remains active until the B-S3A OAuth mapping canary activation step is provisioned through an approved publishable-only runtime-config path.

Therefore:

```text
BUSINESS_S3A_CHATGPT_OAUTH_MAPPING = PENDING_LIVE_CANARY
B-S3                              = IN_PROGRESS
```

Production Business v1.0 remains unchanged.

## Next bounded step

Activate the B-S3A staging fixture through the approved publishable-only local runtime configuration, then run an actual ChatGPT OAuth canary:

1. list caller-eligible node/workspace-root labels;
2. map one existing staging logical project to an existing local checkout;
3. verify the mapped node is discoverable without host-path disclosure;
4. unmap using exact mapping revision;
5. verify unmap did not mutate repository files.

After that canary, close B-S3A and proceed to B-S3B — Personal durable HOST_USER process core.
