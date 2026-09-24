# ChatAgent Personal — AIspace 런타임 키 및 로컬 MCP 게이트 기록

Date: 2026-09-24 KST. Workspace: `AIspace`; assigned new tunnel ID: `tunnel_6ab5204f29108191a16eee9b633f5a2a`. Unchanged implementation source SHA `f91eea57269340f55240a2ac760a0f536e99c770`; prior document HEAD `e4289823afb6222dfce9f79699f1527b902967b4`.

## Verified and corrected
- In private Mac Studio candidate `/Users/macstudio/ChatAgentPersonalCandidate/personal-g1-P7VfXK`, new `secrets/tunnel-runtime-key` exists and is owner-regular, 0600, one link, nonempty (164 bytes). L0 and L1 credential file modes/ownership also PASS. No credential value logged or copied into git.
- `tunnel-client doctor` initially rejected **our** `mcp.extra_headers` and `mcp.discovery_extra_headers` YAML sequences: expected `map[string]string`. Corrected these two candidate-only fields to mappings with existing `file:` references. Re-run: profile load, tunnel ID, API key *configured*, MCP target config and ephemeral health listener PASS. **Real control-plane authentication and tunnel/workspace association not yet proven.**
- Subsequent `doctor` was NOT PASS because planned loopback MCP port `31742` was not yet listening; `mcp_server_reachable` and `oauth_metadata` failed `ECONNREFUSED`. Do not reinterpret as tunnel/network authorization failure.
## Local service probe and safety stop
- Prior isolated create/copy native helpers verified against pinned SHA and owner-private modes. Confirmed current source differs from tested `f91eea5…` in only two documentation files. Loopback 31741/31742 available before start.
- Started *only* candidate-owned `L1` on 127.0.0.1:31741 using locked durable launcher, with memory/file/native copy features and `L1_NATIVE_REPLACE_ENABLED=0`. L1 emitted `L1_BROKER_READY`, `paired=true`, `realAccess=false` (ASK).
- Started *only* candidate-owned `L0` on 127.0.0.1:31742 with `PERSONAL_CORE_TOOLS=1` (intended 32-tool profile). L0 emitted `l0_started`, `realAccess=false`.
- The subsequent direct SDK MCP `listTools`/access-status probe **was blocked by the tool safety check**. It did not produce tool inventory, owner status via SDK, or post-L0 `doctor` result. **No alternate execution surface or request was used to bypass the denial.**
- Safely terminated test L0 PID 86136 and L1 Broker PID 86072. Post-stop `lsof` observed no listeners on 31741/31742 and `ps` showed neither test PID. No tunnel daemon or Business app was created, no FULL_HOST, no tool mutation, no production resources accessed.

## Gate and next authorized action
- **LOCAL_PREP=PARTIAL / REAL_MCP_SDK_PROBE=BLOCKED / TUNNEL_CONNECTION=NOT_STARTED / BUSINESS_E2E=UNVERIFIED**. F03 P1 remains OPEN pending explicit bounded-use acceptance; F01 deliberate actual socket split UNVERIFIED.
- Owner approval for isolated Personal candidate is preserved, but a tool-level safety denial is not authorization to reroute or try a different transport. Wait for an approved way to validate the candidate 32-tool MCP boundary; do not claim ready, register the app, or start the tunnel before resolving the block.
- If an authorized next gate is available, perform exact state/helper checks, then approved local client check and post-L0 `doctor`, verify tunnel ACL/workspace association, health/ready, new private AIspace app scan, and disposable chat effects. Keep 33-tool CAS OFF and existing P8 Stable, Business v2 Canary, M16, STABLE-001 unchanged. PR remains Draft; no beta or merge.
