# Personal C2/C3 — disposable archive/restore/rewrap and helper build smoke

Date: 2026-09-21 KST. Baseline code SHA `d04c1ad7375cb50b483644930df4212b313dbe45`, Draft PR #5.
Classification: isolated engineering verification; NOT independent security approval, release packaging or real user-data backup.

## Source, environment and hermetic scope
- Owner Mac Studio, Node.js `v24.13.1`; Apple clang `21.0.0 (clang-2100.1.1.101)`, target `arm64-apple-darwin25.5.0`.
- Native publisher source `scripts/l1/native-restore-publish.c`: SHA-256 `590806dc0ce2b293db85755a72934d8df28ad6c6ce44a389e79e8b5c8152542f`.
- Apple clang input: `-std=c11 -D_DARWIN_C_SOURCE -Wall -Wextra -Werror -O2`. Build artifacts were confined to new 0700 /tmp directories and removed immediately after inspection. No live helper, runtime, tunnel or keys changed.
- The end-to-end fixture `scripts/l1/personal-memory-encrypted-archive-test.mjs` creates a new test-only memory store and two random distinct archive keys; all input/output paths are inside one disposable private root. This is NOT the owner's actual key-custody or recovery workflow.

## Findings
- Initial compile using different output basenames `publish-a` vs `publish-b`: differing SHA-256. Filename/signature metadata matters when comparing Mach-O builds; **do not report those as reproducible**.
- Repeated independent build using the same basename `publish` in two private directories: bytewise `cmp` PASS and matching SHA-256 `839e64805f33a713051cea4deb84bc33c57c901124931af0ef5c002d1b12d472`. Matching LC_UUID `704A2723-F656-3D84-9479-92441EDA536E`. This is a *same-host, same-input/build-flags/basename observation*, not a cross-machine reproducibility guarantee.
- Local test binary was ad-hoc signed (`Signature=adhoc`; no TeamIdentifier). A released artifact would require the actual distributed binary hash, its precise toolchain/flags/basename and separately accepted signing/verification. Do NOT hard-code this temporary hash as a release pin.
- Targeted archive test: new store and checkpoint → AES-256-GCM archive → exact pinned-helper new-root restore → fresh-key rewrap into a NEW file → new-key restore into a second new root. Original checkpoint re-opened and compared after both restores; original archive bytes retained, rotated ciphertext differs.
- Negative checks: wrong original or rotated key, tampered ciphertext, HMAC key reuse, archive destination collision, and deliberately invalid helper SHA refuse; helper SHA mismatch leaves new restore target absent. Each archive test used scoped fixture cleanup.
- Separate `personal-memory-backup-test.mjs`: PASS, including native concurrent destination refusal and replacement/unknown stage protection. `personal-runner-observation-test.mjs`: 12/12 owned starts, terminal/read and same-key non-replay PASS (`STARTING=11, RUNNING=1`). No observed `RECOVERY_REQUIRED` in that repetition; root cause remains unknown.
- No source code behavior changed. The only updated test adds hash-mismatch refusal and verifies checkpoint/content after rewrap; this smoke checkpoint is the second changed file.

## Product contract, no unnecessary friction
Existing library-only offline archive/restore is optional and NOT exposed through MCP or Business. No extra user prompt, global lock, always-on daemon, managed Keychain entry or mandatory automatic rotation is introduced.
A separately owned and recoverable archive key, independent restore exercise before retiring old custody and no plaintext archive in unencrypted storage are practical operator requirements for **real** backups, not claims established by test-only keys.
The native helper validates `RENAME_EXCL` no-overwrite and destination parent `fsync`, but source-parent power-loss durability and same-UID pathname races are NOT proven. Post-intent physical crash and key escrow/retention remain OPEN.
## Verification / next acceptance
- Targeted fixture commands PASS: encrypted archive, raw backup and owned runner observation.
- Full local `npm test`: `PERSONAL_STANDALONE_SUITE=PASS count=30`, exit code 0 on the C2/C3 test-enhanced working tree. The optional external SSD suite was NOT executed. Exact-SHA Push/PR CI must be verified after committing this checkpoint.
- No PR merge, private Business registration or P8/Business v2/M16 modification. Independent reviewer remains UNASSIGNED and owner approval for actual deployment is not implied.
