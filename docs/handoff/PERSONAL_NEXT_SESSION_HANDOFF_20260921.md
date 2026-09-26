# ChatAgent Personal — new-session engineering handoff (2026-09-21 KST)

**Read this file FIRST and verify its claims against the current Git HEAD, PR and CI.** This is a continuity record, not authorization to merge, change a live app, migrate data, bypass a platform denial, or claim independent security approval.

## 1. Product objective and hard isolation

- Primary objective: a standalone, single-owner macOS Personal ChatAgent whose ChatGPT Business chat exposes useful file/process/memory MCP functionality, with complete independent repository, runtime, state, keys, tunnels and deployment from the legacy P8/M16 and any eventual enterprise product.
- Personal repo: private `exobiz7/chatagent-personal`, local checkout `/Users/macstudio/dev/personal/chatagent-personal`. This is a NEW git history with only selective source copied; no live dependency on `exobiz7/chatagent`, P8 memory, P8 credential, P8 tunnel or P8 container. The P8-compatible adapter exists only in `test/compat`, not the personal Broker/MCP runtime.
- Current accepted P8 Stable, existing **Business Power-User v2 Canary 17-tool app**, STABLE-001, M16 and unrelated Mac user data/processes MUST NOT be modified or repointed. The 36-tool candidate is a **development-only** inventory, not Business deployment or acceptance.
- All new feature flags default OFF. All test fixtures must be new, private, disposable and exactly scoped. Explicit upstream platform safety denials cannot be circumvented by another host surface. Uncertain effects may be reconciled by their original sealed action/process ID; do not blindly re-run.

## 2. Exact current revision and review status

- Branch `feature/personal-archive-stage-atomic`, HEAD before this handoff `4abb533b3c32cccba830cc07985592b29c69e42a`. After handoff commit, HEAD will change: inspect `git log -3`, `git status --short`, and `git ls-remote` rather than assuming this hash remains HEAD.
- Draft [PR #4](https://github.com/exobiz7/chatagent-personal/pull/4) targets `feature/personal-security-key-hardening`; remains OPEN/DRAFT, not merged. Its parent Draft PR #3 targets the independent personal-memory branch (PR #2) rather than enterprise.
- Exact feature-code commit `4abb533...`: macOS GitHub Actions two executions **SUCCESS**, run IDs `35519740954` (PR) and `35519738836` (push). Local independent `npm test`: **30/30 PASS**; local Apple clang native syntax checks PASS. First feature commit `c80ee6c...` had one failing CI run `35519587685` from a test-worker READY/publish race and one succeeding run `35519609653`; the test worker now blocks after synchronous READY until exact owned SIGKILL. Retain failure in evidence, do not conceal.
- Earlier async process `RECOVERY_REQUIRED` sporadically appeared in CI; three test fixtures now wait on the **same** processId for verified terminal `EXITED`/0 and SHA instead of failing on an early uncertain observation. This fixes premature **test assertion**, NOT demonstrated cause of `/bin/ps`/runner uncertainty. No production identity check or retry rule relaxed.

## 3. Delivered functionality and local proof

- Personal own Node 24 built-in SQLite/HMAC memory store and 7 opt-in MCP tools: project register, task start/get, checkpoint append, task complete, project context, bounded search. Separate 0700 root, 0600 database/keys, scoped task/project, revision CAS, UUID idempotency, signed event sequence/high watermark and restart recovery. Memory in ASK does not confer FULL_HOST or host access.
- Offline library backup takes a source-consistent SQLite snapshot plus HMAC-sealed head/key and keyed manifest. Destination is new-only. Offline encrypted AES-256-GCM archive requires a **different externally supplied 32-byte key**; key is not exposed in MCP. Offline new-file rewrap with a new key/nonce retains old archive. No Keychain/escrow/scheduler or production backup yet.
- New native macOS `scripts/l1/native-restore-publish.c` requires a pinned helper SHA and descriptor-relative no-follow parent traversal, checks private stage dev/inode, uses atomic `renameatx_np(RENAME_EXCL|RENAME_NOFOLLOW_ANY)` to publish only an absent destination. Concurrent existing target is refused. A helper uncertainty is fail-closed.
- `scripts/l1/personal-stage-recovery.mjs`: private HMAC ownership receipt before archive/decrypt plaintext stage. Operator-only inspect and cleanup require exact stage UUID, kind, original target, seal/archive key, dev/ino, bounded allowed filenames, content fingerprint and literal confirmation. Cleanup-intent marker persists before deletion; an uncertain or missing receipt requires review. Normal path uses same checks; no arbitrary-path cleanup or automated sweep.
- `scripts/l1/personal-stage-sigkill-test.mjs`: test-owned Node worker **actually SIGKILLed** after plaintext was created in BOTH archive and decrypt modes; exact stage inspected, wrong key/target/fingerprint denied and only verified disposable stage cleaned. Native destination collision, backup restore, archive rotation and key refusal tests PASS.
- Evidence and contracts: `docs/verification/PERSONAL_ARCHIVE_STAGE_ATOMIC_CHECKPOINT.md`, `docs/architecture/PERSONAL_ARCHIVE_KEY_STAGE_CONTRACT.md`, `docs/security/PERSONAL_INDEPENDENT_REVIEW_HANDOFF.md`, `docs/verification/PERSONAL_MEMORY_BACKUP_RECOVERY_CHECKPOINT.md`.

## 4. Explicitly OPEN blockers / non-claims

1. **Independent security review is NOT assigned or approved.** Internal handoff report is not external assessment. Same-UID adversary can race Node recursive stage cleanup, move intermediate parents, inspect user plaintext/key, or attack snapshots. A cleanup-intent crash leaves an uncertain stage; DO NOT auto-retry deletion. The helper is not signed and reviewed as a production artifact.
2. Archive key external custody, user-mediated Keychain/vault contract, escrow/recovery, actual key lifecycle and retention not implemented. Archive rewrap rotates **archive encryption key only**, not the personal memory HMAC seal key. No completed user-data backup or live personal memory migration was performed.
3. No proven explanation of earlier intermittent runner `RECOVERY_REQUIRED`. Require bounded CI-load observation and independent owner/reviewer classification before declaring reliability closed. Never fail open or replay an uncertain write.
4. Current personal memory backup/restore remains OFFLINE operator/library; no backup/restore MCP tool or Business deployment. Existing Personal 36-tool contract is development-only; current Business v2 remains 17 tools.
5. Business candidate registration requires explicit owner action and separate new private app, independently reviewed exact package, isolated credentials/state/tunnel, rollback and actual Business-side user-run tool effects. No existing P8/Business endpoints should be repointed.
6. Node 24 `node:sqlite` experimental status, same-UID threat, signed artifact, backup-at-rest cryptographic custody, all restore crash windows and external SSD representative workload require review; do not mark L6 or product release complete.

## 5. Immediate next bounded work sequence

A. **Read-only verification** (one short turn): check local branch, clean status, `gh pr view 4`, exact HEAD CI, P8/Canary `/readyz` and container health; report evidence, do not change runtime.
B. **Security/design gate** (separate turn): commission or prepare independent review of native no-replace semantics, stage cleanup path/parent races and post-intent crash, key custody/escrow/rotation, Node 24 SQLite and reproducible signed helper packaging. Distinguish internally reviewed vs independently signed-off; if no independent reviewer available, explicitly leave blocked.
C. **Only if needed, new isolated implementation branch** (separate turn): refine descriptor-anchored exact cleanup/uncertain state, prepare reproducible helper hash and restore tests; run local and two clean macOS CIs. No arbitrary production-file cleanup.
D. **After security acceptance and explicit user approval**, register a separate Personal Business private-app candidate, perform actual Business-side smoke with new fixture and exact action-ID reconciliation; preserve P8 and the existing v2 app. Do not claim these tests occurred before their logs exist.

## 6. Commands / environment (read-only unless owner separately authorizes changes)

```sh
cd '/Users/macstudio/dev/personal/chatagent-personal'
git branch --show-current; git rev-parse HEAD; git status --short
gh repo view exobiz7/chatagent-personal --json isPrivate
gh pr view 4 -R exobiz7/chatagent-personal --json url,isDraft,state,headRefOid
gh run list -R exobiz7/chatagent-personal --branch feature/personal-archive-stage-atomic --limit 6
# Bounded isolated test only, if explicitly needed: npm test
```

Remote Desktop Commander authorized Mac device ID: `6b2bf820-0383-41c6-b94a-4633dae003cf`. If RDC is offline, **first provide a manual restart instruction** only after inspecting actual installed app/launch agent state; do not guess a launchctl label or claim a remote command ran. Previously verified local worktree names: `/Users/macstudio/dev/personal/chatagent-stable-001-executor` and `/Users/macstudio/dev/personal/chatagent-stable-001-b02-executor`; do not edit them.

## 7. Communication and task cadence

Time-outs occurred during long chat/tool turns. The true cause (UI transport timeout vs model context vs tool execution) is **not verified**. Prefer short milestones: (1) inspect, (2) implementation, (3) test/CI, (4) commit/report. After every milestone, record SHA, pass/fail, unresolved risks and next action in a standalone markdown checkpoint. Do not promise background work. A new session should use this file as an index, then inspect the current source and PR; don't repeat completed experiments or invent lost results.

## 8. 2026-09-21 KST — C1-1/C1-2 verified and C2/C3 review continuation (supersedes earlier SHA/sequence)
- The historical SHA/PR and immediate A-D sequence above record the **original handoff**, not the current HEAD. Actual current branch is `feature/personal-c1-bounded-cleanup`, implementation SHA `86eae37fb366efd5d31b65745817a637cf4be923`, Draft [PR #5](https://github.com/exobiz7/chatagent-personal/pull/5) OPEN, not merged. Verify fresh state before further work.
- C1-1 `2a20fee...` and C1-2 `86eae37...` completed bounded non-recursive personal scratch cleanup, preserved primary errors and uncertain state. Latest local base `npm test` 30/30 PASS; exact `86eae37...` Push CI `35524979383` and PR CI `35524981604` both SUCCESS. Optional SSD test NOT run.
- C2/C3 internal review: `docs/security/PERSONAL_C2_C3_REVIEW_20260921.md`. Existing archive/seal key separation, offline rewrap and atomic create-only native publish are retained. Native clang syntax PASS. The existing disposable 12-process observation fixture repeated 3 times: 36/36 PASS; no `RECOVERY_REQUIRED` seen, root cause remains OPEN.
- Keychain/vault integration, archive-key recoverable custody, independently reviewed helper distribution, hostile same-UID path races, post-intent crash reconciliation and full end-user backup are NOT accepted. Offline archive/restore are not MCP or Business tools. Do not block useful Personal core acceptance *solely* on optional offline-backup lifecycle; the exposed core still needs scope-specific independent review and explicit owner approval.
- Next practical batch: on a disposable private test root run create → encrypted archive → new-root restore → offline new-file rewrap with test-only keys and hash-pinned helper, capture build/hash evidence and uncertain-status negative test. Review exposed personal MCP and product isolation with an independent reviewer (not assigned). Only after owner approval register a separate Personal Business candidate; never repoint or mutate P8/Business v2/M16 or migrate real user data.
- This appended checkpoint and its C2/C3 review are internal engineering work, not independent security sign-off. No code, live runtime or user data was changed for C2/C3 review.


## 9. Personal operational discovery profile (2026-09-21; supersedes earlier 36-name presentation)
- Default L0 still exposes historical 36 development names. New explicit `PERSONAL_CORE_TOOLS=1` presents 32 names by hiding the volatile UI probe and three unavailable strict/native/durable operations; `local_write` core schema only allows `create`. No runtime L1 authority or service was changed. See `docs/architecture/PERSONAL_CORE_MCP_OPERATIONAL_PROFILE_20260921.md`.
- An isolated second L0 attached to a disposable L1 confirmed the 32-name exact subset, actual core create/read/memory/owned process effects, while legacy 36-name E2E also passed. Existing-file atomic CAS remains NOT IMPLEMENTED; it should be reviewed as a practical chat-as-executor next feature without adding redundant locks/approval.
- Review source and local/remote HEAD anew; the C2/C3, profile documents and code are internal candidate evidence, not independent reviewer approval. Do not register a Business app, modify P8/Business v2/M16, merge or handle real personal data absent separate owner authorization.

## 10. Native expected-SHA existing-file replacement (2026-09-21 follow-up)
- Earlier section 9 describes default-OFF 32-name core. The native CAS candidate adds a separate default-OFF `L1_NATIVE_REPLACE_ENABLED=1` and private hash-pinned binary, plus matching L0 flag, exposing a 33-name operational core with functioning `local_replace_file`. Base 32 core and 36 development remain when flag OFF.
- Verify latest HEAD and `docs/verification/PERSONAL_NATIVE_CAS_IMPL_20260921.md`; verify full local and exact-SHA CI before acceptance. SHA recheck and same-directory atomic rename do not constitute kernel-atomic CAS against malicious same-UID mutation. The metadata guard now preserves copyable xattrs and refuses extended ACLs or file flags; independent review, concurrent metadata changes and signed distribution remain OPEN.
- No Business Personal registration, P8/Business v2/M16 change, real data migration, or PR merge is authorized here.
