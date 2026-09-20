# Personal archive stage and native restore — isolated engineering checkpoint

**Date:** 2026-09-21 KST
**Repository:** private exobiz7/chatagent-personal
**Branch:** feature/personal-archive-stage-atomic
**Status:** LOCAL ENGINEERING TEST PASS / CI AND INDEPENDENT REVIEW SEPARATE / NOT DEPLOYED

## Scope implemented

1. Mac-only native-restore-publish.c: descriptor-relative openat/O_NOFOLLOW parent traversal, exact owner-private stage dev/inode check, same-filesystem requirement, atomic create-only renameatx_np(RENAME_EXCL|RENAME_NOFOLLOW_ANY). A concurrent target fails with PUBLISH_DESTINATION_EXISTS and remains unchanged. No generic replace. An uncertain native call reports BACKUP_PUBLISH_UNCERTAIN instead of automatic retry.
2. personal-memory-backup.mjs: hash-pinned private native helper is REQUIRED for any offline restore. SQLite read-only verification-created WAL/SHM sidecars are checked and removed from the disposable staging folder before publishing. Existing target, including a dangling symlink, is denied.
3. personal-stage-recovery.mjs: a private HMAC-bound receipt is persisted before archive/decrypt plaintext staging. Offline inspect checks UUID, target digest, archive key, stage dev/inode, allowed filenames, private ownership and fingerprint; exact cleanup requires an explicit confirmation and a durable cleanup-intent marker. No generic deletion path or unattended sweep.
4. personal-memory-encrypted-archive.mjs: normal cleanup uses exactly the same verified stage ownership mechanism. An offline rotateEncryptedMemoryArchive function rewraps authenticated ciphertext under a fresh separate key/nonce into a NEW file, preserving the old archive. No Keychain integration, MCP tools or live personal/P8 migrations.

## Executed local evidence

- The native helper was built with Apple clang -Wall -Wextra -Werror. Disposable local smoke: PUBLISH_DONE on new root, PUBLISH_DESTINATION_EXISTS when an existing target was present; original existing target was unchanged.
- PERSONAL_MEMORY_BACKUP_TEST=PASS, including a destination entry intentionally created BETWEEN precheck and publication; native conditional publish refused it. Original bundle and other data remained unchanged.
- PERSONAL_MEMORY_ENCRYPTED_ARCHIVE=PASS, including encrypted restoration with pinned helper, wrong-key/ciphertext, rejected memory-seal key reuse, offline new-file key rotation, wrong old key and old-archive retention.
- PERSONAL_STAGE_SIGKILL_RECOVERY=PASS: independently owned test workers were killed after *actual plaintext staging* in BOTH encryption and decryption. A fresh inspector verified each exact UUID stage; wrong key/target/ID, fingerprint mismatch and missing confirmation were refused. Only the explicitly verified, disposable stage was removed. Neither final target was created.
- Existing 29 suites plus new stage test: 30 local suites PASS, with no P8 runtime dependency. Full GitHub macOS CI outcome must be recorded for the exact feature commit before a release gate is evaluated.

## Explicit limitations

This is not a complete malicious same-UID filesystem-isolation proof: a same-user process could race Node recursive cleanup, rename an intermediate parent after pathname validation, or inspect plaintext in memory/private staging. A crash after cleanup intent may leave uncertain partial effects requiring operator review; never infer cleanup from prefix alone. The archive key is supplied by the caller and is NOT stored in Keychain, rotated on a schedule or escrowed. Backup/restore still require offline/quiescent use. Signed pinned distributable helper, independent security approval, actual Business candidate registration and product cutover are NOT DONE.

Existing P8 Stable, Business v2 and M16 were not modified, copied at runtime, or used as a data store.
