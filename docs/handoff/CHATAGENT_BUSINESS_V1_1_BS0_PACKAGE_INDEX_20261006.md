# ChatAgent Business v1.1 — B-S0 Handoff Package Index

> Snapshot date: 2026-10-06 KST
> Authority: if the repository contains newer accepted/current-state evidence, the newer repository evidence wins.

## Start here

1. `CHATAGENT_BUSINESS_V1_1_BS0_SESSION_BOOTSTRAP_PROMPT_20261006.txt` — paste into the first message of the new session.
2. `CHATAGENT_BUSINESS_V1_1_BS0_SESSION_CONTINUITY_HANDOFF_20261006.md` — complete human-readable context, decisions, findings, next steps and invariants.
3. `CHATAGENT_BUSINESS_V1_1_BS0_CURRENT_STATE_20261006.json` — machine-readable snapshot.
4. `CHATAGENT_BUSINESS_V1_1_BS0_SHA256_MANIFEST_20261006.json` — integrity hashes for the handoff and normative B-S0 inputs.

## Normative / verification sources referenced by the handoff

- `docs/approved/CHATAGENT_BUSINESS_V1_1_ACCEPTED_DESIGN_20261005.md` — SHA-256 `05db058c75c9b6bab33c0f40fffb933940379242f9b65b9b09e9a0ca90e21246`
- `docs/verification/v1.1/B_S0_VERIFICATION_REPORT_20261005.md` — SHA-256 `6d25c91abefdc2f5eb8f658f43c5854a3a0541fae019e648b1cc7fb482060b2e`
- `docs/verification/v1.1/B_S0_GATE_STATE_20261005.json` — SHA-256 `a39957c2802b4a49a704bedd6e7779ea7af74091615c3854f69e38c2c82542f1`
- `docs/verification/v1.1/B_S0_LIVE_CANARY_RUNBOOK.md` — SHA-256 `57046608938971862af41c47fb5d69022309ef9cfddd46ae6fbd9f3d352705e5`
- `docs/verification/v1.1/B_S0_TOOL_CONTRACT_CANDIDATE.json` — SHA-256 `dafec447362045078184e216323f461f56b8b0d88754d479d4e0b41982279869`
- `docs/verification/v1.1/B_S0_TOOL_SELECTION_GOLDEN_SET.json` — SHA-256 `c0059596e38d51538059f39e665f559f3c437a46ed5dbb0ba1f63991f5da1cf4`
- `docs/verification/v1.1/B_S0_SUPABASE_SCHEMA_RPC_CONTRACT.json` — SHA-256 `4b4dd04a78cef6295428d8999aa9dd28de4bc660fba0262baa4b3bcadc6357fd`
- `docs/verification/v1.1/B_S0_TEST_MATRIX.json` — SHA-256 `419a0d35e776c77e4e16e5a86606fd15f4d52e8da835d30bccb4ec0ce9082866`
- `docs/verification/v1.1/B_S0_PERSONAL_DONOR_MANIFEST.json` — SHA-256 `4273b84f1ef42db8a3d700df4fa570a8a00c4ad2ba71a3c027892445b74a7daa`
- `docs/verification/v1.1/B_S0_TUNNEL_PROFILE_TEMPLATE.yaml` — SHA-256 `9be27100166855a6ebacaddec1d0def5cc96f627655528bfd85faad79495914e`
- `scripts/business/v1.1/bs0-live-fixture-server.mjs` — SHA-256 `f25aa4a2c0306f154eb4d2285e29413e022921240be33c9b172af4060532bc2f`
- `scripts/business/v1.1/bs0-local-validation-suite.mjs` — SHA-256 `726172c0fe07b1bb15af71805796ba9634444a01a7ec9bef856dfe3dc046b5d5`

## Generated handoff files

- `docs/handoff/CHATAGENT_BUSINESS_V1_1_BS0_SESSION_CONTINUITY_HANDOFF_20261006.md` — SHA-256 `5fb659a423b8c1ad16ac2e513d858dfbf4dcf1d794c5a05ad432b1b8afeec8f7`
- `docs/handoff/CHATAGENT_BUSINESS_V1_1_BS0_SESSION_BOOTSTRAP_PROMPT_20261006.txt` — SHA-256 `6a81daf4d5159ecc21ce2ca154108380c3df4cfb6f8c0ec3c42c19e8aeb6025b`
- `docs/handoff/CHATAGENT_BUSINESS_V1_1_BS0_CURRENT_STATE_20261006.json` — SHA-256 `bf464a36cb48621b37746fe4c6ceffc9ab9b8a1dbf127599e3cef7ddcdb8d284`

## Current handoff state

- Business v1.0 remains the frozen production baseline.
- v1.1 B-S0 local validation is PASS; live ChatGPT OAuth/tool-selection canary is still pending.
- Dedicated Supabase B-S0 project and consent Edge Function are provisioned.
- Supabase OAuth Server is still disabled at snapshot time (`HTTP 404 feature_disabled`).
- Dedicated OpenAI B-S0 tunnel has not yet been created.
- Draft PR #6 remains Draft until the live B-S0 close gates pass.

## Do not confuse snapshot packaging with source authority

The ZIP copy is only a transfer snapshot. Continue work from the canonical repository, not by editing files extracted from the ZIP. The canonical repo is:

`/Volumes/SSD 4T/z_proj/proj04_chatagent/chatagent_business`

## External transfer ZIP

A convenience snapshot ZIP is stored outside the Git worktree at:

`/Volumes/SSD 4T/z_proj/proj04_chatagent/chatagent_business_handoffs/CHATAGENT_BUSINESS_V1_1_BS0_SESSION_HANDOFF_20261006.zip`

Its SHA-256 is intentionally reported at package creation/final handoff time rather than embedded here, because embedding the ZIP's own digest inside a file contained by the ZIP would be self-referential. The per-file integrity values are in `CHATAGENT_BUSINESS_V1_1_BS0_SHA256_MANIFEST_20261006.json`.
