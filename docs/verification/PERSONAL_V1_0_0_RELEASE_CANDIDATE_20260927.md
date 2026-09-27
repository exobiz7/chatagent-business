# ChatAgent Personal v1.0.0 — Private Production Release Candidate

Date: 2026-09-27 KST

Scope: single-owner macOS private production through the owner's ChatGPT Business workspace. This is not a public binary distribution release.

## Candidate basis

- Parent main SHA: `c507fdb002a9ec4641217d91d643b638db5dbe9d`
- Product version: `1.0.0`
- Node pin: `24.21.0`
- Supported Node range: `>=24.15.0 <25`
- MCP SDK: `1.30.0`
- zod: `4.4.3`
- Core tool snapshot: 33 tools
- Beta disposition before RC: `BETA_ACTIVE_BOUNDED`
- Current independent findings before RC metadata-only delta: P0 0 / P1 0 / P2 0

## Beta evidence

- Actual Business create/read/hash/replace/process/memory canary: PASS
- Safe Replace commit mode: `DIRFD_DUAL_EXLOCK_RENAME_SWAP`
- Post-canary owner rollback: ASK, realAccess=false
- Published workspace beta app: `ChatAgent Personal beta`
- Root migration: `~/ChatAgentPersonalBeta`
- Private beta canary closure: `PERSONAL_PRIVATE_BETA_CANARY_AND_ROOT_MIGRATION_CLOSURE_20260927.md`

## Release-focused smoke

Release candidate smoke covered:
- base MCP + ASK contract
- host list/read/create/hash/copy
- owned scratch create/cleanup and arbitrary-delete refusal
- 9 MiB async hash
- 16 MiB async copy, concurrency/idempotency/F04 recovery
- host process lifecycle/revoke
- actual 33-tool MCP Safe Replace
- Personal Memory MCP
- 12-process runner observation
- SIGKILL stage recovery

Result: `RELEASE_CORE_SMOKE=PASS`.

## Node release runtime

Node `24.21.0` was installed through NVM from the official Node distribution with SHA-256 verification performed by NVM.

The full standalone suite was rerun under Node 24.21.0:

`PERSONAL_STANDALONE_SUITE=PASS count=34`

Node 24 documents classify `node:sqlite` as Stability 1.2 / Release Candidate from Node 24.15.0 onward. The v1.0 private production profile therefore pins 24.21.0 and rejects Node 25+ through the package engine range.

## Native helper provenance

Build toolchain:
- macOS 26.5.2 / arm64
- Apple clang 21.0.0
- flags: `-std=c11 -D_DARWIN_C_SOURCE -Wno-deprecated-declarations -Wall -Wextra -Werror -O2`

Rebuilt binaries were byte-identical by SHA-256 to the active beta helpers:

- native-create-excl:
  `5db079d0b132ac196cb49a74f7aef35db30d8ba91f63e59ff0526a0fc9ffb0c4`
- native-copy-create:
  `9d77cd7ad5370afb09308a20c38d1d65dd23cfbe89dd1b031950a2327cfc3265`
- native-replace-cas:
  `3c9b54143bda17f1e66126bd1d9c9ebc1350033019bbb21190d1876ca9258ab7`

Current helpers are ad-hoc/linker-signed. This is accepted for the bounded private-production scope on the owner's Mac. Developer ID signing/notarization remains required before any separately distributed/public macOS package.

## Release boundary

Private production v1.0 may proceed only if:
1. exact RC SHA passes full local 34-suite under Node 24.21.0;
2. GitHub macOS CI passes;
3. metadata-only diff review finds no functional code change;
4. final Business production app is recreated/published from the frozen 33-tool snapshot because Business published apps cannot be updated in place;
5. production starts in ASK.

Public distribution remains a separate release gate.
