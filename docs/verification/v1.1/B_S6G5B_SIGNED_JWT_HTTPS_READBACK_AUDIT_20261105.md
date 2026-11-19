# ChatAgent Business v1.1 — B-S6G-5B Real Signed-JWT HTTPS Readback Audit

Date: 2026-11-05 KST
Verdict: DIRECT PRODUCTION SIGNED JWT HTTPS READBACK PASS; ACTUAL V1.1 MCP GATEWAY E2E PENDING; B-S6 CUTOVER NO-GO.
Baseline source HEAD e1af948ceddeb901f2cd8cd8af5d7df69763dd42 matched tracked upstream and was clean.

## Independently verified live facts

1. Owner completed private local Mac Studio TTY sign-in. Already-committed B-S6G-5A canary readback mode used only the exact KAI Org Production URL, modern publishable key and owner-private 0600 auth.json with SHA-pinned macOS Keychain helper. No password, token or member identity was provided through ChatGPT.
2. Actual Keychain refresh-token restore and Supabase Auth refresh succeeded. Real signed access JWT called public.bc_member_profile() and public.bc_schema_status() via HTTPS, returning profile format valid, organization release-org, role ADMIN, organizationInitialized true, schemaVersion 1, contractVersion 1 and privateIdentityExposed false. Canary PASS was confirmed twice with no raw response or token printed.
3. Independent Mac Studio one-shot check recovered the Keychain session in memory and verified its JWT cryptographic signature with the live issuer public JWKS via jose.jwtVerify; an asymmetric signing algorithm and issuer were validated. Supabase Auth getUser(access_token) succeeded and its user subject matched the verified JWT subject, with role authenticated. Only safe booleans were printed, not bearer, refresh token, email or user ID.
4. Separate Supabase READ ONLY SQL confirmed one active Auth session, one confirmed non-anonymous Auth user, one release-org application organization and one ACTIVE ADMIN. The SQL check alone does not substitute for the signed HTTPS test.
5. Previous B-S6G-5A negative real HTTPS calls to member profile/schema status returned 401 with PostgreSQL SQLSTATE 42501. No app data, schema, member authority, installer, importer or v1.0 runtime was modified during B-S6G-5B.
6. Supabase Auth refresh-token rotation is an expected login/session side effect, not a business data migration.

## Explicit limitations

- Direct signed-JWT HTTPS subgate is PASS. A real signed access-token MCP tools/call through an isolated v1.1 Gateway was NOT completed or verified. Existing local fixtures and static contracts are supporting evidence only, not Production Gateway E2E.
- Target proof remains 7/11 PASS. The composite authenticatedReadbackPlan remains PENDING until the actual v1.1 MCP Gateway signed tool call and authorized resource handling are independently demonstrated.
- runtimeSecretCustody stays PENDING: owner-private Keychain canary is not proof of final deployed gateway/operator credentials, rotation, recovery and audit.
- migrationAdmin and importerPrivilegeIsolation are PENDING. No privileged one-time importer exists; no SQLite source stop/export/import, no PR merge/tag, no app republish.
- The authorization evidence uses a single confirmed ADMIN, not a multi-user TEAM/PRIVATE isolation test.

## Next B-S6G-5C

Review the actual v1.1 MCP handler and issuer/JWKS integration, then run a bounded local loopback-only no-effect Gateway canary with missing-bearer/invalid-bearer denial and a real signed member_get_profile tool-call. Route the owner-private Keychain access token in memory only. Never print raw Gateway responses, identity, JWT, refresh token, password, or Keychain contents. Do not publish a test fixture via the production tunnel, manipulate v1.0, create customer project records or advance the cutover.

Separately verify future operator signature, importer privilege lifecycle, final runtime secret custody and independent release approval. B-S6 Production Cutover remains NO-GO.
