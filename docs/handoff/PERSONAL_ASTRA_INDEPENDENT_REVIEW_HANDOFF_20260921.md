# ChatAgent Personal — Codex Astra 독립 검토 핸드오프

**문서 역할:** 구현자와 분리된 독립 감사의 실행 계약·검토 대상 인덱스. 승인서 아님.
**준비일:** 2026-09-21 KST | **제품:** macOS 단일 소유자 Personal ChatAgent (채팅창 자체가 실행자).
**정확한 소스 검토 SHA (고정):** `90f1b89cb71b247a768e589fdc7987f6a6835d1c`
**저장소:** private `exobiz7/chatagent-personal` | **기준 브랜치:** `feature/personal-c1-bounded-cleanup` | **Draft PR:** https://github.com/exobiz7/chatagent-personal/pull/5
**로컬 소스 경로:** `/Users/macstudio/dev/personal/chatagent-personal` (감사자는 읽기 전용).
**검토자:** 사용자가 Codex 앱에서 선택한 Astra 모델. **최종 승인자:** 제품 소유자(사용자). 감사 모델은 사용자를 대신해 승인하거나 배포하지 않음.

## 0. 버전과 검토 경계
- 이 문서는 **소스 커밋 90f1b89…** 를 검토하도록 지정한다. 핸드오프 문서 자체는 후속 문서 전용 커밋으로 추가될 수 있으며, 그 커밋의 SHA를 소스 검토 대상으로 바꾸지 말 것.
- 먼저 `git show --no-patch --format=fuller 90f1b89cb71b247a768e589fdc7987f6a6835d1c` 및 `git status --short` 로 존재·상태 확인. `git show <PIN>:<path>` 또는 별도 새 임시 클론으로 **정확한 SHA** 를 읽을 것. 이동 가능한 브랜치 HEAD나 과거 검증 요약만 믿지 말 것.
- 다른 버전의 증거는 참고로만 사용. 조사 중 HEAD 변경 발견 시 diff와 범위 차이를 기록하고, 원래 SHA를 수정/재기준화하지 말 것. 재검토 SHA 변경은 사용자 승인 후 별도 진행.
- 이번 검토는 **활성화된 Personal core 32-tool / 선택적 native CAS 33-tool**. 기본 36-tool 개발용 목록은 호환성 검사 대상이며, 실제로 모두 작동하는 제품 목록이라고 표현 금지.
- 오프라인 암호화 백업/복원/키 교체는 현재 MCP로 노출되지 않는 **별도 수용 범위**. 코어 베타 판단을 불필요하게 종속시키지 말 것.
## 1. 코드·테스트·계약 문서: 저장소 루트 기준 상대 경로

| 영역 | 반드시 열람할 파일·경로 | 확인 주제 |
|---|---|---|
| MCP L0 | `scripts/l0-ui-probe.mjs` | 36/32/33 이름, schema/annotation, 제한된 요청 크기·L1 라우팅, 자격증명 검사 |
| L1 진입·설정 | `scripts/l1/broker-server.mjs`, `scripts/l1/broker-core.mjs` | 소유자 enrollment/FULL_HOST, L1 토큰, protectedRoots, 기능 플래그와 분리 상태 |
| 파일 작업 | `scripts/l1/host-file-ops.mjs`, `scripts/l1/native-create-excl.c`, `scripts/l1/native-create-only.mjs` | 생성 O_EXCL, 링크·보호 경로, 기존 파일 교체와 신규 생성 구분 |
| 네이티브 CAS | `scripts/l1/native-replace-cas.c`, `scripts/l1/native-replace-cas.mjs` | 해시, inode/parent, 단계별 fsync, rename, xattr, ACL·flags, 실패 후 불확실성 |
| 복사·scratch | `scripts/l1/async-copy-jobs.mjs`, `scripts/l1/native-copy-create.c`, `scripts/l1/owned-scratch.mjs`, `scripts/l1/personal-stage-recovery.mjs` | 9 MiB 비동기 복사, digest, 소유 핸들 정리, crash 잔여물 |
| 실행·해시 | `scripts/l1/durable-host-processes.mjs`, `scripts/l1/durable-process-runner.mjs`, `scripts/l1/async-hash-jobs.mjs` | 정확한 프로세스 ID, identity 확인, 비반복·RECOVERY_REQUIRED |
| 개인 메모리 | `scripts/l1/personal-memory-store.mjs` 및 `scripts/l1/personal-memory-mcp-test.mjs` | 프로젝트 분리, 이벤트 HMAC, checkpoint CAS, secret-filter 한계 |
| CAS 부정검증 | `scripts/l1/personal-native-cas-test.mjs`, `scripts/l1/personal-native-cas-mcp-test.mjs` | 조건 불일치, 부모·대상 교체, xattr 보존, ACL/flags 거부, 실제 MCP |
| 32/36 목록 검증 | `scripts/l1/personal-36-tool-candidate-test.mjs` | 기본 36, opt-in core 32, 도구 활성 상태·실제 효과 |
| 전체 회귀 | `scripts/run-personal-tests.mjs`, `.github/workflows/personal-macos-ci.yml`, `package.json` | 32개 격리 테스트, macOS CI 증거 범위 |
## 2. 설계·위험 기록 및 이전 증거

- `docs/verification/PERSONAL_NATIVE_CAS_IMPL_20260921.md`: 이번 SHA의 CAS 동작·한계·검증 범위.
- `docs/architecture/PERSONAL_CORE_MCP_OPERATIONAL_PROFILE_20260921.md`: 기본 32, CAS 활성 33, 개발 36의 의도한 계약. 구 문단은 최초 32 기준이므로 후속 추가 절까지 읽을 것.
- `docs/security/PERSONAL_CORE_MCP_SCOPE_REVIEW_20260921.md`: 기능별 검토 체크리스트·핵심 위험. 내부 검토 자료로서 독립 검증 증거를 대체하지 않음.
- `docs/security/PERSONAL_C2_C3_REVIEW_20260921.md`, `docs/security/PERSONAL_INDEPENDENT_REVIEW_HANDOFF.md`: 키 보관·백업·실행기의 OPEN 항목; 기존 일부 문단은 역사적 상태일 수 있음.
- `docs/verification/PERSONAL_C2_C3_END_TO_END_SMOKE_20260921.md`, `docs/verification/PERSONAL_C1_2_OFFLINE_SCRATCH_CLEANUP_20260921.md`: 기존 엔지니어링 증거.
- `docs/handoff/PERSONAL_NEXT_SESSION_HANDOFF_20260921.md`: 과거 진행 연속성 인덱스. 최신 버전은 정확한 `git show` 가 우선.
- `docs/architecture/PERSONAL_ARCHIVE_KEY_STAGE_CONTRACT.md` 및 `scripts/l1/personal-memory-encrypted-archive.mjs`: 선택적 백업과 코어의 **비노출 관계** 검증에 한함.
- GitHub [PR #5](https://github.com/exobiz7/chatagent-personal/pull/5) 댓글·Actions는 보조 증거. 실제 결과의 SHA, 이벤트, 결론을 구분할 것.

## 3. 제품 위협 모델·판정 전제
- 한 명의 신뢰된 macOS 계정 사용자가 자신의 Mac에서 권한을 부여하는 제품. `FULL_HOST` 는 일반 사용자의 파일·명령 실행 위임이며 **악성 같은-UID 프로세스에 대한 샌드박스가 아님**.
- P8 Stable, Business v2 Canary, M16, STABLE-001, 해당 토큰·state·터널·앱은 별도 제품으로 간주. 사용 경로·자격증명·상태의 교차 연결/변경은 허용되지 않음.
- 예기치 않은 파일 덮어쓰기, 비인가 실행, cross-project memory 노출, silent duplicated effects, credential leak는 해당 베타 기능의 차단 기준.
- **핵심 구분:** `renameat` 은 원자적 파일 가시성을 제공하나 예상 SHA 비교와 교체를 하나의 커널 CAS로 결합하지 않음. 적대적인 동시 동일 UID race는 여전히 OPEN. ACL·비영(0) 파일 플래그는 거부; 복사가 가능한 xattr·일반 mode는 보존. 기타 metadata·crash window를 검증할 것.
## 4. 독립 감사 실행 체크리스트 (각 항목 PASS / FAIL / UNVERIFIED로 표기)

| ID | 필수 검토·재현 내용 | 독립 검토 시 요구 증거 |
|---|---|---|
| R01 | 정확한 source SHA 및 32/33/36 도구 구성과 플래그 일치 | SHA, `tools/list` 명칭 비교, 실제 enabled/disabled |
| R02 | L0/L1 인증·소유자 승인, FULL_HOST 전환·해제, 보호 경로, 별도 state/token | 성공·거부 호출과 소스 참조; 프라이빗 값은 출력 금지 |
| R03 | 생성 전용 O_EXCL, 없는 대상·이미 존재하는 대상·링크 거부 | 테스트 생성·거부 증거, 기존 바이트 보존 |
| R04 | CAS 올바른 SHA 성공·틀린 SHA/대상 없음 거부, 교체 후 hash | 독립 재현, 파일 출처·영향 범위·오류 코드 |
| R05 | CAS parent symlink, leaf symlink/hardlink, 경합 및 같은 UID 한계 | 재현 가능한 안전한 경합 테스트 또는 미검증의 명시 |
| R06 | CAS xattr·mode 보존, ACL/flags 거부, metadata race 및 실패 stage | 대상 보존/임시 stage, 지원/미지원 항목별 판정 |
| R07 | CAS commit 이후 fsync/timeout/output 불확실성에서 blind retry 방지 | 실패 지점별 동작 분석; 실험 불가면 UNVERIFIED |
| R08 | 비동기 해시/복사/실행의 owned processId·non-replay·stop·recovery | 원 ID 유지, 재시작·중복 실행 금지, CI의 과거 경고 고려 |
| R09 | 개인 메모리 프로젝트 간 거부, HMAC/체크포인트 무결성, secret filter | 코드·독립 fixture; 필터가 완전 DLP라는 주장 금지 |
| R10 | 민감한 백업·restore·rotation 도구의 core MCP 비노출 | `tools/list` 와 실제 route 구분; 선택 기능의 gate 따로 표기 |
| R11 | 별도 Personal app/터널/credential/state 배포 계획의 P8/Business v2/M16 비간섭 | 오염 없는 계획과 역전환 방안, 실제 배포는 수행 금지 |
| R12 | macOS/Node/compiler, 테스트 한계, 독립 산출물·차단 결함 분류 | 재현 로그, 원인/추론 구분, 사후 승인 주체 명시 |
## 5. 검토 방법·수행 범위·금지사항
**읽기 전용 시작:** 위 절의 source SHA와 로컬 상태를 확인한 후, 기존 working tree를 직접 checkout/reset/clean 하지 않는다. 가능하면 새로 만든 0700 임시 클론에서 해당 SHA로 checkout하여 코드·테스트를 독립 실행한다. 기존 로컬 저장소는 `git show`, `git status`, `git diff`, `git log` 등 읽기 전용 조회만 한다.

**허용 작업:** 새로 만든 독립 클론, 새 0700 임시 폴더, 새 0700 리뷰 산출물 폴더 안에서만 의존성 설치·빌드·격리 테스트·재현 스크립트 생성·정리. `PERSONAL_TEST_SSD_ROOT` 는 설정하지 않는다. 오프라인 아카이브를 시험하려면 **테스트 전용 키와 내용**만 사용. 테스트 실패·예상 밖 파일 발견 시 무조건 일괄 삭제하지 말고 위치와 증거를 남겨 판단한다.

**절대 금지:** 원본 저장소의 파일 변경·삭제·이동·복원·`git reset`/`git clean`/`git checkout`/`git commit`/`git push`, 기존 PR 상태·리뷰·설정 변경, 원래 Mac의 계정·Keychain·launchd·운영 state·토큰·터널·P8/Business v2/M16 파일·서비스 접근/변경, 실제 업무 데이터 열람·백업/마이그레이션, 사용자 파일 대상 경합/삭제/권한 변경, 대량 프로세스 검사/종료, 외부 배포, 임의 설치·업데이트, 서명 자격증명 접근. 비밀값·사용자 파일 본문은 검토 보고서와 채팅에 노출 금지.

**테스트 원칙:** 재현 명령은 먼저 읽기 전용으로 적정성을 확인한 후 자기 자신이 생성한 시험 환경에서 실행한다. 예상과 다른 상태가 발생하면 즉시 범위 확대를 중지하고 `UNVERIFIED` 또는 재현 가능한 finding으로 보고한다. 원본 파일을 수정할 필요가 있는 이슈는 수정 제안·최소 패치를 **산출물**로만 기록하고 실제 적용하지 않는다.
## 6. 필수 검토 산출물과 저장 위치

**산출물 디렉터리 제안:** `/Users/macstudio/CodexReview/chatagent-personal/90f1b89cb71b247a768e589fdc7987f6a6835d1c/` (없는 경우에만 새로 생성, mode 0700). 기존 파일·디렉터리가 발견되면 덮어쓰기/삭제하지 말고 별도 새 이름을 사용. 원본 저장소 `docs/` 에 직접 기록하지 말 것.

| 파일명 | 반드시 포함할 내용 |
|---|---|
| `00_EXECUTIVE_SUMMARY.md` | 보스를 위한 한눈 요약: 대상 SHA, 핵심 결함, 32/33-tool 각각의 베타 준비 의견, 차단 요인, 권장 다음 행동 및 미검증 |
| `01_INDEPENDENT_REVIEW_REPORT.md` | 리뷰 방법, 실제 열람한 파일, R01~R12 각각 PASS/FAIL/UNVERIFIED, 코드 행/증거, 한계·기술적 결론 |
| `02_FINDINGS_AND_REPRO.md` | 각 finding ID, 심각도 P0/P1/P2, 관련 source 경로:행, 영향을 받는 기능, 최소 재현 방법, 예상·실제, 데이터 보존, 권장 최소 수정 |
| `03_GATE_DECISION_MATRIX.md` | 32-tool core / 33-tool CAS / offline backup 별도 gate, 차단·수용 조건, 추가 검증, 정확한 수정 재검토 SHA 조건, 소유자 승인 대기 |
| `evidence/` (선택) | 비밀 제거된 테스트 로그·해시·재현 스크립트. 개인정보·토큰·시스템 경로 비밀이 섞이면 원문 출력 금지 |

**결과물 작성 규칙:** 사실·재현한 증거·추론·의견을 구분하고 소스 `<경로>:<행>` 와 테스트/CI 실행 SHA를 기재한다. 모델의 자체 검토를 외부 보안 인증으로 표현하지 말 것. 리뷰 결론과 소유자의 최종 승인 여부는 별개. 체크리스트를 빠뜨리지 말고 미실행은 UNVERIFIED.
## 7. 베타 게이트와 종료조건

**초기 32-tool 베타:** core-only 보안/격리 및 실제 소유자 비공개 앱 연결 E2E 통과가 전제. CAS 미승인 시 OFF를 유지하고 33번째 도구가 노출되지 않아야 한다. 선택적 오프라인 backup 완료를 필수로 만들지 않는다.

**33-tool CAS 베타:** 32-tool 조건 + 정확한 CAS 구현/메타데이터·레이스 위험의 독립 검토 결과를 소유자가 수용해야 한다. 안전한 단일 소유자·비경합 작업으로 사용 범위를 제한할 수 있으나 데이터 손실·무단 overwrite가 재현되면 기능 활성화를 금지한다.

**사후 제품 단계:** (a) 독립 검토 보고서 제출 → (b) 보스가 결과물을 검토하고 명시적으로 기능별 승인 → (c) 독립 Personal 전용 서명/핀된 helper·credentials/state/tunnel·중지/rollback 준비 → (d) 신규 Personal Business 비공개 앱 등록 → (e) 실제 채팅에서 자기 소유 임시 파일/프로세스/메모리 E2E 및 재연결 검증 → (f) 격리 베타 → (g) 복구 가능한 제한 실제 업무 → (h) 반복 검증 후 범위 확대. 정확한 출시일은 gate 확인 전 임의 약속 금지.

**종료조건:** 검토 산출물 4개가 실제 생성되고 모든 R항목 판정, blocker 및 잔여 위험이 기록되면 Codex 감사 결과를 사용자에게 제출하고 **사용자 승인까지 대기**. Codex가 독자적으로 승인/수정/병합/등록/배포·실제 데이터 접근 금지.

## 8. 고정 SHA의 검증 증거 (참고: 독립 검증을 대체하지 않음)
- 고정 소스 SHA: `90f1b89cb71b247a768e589fdc7987f6a6835d1c`. 네이티브 CAS C 소스 SHA-256: `77bd50ba44abd633d458eb62942fd5a5e9ef92c1d5f88f210c02c4a5a9baf813` (소스 해시이며 릴리스 바이너리 해시가 아님).
- 해당 SHA 이전 작업 트리의 로컬 `npm test`: `PERSONAL_STANDALONE_SUITE=PASS count=32`, exit 0. CAS 단위·MCP 격리 테스트도 PASS. 별도 실제 ChatGPT Business 앱 호출 증거는 없음.
- 같은 SHA의 macOS Push CI: https://github.com/exobiz7/chatagent-personal/actions/runs/35560735799 — SUCCESS.
- 같은 SHA의 macOS PR CI: https://github.com/exobiz7/chatagent-personal/actions/runs/35560738636 — SUCCESS.
- 다른 SHA·다른 프로필·다른 테스트 범위로부터 승인 결과를 이식하지 말 것. `PERSONAL_TEST_SSD_ROOT` 선택 테스트는 실행되지 않았음.
