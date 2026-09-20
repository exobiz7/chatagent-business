# Personal memory — internal security pre-review and release gates

**Date:** 2026-09-20 KST
**Review classification:** INTERNAL SOURCE + NEGATIVE TEST REVIEW ONLY
**Independent reviewer:** NOT ASSIGNED
**Runtime deployment or Business approval:** NOT AUTHORIZED

| ID | Severity | Observed control | Residual risk / required action |
|---|---|---|---|
| PM-01 | High | Separate private owner state, 0600 SQLite and independently created HMAC seal key; no P8 runtime imports. | Arbitrary commands running under the same macOS UID can access both key and database. No same-UID adversary sandbox; independent product cannot claim credential isolation from owner-approved FULL_HOST execution. |
| PM-02 | High | SQLite BEGIN IMMEDIATE/FULL synchronous, signed event chain and separately signed high-watermark. Crash after committed event before head promotion is reconciled on verified suffix; signed head ahead of DB rejects truncation. | Database and seal must be backed up/restored consistently. A full rollback of both (or key compromise) may be undetectable. Backup/restore, key rotation and retention are not implemented. |
| PM-03 | High | Every task read/write requires explicit projectId; taskId alone never authorizes cross-project disclosure. Revision CAS and operation ID digest prevent ordinary duplicate effects. | Product-level tenant/user authorization beyond one paired owner, hostile concurrent schema mutation and rate limits require independent review. |
| PM-04 | Medium | Best-effort secret-pattern rejection, max 512-char summaries/state/verification, bounded metadata, five returned checkpoints and 20 search matches. | Regex is not a comprehensive DLP classifier. User must avoid raw terminal logs, keys, passwords, access tokens and unbounded model output. Encrypted-at-rest per-user keychain integration is not implemented. |
| PM-05 | Medium | Memory route is separate from FULL_HOST; paired owner may use memory in ASK. Memory text is never used as an execution grant. | The existing general-purpose host execution tool remains powerful under FULL_HOST. No claim that filesystem ACLs block that same-user process. |
| PM-06 | High | Memory service flags default OFF. Independent Broker root and no P8/enterprise app/secret/database dependency. | Wrong product config or accidental schema remapping must be stopped through release scripts and negative deployment tests; no live Business app test yet. |
| PM-07 | Medium | Node 24 built-in SQLite avoids a native npm binary and enables clean CI dependency testing. | node:sqlite is currently an experimental API; pin supported Node/runtime, review SQLite upgrade and migration, test macOS binaries and documented rollback. |

## Minimum production gate

Independent reviewer must inspect the exact source hash, memory seal lifecycle, cross-project data flow, sanitizer, crash/restore semantics and product isolation. Require full macOS CI, signed/pinned deploy candidate, isolated new personal memory state, new authenticated Business private app tool inventory and representative owner-run effect tests. Do not reuse existing P8 private app or report the current 29-tool / current Business 17-tool snapshot as updated.

Explicitly separate **engineering test PASS** from **independent security sign-off** and **user-authorized promotion**. This document is not approval.
