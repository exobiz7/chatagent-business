# ChatAgent Personal — Codex Astra F03 메타데이터 재검사 독립 감사 핸드오프

**문서 성격:** 기존 F03 P1에 대한 한정 기술 재감사. 구현 승인, 33-tool 베타 진입 또는 운영 배포 승인서가 아니다.
**고정 감사 대상 구현 SHA:** `bd6b444c95395531df63e8e7ca016f5ef5f77932`
**직전 브랜치 SHA:** `dbe2a0152da977bbf6a0f6ae7d79357b5e49d2e9` (F04-R1 핸드오프 문서 전용).
**최근 독립 검토 구현 SHA:** `fc518c70693e570c54dedd41afb2190653627235` (F04-R1 PASS, F03 OPEN).
**저장소:** private `exobiz7/chatagent-personal`; [PR #5 (Draft)](https://github.com/exobiz7/chatagent-personal/pull/5).
**원본 경로 (읽기 전용):** `/Users/macstudio/dev/personal/chatagent-personal`.
**최종 수용·베타 판단:** 사용자. **독립 감사자:** Codex Astra.

이 핸드오프와 동봉 프롬프트는 구현 후속 문서 전용 커밋에 추가한다. PR HEAD가 바뀌어도 **코드 검토 기준은 위 구현 SHA**다.

## 1. 선행 보고서·이번 증거
- F03 원본 P1: `/Users/macstudio/CodexReview/chatagent-personal/90f1b89cb71b247a768e589fdc7987f6a6835d1c-static-n78czyco/02_FINDINGS_AND_REPRO.md`, F03 섹션. 기존 모드/xattr snapshot은 final 검증에서 비교되지 않는다는 정적 지적이며 실제 경합은 UNVERIFIED.
- 최근 F04-R1 PASS 보고서: `/Users/macstudio/CodexReview/chatagent-personal/fc518c70693e570c54dedd41afb2190653627235-f04-r1-rereview/`. F03 P1 OPEN 승계와 실제 통합 미검증 확인.
- 구현자 기록: `docs/verification/PERSONAL_F03_CAS_METADATA_RECHECK_20260923.md` (고정 구현 SHA에 포함).
- 비교: `git diff dbe2a0152da977bbf6a0f6ae7d79357b5e49d2e9..bd6b444c95395531df63e8e7ca016f5ef5f77932 -- scripts/l1/native-replace-cas.c scripts/l1/personal-native-cas-test.mjs`.
## 2. 소스 및 실행 계약 대조

| 대상 | 독립 검토 관점 |
|---|---|
| `scripts/l1/native-replace-cas.c` | `same_metadata`, initial/final hash, leaf 재확인, staged inode 재open, `same_xattrs`, rename 경계 |
| `scripts/l1/personal-native-cas-test.mjs` | 테스트 전용 mode/source-xattr/stage-xattr 변경 주입, 원본·stage 처리, 음성·양성 검증 |
| `scripts/l1/native-replace-cas.mjs` | pinned helper SHA, 실행, 실패 코드 처리, postcommit observation의 UNCERTAIN |
| `scripts/l1/host-file-ops.mjs` | 파일 교체 게이트, expected SHA, 지원 메타데이터 범위 및 오류 전달 |
| `scripts/l1/personal-native-cas-mcp-test.mjs` | 격리된 opted-in 33-tool L0/MCP 교체와 기존 정상 경로 |
| `scripts/run-personal-tests.mjs` 및 CI workflow | 로컬 전체 34개, 정확한 SHA의 macOS Push/PR CI 검증 |

- **탐지 강화 대상:** 내용 SHA/size/mtime가 같지만 최초 snapshot 이후 원 mode·flags·ctime 또는 복사 대상 stage xattr가 달라지는 경우. 원본과 stage의 xattr *이름과 값*을 비교하며, 오류·불일치는 교체 전 `CAS_TARGET_CHANGED`로 거부되어야 한다.
- **기존 거부 보존:** precondition SHA 불일치, 비정상 링크/권한/flags/extended ACL, 디렉터리 이동·leaf 교체, stage inode 불일치 및 cleanup 실패 의미.
- **기존 성공 보존:** 정상 파일의 mode(0777 범위)/xattr 보존, 같은 디렉터리 원자적 가시성, 내용·경로 postcommit 관측과 실패 시 nonretryable/UNCERTAIN 처리.
- **정직한 한계:** 마지막 검사와 `renameat` 사이 race, 동일 UID 경쟁자, ABA, filesystem/xattr 조합은 이 변경만으로 봉쇄되지 않는다. 내용 SHA CAS나 metadata가 커널-원자적이라고 주장하지 않는다.
## 3. 항목별 판정 — PASS / FAIL / UNVERIFIED
| ID | 확인할 항목 |
|---|---|
| C01 | 구현 SHA 고정, 원본 F03 및 F04-R1 판정, 후속 문서 SHA 분리 |
| C02 | `same_metadata`의 mode/flags/나노초 ctime 및 initial/final hash·leaf 재검증의 정확성 |
| C03 | `same_xattrs`의 원본·stage 이름 목록/값 비교, size/bounds/read 오류 거부 및 stage inode 검증 |
| C04 | metadata-only drift가 기존 SHA·mtime 일치 시에도 교체 전 거부되는가 |
| C05 | 원본/스테이지 모드·xattr 주입 3종이 테스트 전용 macro에서만 활성화되는가 |
| C06 | 정상 replacement와 SHA mismatch, 지원 불가 ACL/flags, symlink/hardlink/parent switch 거부 보존 |
| C07 | cleanup은 소유한 stage inode만 처리하고 변경된 원본은 보존하는가; 불명확한 효과를 안전한 재시도로 바꾸지 않는가 |
| C08 | 코드의 ctime/xattr 검사가 실제로 보장하는 범위와 임의 동시 경쟁자·ABA·check→rename 창의 구분 |
| C09 | owner/group, 생성시각, 특수 mode 비트, ACL/flags 등 새 inode 보존 범위 과장 없음 |
| C10 | 독립 실행 증거, 개발자 34/34, 동일 구현 SHA CI event/headSha/conclusion 및 checkout/log 검증을 구분 |
| C11 | F03 잔여 P1 해소/제한 수용/미해결의 근거, 33-tool opt-in 범위 및 32-tool과의 게이트 분리 |
| C12 | F01 actual HTTP split, 물리 장애, 동시 client, 라이브 Business E2E 및 optional backup의 미검증·별도 수용 유지 |

모든 항목은 파일:행과 확인 방식(정적·격리 native·MCP·미실행)을 붙여 PASS/FAIL/UNVERIFIED로 판정한다. 결함·범위 한계를 혼동하지 말고 반대 근거도 기록한다.
## 4. 개발자 증거와 실제 실행 한계
- 격리 native 테스트에서 **원본 mode 변경 / 원본 xattr 변경 / stage xattr 변경** 세 주입 모두 `CAS_TARGET_CHANGED`로 교체 거부, 원본 텍스트 유지 및 stage 정리 확인. 정상 mode/xattr 보존과 ACL/flags 등의 기존 거부 PASS.
- opted-in 33-tool의 격리된 L0/MCP CAS 테스트 PASS. 로컬 전체 `npm test`: `PERSONAL_STANDALONE_SUITE=PASS count=34` / exit 0. 테스트 매크로는 테스트용 컴파일 변형에만 사용한다.
- 같은 구현 SHA macOS [Push CI 35745106102](https://github.com/exobiz7/chatagent-personal/actions/runs/35745106102) SUCCESS, [PR CI 35745110650](https://github.com/exobiz7/chatagent-personal/actions/runs/35745110650) SUCCESS. CI metadata와 구체적 checkout/log 확인을 구분하라.
- 테스트는 소유된 임시 fixture에서 **결정적 메타데이터 변경**을 주입한 것이며, 실제 경쟁 editor/sync, hostile same-UID 변경, power/disk loss, 모든 filesystem, 라이브 Business 앱에서는 검증하지 않았다.

## 5. 감사 권한·금지 사항
- 원본은 `git status/show/diff`와 파일 읽기만. 독립 실행은 허용되면 새 mode 0700 클론·테스트 fixture에서 고정 SHA checkout 후 기존 bounded native/MCP 테스트로 한정. 테스트 전용 macro의 변경은 격리 파일에만 적용.
- 원본 repo/refs/PR 및 기존 Astra 폴더 수정·삭제·checkout/reset/clean/add/commit/push/merge 금지. 운영 사용자 데이터·메모리·Keychain·토큰·터널·launchd·P8 Stable·Business v2 Canary·M16·STABLE-001 조작, app 등록·배포 금지.
- 실제 사용자 파일에 대한 race, SIGKILL/전원 장애, 강제 권한 변경 또는 다른 안전 검사 우회 금지. 실행이 불가능하면 해당 항목은 UNVERIFIED로 보고하고 정적 관측과 혼합하지 않는다.
## 6. 필수 산출물·결정 게이트
**권장 신규 폴더:** `/Users/macstudio/CodexReview/chatagent-personal/bd6b444c95395531df63e8e7ca016f5ef5f77932-f03-rereview/`. 없을 때만 0700 생성; 존재하면 새로운 고유 접미사 폴더를 사용하고 기존 보고서 보존.

| 보고서 | 필수 내용 |
|---|---|
| `00_EXECUTIVE_SUMMARY.md` | 검증 범위에 따른 F03 판정, P0/P1/P2, 32/33-tool 게이트 요약 |
| `01_F03_REREVIEW_REPORT.md` | C01~C12 근거별 판정과 독립/개발자 CI·시험 구분 |
| `02_REMAINING_FINDINGS.md` | 남은/신규 결함의 독립 집계, 원본 F03 중복 배제, 재현·추론·최소 수정/수용 |
| `03_GATE_DELTA_AND_NEXT_STEPS.md` | F03 이전 OPEN 대비 delta, 제한된 33-tool 적용 조건과 32-tool 별도 실사용 조건 |

**33-tool:** F03 개선에 대한 기술 판정과 별도로 *비경합·복구 가능한 파일만 사용*하는 제한 수용 여부를 사용자가 결정해야 한다. **32-tool:** F03/CAS를 요구하지 않고 F01 HTTP split 및 실제 client/MCP/Business 통합 선행조건을 별도로 판단한다. F04-R1/F02의 기존 code/contract PASS는 전체 런타임 승인으로 승격하지 않는다. optional encrypted backup은 별도 판단.

완료 시 구현 SHA, 실제 작성된 네 파일 절대 경로, 직접 검증/UNVERIFIED, F03 판정과 P0/P1/P2, 32/33 각각의 사용자 결정 사항을 보고한다. 전체 베타 시작·앱 등록·배포·PR 병합을 선언하지 말고 다음 사용자 지시를 기다린다.
