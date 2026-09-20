# Personal core — discoverable operational MCP profile

Date: 2026-09-21 KST. Base code `c7e619133f89afbfbde0f12d5b5719321d487ce6`; personal-only isolated development branch, Draft PR #5.
Classification: development profile and internal engineering test. No private Business registration, endpoint deployment, merge or independent security acceptance.

## Purpose and selection
The default L0 discovery retains all 36 development names for compatibility and existing isolated tests. An explicitly selected `PERSONAL_CORE_TOOLS=1` **L0 presentation flag** exposes 32 names for the intended single-owner macOS strict/native/durable Personal profile. This is not a new owner permission, Keychain integration, service, global lock or background job.
This flag changes **L0 tools/list and MCP schema only**, not L1 authority or API routes. Enable both sides' existing file/host/memory and strict/native/durable flags consistently when an independent candidate is eventually configured. Never advertise 32 usable effects solely on the basis of a count; some names are owner-status, read/stop or access-record controls.

## Four development-only / unavailable names hidden in core mode
- `l0_confirmation_probe`: volatile UI demonstration, not a real file/process effect.
- `local_replace_file`: strict-mode existing-file atomic compare-and-replace is not implemented; the historical return is `ATOMIC_REPLACE_UNAVAILABLE`.
- `local_copy`: synchronous copy is unavailable under pinned native create-only mode; use functional `local_async_copy_start` with exact source digest and new destination.
- `local_process_input`: durable runner does not accept live stdin; attempting this operation would return `DURABLE_STDIN_UNAVAILABLE`.

The retained `local_write` advertises `mode: create` **only** in the core schema; `local_create_file` remains the simpler recommended create-only tool. No apparent support for replacing an existing file is promised. Legacy/default mode preserves the historical `create|replace` schema and all 36 names.

## Preserved useful operations
- Owner-authorized file list/stat/read/hash and native new-file create. No overwrite or general-purpose delete.
- Create-only native async copy with its original owned process ID, status/read/stop and terminal hash; owned, exact orphan-stage inspection/cleanup. Scratch cleanup remains opaque-handle/hash scoped.
- Owner-delegated host process start/status/read/stop and independent project/task/checkpoint/search personal memory. The owner enables FULL_HOST under existing local enrollment; no per-operation prompts added.
- No optional offline backup/restore/encryption/key rotation in either MCP profile. Existing P8/Business v2/M16 credentials, runtime and endpoints are not reused.

## Tested profile contract
The existing `personal-36-tool-candidate-test.mjs` starts a second L0 with `PERSONAL_CORE_TOOLS=1` against the same *disposable* Personal L1, confirms the exact 32-name ordered subset and `local_write` create-only schema, then performs actual core MCP create/read, memory registration, owned executable/terminal output. It separately verifies the original 36-tool development inventory and its previous create-only/refusal, 9MiB hash/copy, stage and memory tests.
Both L0 fixtures bind new loopback ports and use generated test-only credentials/0700 directories. Test code and fixture binaries are not deployed.

## Practical capability follow-up
The core profile is a truthful **current** surface but does not yet deliver editing an existing file, which is relevant to the product's chat-as-executor goal. If needed for practical workflows, implement a separately reviewed *atomic, expected-SHA-256 existing-file replace* with precise no-overwrite/create separation and negative race tests; only then expose `local_replace_file` in that actual operational profile. Do not re-enable the weaker pathname-based replace simply to make the tool count larger, and do not add global locks or approval prompts to normal owner-approved work.
The runner's intermittent `RECOVERY_REQUIRED` root cause, hostile same-UID access and optional archive key custody remain OPEN. Independent reviewer UNASSIGNED; no Business candidate or production approval is implied.
