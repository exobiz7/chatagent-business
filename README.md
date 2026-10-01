# ChatAgent Business — SMB Edition

> Current stage: B2 Safe Files implemented and locally verified.
> B3 Shared Continuity has not started.

Canonical repo: `/Volumes/SSD 4T/z_proj/proj04_chatagent/chatagent_business`

## Foundation
- Seed: Personal main `9ac3d6df9d3e4616d85083719291af41350da016`
- Functional lineage: Personal v1.0.0 `d3279ee948f44f6b8bc66d446be52dc085983eee`
- Runtime baseline: Node `24.21.0`
- Development version: `0.1.0-dev.0`
- Git remote: intentionally unset pending user confirmation.
- P7/P8/P9 remain reference-only; no wholesale merge.

## Authority
One deployment has one organization and an owner-private registry.
Every operation resolves `projectId → enabled canonical root → stored profile → tool minimum profile`.
Callers never provide a host root or authority profile.

Profiles remain `READ_ONLY / SAFE / STANDARD`.
No runtime `set_profile` exists.

## B2 MCP surface

Configured B2 publishes exactly 9 tools:

```text
business_status
list_directory
stat_path
read_file
hash_file
make_directory
create_file
replace_file
apply_patch
```

File tools accept `projectId + relativePath` only.
Direct `.git` access, absolute paths, `..` traversal and symlink components are denied.
READ_ONLY projects cannot use mutation tools.

## Safe mutation model

- `make_directory`: descriptor-traversed native create-only directory.
- `create_file`: Personal-derived native O_EXCL create-only primitive.
- `replace_file`: expected-SHA Safe Replace using Darwin atomic swap, post-verify and fail-closed uncertainty.
- `apply_patch`: one UTF-8 file, bounded exact-text replacement, current SHA required, committed through `replace_file`.
- No delete, rename, copy, Git mutation or multi-file transaction tool.

All mutation helpers are pinned by absolute binary path + SHA-256 and must live in an owner-private directory.
A partial native-helper configuration fails startup; no native configuration preserves the B1 status-only surface.

## Admin CLI

Set `CHATAGENT_BUSINESS_STATE_DIR`, then use:

```bash
node scripts/business/business-admin.mjs organization init <organizationId> "<displayName>"
node scripts/business/business-admin.mjs project add <projectId> "<displayName>" "<absoluteRoot>" <READ_ONLY|SAFE|STANDARD>
node scripts/business/business-admin.mjs project list
node scripts/business/business-admin.mjs project enable <projectId>
node scripts/business/business-admin.mjs project disable <projectId>
node scripts/business/business-admin.mjs project inspect <projectId>
```

## Current boundary

B2 completes local registered-project read/safe-file workflows.
Continuity remains deferred to B3; isolated STANDARD execution is later.
Arbitrary delete, root/sudo, Docker socket, generic host shell, automatic Git push,
multi-tenant SaaS and autonomous transport remain out of scope.

The host file boundary is not claimed as a sandbox against a malicious process already
running as the same macOS user. Mutation primitives are descriptor-bound; ordinary read
operations still assume the local same-UID environment is trusted.

Normative baseline: `docs/approved/CHATAGENT_BUSINESS_ACCEPTED_BASELINE_v0.1.md`
B2 evidence: `docs/verification/B2_SAFE_FILES_VERIFICATION.md`
