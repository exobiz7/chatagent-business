# ChatAgent Business — SMB Edition

> Current stage: B3 Shared Continuity implemented and locally verified.
> B4 Audit + Ops / SAFE Pilot Gate has not started.

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

## B3 MCP surface

Configured B3 publishes exactly 14 tools:

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
continuity_open
continuity_start_task
continuity_checkpoint
continuity_prepare_handoff
continuity_complete_task
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

## Shared continuity

B3 reuses the Personal HMAC-sealed SQLite event store inside the Business state root.
It adds organization/project membership validation while retaining task revision CAS,
idempotency UUIDs, immutable completion and secret rejection.

`continuity_prepare_handoff` derives a bounded context-only package; it is not a second SSOT.
The package carries a deterministic `sha256:` context digest, an 8 KiB target with deterministic
optional-field pruning, and `FRESH / STALE / UNVERIFIED` continuity-state freshness.
Global/unrelated project event advancement is excluded from the digest to avoid false staleness.
Git observation is intentionally not an authority input in B3 and is emitted as `null`.
No generic memory search, decision/fact tools, automatic replay or authority grant is exposed.

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

B3 completes local registered-project read/safe-file workflows plus shared cross-chat task continuity.
Audit/ops and the SAFE pilot gate are next; isolated STANDARD execution remains later.
Arbitrary delete, root/sudo, Docker socket, generic host shell, automatic Git push,
multi-tenant SaaS and autonomous transport remain out of scope.

The host file boundary is not claimed as a sandbox against a malicious process already
running as the same macOS user. Mutation primitives are descriptor-bound; ordinary read
operations still assume the local same-UID environment is trusted.

Normative baseline: `docs/approved/CHATAGENT_BUSINESS_ACCEPTED_BASELINE_v0.1.md`
B2 evidence: `docs/verification/B2_SAFE_FILES_VERIFICATION.md`
B3 evidence: `docs/verification/B3_SHARED_CONTINUITY_VERIFICATION.md`
