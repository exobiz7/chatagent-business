# B1 Organization + Project Boundary — Verification Record

> Date: 2026-10-01 KST
> Branch: `feat/business-b1-project-boundary`
> Result: LOCAL IMPLEMENTATION / VERIFICATION PASS

## Implemented
- One organization per deployment registry.
- Owner-private atomic `registry.json`.
- Project admin CLI: add/list/enable/disable/inspect.
- Project fields: `projectId`, display name, canonical host root, profile, enabled.
- Exact profiles: `READ_ONLY`, `SAFE`, `STANDARD`.
- Server-side tool minimum-profile map for the accepted 17-tool contract.
- Authoritative admission: project registry controls root and profile.
- B1 MCP façade with bounded `business_status` only.

## Negative boundaries verified
- Relative/nonexistent project root denied.
- Symlink project root denied.
- Business state overlap denied.
- `AUTONOMOUS` denied.
- Duplicate project ID denied.
- Unknown project denied.
- Disabled project denied.
- Root replaced by symlink after registration denied at admission.
- READ_ONLY cannot call SAFE/STANDARD-class tools.
- SAFE cannot call STANDARD-class tools.
- Caller-supplied `profile=STANDARD` cannot elevate a READ_ONLY project.
- MCP tool-argument profile injection rejected by strict schema.
- MCP authority/profile headers rejected before dispatch.
- Missing organization deployment credential rejected.
- `business_status` does not expose host roots.

## Persistence and operations
Registry survives reopen/restart with the same project ceilings and enabled state.
Admin CLI init/add/disable/inspect was executed against disposable state.
No runtime `set_profile` or MCP project-registry mutation tool exists.

## Regression evidence
Focused:
`npm run test:business:b1` → `BUSINESS_B1_PROJECT_BOUNDARY=PASS`.

Full:
`npm test` → inherited Personal standalone suite `34/34 PASS`
followed by `BUSINESS_B1_PROJECT_BOUNDARY=PASS`.

All B1 fixtures were disposable and cleaned.

## Scope statement
B1 establishes authority and project-root selection only.
B2 Safe Files, B3 Continuity, B4 Audit/Ops and B5 isolated execution are not implemented here.
Personal and P8 production/reference repositories/runtimes are not modified by B1.
