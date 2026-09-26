# Personal archive — key custody, rotation and crash-orphan contract

**Date:** 2026-09-21 KST
**Classification:** DEVELOPMENT CANDIDATE; NOT an accepted, signed or deployed security policy
**Owner:** private exobiz7/chatagent-personal; no P8/M16/enterprise dependencies.

## 1. Key domains and custody

The per-store 32-byte memory HMAC seal key lives in a private personal state root and is included *inside* a backup. It is NOT the archive encryption key. Every AES-256-GCM archive requires a distinct externally supplied 32-byte encryption key. Reuse of the HMAC key is rejected, as is rotation to an identical key. A fresh 96-bit nonce is used for each encryption or rotation.

The library only accepts the key as a Buffer in its calling process. It never accepts or returns archive keys through MCP, arguments, environment variables or stdout, saves them in a repository, or creates a Keychain item automatically. The proposed product custody contract is explicit, user-mediated macOS Keychain or another encrypted owner-managed vault, independently reviewed access settings, backup and escrow strategy, and controlled deletion. Keychain integration, escrow, key-loss recovery and scheduled rotation are NOT IMPLEMENTED. Loss of the sole archive key can make recovery impossible.

A same-UID process can read memory and temporary plaintext; 0700/0600 permissions are not isolation against processes authorized under the same macOS user.

## 2. Offline key rotation

The rotateEncryptedMemoryArchive function authenticates the old ciphertext with its old key, re-encrypts in process memory using an independently supplied new key and nonce, and writes a NEW file with exclusive creation. It never replaces or deletes the original archive, changes live personal memory or rotates the memory store's HMAC key. A reviewer or owner must independently verify the new archive and custody of the new key before revoking or deleting the old archive/key. No MCP tool, P8 migration, background scheduler or automated key lifecycle is involved.

## 3. Owned plaintext stage recovery

Encryption and decryption each create a private .personal-{archive|decrypt}-working-UUID directory BEFORE generating plaintext files. A private HMAC-authenticated ownership receipt binds UUID, stage device/inode, job kind and destination-path SHA-256 to the supplied archive key. Offline operator inspection reconstructs the expected stage path from the private parent, kind and UUID and returns bounded file count/bytes and a tree fingerprint, not secret contents.

Exact cleanup demands matching key, target, receipt, stage device/inode, expected tree fingerprint and explicit DELETE_VERIFIED_PERSONAL_STAGE confirmation. It records a durable cleanup-issued marker before deleting the exact directory. Unknown or unexpected files, symlinks, wrong key/target, mismatching hash and an existing cleanup intent fail closed. There is no generic arbitrary-path cleanup API or automatic directory sweep. Stages missing the receipt and ambiguous interrupted cleanups require quarantine and manual review.

As of C1-1, archive/decrypt stage cleanup deletes only verified allowlisted files non-recursively and retains cleanup intent on uncertainty; C1-2 also bounds the separate raw-backup/restore scratch cleanup. These operations still use Node pathnames: a hostile same-UID writer may race the final checks or move parents. This is NOT descriptor-anchored deletion or a sandbox. Do not promote the current operator functions to unattended hostile-environment cleanup without independent review.

## 4. Create-only restore

restorePersonalMemory requires a hash-pinned, owner-private macOS native restore publisher. It validates a staging directory identity and traverses parents with openat/O_NOFOLLOW; renameatx_np with RENAME_EXCL and RENAME_NOFOLLOW_ANY publishes a new destination without replacing a concurrent existing entry. A timeout, ambiguous helper failure or fsync failure returns UNCERTAIN without blind retry. Temporary SQLite WAL/SHM files caused by read-only verification are validated and removed from the disposable staging root before publishing.

These checks mitigate accidental entry replacement and symlink redirection. They do NOT prevent all malicious same-UID parent rename attacks, guarantee full pathname immutability, or constitute a signed helper artifact.

## 5. Release condition

Both archive and decrypt plaintext-stage SIGKILL recovery are verified on disposable local fixtures; final-entry collision, wrong key, unexpected target, key rewrap, existing root, SHA and identity refusals are also tested. Review exact verification report and CI results before any acceptance.

Independent reviewer NOT ASSIGNED. Keychain integration, independent security approval, Business private app registration and production promotion NOT DONE.
