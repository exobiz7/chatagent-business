# ChatAgent Personal — Bounded Private Beta Activation Closure

Date: 2026-09-27 KST

Final main SHA:

`ccc9232814c63d95e696dfca602cad8ff137a99f`

Reviewed implementation SHA:

`2161d484dfbb28a18afd4703f9816f33e54cda2b`

Tree SHA:

`f5fec93917d5e8cc52ee70df88d96f2af8939eeb`

## Final disposition

**BETA_ACTIVE_BOUNDED**

This record closes the bounded private-beta activation gate for the ChatAgent Personal 33-tool Core.

It does not approve public distribution, production promotion, notarized/signed release packaging, or removal of documented bounded operating assumptions.

## 1. GitHub / source closure

The reviewed stacked lineage was merged in dependency order:

1. PR #8 — async-copy start ownership serialization
2. PR #7 — OpenAI MCP write-action alignment
3. PR #6 — Safe Replace v2 / F03 closure
4. PR #5 — bounded cleanup / effect reporting / Business E2E closure lineage
5. PR #9 — final integration to `main`

Final main merge SHA:

`ccc9232814c63d95e696dfca602cad8ff137a99f`

The final `main` tree exactly matches the independently reviewed implementation tree.

GitHub self-approval was rejected by GitHub policy. No bypass was used. Audit approval was recorded as review comments, and merge proceeded under explicit owner authorization.

## 2. Test and audit gate

Current independent finding counts:

- P0: 0
- P1: 0
- P2: 0

Closed findings relevant to beta:

- F03 / Safe Replace: CLOSED
- CORE-COPY-01: CLOSED

Independent beta re-review result before activation:

`BETA_READY_AFTER_NAMED_NONCODE_OPERATION`

The named non-code operation was the workspace publication/activation step completed below.

Regression evidence:

- independently reviewed CORE-COPY-01 remediation: PASS
- actual Business Safe Replace correct-SHA E2E: PASS
- actual Business 33-tool inventory: PASS
- post-stack macOS CI #94: SUCCESS
- post-stack macOS CI #96: SUCCESS
- post-stack macOS CI #98: SUCCESS
- final integration CI #100: SUCCESS
- final integration CI #101: SUCCESS
- final `main@ccc923...` local suite:
  `PERSONAL_STANDALONE_SUITE=PASS count=34`

## 3. Workspace publication

The OpenAI Business workspace application was explicitly published by the workspace owner/admin.

Published app name:

`ChatAgent Personal beta`

Published description:

`Private beta of ChatAgent Personal 33-tool Core for owner-authorized local file, process, memory, async copy/hash, and Safe Replace operations on macOS.`

Workspace app detail UI shows:

- feature class: write-capable
- tool count: 33
- publication/creation date: September 26, 2026
- published workspace app detail page available to the workspace

This confirms that the 33-tool beta snapshot is published to the Business workspace.

## 4. Runtime at activation

The isolated candidate runtime was restarted from final `main`.

Runtime identity:

- source: `main@ccc9232814c63d95e696dfca602cad8ff137a99f`
- Node: `v24.13.1`
- L1: `127.0.0.1:31841`
- L0: `127.0.0.1:31842`
- one locked L1 broker for the candidate state root
- tunnel health: 200
- tunnel ready: 200
- native helper SHA pins unchanged

Activation authority state:

- paired: true
- ownerIdentity: `LOCAL_PAIRED_OWNER`
- mode: `ASK`
- epoch: 4
- pending: 0
- approvedRecords: 0
- effective real access: false

Therefore beta activation did not leave FULL_HOST enabled.

## 5. Published app vs current-chat installation state

Workspace publication and current-chat installation are separate states.

After workspace publication, the current Plugin Management context reports the exact prior app ID as:

`not_installed`

with the current global permission policy:

`Allow low-risk actions`

This does not invalidate workspace publication. It means the app is not presently installed/connected in this specific ChatGPT user/session context.

Accordingly:

- workspace private-beta publication: ACTIVE
- candidate runtime: ACTIVE / ASK-safe
- current-chat installation/connection: NOT INSTALLED in the observed plugin-management context
- production/public promotion: NOT APPROVED

A workspace member may still need to install/connect/select the published app before invoking it in a new chat, depending on the ChatGPT workspace UI flow.

## 6. Bounded beta operating contract

The private beta remains bounded by the reviewed contract:

- macOS/APFS-oriented implementation assumptions remain documented;
- owner pairing and explicit local TTY control remain authority boundaries;
- ASK is the safe default operating mode;
- FULL_HOST is ordinary same-user authority, not sudo/TCC bypass;
- `local_replace_file` uses expected SHA-256 plus native dual-inode O_EXLOCK and Darwin atomic RENAME_SWAP with post-swap verification and rollback;
- raw same-UID writers can ignore advisory locks, so UNCERTAIN must never be blindly retried;
- unsupported ACL/special metadata is refused;
- async-copy ownership/idempotency serialization and recovery are enabled;
- production signing/notarization/toolchain provenance remain separate release-engineering gates.

## 7. Final gate

**BETA_ACTIVE_BOUNDED**

No demonstrated P0/P1/P2 code blocker remains.

The 33-tool Core is merged to `main`, the final main tree matches the independently reviewed tree, the isolated candidate is running from final main in ASK, and the app has been published to the Business workspace.

Production/public release remains HOLD until a separate production-release review is explicitly completed.
