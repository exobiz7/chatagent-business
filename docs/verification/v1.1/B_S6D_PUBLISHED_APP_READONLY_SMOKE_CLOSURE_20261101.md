# Business v1.1 / B-S6D published v1.0 app fresh-chat closure

Date: 2026-11-01 KST
Status: B-S6D ACCEPTED/CLOSED — REQUIRED READ-ONLY USER PATH PASS
B-S6 cutover: NOT STARTED / NOT AUTHORIZED.

## Evidence

- Business account screenshots supplied by the owner show AIspace workspace catalog publication of ChatAgent Business and admin plugin listing with status available/active and update date 2026-11-01. The personal-owned catalog listing and installed plugin list corroborate registration. Screenshots are not copied into the public repo.
- A fresh ChatGPT chat screenshot shows @ChatAgent Business selected and the owner reports business_status exactly once and read_file exactly once, no other tools, retry or mutation.
- business_status returned v1.0.0, SMB/B5; project dev/STANDARD, docs/READ_ONLY, ops/SAFE all enabled and available; B2–B5 readiness states.
- read_file for projectId docs and relativePath README.txt returned 21 bytes, hasMore=false, content RELEASE_RC_READ_ONLY followed by newline. Local production fixture was independently read-only checked: 21 bytes, same content, SHA256 9efe3c8acc12077e98557ff8245a179a9f552558cd9a029ddb4a9e4956c94394.
- Independent production tunnel logs contain exactly two forwarded commands during the user test: 2026-11-01T21:37:58.483816+09:00 and 2026-11-01T21:38:04.841975+09:00. Both have private request IDs. Logs do not identify tool name or tool-level response, therefore individual forwarded-command-to-tool mapping is NOT PROVEN.
- Installed production v1.0 operator status RUNNING / healthy=true, phase B5, PID 38634; production 31850/health, tunnel 51950/healthz and 51950/readyz all HTTP 200. The separately approved 2026-11-01 tunnel-only restart recovered stale readyz 503 without restarting the v1.0 server.

## Evidence boundaries

- Mandatory fresh-chat read-only published-app path: PASS, based on owner UI, two user-visible tool outputs, local fixture and independently time-correlated forwarded commands. Publication screenshot and tool call screenshot are consistent, but there is no cryptographic binding of UI app identity to each tunnel request.
- Optional continuity_open: NOT_RUN_MISSING_AUTHORIZED_FIXTURE. No taskId/contextDigest invented.
- Confirmation UI visibility: NOT_OBSERVABLE. No exhaustive secret leakage audit; no secrets shown in user-provided output.
- B-S6C original recovery remains a separate historical accepted unit; current fresh-chat completion happened later in B-S6D.
- Reboot persistence: NOT_TESTED. B-S6C pre-start backup is not the maintenance-window final backup.
- No v1.1.0 release, final SQLite export, Supabase import, PR #9 Ready/merge, tag, published app replacement, or production cutover.
- Accepted Design section 37 sequence and section 39 invariants remain authoritative.

Final decision: B-S6D PUBLISHED_APP_READONLY_SMOKE_PASS/CLOSED.
Next: prepare cutover decision dossier and obtain a SEPARATE explicit owner approval before any production effect.
