# ChatAgent Business — SMB Edition

> Current stage: B1 Organization + Project Boundary implemented and locally verified.
> B2 Safe Files has not started.

Canonical repo: `/Volumes/SSD 4T/z_proj/proj04_chatagent/chatagent_business`

## Foundation
- Seed: Personal main `9ac3d6df9d3e4616d85083719291af41350da016`
- Functional lineage: Personal v1.0.0 `d3279ee948f44f6b8bc66d446be52dc085983eee`
- Runtime baseline: Node `24.21.0`
- Development version: `0.1.0-dev.0`
- Git remote: intentionally unset pending user confirmation.
- P7/P8/P9 are reference-only inputs; no wholesale P8 merge.

## B1 authority model
One deployment has one organization and an owner-private atomic registry.
Projects are registered locally with an admin-selected canonical host root and exactly one
profile ceiling: `READ_ONLY`, `SAFE`, or `STANDARD`.

MCP callers never choose the host root or profile. Admission resolves:
`projectId → registry → enabled/root-valid → stored profile → tool minimum profile`.
The B1 public MCP surface exposes only `business_status`, which omits host roots and secrets.

## Admin CLI
Set `CHATAGENT_BUSINESS_STATE_DIR` to an owner-private Business state directory.

```bash
node scripts/business/business-admin.mjs organization init <organizationId> "<displayName>"
node scripts/business/business-admin.mjs project add <projectId> "<displayName>" "<absoluteRoot>" <READ_ONLY|SAFE|STANDARD>
node scripts/business/business-admin.mjs project list
node scripts/business/business-admin.mjs project enable <projectId>
node scripts/business/business-admin.mjs project disable <projectId>
node scripts/business/business-admin.mjs project inspect <projectId>
```

## Current boundaries
B1 does not expose file mutation or execution yet. B2 will add project-relative Safe File tools
on top of this registry/authority boundary. Continuity remains context-only and is deferred to B3.
Arbitrary delete, root/sudo, Docker socket, generic host shell, automatic Git push,
multi-tenant SaaS and autonomous transport remain out of scope.

Normative baseline: `docs/approved/CHATAGENT_BUSINESS_ACCEPTED_BASELINE_v0.1.md`
B1 evidence: `docs/verification/B1_PROJECT_BOUNDARY_VERIFICATION.md`
