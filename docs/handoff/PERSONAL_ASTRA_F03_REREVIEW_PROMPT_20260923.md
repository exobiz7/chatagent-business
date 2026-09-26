# Codex Astra — F03 CAS 메타데이터 재검사 독립 재검토 프롬프트 (붙여넣기용)

당신은 ChatAgent Personal 개발 담당자와 독립된 **macOS native CAS 코드·검증 계약 감사자**입니다. 기존 F03 P1에 대한 메타데이터 변경 탐지 보강을 재검토합니다. 구현·PR·제품 수용·베타 승인·배포는 지시하지 않습니다.

**먼저 핸드오프 전문을 읽고 검사 경계·금지사항을 따르십시오.**
`/Users/macstudio/dev/personal/chatagent-personal/docs/handoff/PERSONAL_ASTRA_F03_REREVIEW_HANDOFF_20260923.md`

| 고정 필드 | 값 |
|---|---|
| Repo / PR | Private `exobiz7/chatagent-personal` / [Draft PR #5](https://github.com/exobiz7/chatagent-personal/pull/5) |
| **검토할 구현 SHA** | `bd6b444c95395531df63e8e7ca016f5ef5f77932` |
| 직전 브랜치 SHA | `dbe2a0152da977bbf6a0f6ae7d79357b5e49d2e9` (F04-R1 검토 문서 전용) |
| 직전 Astra 검토 구현 SHA | `fc518c70693e570c54dedd41afb2190653627235` (F04-R1 코드·비실행 계약 PASS) |
| Mac Studio 원본, 조회 전용 | `/Users/macstudio/dev/personal/chatagent-personal` |
| F03 원본 지적 | `/Users/macstudio/CodexReview/chatagent-personal/90f1b89cb71b247a768e589fdc7987f6a6835d1c-static-n78czyco/02_FINDINGS_AND_REPRO.md`, F03 |
| 개발자 증거 | `docs/verification/PERSONAL_F03_CAS_METADATA_RECHECK_20260923.md` |

이 프롬프트는 후속 **문서 전용 커밋**으로 추가될 수 있습니다. **감사 대상은 위 구현 SHA에 고정**하며, 이동한 HEAD나 문서 커밋으로 교체하지 마십시오.
## 독립 검토 지시

1. 원래 F03 P1과 `git diff dbe2a0152da977bbf6a0f6ae7d79357b5e49d2e9..bd6b444c95395531df63e8e7ca016f5ef5f77932 -- scripts/l1/native-replace-cas.c scripts/l1/personal-native-cas-test.mjs`를 대조하십시오.
2. `same_metadata`의 mode, flags, 나노초 ctime 스냅샷과 initial/final `hash_file`, dirfd leaf 재검사의 적절성·실패 처리를 검토하십시오.
3. `same_xattrs`는 **원본과 stage의 실제 xattr 이름 집합과 각 값 전체가 일치하는지** 검증하십시오. 특히 이름 목록의 길이만 같고 이름이 다른 경우, 다른 순서, 값 크기는 같으나 bytes가 다른 경우, 원본/stage extra attribute, 목록 변화 및 read 오류를 점검하고 근거가 부족하면 PASS로 두지 마십시오. stage를 no-follow 재open해 같은 inode임을 확인하는지도 검토하십시오.
4. `PERSONAL_TEST_CAS_MODE_DRIFT`, `PERSONAL_TEST_CAS_XATTR_DRIFT`, `PERSONAL_TEST_CAS_STAGE_XATTR_DRIFT`는 **격리 fixture 컴파일에서만** 사용되고 정상 production/MCP helper에는 포함되지 않는지 확인하십시오. 세 변경 주입에서 교체 거부, 원본 내용·개입된 원본 메타데이터 유지, 정확한 소유 stage cleanup을 확인하십시오.
5. 정상 replacement, 잘못된 SHA, ACL/flags, symlink/hardlink/parent switch, postcommit UNCERTAIN/non-replay, 33-tool의 선택적 MCP 노출을 교차 확인하십시오. 독립 실행은 새 0700 클론·테스트 데이터에서만 수행하십시오.
6. 최종 검사와 `renameat` 사이의 남는 race, 동일 UID 경쟁자 및 ABA, owner/group·creation time·special mode 보존 한계와 32/33 게이트를 별도로 명시하십시오. **원자적 해시·메타데이터 CAS 또는 모든 동시 쓰기 보호로 확대하지 마십시오.**
7. 핸드오프의 **C01~C12 각각 PASS / FAIL / UNVERIFIED**를 소스:행과 증거로 판정하십시오. 독립 검증과 개발자 34/34·CI 성과를 구별하고, 원래 F03 및 새 finding을 중복 집계하지 마십시오.

개발자 증거: isolated native metadata drift 3종 PASS, 기존 opted-in L0/MCP CAS PASS, 로컬 `npm test` **34/34 PASS**, 동일 구현 SHA [Push CI 35745106102](https://github.com/exobiz7/chatagent-personal/actions/runs/35745106102) / [PR CI 35745110650](https://github.com/exobiz7/chatagent-personal/actions/runs/35745110650) **SUCCESS**. CI metadata, 실제 checkout/log 및 독립 실행 범위를 분리하고 실제 전원·디스크·운영 장애 증거로 승격하지 마십시오.
## 실행 안전·보고서 4종

원본 저장소·Git refs·PR·기존 Astra 산출물을 수정·삭제·checkout/reset/clean/add/commit/push/merge하지 마십시오. macOS 원본에서 정적 조회만 수행하고, 독립 실행은 새 mode 0700 격리 클론/fixture로 제한하십시오. P8 Stable, Business v2 Canary, M16, STABLE-001, 실제 사용자 데이터·개인 메모리·Keychain·토큰·터널·launchd 및 Personal Business 등록·배포 조작 금지. 실사용 파일에 대한 경쟁 변경·권한 변경·SIGKILL/전원 장애 주입 금지. 막힌 검증은 우회하지 않고 UNVERIFIED로 기록하십시오.

**권장 신규 산출물 폴더:** `/Users/macstudio/CodexReview/chatagent-personal/bd6b444c95395531df63e8e7ca016f5ef5f77932-f03-rereview/`
없을 때에만 0700으로 생성하고, 이미 있으면 새 고유 접미사 폴더를 선택하십시오. 기존 자료는 보존합니다.

1. `00_EXECUTIVE_SUMMARY.md` — F03 판정과 검증 범위, P0/P1/P2 및 32/33-tool 영향.
2. `01_F03_REREVIEW_REPORT.md` — C01~C12 항목별 PASS/FAIL/UNVERIFIED, 정확한 소스:행, 독립 실행·CI 구분.
3. `02_REMAINING_FINDINGS.md` — F03 잔여·신규 결함, 재현/추정 구분, 중복 없는 P0/P1/P2 및 최소 수정·제한 수용 대안.
4. `03_GATE_DELTA_AND_NEXT_STEPS.md` — 이전 F03 OPEN 대비 변화, 33-tool의 비경합·복구 가능 파일 조건과 32-tool의 별도 실사용 게이트.

F04-R1/F02-R1.1은 기존 코드·계약 PASS에 한정됩니다. F01 실제 HTTP split, 운영 SIGKILL/디스크/전원, 동시 독립 client 및 실제 Business E2E는 UNVERIFIED, optional encrypted backup은 별도 수용입니다. 전체 승인·베타 시작·앱 등록·배포·병합을 선언하지 마십시오.

완료하면 고정 구현 SHA, **실제로 생성한 네 보고서의 절대 경로**, 직접 검증 및 미검증, F03 판정, 잔여 P0/P1/P2와 32/33-tool별 사용자 결정 사항을 보고하고 다음 지시를 기다리십시오.
