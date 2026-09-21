# ChatAgent Personal — Codex Astra F02-R1 독립 재검토 핸드오프

**문서 성격:** 특정 수정분의 읽기 전용 독립 검토 작업 계약. 구현 승인서·제품 출시 승인서가 아니다.
**제품 목표:** 단일 소유자 macOS의 ChatGPT 대화에서 파일·프로세스·프로젝트 메모리 작업을 실행하는 Personal MCP. 정상 사용에 반복 승인이나 전역 잠금을 추가하지 않는다.
**검토 기준 소스 SHA (변경 불가):** `70c6858b70a12b3cd8037b9ec1c67bf38f519ce8`
**이전 Astra 재검토 SHA:** `8465c12c28f4aeb835ab0bfaf739d7a814376e44`
**저장소:** private `exobiz7/chatagent-personal`, [Draft PR #5](https://github.com/exobiz7/chatagent-personal/pull/5)
**원본 Mac 경로 (조회 전용):** `/Users/macstudio/dev/personal/chatagent-personal`
**감사자:** 소유자가 Codex 앱에서 선택한 Astra. **최종 수용·승인자:** 사용자.

## 1. 범위·버전 고정
- 이번 검토는 위 두 SHA 사이 **F02-R1의 요청 후 응답 불확실성** 및 **읽기 전용 파일 감사 기록 회귀 복원**만 대상으로 한다. F01 전체, R01~R12 전면 감사, F03/F04 구현, Business 앱 배포, 암호화 백업 수용은 포함하지 않는다.
- 핸드오프·프롬프트 자체는 **후속 문서 전용 커밋**에 들어간다. 문서 커밋과 기준 소스 SHA를 혼동하지 말 것. 최신 브랜치 HEAD가 이동하더라도 감사 소스를 자동 변경하지 않는다.
- 먼저 `git cat-file -t 70c6858b70a12b3cd8037b9ec1c67bf38f519ce8`, `git show --no-patch --format=fuller <고정 SHA>`, `git status --short`로 상태를 조회한다. 별도 신규 임시 클론 또는 `git show <SHA>:<path>`로 해당 커밋의 소스를 읽는다. **원본 경로에서는 checkout/reset/clean 하지 않는다.**
- 비교 명령: `git diff 8465c12c28f4aeb835ab0bfaf739d7a814376e44..70c6858b70a12b3cd8037b9ec1c67bf38f519ce8 -- scripts/`. 중간의 문서 전용 변경은 소스 변경과 구분한다.
## 2. 입력 증거·컨텍스트 (조회 전용)

| 구분 | 경로 및 해석 |
|---|---|
| 직전 Astra 보고서 | `/Users/macstudio/CodexReview/chatagent-personal/8465c12c28f4aeb835ab0bfaf739d7a814376e44-f01-f02-rereview/` |
| 구체 지적 | 위 폴더의 `02_REMAINING_FINDINGS.md` — F02-R1 및 읽기 감사 기록 회귀; `03_GATE_DELTA_AND_NEXT_STEPS.md` — 기능별 게이트 |
| 구현·검증 기록 | `docs/verification/PERSONAL_F02_R1_REMEDIATION_20260921.md` (고정 SHA에 포함) |
| 초기 독립 감사 | `/Users/macstudio/CodexReview/chatagent-personal/90f1b89cb71b247a768e589fdc7987f6a6835d1c-static-n78czyco/` (참고만; 수정·덮어쓰기 금지) |
| 전체 설계 연속성 | `docs/architecture/PERSONAL_CORE_MCP_OPERATIONAL_PROFILE_20260921.md`, `docs/security/PERSONAL_CORE_MCP_SCOPE_REVIEW_20260921.md` (과거 시점 서술은 새 SHA보다 우선하지 않음) |

### 고정 SHA 소스·테스트 경로

| 대상 | 파일 (저장소 루트 기준) | 확인 내용 |
|---|---|---|
| F02-R1 transport | `scripts/l1/l1-file-transport.mjs` | file mutation route의 fetch/JSON 오류·잘못된 payload 분류, 이미 수신된 상태 보존 |
| L0 MCP | `scripts/l0-ui-probe.mjs` | production `brokerCall` 호출, `toolError` → MCP `structuredContent` |
| L1 파일 라우트 | `scripts/l1/broker-server.mjs` | file mutation/read-only dispatch, 인증 및 결과·감사 응답 |
| 파일 감사 로직 | `scripts/l1/file-effect-status.mjs` | `auditedFileMutation`, `auditedFileRead`, 완료/실패의 감사 저장 실패 |
| 새 계약 테스트 | `scripts/l1/personal-f02-r1-test.mjs` | 주입된 transport 오류, known code, read-audit 보존 및 오인 방지 |
| 회귀·CI | `scripts/run-personal-tests.mjs`, `package.json`, `.github/workflows/personal-macos-ci.yml` | 기본 34개 테스트와 macOS CI 범위 |
| 기존 CAS 결과 | `scripts/l1/native-replace-cas.mjs`, `scripts/l1/personal-f01-f02-contract-test.mjs` | postcommit UNCERTAIN과 파일 작업 감사의 기존 계약, 직접 수정 대상은 아님 |
## 3. 감사 체크리스트 — 각 항목 PASS / FAIL / UNVERIFIED

| ID | 독립적으로 확인할 사항 |
|---|---|
| T01 | 위 고정 SHA가 실제로 존재하고 원본·임시 클론의 대상 버전이 명확한가? |
| T02 | `file/create`, `file/write`, `file/replace`, 개발용 `file/copy` 각각에서 전송/응답 JSON 실패를 `effect=UNCERTAIN,retryable=false`로 처리하는가? |
| T03 | 응답이 null·배열 등 비정상 형태이면 확인 불가로 처리하고 원시 오류·토큰을 반환하지 않는가? |
| T04 | 정상 수신된 L1 `COMMITTED`/`UNCERTAIN`, `audit=UNCERTAIN`, 사전 거부 코드와 정상 결과를 그대로 보존하는가? |
| T05 | L0 파일 도구의 catch 및 MCP `structuredContent`가 위 결과를 누락하거나 retry 가능하게 만들지 않는가? |
| T06 | 읽기/조회 및 다른 route의 오류를 잘못된 **파일 mutation effect**로 표시하지 않는가? 해당 route의 고유 미확정 문제는 범위 밖으로 분리하는가? |
| T07 | `file/list`, `file/stat`, `file/read`, `file/hash`의 기존 `HOST_FILE_COMPLETED`/`HOST_FILE_FAILED` 감사가 복구되었는가? |
| T08 | 읽기 감사 저장 실패가 파일 변경 완료를 주장하지 않고, 읽기 원인 오류와 감사 실패를 구분하는가? |
| T09 | 신설 테스트는 오류별 실제 assertion을 포함하는가? mock과 실제 네트워크 장애/실제 MCP 경로 검증을 구별하는가? |
| T10 | 추가 승인·자동 재시도·전역 잠금 없이 기존 32/33 core 및 파일 생성/교체 동작을 보존하는가? |
| T11 | 로컬 34/34와 Push·PR CI의 정확한 SHA·이벤트·결론, 실행하지 않은 검증을 구별하는가? |
| T12 | 잔여 F01 실제 HTTP split, F03 metadata concurrency, F04 async-copy recovery, optional backup 및 Business E2E가 별도 OPEN으로 남는가? |
## 4. 알려진 테스트 결과와 금지할 과장
- 개발자 로컬 `npm test`: `PERSONAL_STANDALONE_SUITE=PASS count=34`, 종료 코드 0. 기존 33개 + 새 F02-R1 계약 테스트 1개.
- 정확한 SHA의 macOS [Push CI 35569503294](https://github.com/exobiz7/chatagent-personal/actions/runs/35569503294): SUCCESS.
- 정확한 SHA의 macOS [PR CI 35569507201](https://github.com/exobiz7/chatagent-personal/actions/runs/35569507201): SUCCESS. CI 메타데이터와 실제 checkout/ref가 동일한지를 분리해 기록한다.
- F02-R1의 실패는 **주입한 mock fetch/parse/잘못된 JSON**으로만 테스트했다. 실제 소켓 단절·디스크 고장·전원 손실·ChatGPT Business 앱 호출 실패까지 재현했다고 표시 금지.
- 파일 mutation에 `UNCERTAIN`을 붙이는 것은 효과 발생을 단정하지 않는다는 뜻이다. 저장된 원래 요청의 결과를 조회·조정하기 전 임의로 반복 실행해서는 안 된다.
- F01의 기존 독립 PASS는 **코드/메모리 검사 한정**이다. 새 SHA로 F01 전체를 자동 인증하거나 실제 HTTP 청크 분할 E2E가 통과했다고 하지 않는다.

## 5. 실행 및 변경 금지 계약
- 시작은 정적 소스/diff 검토. 독립 실행이 허용되는 경우에만 **새 0700 임시 클론·테스트 폴더**에서 정확한 SHA로 선택된 테스트를 수행한다. 실제 사용자 데이터·자격증명·외장 SSD는 사용하지 않는다.
- **절대 금지:** 원본 저장소 수정·삭제·이동·checkout/reset/clean/add/commit/push, PR 리뷰·승인·병합·설정 변경, 기존 Astra 산출물 덮어쓰기/삭제, 운영 파일·메모리·Keychain·토큰·터널·launchd 접근/수정, P8 Stable/Business v2 Canary/M16/STABLE-001 구성이나 서비스에 대한 조작, 실제 Personal Business 앱 등록/배포, 실제 사용자 파일 대상 경합·삭제·권한 변경.
- 독립 테스트가 실행 제한 또는 추가 안전 검사로 막히면 **우회하지 말고** 수행 가능 범위만 완료하고 나머지를 `UNVERIFIED`로 명시한다. 보고서에는 비밀값·실제 파일 본문을 포함하지 않는다. 이슈의 최소 수정 제안은 산출물에만 기록하며 구현 코드를 직접 고치지 않는다.
## 6. 필수 산출물 — 새 폴더에만 작성
**권장 새 산출물 폴더:** `/Users/macstudio/CodexReview/chatagent-personal/70c6858b70a12b3cd8037b9ec1c67bf38f519ce8-f02-r1-rereview/` (신규 생성 시 권한 0700).
기존 경로가 있으면 **새 고유 접미사를 가진 다른 폴더**를 만든다. 이전 보고서·원본 저장소에는 쓰지 않는다.

| 파일명 | 반드시 기재할 내용 |
|---|---|
| `00_EXECUTIVE_SUMMARY.md` | 사용자용 핵심 요약, F02-R1 판정, 읽기 감사 복원 판정, 미검증과 32/33 core에 미치는 영향 |
| `01_F02_R1_REREVIEW_REPORT.md` | T01~T12 각각 PASS/FAIL/UNVERIFIED, 고정 SHA, 코드 경로:행, 실제 독립 검증 명령·증거, 한계 |
| `02_REMAINING_FINDINGS.md` | 재현 가능한 신규/잔여 이슈 ID, P0/P1/P2, 영향, 예상·실제, 최소 수정·사용 제한, 미재현 구분 |
| `03_GATE_DELTA_AND_NEXT_STEPS.md` | 직전 F02 FAIL에서 바뀐 범위, 32-tool/33-tool 별 조건, F01·F03·F04·백업의 기존 OPEN과 사용자 승인 조건 |

검토자는 구현·승인·배포를 하지 않고 **기술적 의견만 보고**한다. 실제 생성한 네 산출물의 절대 경로, 고정 SHA, 핵심 결함/미검증, P0/P1/P2 건수와 32/33별 판단 필요사항을 사용자에게 제출하고 다음 지시를 기다린다.
