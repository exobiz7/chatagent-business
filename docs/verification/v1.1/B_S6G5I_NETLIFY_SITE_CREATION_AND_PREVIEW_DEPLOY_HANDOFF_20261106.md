# B-S6G-5I — Dedicated Netlify Free Consent Preview Site Creation

Date: 2026-11-06 KST
Verdict: **FREE SITE CREATED; STATIC PREVIEW ASSETS BUILT AND VERIFIED LOCALLY; HOSTED DEPLOYMENT PENDING AUTHORIZED BROWSER INTERACTION**.
Production release status: **B-S6 Cutover NO-GO; target evidence 7/11 PASS**.

## Provider and site identity
- Connected Netlify team ID: `6751a08523c4933ee2bbbf03`, slug `exobiz7`; owner role, **Free** team plan.
- The team had two existing, unrelated sites, `codeit-webdev-basic` and `profitwithkai`. Neither was modified.
- Created **exactly one** new Netlify site via connected project-create action:
  - Site name: `chatagent-business-v11-consent-staging`
  - Site ID: `6a561d90-21fe-4001-8a04-ea566236f236`
  - Dashboard: https://app.netlify.com/projects/chatagent-business-v11-consent-staging
  - Planned stable HTTPS origin: https://chatagent-business-v11-consent-staging.netlify.app
  - Connected plan label `nf_team_dev`; team type name `Free`
  - Netlify Free credit constraints apply; no auto-billing or upgrade was requested.
- **No deploy ID and no published site content currently exists.** A site created in Netlify is not evidence of successful HTTPS content publication.

## Static deployment artifact
Canonical source scripts:
- `scripts/business/v1.1/bs6g5i-build-static-consent-preview.mjs`
- `scripts/business/v1.1/bs6g5i-static-consent-preview-test.mjs`

Generated Mac Studio output directory:
`/tmp/chatagent-business-bs6g5i-staging-preview-20261106`

Generated exactly six files, including `index.html`, `oauth/consent.html`, `assets/preview.css`, `_headers`, `_redirects` and `robots.txt`. This is an **inert static site**. No JS SDK, external script, forms, JavaScript events, credentials, real login, approvals, Supabase API calls, OAuth callbacks, or MCP Gateway calls. Login/approval controls are disabled. Headers disable scripts, API connects, form actions, frames and robots indexing. No JavaScript, tokens or secret material is in the deploy folder.

The first local test encountered a macOS `tmpdir()` path outside the script's explicit allowed `/tmp` root; the test was corrected to use the dedicated `/tmp` output root. Final build and negative overwrite/security tests PASS. No manual edits or bytes need to be pasted into the browser.

## Current manual blocker
The connected Netlify plugin can **create a site and inspect deploys**, but exposes no `create-deploy` or file upload operation. The Mac Studio has neither `netlify-cli` nor an available Netlify deployment token/session. Do **not** extract credentials from a browser, change Netlify team configuration, use a temporary public GitHub repository, or invent authenticated deployment capability.

**One human-only browser step is required**:
1. Open the new site dashboard at https://app.netlify.com/projects/chatagent-business-v11-consent-staging
2. Open its **Deploys** screen and use **Deploy manually / drag and drop folder**.
3. On Mac, in Finder use `Command + Shift + G`, paste `/tmp/chatagent-business-bs6g5i-staging-preview-20261106`, press Return, go to its parent if necessary, and drag the **folder itself** into the Netlify upload/drop area. Do not drag the repository or any `secrets` directory.
4. Do **not** enable Git auto-deploy, Supabase OAuth, account signup, credential storage, background functions or payment upgrades.
5. Confirm deploy state `Ready/Published`, then report completion. The assistant must independently verify:
   - `https://chatagent-business-v11-consent-staging.netlify.app/oauth/consent` returns 200 over HTTPS with displayed preview-only text;
   - strict CSP and no-store/noindex headers at HTML route;
   - no login/signup/approval API, `/_headers` and `/_redirects` behavior, no external Auth/API calls;
   - original v1.0 health, and Supabase OAuth discovery remains 404.
6. Never claim successful deployment or a Site URL safe for the real OAuth server before that independent check.

## Next gates
- Netlify actual *hosted* preview proof: **PENDING**, no deploy.
- Supabase Auth global Site URL change: **NOT PERFORMED**.
- OAuth Server enable: **NOT PERFORMED** (live discovery previously 404).
- OAuth Client ID, ChatGPT Business exact callback, DCR/CIMD, resource audience validation: **PENDING**.
- Actual Business workspace OAuth and one read-only MCP tool E2E: **NOT EXECUTED**.
- Production v1.0 server/tunnel unchanged and protected.
- Final 7/11 Production Target and B-S6 Cutover NO-GO unchanged.

## CI and final prepublication acceptance evidence

- Mac Studio `npm run test:ci`: PASS (96.45 seconds), complete Business/Personal regression including Docker PostgreSQL and B-S6G-5I static security build test.
- Mac Studio `npm run test:ci:hosted`: PASS (80.01 seconds), including the same exact static security test.
- Public repository change set contains no client secrets, Service Role keys, JWTs or sign-in credentials.
- Netlify project create returned ID 6a561d90-21fe-4001-8a04-ea566236f236; subsequent site readback confirmed the identity, Free plan, and **empty deploy**.
- GitHub exact-head CI is separately required after commit. Hosting acceptance remains PENDING until user drag/drop and independent HTTPS headers/content verification.
