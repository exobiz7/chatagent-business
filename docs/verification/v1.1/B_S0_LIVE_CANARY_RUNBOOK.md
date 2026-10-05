# ChatAgent Business v1.1 — B-S0 Live Canary Runbook

Status: PREPARED / external resources not yet provisioned.

This canary is deliberately separate from Business v1.0 production and ChatAgent Personal.

## Required external resources

1. A dedicated Business B-S0 Supabase project in a user-confirmed Supabase organization.
2. Supabase OAuth 2.1 enabled with an authorization/consent flow and dynamic client registration as required by the ChatGPT MCP client.
3. A dedicated OpenAI Secure MCP tunnel ID, separate from `chatagent-business` production.
4. A Draft/Developer Mode ChatGPT app pointed at the B-S0 tunnel.

Do not repoint or reuse the production v1.0 tunnel for this validation.
Do not modify or branch the Personal Supabase project for this validation.

## Local fixture

Server:

`scripts/business/v1.1/bs0-live-fixture-server.mjs`

It is effect-free. All semantic tools return a no-effect probe result; only `member_get_profile` returns the OAuth-derived stable profile object.

Required environment values at runtime:

- `BS0_PUBLIC_ORIGIN`
- `BS0_SUPABASE_URL`
- `BS0_ORGANIZATION_ID`
- optional `BS0_EXPECTED_AUDIENCE`
- optional `BS0_FIXTURE_PORT` (default 31860)

The fixture exposes:

- `/mcp`
- `/.well-known/oauth-protected-resource`
- `/healthz`

It validates Supabase-signed access tokens through the project's JWKS and never logs token values.

## Tunnel profile

Create a separate tunnel profile with:

- new B-S0 tunnel ID;
- the existing organization-scoped runtime API-key file reference (do not copy or print the key);
- separate health listen port/file;
- MCP target `http://127.0.0.1:31860/mcp`;
- no production deployment-key header, because the B-S0 fixture uses OAuth.

## ChatGPT validation sequence

1. Scan Tools.
2. Confirm all candidate tools have expected names/titles/descriptions/input schemas/annotations/security schemes.
3. Link the Supabase OAuth test account.
4. Call `member_get_profile`; verify stable opaque ID and credential scoping.
5. Run every case in `B_S0_TOOL_SELECTION_GOLDEN_SET.json`.
6. Record selected tool, arguments, any confirmation UI, any platform block, and returned no-effect result.
7. Semantic tool existing + unnecessary `process_start_host` selection = FAIL unless evidence justifies the exception.
8. Any false annotation, hidden effect, or unsafe substitution = FAIL.
9. If repeated legitimate workflows are blocked despite truthful focused tools, activate the documented Personal safety-compatibility fallback and rerun the complete scan/golden set.

## Close conditions

B-S0 may close only after:

- `OPENAI_TOOL_ANNOTATION_SCAN=PASS`
- `TOOL_SELECTION_GOLDEN_SET=PASS`
- `OAUTH_MEMBER_IDENTITY_PATH=PASS`
- `BUSINESS_V11_S0_ACCEPTED=PASS`

Until then Draft PR #6 remains unmerged and Business v1.0 remains the production baseline.

## Supabase staging values

- project ref: `dxofyjarkzizdzumfyul`
- project region: `ap-northeast-2`
- Site URL: `https://dxofyjarkzizdzumfyul.supabase.co`
- OAuth Authorization Path: `/functions/v1/bs0-oauth-consent`
- consent URL: `https://dxofyjarkzizdzumfyul.supabase.co/functions/v1/bs0-oauth-consent`
- Dynamic Client Registration: enable for this isolated B-S0 staging project
- requested identity scopes: `openid email profile` only

Do not configure custom `business.*` OAuth scopes; Supabase OAuth Server currently supports only standard OIDC scopes. Business authorization remains RLS/server/local-policy based.

## OpenAI tunnel staging values

Create a separate Platform tunnel for this canary; do not repoint the production `chatagent-business` tunnel.

Recommended tunnel name: `chatagent-business-v11-bs0`

Associate it with the target ChatGPT Business workspace and grant/use the existing organization tunnel permissions. After creation, replace `__TUNNEL_ID__` in `B_S0_TUNNEL_PROFILE_TEMPLATE.yaml`. The template uses dedicated local ports `31861` (fixture MCP) and `51961` (tunnel health), so it does not collide with production ports `31850/51950`. It references the existing runtime API key file by path without copying or exposing the key value.
