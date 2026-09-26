# ChatAgent Personal — AIspace tunnel profile 준비 (연결 보류)

Date: 2026-09-24 KST. User-supplied Business workspace: `AIspace`. User-supplied **new** tunnel ID: `tunnel_6ab5204f29108191a16eee9b633f5a2a`. Candidate code SHA `f91eea57269340f55240a2ac760a0f536e99c770`. Follow-up document only. No production credential in git.

## Completed on Mac Studio
- Prior independent candidate root preserved: `/Users/macstudio/ChatAgentPersonalCandidate/personal-g1-P7VfXK`. Source remains the pinned G1 test SHA; existing owner paired in ASK; `FULL_HOST` OFF.
- Installed `tunnel-client` version `0.0.14+0f870e50` and tested loopback ports 31741/31742 for availability at preparation time (not reserved).
- Created **private 0600** profile `tunnel-profile/personal-aispace-g1.yaml` via `tunnel-client init --sample sample_mcp_remote_no_auth`, with the user-provided tunnel ID, planned L0 endpoint `http://127.0.0.1:31742/mcp`, and `file:.../secrets/tunnel-runtime-key` reference (file currently absent). Health listener selected ephemeral `127.0.0.1:0`.
- Added independent `x-chatagent-l0-credential` header **file references** in `mcp.extra_headers` and `mcp.discovery_extra_headers`; source points only to candidate's existing private `secrets/l0-mcp-token`. L1 credential is distinct and never sent to control plane. Header values themselves are not printed.
- Installed user-run owner-private `InstallTunnelRuntimeKey.command` (0700) in candidate root. Interactive hidden `getpass` writes **only a new** tunnel runtime key to `secrets/tunnel-runtime-key` (0600, O_EXCL, no overwrite); does not print it or pass it in command arguments.

## Current exact status / gate
- No `CONTROL_PLANE_API_KEY`, `CONTROL_PLANE_TUNNEL_ID` or `OPENAI_ADMIN_KEY` was set in the remote command environment. No prior profile existed. `tunnel-client admin tunnels get` refused without admin key; tunnel-to-workspace association was **NOT independently verified**.
- `tunnel-client doctor --profile personal-aispace-g1 --profile-dir ... --explain` returned FAIL at `profile_load`: referenced runtime key file **missing**. This is an expected explicit blocker, NOT a successful tunnel readiness test.
- No L0/L1 listener launched, no outbound tunnel connected, no ChatGPT Business app created, no real chat E2E. Existing P8 Stable/Business v2 Canary/M16/STABLE-001 were not changed. 33-tool CAS remains OFF. Draft PR #5 and beta HOLD remain.

## Owner next input and planned resume
1. Owner: confirm AIspace workspace controls the new tunnel and grants runtime key principal Tunnels Read + Use; issue or identify **new independent runtime key**. On Mac Studio open the candidate's `InstallTunnelRuntimeKey.command` from Terminal, enter key into hidden prompt (not in ChatGPT/GitHub). If key already exists, script fails; rotate deliberately rather than overwrite.
2. Executor: inspect key **presence/permissions only**; run tunnel doctor; if PASS, validate candidate helper SHA and isolated L0/L1 config and start only Personal local listeners, then private tunnel health/ready. Any auth, workspace-association or config failure stops before app creation.
3. Owner + executor: add **new private Personal app draft** in AIspace and verify exact 32 tool inventory and disposable chat effects. Default-OFF CAS, no existing app changes. F01 actual deliberate HTTP split / F03 residual P1 / physical fault gates remain separately UNVERIFIED or OPEN.
