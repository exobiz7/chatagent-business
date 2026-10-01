# B3 Shared Continuity — Verification Record

> Date: 2026-10-01 KST
> Baseline: B2 `83f46b942fb612acd59bffc8d77c069d4811db21`
> Branch: `feat/business-b3-shared-continuity`
> Result: LOCAL IMPLEMENTATION / VERIFICATION PASS

## Implemented five-tool surface

- `continuity_open`
- `continuity_start_task`
- `continuity_checkpoint`
- `continuity_prepare_handoff`
- `continuity_complete_task`

Configured B3 MCP exposes 14 total tools:
B2 status/read/safe 9 + continuity 5.
No generic search/decision/fact/validate/import/replay tool was added.

## Persistence and authority

B3 reuses the Personal Node 24 SQLite event store:
- owner-private 0700 continuity directory
- 0600 SQLite, HMAC seal key and signed head
- append-only event hash chain
- BEGIN IMMEDIATE write serialization
- operation UUID exact idempotency
- task revision CAS
- immutable task completion
- bounded secret/sensitive-text rejection

Business state remains one organization per deployment.
Every continuity call first resolves the B1 project registry and stored profile.
Continuity context never grants file or execution authority.

## Handoff and freshness

Canonical handoff is derived, not persisted as a second SSOT.

Digest basis includes only relevant task continuity state:
organization/project/task identity, objective, status, revision,
current checkpoint summary/state/verification, next actions,
decisions, facts, artifacts, truncation metadata and context-only markers.

Excluded from the digest:
- generated timestamp
- global event sequence
- unrelated project state
- Git observation

Therefore unrelated project activity does not cause false STALE.
B3 freshness means continuity-state freshness only:
`FRESH`, `STALE`, or `UNVERIFIED`.

## Size contract

Ordinary canonical handoff target: <= 8,192 UTF-8 bytes.
Hard maximum: 24,576 UTF-8 bytes.

If the target is exceeded, optional fields are pruned deterministically
while required task identity, status, summary/state/verification and next actions remain.
The package explicitly reports `truncated` and omitted counts.
If required context cannot fit the hard bound, generation fails closed.

The truncation fixture used multibyte UTF-8 data so the test measures bytes,
not merely JavaScript character count.

## Focused evidence

`npm run test:memory`:
all inherited Personal memory/store/MCP/restart/backup/encrypted-archive tests PASS.

`node scripts/business/b3-shared-continuity-test.mjs`:
`BUSINESS_B3_SHARED_CONTINUITY=PASS`.

Verified:
- fresh task resume after store close/reopen
- task/project mismatch denial
- stale revision denial
- exact idempotent retry and conflicting retry denial
- completed task immutability
- secret rejection in objective/checkpoint fields
- decisions/facts folded into checkpoint
- deterministic handoff digest
- related-task change => STALE
- unrelated-project advancement remains FRESH

Also verified:
- 8 KiB deterministic truncation
- project task listing does not leak another project
- corrupted signed memory head => explicit UNVERIFIED
- READ_ONLY may read continuity but cannot start/checkpoint/complete
- disabled project denied
- tool/header profile injection denied
- actual B3 MCP publishes exactly 14 tools
- Conversation A checkpoint/handoff -> fresh stateless MCP call resumes objective/state/next actions
- no host root, secret or hidden chat history is required for resume

Git observation is intentionally `null` in B3.
It is informational/optional by the accepted baseline and is not execution readiness.

## Full regression

Final `npm test` after all B3 code changes:
- inherited Personal standalone suite: `34/34 PASS`
- B1 Organization + Project Boundary: PASS
- B2 Safe Files: PASS
- B3 Shared Continuity: PASS
- exit code: 0

`git diff --check`: PASS during B3 audit.

## Scope / known residuals

- No audit ledger or operator Start/Stop/Status/Doctor/Backup/Restore yet.
- No production Business runtime/tunnel/app publication yet.
- No isolated STANDARD execution yet.
- No generic continuity search, separate decision/fact tools or automatic replay.
- No Git freshness/execution-readiness claim; Git observation is not collected in B3.
- Continuity is deployment-scoped logical project separation, not per-user RBAC.

## Next unit

Per the accepted compact baseline, the next unit is:

`B4 Audit + Ops + SAFE Pilot Gate`

That unit should add the lightweight audit ledger, operator commands,
Doctor, operational-state backup/restore and the local SAFE pilot gate.
Isolated STANDARD execution remains B5.

## Rollback

B3 is isolated on this feature branch.
Return to B2 commit `83f46b942fb612acd59bffc8d77c069d4811db21`
to remove the complete continuity unit without touching Personal or P8.
