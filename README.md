# ChatAgent Business — SMB Edition

> Current stage: B0 Foundation / baseline convergence
> Business feature implementation has not started.

Canonical repo: `/Volumes/SSD 4T/z_proj/proj04_chatagent/chatagent_business`

## Foundation
- Seed: ChatAgent Personal current main `9ac3d6df9d3e4616d85083719291af41350da016`
- Functional lineage: Personal v1.0.0 `d3279ee948f44f6b8bc66d446be52dc085983eee`
- Runtime baseline: Node `24.21.0`
- Development package version: `0.1.0-dev.0`
- Git remote: intentionally unset in B0
- P7/P8/P9 are reference-only inputs; no wholesale P8 merge.

## Accepted direction
One company = one deployment. Admin-registered projects use `projectId + relativePath`.
Per-project authority is `READ_ONLY / SAFE / STANDARD`; callers cannot elevate it.
Create and replace remain separate; Safe Replace preserves Personal semantics.
Continuity is context, never authority. Arbitrary delete, root/sudo, Docker socket,
generic host shell, automatic Git push, multi-tenant SaaS and autonomous transport are out of scope.

## Namespace and B0 boundary
Business-owned config will use `CHATAGENT_BUSINESS_*`, `~/ChatAgentBusiness/`,
and `chatagent-business-*` runtime names. Inherited `PERSONAL_*` names remain only
inside compatibility/regression code until their Business unit replaces them.
B0 changes identity, portability, documentation and evidence only; B1 is the first feature unit.

Normative baseline: `docs/approved/CHATAGENT_BUSINESS_ACCEPTED_BASELINE_v0.1.md`
