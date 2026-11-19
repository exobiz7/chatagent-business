# ChatAgent Business v1.1 — B-S6G-5E OAuth Discovery and External Staging Decision

Date: 2026-11-05 KST
Scope: independent pre-publication OAuth 2.1 discovery, browser-consent risk audit, Staging routing/identity plan and fail-closed admission contract.
Verdict: **LOCAL PREFLIGHT AND CONTRACT PASS; PRODUCTION AUTH OAUTH-SERVER DISCOVERY HTTP 404; EXTERNAL STAGING NOT AUTHORIZED/NOT ARMED.**
Release authority: **B-S6 Production Cutover NO-GO.**

## 1. Verified actual starting point

- Mac Studio canonical repository `/Volumes/SSD 4T/z_proj/proj04_chatagent/chatagent_business`, feature branch `feat/business-v1.1-bs3-runtime-routing`, local/upstream baseline HEAD `23805eee5a5ac89f78d492cbdf36f391c55e6a38`, clean before B-S6G-5E.
- Existing published Business ChatAgent **v1.0** operator RUNNING, healthy B5 PID 13607; local server 31850 and public tunnel 51950 active, GET /health, /healthz and /readyz HTTP 200. No reboot/restart/reconfiguration.
- KAI Org dedicated Business v1.1 Production Supabase ref `hjgerbyofaxyfqdckret`; earlier 11 canonical migrations, one ACTIVE release-org ADMIN; no imported customer projects or continuity records; privileged importer absent.
- Historical B-S0/B-S3B-3 Staging ports 31861/51961/32171 **not listening**. Proposed *future only* separate candidate ports 31862/51962/32172 also **not listening** at preflight; these are reserved planning identifiers, not configured endpoint/tunnel URLs. Do NOT assume ports will remain free or that any tunnel exists.
- The B-S6G-5D isolated single-tool `member_get_profile` Gateway and signed JWT readback already PASS. It is not a published v1.1 app or a real Business workspace ChatGPT OAuth authorization-code session.

## 2. NEW live read-only Supabase Auth discovery results

Read-only direct TLS GET against the **actual same Production project**:

| Resource | HTTP | Meaning |
|---|---:|---|
| `/.well-known/oauth-authorization-server/auth/v1` | **404** | Required MCP OAuth Authorization Server discovery **NOT available** at this URL |
| `/auth/v1/.well-known/oauth-authorization-server` | 404 | Alternate endpoint also not available |
| `/auth/v1/.well-known/openid-configuration` | **200** | OIDC issuer and authorization_code + refresh_token, PKCE S256 metadata present |
| `/.well-known/openid-configuration/auth/v1` | 401 | Not a valid substitute for provider OIDC discovery |

The 200 OIDC document **does not** prove a functioning OAuth 2.1 Authorization Server Discovery endpoint. The HTTP 404 **does not alone prove** the project feature toggle is disabled; it requires an authorized inspection of **Authentication → OAuth Server** settings and provider routing/configuration before any enabling/change is considered.

Official reference:
- https://supabase.com/docs/guides/auth/oauth-server/getting-started
- https://supabase.com/docs/guides/auth/oauth-server/mcp-authentication
- https://supabase.com/docs/guides/auth/oauth-server/oauth-flows

Documentation confirms that a working MCP OAuth path requires enabled OAuth Server, the issuer-specific discovery document, an authorization UI and an OAuth client. A legitimate password-based app Auth session restored from Mac Keychain cannot substitute for a ChatGPT OAuth authorization-code + PKCE/consent flow.

## 3. Inherited B-S0 consent implementation risks — NOT authorized for external reuse

Existing `scripts/business/v1.1/bs0-oauth-consent-server.mjs` is a **historical Staging fixture**, not a new vetted Production-Auth consent service. Direct source audit found:
- public `signUp` button, inappropriate to automatically expose on this release-org ADMIN-targeted private canary;
- an unversioned browser import `https://esm.sh/@supabase/supabase-js@2`, not independently pinned/self-hosted with integrity control;
- inline browser script and permissive `unsafe-inline` CSP;
- consent screen has no confirmed exact allowed client/redirect-domain binding to a NEW authorized B-S6G-5E app;
- old path `/functions/v1/bs0-oauth-consent` and old Staging Site URL behavior are not evidence that this new Production Auth project is configured correctly.

**Do not simply restart or publish this old consent fixture on the Production target.** Build/review a dedicated minimal consent UI before authorization: existing approved user login only (no public signup), pinned locally served dependencies and strict CSP, exact OAuth client/redirect URI validation, explicit scopes/consent and denial, safe provider SDK API/error handling and no token/PII logs. Its external HTTPS origin and Supabase Auth Site URL/Authorization Path must match.

## 4. Implemented immutable pre-publication verification assets

- `scripts/business/v1.1/bs6g5e-oauth-discovery-preflight.mjs`: two bounded HTTPS GET metadata reads only, correct issuer/authorize/token/JWKS/grants/PKCE S256 and independent OIDC validation; prints status/booleans and never credentials or raw server bodies.
- `scripts/business/v1.1/bs6g5e-oauth-discovery-preflight-test.mjs`: actual missing OAuth discovery must block even if OIDC 200; rejects forged issuer, missing PKCE S256 and cross-target endpoints.
- `scripts/business/v1.1/bs6g5e-external-admission-verifier.mjs`: **supporting evidence-only verifier**; separate exact v1.1 target, HTTPS/consent, owner staging approval and Business plugin checks. It NEVER authorizes import/republish/cutover, even for all-green hypothetical evidence.
- `scripts/business/v1.1/bs6g5e-external-admission-verifier-test.mjs`: simulates positive metadata and malicious/fabricated cutover claims; no authority unlocked.
- `docs/verification/v1.1/B_S6G5E_EXTERNAL_OAUTH_ADMISSION_EVIDENCE_20261105.json`: bounded frozen pre-publication observations, not a new SSOT and not an approval record.
- Both tests integrated into `npm run test:business:bs6g5e` and the canonical full/hosted CI chain. Live Production GET probe stays separate from GitHub CI, which must not use Production credentials.

## 5. External staging publication sequence — NOT EXECUTED

1. Verify Authentication → OAuth Server feature status and discovery document via owner-authorized UI/tool. Any enabling/toggle changes on the existing Production Auth project require a **separate explicit approval**; do not rotate signing keys or enable open registration incidentally.
2. Review hardening of a new minimal consent UI, Supabase Site URL / Authorization Path and exact ChatGPT redirect URI. Do not allow public signup. Require real browser authorization code with **PKCE S256**, client/scopes/redirect verification, approval and denial, no token copying.
3. Once approved, prepare an isolated Staging gateway/tunnel/consent routing topology. Suggested independent local candidates: 31862 gateway, 51962 tunnel, 32172 consent; reconfirm free and bind loopback. Existing v1.0 31850/51950 endpoints remain untouched. **No new public hostname or domain was allocated in this work unit.**
4. Independently verify end-to-end HTTPS public TLS, `/.well-known/oauth-protected-resource`, issuer discovery, 401 Bearer challenge and exact **one** read-only `member_get_profile` in `tools/list`. Confirm no write/process/exec/migration tools on the public Staging service.
5. Register/connect a separate specifically named `ChatAgent Business v1.1 B-S6G-5E ReadOnly` **Business workspace** development app (not v1.0 production and not an old B-S3B-3 app). Only after exact app identity, PKCE, scopes, URI and permission are reviewed may a separate Business-account chat invoke the existing HOLD-only user prompt. The personal Plus chat cannot directly exercise that Business app.
6. Compare actual owner-visible Business result with redacted Staging ingress arrival; ensure no extra tool calls and remove/revoke test registration/permissions as instructed. Local manual bearer test or v1.0 status cannot substitute for this proof.

## 6. Current blocker and authority

**B-S6G-5E = BLOCKED_OAUTH_DISCOVERY / PREPUBLICATION PREP PASS**.

- No Supabase OAuth Server setting change, new OAuth client or external app registration.
- No staging public tunnel or consent URL started; no Business workspace plugin invocation.
- No local or Production v1.0 service modification and no application data or schema modification.
- Existing B-S6G Production Target remains **7/11 PASS**; `migrationAdmin`, `importerPrivilegeIsolation`, `authenticatedReadbackPlan` (actual Business workspace published/connected path), `runtimeSecretCustody` remain PENDING.
- Final release authority remains **B-S6 Production Cutover NO-GO**.

Next unit: B-S6G-5F — owner-reviewed OAuth Server setting/discovery readiness and dedicated consent UI design + isolated HTTPS topology. Separate explicit approval required **before** changes to OAuth Server settings, public tunnel, or Business app registration.

## 7. Independent release/hosted CI and secrets scan

- Mac Studio `npm run test:ci`: **PASS (94.56 seconds)**, complete legacy and B-S6G-5E integration contracts.
- Mac Studio `npm run test:ci:hosted`: **PASS (79.04 seconds)**, including missing-OAuth-discovery and forged-authorization rejection.
- Expected changed-file allowlist **11 files**; public secret/token/key pattern scan PASS. No Production Auth settings changed.
- GitHub exact-head checks remain separately subject to verification after this B-S6G-5E commit; local CI cannot substitute.
- Release verdict remains **BLOCKED_OAUTH_DISCOVERY / NO-GO** even if code tests are all PASS.
