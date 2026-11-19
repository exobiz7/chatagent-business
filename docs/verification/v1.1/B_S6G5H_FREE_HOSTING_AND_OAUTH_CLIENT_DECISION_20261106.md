# ChatAgent Business v1.1 — B-S6G-5H Free HTTPS Hosting & OAuth Client Selection

Date: 2026-11-06 KST
Decision: **DEDICATED NETLIFY FREE CONSENT SITE SELECTED AS AN ARCHITECTURE CANDIDATE / ZERO PUBLICATION / OAUTH CLIENT REGISTRATION NOT PERFORMED / EXTERNAL ACCEPTANCE NO-GO**.
Release authority: **B-S6 CUTOVER NO-GO; Production target 7/11 PASS**.

## 1. Actual repository and production environment
- Canonical Mac Studio repository: `/Volumes/SSD 4T/z_proj/proj04_chatagent/chatagent_business`; `feat/business-v1.1-bs3-runtime-routing` branch. Opening local/upstream HEAD `61ff497ade3b7084b84824b4c59baa692a308668` and clean worktree.
- Existing v1.0 operator RUNNING, phase B5, owner PID 13607. Port `31850/health`, tunnel `51950/healthz` and `51950/readyz` return HTTP 200. No process restarts or config mutation.
- Target Supabase Auth remains the independent `chatagent-business-v1.1-production` project `hjgerbyofaxyfqdckret`. Prior 7/11 evidence, one release-org ACTIVE ADMIN, no imported projects/tasks/events, no privileged importer. OAuth Server was **not enabled** by this work unit. Owner previously canceled an unsaved enable attempt; current Site URL has not been independently read from the management API.
- User chat is **personal Plus**; any actual plugin connection test requires the separately signed-in ChatGPT Business workspace.

## 2. Read-only provider inventory and chosen layout
| Provider | Actual connected inventory | Decision |
|---|---|---|
| Netlify | Two existing sites: `codeit-webdev-basic`, `profitwithkai`. Both belong to other projects. Team plan label `nf_team_dev`; actual current account billing controls not independently inspected. | **NEW DEDICATED Netlify Free site** for consent frontend only; don't overwrite either existing site |
| Vercel | No currently listed projects or domains | Not selected; would also require a new deployment |
| Cloudflare Quick Tunnel | Provides temporary public `trycloudflare.com` hostnames, not a stable owner-controlled origin | Not selected for production-like OAuth consent |
| Supabase Edge Functions | Potential alternative that shares Auth-project provider/runtime boundary | Deferred; consent application should remain separable for this staging assessment |

The Netlify Free pricing reference documents $0 baseline, monthly credit allowance with no automatic recharge. Actual connected account/project billing must be verified before new-site provisioning. **No Netlify project, deployment, domain, customer login site, tunnel or App was created**.

Preferred topology:
1. Consent UI: **new dedicated Netlify Free HTTPS site** with a verifiable fixed origin, independent release assets and `/oauth/consent` route. No reuse of existing unrelated sites.
2. Identity provider: the existing v1.1 Supabase Auth issuer `https://hjgerbyofaxyfqdckret.supabase.co/auth/v1`.
3. Resource server: separate isolated v1.1 **one-tool read-only** Staging MCP Gateway via separately authorized HTTPS ingress, not the existing v1.0 production server or tunnel.
4. OAuth callback: the **actual exact URI** shown in the ChatGPT **Business** new development-app management page. For modern plugins, OpenAI documentation describes `https://chatgpt.com/connector/oauth/{callback_id}`, but the identifier cannot be guessed and must be copied only from the real app UI.
5. Consenting user: existing authenticated release-org ADMIN; no public user signup or wildcard callback.

## 3. OAuth registration mode decision

Current OpenAI plugin authentication supports **predefined**, **DCR**, and **CIMD**, with authorization code + PKCE S256. The target Supabase guide explicitly covers pre-registered clients and optional dynamic registration.

- **Preferred first path: pre-registered OAuth client**, if the actual Business plugin builder supports supplying its client ID and credential method. Create a separate staging client with the exact Business callback; no wildcard URI. Verify the ChatGPT app and Supabase client registration before any real consent.
- **Fallback: DCR**, only when the Business app's actual registration workflow requires it and after separate owner security approval. DCR allows registration by other MCP clients; monitor clients, verify callback domains and use strict user consent. Do **not** enable dynamic registration merely because it appears as a toggle in Supabase.
- **CIMD is not claimed supported by this Supabase project.** Confirm the actual issuer discovery explicitly advertises `client_id_metadata_document_supported`; a CIMD URL client ID would not pass the existing consent policy's UUID allowlist without a separately audited architecture change.
- The OAuth client type (`public` + `none` versus `confidential` + a secret) and exact token endpoint client-auth method must be matched to the selected ChatGPT workflow; do not invent an OAuth client secret or submit credentials into chat.

## 4. Independent critical token/resource blocker

OpenAI's plugin specification requires a canonical MCP `resource` identifier and correlation of OAuth `resource` parameter with access tokens accepted for that resource. Supabase OAuth documentation shows `aud: authenticated` as its default token audience and a client-specific `client_id` claim.

The earlier one-tool local JWT canary verified existing Supabase JWT `aud=authenticated`, NOT an externally minted OAuth token bound to the **exact MCP Gateway resource**. Therefore **do not equate prior local JWT PASS with ChatGPT resource-specific OAuth acceptance**.

Before public Staging admission, independently prove:
- Supabase authorization/token flow propagates the requested canonical MCP resource, with an appropriate aud/resource contract or an independently reviewed equivalent accepted by the client and Gateway.
- Gateway verifies signature, issuer, expiration, user role, exact client_id, resource-specific audience and any required scopes for every call. No fallback to plain `aud=authenticated` unless independently justified against current MCP requirements.
- If a Supabase Custom Access Token Hook is needed, review it as a **separate auth-wide change** with rollback/recovery and a real S256 client E2E; no Hook or schema was deployed here.
- The existing release-org membership/RLS remains enforced; never use editable `user_metadata` claims for authority.

## 5. Supabase global Auth Site URL impact contract

- Screenshot previously showed `http://localhost:3000` and `/oauth/consent` while OAuth Server toggle was unsaved. **Do not claim the currently persisted Site URL has been verified.**
- Supabase computes the consent UI location from its Auth Site URL plus Authorization Path; changing this global value can alter fallback redirects for confirmation, password recovery, invitation, email magic link and any existing Auth client.
- After allocating the dedicated Netlify origin, verify URL configuration and all applicable email/login flows against it and preserve the old value/rollback plan. The exact origin must match `/oauth/consent` and must serve a working UI with HTTPS and no third-party scripts.
- This is **not a license** to turn OAuth Server on or change Site URL now.

## 6. Code/validation assets

- `docs/verification/v1.1/B_S6G5H_HOSTING_OAUTH_EVIDENCE_20261106.json`: grounded current provider inventory + unallocated consent site, client, callback and Gateway resource details. All permission flags false.
- `scripts/business/v1.1/bs6g5h-hosting-and-oauth-admission.mjs`: pure, no-network fail-closed evaluation of dedicated zero-cost site, exact Site URL, callback/client registration method, Auth discovery/PKCE, v1 isolation, resource-token audience binding and external owner approval. It **never grants publication/OAuth change/import/cutover authority**.
- `scripts/business/v1.1/bs6g5h-hosting-and-oauth-admission-test.mjs`: current blocked evidence, fake all-green and forged-target cases; prevents incorrectly treating user interface or old local signed JWT as public admission.
- CI contract is synthetic and must never make real OAuth server calls, auto-register a client or publish a hostname.

## 7. Source documentation
- OpenAI: https://developers.openai.com/plugins/build/auth
- Supabase: https://supabase.com/docs/guides/auth/oauth-server/getting-started
- Supabase MCP: https://supabase.com/docs/guides/auth/oauth-server/mcp-authentication
- Supabase token security: https://supabase.com/docs/guides/auth/oauth-server/token-security
- Netlify Free: https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/credit-based-pricing-plans/
- Cloudflare Quick Tunnel: https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/

## 8. Next bounded unit B-S6G-5I

**Before externally mutating any system**: seek separate owner authorization to create one new *zero-cost* dedicated Netlify site (not to overwrite existing sites), verify the account's Free billing limit, and build/deploy a secure consent frontend to an exact stable HTTPS origin. Ensure OAuth remains OFF until the origin and recovery/redirect audits PASS. In a later separately controlled gate, identify the exact ChatGPT Business development-app callback/client-registration mode, solve the resource audience mismatch and verify end-to-end Auth consent + isolated MCP one-tool response. Do not promote to production or modify the published v1.0 plugin. Current Production Target: 7/11 PASS, B-S6 Cutover NO-GO.

## 9. Verified local completion and pending external checks

- Mac Studio full `npm run test:ci`: **PASS (97.35 seconds)** including the full migration PostgreSQL Docker canary and B-S6G-5H contract.
- Hosted-mode `npm run test:ci:hosted`: **PASS (78.75 seconds)** including the B-S6G-5H contract.
- Read-only Production DB census: one `release-org` ACTIVE ADMIN, zero project/task/event rows, importer absent.
- Live OAuth metadata check: issuer OIDC 200; MCP OAuth Authorization Server Discovery 404. No Supabase OAuth or Netlify deployment mutation occurred.
- Exact changed-file set: 9, public credential/token-scan PASS, no new paid service, no customer-data mutation.
- GitHub exact-head CI must be checked after the new feature commit; local CI PASS does not override this external gate.
