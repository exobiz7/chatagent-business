# B-S3E-1 — SHARED_NODE Semantic-Root Policy Verification

Date: 2026-10-11
Status: ACCEPTED / CLOSED

## Purpose

Close the B-S3 `BUSINESS_S3_SHARED_NODE_ROOT_POLICY` gate without weakening the accepted separation between focused semantic effects and broad HOST_USER authority.

Accepted rule:

- `SHARED_NODE` semantic filesystem/Git operations may use configured approved workspace roots according to project profile;
- those operations remain root-bounded;
- `process_start_host` remains denied by default on a `SHARED_NODE`;
- broad host process authority is admitted only when `sharedHostPowerEnabled=true` has been explicitly approved;
- `cwd` or a project mapping is never treated as a sandbox for generic host processes.

This unit is a deterministic local policy verification using the production Business routing/root-policy code with a synthetic APPROVED `SHARED_NODE`. It does not convert the live Mac Studio node to SHARED and does not substitute for the later real multi-node B-S5 E2E.

## Implementation

### Internal approved-root resolver

`LocalWorkspaceRegistry` now exposes `resolveWorkspaceRootForEffect(workspaceRootId)` for internal effect composition only.

The method:

1. accepts only a configured root ID;
2. revalidates the configured root on every use;
3. rejects unavailable, unsafe, broad, state-overlapping, or replaced roots;
4. returns the canonical host path only to trusted internal runtime code;
5. leaves the public `listWorkspaceRoots()` response path-free.

### BusinessWorkspaceRootPolicy

Added:

`scripts/business/v1.1/runtime/business-workspace-root-policy.mjs`

`authorizeClone()` binds pre-mapping Git clone authority to:

```text
validated authenticated member key
+ requested runtimeNodeId
+ LocalWorkspaceRegistry node identity
+ configured workspaceRootId
+ current Business runtime-node status
+ runtime authorization
+ organization identity
```

The returned `workspaceRootPath` is internal-only and is sourced from the validated registry root rather than a caller-provided path.

The policy additionally verifies that the runtime registry's returned `nodeId` exactly equals the requested runtime node.

## Verification fixture

Added:

`scripts/business/v1.1/bs3e1-shared-root-policy-test.mjs`

The fixture uses an owner-private temporary workspace, a synthetic APPROVED `SHARED_NODE`, a disposable Git source/bare remote, real semantic filesystem primitives, real semantic Git service, and the HMAC local-effect audit.

The synthetic node starts with:

```text
nodeType = SHARED_NODE
lifecycle = APPROVED
ownedByCaller = false
sharedHostPowerEnabled = false
```

## Passed checks

### Approved root authority

PASS:

- configured root resolves for internal clone authority;
- public root listing discloses root ID/label but no host path;
- unknown root ID is rejected;
- requested runtime node mismatch is rejected;
- runtime registry returning a different node ID is rejected.

### Root-bounded clone

PASS:

- semantic `git_clone_repository` succeeds inside the configured SHARED workspace root with `sharedHostPowerEnabled=false`;
- unknown-root clone is rejected before destination creation;
- clone remains separate from Business project mapping.

### Mapping boundary

PASS:

- `../` traversal mapping is rejected;
- mapping through a symlink that points outside the root is rejected;
- valid logical project mapping binds to the configured root and an exact mapping revision.

### Semantic filesystem / Git boundary

PASS:

- mapped semantic file creation succeeds inside the SHARED project root;
- relative traversal is rejected;
- symlink read escape to outside content is rejected;
- exact-SHA semantic file cleanup succeeds;
- mapped semantic Git branch creation succeeds on SHARED without generic host-power opt-in.

### Generic HOST_USER separation

PASS:

- `fs_create_file` routing is eligible on the SHARED node while `sharedHostPowerEnabled=false`;
- the same node rejects `process_start_host` with `BUSINESS_SHARED_HOST_POWER_DENIED`;
- after explicitly setting `sharedHostPowerEnabled=true` in the synthetic node, `process_start_host` routing becomes eligible.

No host process was actually started by this test.

### Root replacement / TOCTOU defense

PASS:

After registry construction, the configured workspace-root directory was renamed and replaced by a symlink. A subsequent clone-authority request failed closed with the unsafe-root boundary before effect.

### Audit / privacy

PASS:

SHARED semantic clone/file/Git effects are present in the HMAC-chained local audit. The audit does not contain:

- canonical host roots;
- outside-root paths;
- OAuth subject plaintext;
- test file content.

## Regression

Authoritative Node: `v24.21.0`.

Targeted:

```text
BUSINESS_S3E1_SHARED_ROOT_POLICY=PASS
```

Full:

```text
npm run test:ci
TEST_CI_EXIT=0
```

`git diff --check` also passed.

## Production / staging impact

None.

The live runtime remained:

```text
production 31850 = unchanged
staging    31861 = live with all temporary B-S3D-2 effect gates disabled
tunnel     51961 = unchanged
```

No live node lifecycle/type, workspace root, project mapping, file, Git, process, GitHub, or Supabase control-plane mutation was performed by B-S3E-1.

## Gate decision

`BUSINESS_S3_SHARED_NODE_ROOT_POLICY=PASS`.

B-S3 remains open only for the existing isolated-execution regression and final OpenAI safety/tool-selection canary. Real multi-node SHARED/PERSONAL fleet E2E remains a later B-S5 concern and is not falsely claimed by this local policy gate.
