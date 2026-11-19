# B-S6G-5G — Exact HTTPS Staging Topology and Functional Consent Candidate

Date: 2026-11-06 KST
Decision: **OFFLINE CONSENT CONTROLLER/BROWSER CONTRACT PASS; EXACT PUBLIC STAGING ORIGIN, OAUTH CLIENT AND CALLBACK REMAIN UNRESOLVED; EXTERNAL E2E NOT EXECUTED**.
Production release: **B-S6 CUTOVER NO-GO**.

## 1. Actual starting state

- Canonical repo: `/Volumes/SSD 4T/z_proj/proj04_chatagent/chatagent_business`; feature branch `feat/business-v1.1-bs3-runtime-routing`, clean local/upstream baseline HEAD `4ec1807b2f800e156108db01c6024cdabd62d27e`.
- Existing v1.0 operator RUNNING healthy (previous PID 13607) and /health /healthz /readyz HTTP 200 on unchanged 31850/51950 ports.
- Existing developer tunnel template `docs/verification/v1.1/B_S0_TUNNEL_PROFILE_TEMPLATE.yaml` describes a *historical* local staging 31861/51961 and private credentials, NOT a current authorized B-S6G-5G Internet hostname.
- Supabase Business v1.1 Production ref `hjgerbyofaxyfqdckret`, one existing release-org ADMIN, no imported logical projects. Current OAuth Server Authorization Metadata: HTTP 404; OIDC metadata: HTTP 200. The user explicitly canceled the previous unsaved OAuth Server ON toggle.
- Historical UI showed Auth Site URL `http://localhost:3000`. This is not an independently retrieved CURRENT persisted URL. The current actual URL must be verified with the owner before any update.

## 2. Decided safe topology — exact addresses intentionally unallocated

- Proposed distinct new Staging *logical* components:
  - Public, owner-approved HTTPS **Consent Site origin**: PENDING exact domain, TLS certificate, ingress authorization and no v1.0 collision
  - Consent path: `/oauth/consent`, served by the new isolated frontend under that origin
  - MCP Gateway public HTTPS origin/resource: PENDING independent endpoint/route mapping and TLS verification
  - Supabase Auth issuer: `https://hjgerbyofaxyfqdckret.supabase.co/auth/v1` (fixed known Production Auth target)
  - OAuth Client ID: PENDING actual Supabase OAuth Apps registration
  - OAuth Redirect URI: PENDING the **exact** callback from the ChatGPT Business development-app setup
  - Dynamic OAuth Apps: keep OFF pending verified ChatGPT client registration behavior; if DCR is mandatory, treat as new owner authorization/security decision
- The Supabase Auth **Site URL is global for this Auth project**; changing it changes the default absolute redirect used by Auth flows and recovery links. Audit all existing Business Auth password recovery, confirmation/magic link, default redirects and future clients before editing. Do not infer a safe Site URL from the v1.0 OpenAI tunnel.
- `docs/verification/v1.1/B_S6G5G_STAGING_ADMISSION_PLAN_20261106.json` is a **data-only, unarmed plan**; origin/client/redirect stay NULL and every deployment/authorization flag stays FALSE.
- The pure `bs6g5g-staging-topology.mjs` validator rejects HTTP/localhost/loopback/invalid site, wrong OAuth client ID, missing v1.0 isolation and unverified TLS/callback/site impact. Even hypothetical all-green inputs return `ELIGIBLE_FOR_SEPARATE_OWNER_CHANGE_APPROVAL` with **no executable authorization**.

## 3. Functional consent candidate (not yet publicly served)

- `bs6g5g-consent-controller.mjs` is a one-time, headless state machine implementing explicit existing-user login, `release-org` ADMIN/active membership via the existing `bc_schema_status` RPC, Supabase OAuth request inspection, exact client/redirect/scope comparison, and explicit approve/deny decision with callback-origin/path validation. Every decision is one-shot; no automatic consent.
- `bs6g5g-consent-browser-candidate.mjs` supplies the future browser wiring: requires separately owner-approved staging JSON, exact origin and target ref, and an authorization_id from the legitimate browser redirect. It uses an in-memory SDK session (`persistSession:false`, `autoRefreshToken:false`, `detectSessionInUrl:false`), has no signup or token logging, and only activates consent after successful inspect/ADMIN verification.
- **This browser candidate is NOT served by** the B-S6G-5F PREVIEW_ONLY server; that server still has login/approve/deny disabled and has no public listener. Candidate code is not a remotely published app and the server has not been given a deploy/activation switch.
- PKCE `code_verifier` and state are owned and checked by the *ChatGPT OAuth client and Supabase Authorization Server*. This consent page must only process Supabase `authorization_id` and return the Supabase-generated approved/denied redirect. It does not create or exchange OAuth authorization codes itself.
- Existing B-S6G-5F consent policy checks exact registered client UUID, HTTPS callback URI, scope subset `openid email profile`, and returned redirect matching registered origin/path. OAuth client scope and callback must be revalidated against the actual Business integration.
- Candidate approval and denial were both exercised **with synthetic JavaScript SDK fixtures only**, never against a live OAuth session. A mock browser integration verified that an unarmed configuration doesn't instantiate Auth or enable buttons. Login was accidentally left enabled after review in the first test; this was corrected and re-tested to block session-switching within reviewed consent state.

## 4. Security/acceptance gates

- No password, real bearer JWT, refresh token, private Auth member UUID or raw user profile stored in Git or shown in ChatGPT.
- No v1.0 server/tunnel changes, no Production Supabase OAuth toggle, Auth Site URL, OAuth Apps, RLS, schema or Business data changes, no staging public tunnel, no app publish and no paid service.
- Real Browser authorization-code + PKCE end-to-end **NOT RUN**. Actual Business-workspace plugin E2E **NOT RUN**. No authority to enable OAuth, publish externally or proceed to migration/cutover.
- Formal Production Target remains **7/11 PASS**, pending `migrationAdmin`, `importerPrivilegeIsolation`, `authenticatedReadbackPlan` and `runtimeSecretCustody`.
- Tests: `bs6g5g-consent-controller-test.mjs`, `bs6g5g-browser-contract-test.mjs`, legacy B-S6G-5F security test; integrated into `npm run test:business:bs6g5g` and full/hosted CI. No Production Auth side effects.

## 5. Next bounded unit — B-S6G-5H

Read-only source/ownership review to select a concrete **free existing** HTTPS Staging origin or independently approved new origin; verify ChatGPT Business development app callback and whether static client registration or DCR is required. Verify global Supabase Auth Site URL scope and rollback plan. Only after separate owner approval may an HTTPS Staging deployment, Supabase OAuth Server enablement, client registration and Business-account 1-tool test be performed. Never repurpose v1.0 Production or claim offline code proves external OAuth success.

Canonical source docs:
- Supabase OAuth Server getting started — https://supabase.com/docs/guides/auth/oauth-server/getting-started
- Supabase OAuth flows — https://supabase.com/docs/guides/auth/oauth-server/oauth-flows
- Supabase MCP authentication — https://supabase.com/docs/guides/auth/oauth-server/mcp-authentication

## 6. CI closure, transient environment recovery and custody

- Hosted-mode full CI PASS, 79.62 seconds.
- First Mac Studio full CI attempt FAIL in legacy B-S4A PostgreSQL integration when the Docker Desktop daemon socket became transiently unavailable. This failure is recorded and not represented as a passing execution.
- Docker Desktop daemon independently returned server version 29.7.2. One subsequent full CI rerun PASS, 100.13 seconds; new B-S6G-5G controller and browser tests, prior B-S6G OAuth tests and PostgreSQL integration all passed. No persistent Docker configuration change or deliberate service restart was performed.
- Production Supabase read-only census after tests: one active release-org ADMIN, 0 logical projects, 0 continuity tasks/events and privileged importer absent. v1.0 process and secure tunnel were healthy at entry; no runtime or OAuth settings modified.
- Exact public GitHub HEAD CI must still be independently checked after this commit is pushed. Technical CI PASS does not authorize Production Cutover or external OAuth registration.
