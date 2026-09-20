# ChatAgent Personal — separation, copy-stage SIGKILL, SSD and P8 one-off compatibility evidence

**Date:** 2026-09-20 KST
**Repo:** private exobiz7/chatagent-personal
**Status:** DEVELOPMENT TEST PASS / PRODUCT RELEASE NOT ACCEPTED

## 1. Independent product boundary

The original source is selectively copied from exobiz7/chatagent feature commit 359b9acb9c9391f3d9f88d60bcac924f07bb6186 into a NEW git repository with independent history. The new private GitHub repository is exobiz7/chatagent-personal, initial commit db693549891ee958f414d2ffcd0cc3334220b07c. Package name chatagent-personal; only MCP SDK 1.30.0 and zod 4.4.3 are direct dependencies, pinned by its own package-lock. An independent npm installation without node_modules symlink passed. The copy deliberately excludes previous P8 control server, container deployment, P8 memory database, old repo Git history, .env/keys and hard-coded former repo roots. No accepted P8 or existing Business app was repointed.

The earlier P8-compatible read adapter and mock were removed from the personal Broker/MCP runtime and kept only under test/compat. Personal memory implementation has its OWN future store and checkpoint contract (docs/architecture/PERSONAL_MEMORY_CHECKPOINT_DESIGN.md); continuity writes are not implemented. No runtime route, credential or implicit authorization points to P8. The original P8 accepted memory service may remain online completely independently.

## 2. Copy-stage exact ownership and crash recovery

An owned copy now persists a randomly generated stage UUID into the HMAC-sealed personal Broker state before a helper is launched. The native helper stages as .personal-copy-<UUID>.stage using O_EXCL, records COPY_STAGE_READY for progress and atomically publishes an entirely new destination using linkat. A same-key launch with an unbound action fails closed rather than launching a second helper. The stage recovery API derives its path only from a sealed copy record and refuses generic path input.

For a terminal **owned** copy, inspectStage hashes the stage through O_NOFOLLOW, checks file kind, single link, mode, owner, size, dev/ino and stable identity, and returns a bounded audit receipt. Cleanup requires exact expected SHA-256, device and inode, records CLEANUP_ISSUED before unlink, checks absence and seals CLEANED. Mismatched SHA fails without deletion. If an effect becomes uncertain, the system does not blindly replay it.

Evidence:
- personal-copy-sigkill-test: an exact test-owned native helper was SIGKILLed after stage creation. The UUID stage remained, was independently bounded/hashed and the absent destination was confirmed.
- personal-copy-e2e-kill-test: an isolated owned durable job used a **test-only compiled** native helper with a short hold after COPY_STAGE_READY. The exact verified native helper PID was SIGKILLed; the owned runner reached FAILED, a newly opened Broker inspected the sealed UUID stage and its SHA/dev/ino, refused a wrong-hash cleanup and removed the exact stage. The source hash remained unchanged and the final destination was absent.
- l6-b05-async-copy-test and l6-personal-mcp-e2e-test: separate synthetic orphan-stage negative tests, exact cleanup, no arbitrary delete pathname and wrong-hash rejection PASS. The latter exercises a separately authenticated 29-tool personal MCP with no P8 continuity tools.

This is not blanket guarantee against malicious same-UID final pathname substitution. A crash between cleanup intent and unlink remains RECOVERY_REQUIRED; a sealed unbound copy action remains manually reconcilable without blind replay. Full host reboot and unrelated orphan directory discovery are not implied.

## 3. Actual external SSD (APFS) source/destination verification

A disposable, unique, private fixture was created UNDER /Volumes/SSD 4T on the user's actual APFS external volume. The independently owned native copy read a 32 MiB source and published a new destination on the same volume. Source and destination SHA-256 matched the in-memory expected digest; the durable job reported EXITED/0 and COPY_DONE. No unexpected staging entry remained. The two exact verified files were unlinked and only the empty verified fixture directory removed; the separate test-owned Broker state was cleaned independently. There was no access to existing user assets, P8 storage or M16 processes. This proves a bounded 32 MiB APFS copy, **not** every file size/filesystem.

## 4. Actual P8 memory read-only protocol probe — NOT a product dependency

A one-off command was executed INSIDE the existing P8 memory container, using its own process-local existing credential (never printed/copied). The actual service health returned 200; an authenticated POST to /v1/tasks/list with limit:1 returned HTTP 200 and the expected tasks array, with zero tasks returned at that time. No record values, token or private payload were printed; no POST write route was invoked. This proves live authenticated read-only protocol reachability and basic response shape, NOT end-to-end matching of nonempty project/task/checkpoint contents.

The new personal product does NOT call the live P8 container, persist its token, share its memory volume or route its MCP to P8. Test/compat retains a separate P8-compatible mock contract solely as a source-of-design verification aid. No shared runtime identity, permissions or data are installed.

## 5. Open gates

Separate product data store and checkpoint implementation; stage/path malicious same-UID threat review, interrupted-commit reconciliation; representative M16 copied-asset workload and larger SSD tests; signed helper artifact, independent security review; actual new private Business app registration and release rollback. Existing-target atomic replace remains UNAVAILABLE. All feature flags stay default OFF. This report is engineering evidence, not independent security sign-off or product acceptance.
