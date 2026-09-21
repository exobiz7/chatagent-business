# ChatAgent Personal — Codex Astra F04 독립 재검토 핸드오프

**문서 유형:** 한정된 F04 수정의 독립 기술 감사 작업 계약. 구현·PR 승인·베타 개시의 근거로 자동 승격하지 않는다.
**검토 대상 구현 SHA (고정):** `17b186d679711ddc66ac1aa4152eb2a7733cfacc`
**직전 브랜치 SHA:** `764f297bd148dd54d4983d223bff0166a6dd8632` (F02-R1.1 재검토 문서 전용).
**직전 독립 검토 구현 SHA:** `3f9a4a824d7b39f8d8129a9b0636714850241e70` (F02-R1.1 PASS; F04는 미해결).
**Private repo:** `exobiz7/chatagent-personal`; [Draft PR #5](https://github.com/exobiz7/chatagent-personal/pull/5).
**원본 저장소 (조회 전용):** `/Users/macstudio/dev/personal/chatagent-personal`.
**최종 수용·베타 여부 결정:** 사용자. **감사자:** 독립 Codex Astra.

이번 핸드오프·프롬프트는 **구현 후속 문서 전용 커밋**에 추가한다. 문서 커밋이나 이동하는 HEAD로 감사 대상 SHA를 바꾸지 않는다.

## 1. 독립 검토 배경·입력 증거
- 최초 F04 P1 근거: `/Users/macstudio/CodexReview/chatagent-personal/90f1b89cb71b247a768e589fdc7987f6a6835d1c-static-n78czyco/02_FINDINGS_AND_REPRO.md`의 F04. copy 예약 뒤 runner 시작·copy ID 연결 사이 중단 시 원래 ID의 안전한 조회/조정이 불가능했다.
- 최근 Astra 잔여 집계: `/Users/macstudio/CodexReview/chatagent-personal/3f9a4a824d7b39f8d8129a9b0636714850241e70-f02-r1-1-semantic-rereview/` — F02 한정 PASS, F03/F04 P1 OPEN. 원본 및 모든 기존 감사 폴더는 보존한다.
- 개발자 구현·검증 기록: `docs/verification/PERSONAL_F04_ASYNC_COPY_RECONCILIATION_20260921.md` (고정 구현 SHA에 포함), PR #5 해당 SHA 검증 댓글.
- 소스 변경 비교: `git diff 764f297bd148dd54d4983d223bff0166a6dd8632..17b186d679711ddc66ac1aa4152eb2a7733cfacc -- scripts/l1/async-copy-jobs.mjs scripts/l1/l6-b05-async-copy-test.mjs`. 이전 독립 구현과의 차이에서 문서 전용 커밋을 구분한다.
## 2. 주요 코드·계약 경계

| 파일 (저장소 기준) | 검토 초점 |
|---|---|
| `scripts/l1/async-copy-jobs.mjs` | 신규 source dev/ino 저장, 원 action 조회, digest·nonce·stage·경로 대조, legacy config 검증, ID binding/save, 복구 상태 반환 |
| `scripts/l1/l6-b05-async-copy-test.mjs` | 새로운 실패 창 fixture 및 기존 copy, source SHA, create-only, 소유자·stage 검증 |
| `scripts/l1/durable-host-processes.mjs` | 원래 action/processId 봉인, runner identity·manifest 검증, `sync/status`의 복구 한계, non-replay |
| `scripts/l1/broker-core.mjs` | HMAC-sealed copyJobs/actions 저장, `reserveAction`, `bindAction`, journal audit, save 실패 의미 |
| `scripts/l1/async-file-copy-worker.mjs`, `scripts/l1/native-copy-create.c` | 실제 실행 argv/source identity, 새 복사·stage 처리 계약 |
| `scripts/l1/broker-server.mjs`, `scripts/l0-ui-probe.mjs` | same-key start 및 status/read/stop/stage 경로의 L1/L0/MCP 노출 |
| `scripts/run-personal-tests.mjs`, `package.json`, `.github/workflows/personal-macos-ci.yml` | 로컬 34개 회귀 및 동일 SHA macOS CI |

## 3. 핵심 불변식
- 동일 idempotency key와 동일 canonical source/destination 및 expectedSourceSha256에만 조정 가능. key 재사용/요청 불일치는 거부하며 임의의 새 키나 새 stage를 생성해 실행을 반복하지 않는다.
- copy 예약에 `processId:null`이면 오직 동일 key의 봉인된 action을 확인한다. **원 실행 intent digest와 원 processId를 검증한 뒤 기존 ID만 연결**한다. 조정 중 `processes.start`, runner spawn 또는 native copy를 다시 실행하지 않는다.
- 새로운 예약의 source dev/ino는 최초 원본 inode 관측값이며, 복구 시 변경된 live source에서 다시 채취하지 않는다. 이전 형식 예약은 온전한 소유자 비공개 action config의 nonce와 digest 등으로만 조정한다.
- sealed action/config가 없거나 서로 모순되면 `ASYNC_COPY_RECONCILIATION_REQUIRED` 유지. runner 상태 불확실은 원 ID와 `RECOVERY_REQUIRED`로 보수적으로 표기. terminal 완료·작업 미실행을 추정하지 않는다.
- status/read/stop 및 stage inspection/cleanup은 원래 소유·실행 상태 확인과 stage hash/inode/write 권한을 유지한다. 임의 processId 조작이나 RECOVERY_REQUIRED stage 삭제를 허용하지 않는다.
## 4. 판정표 — 각 항목 PASS / FAIL / UNVERIFIED
| ID | 독립 확인 항목 |
|---|---|
| R01 | 실제 검토 구현 SHA 고정, 이전 감사·문서 전용 커밋 구분 및 diff 확인 |
| R02 | 최초 copy 예약의 source dev/ino, stage UUID, 경로/source SHA/size 및 HMAC-sealed action intent 비교의 정확성 |
| R03 | action 자체가 없는 pre-action 중단에서는 같은 key로도 두 번째 실행을 하지 않는가 |
| R04 | action만 봉인됐지만 config/runner 없는 창에서 원 processId의 RECOVERY_REQUIRED를 반환하고 새 실행은 없는가 |
| R05 | 실제 runner가 시작된 뒤 copy binding 전 중단을 독립 fixture에서 재현·동일 ID 조회/복구하는가 |
| R06 | 이전 형식 예약의 private no-follow config·nonce·digest·file bounds 검증, 값 불일치·누락·변조 시 fail-closed |
| R07 | 실패한 copy-binding save 이후 상태/감사를 부당하게 확정하지 않고 재조정 가능하며 replay하지 않는가 |
| R08 | runner가 종료/손상/미확정일 때 원 ID·status 처리 및 stage inspection/cleanup의 소유·terminal gate를 보존하는가 |
| R09 | key conflict, source/destination mismatch, unrelated action/processId, 재시작, 정상 16 MiB copy, 기존 대상/잘못된 SHA 거부 등 회귀 |
| R10 | async hash는 copy 결과로 자동 PASS하지 않는가; F03/CAS 코드·제품 범위와 새로운 도구/권한 변경은 없는가 |
| R11 | 독립 실행 결과와 개발자 34/34·정확한 CI headSha/event/conclusion 및 checkout/log 확인 범위 명시 |
| R12 | 실제 broker SIGKILL·disk/power 손실, 동시 client·실제 Business E2E, F01 actual split HTTP의 UNVERIFIED를 유지하는가 |

정적 감사만으로 판별되지 않는 실제 실패 창·race는 UNVERIFIED로 명시한다. 수정할 결함이 있으면 **경로:행, 예상/관측, 재현 범위, 최소 수정/사용 제한**을 기록하고 결함을 중복 집계하지 않는다.
## 5. 이미 있는 개발자 증거와 제한
- 격리 macOS 네이티브 helper를 이용한 `l6-b05-async-copy-test.mjs`: 정상/거부 + pre-action·pre-config·post-launch 중단 주입, 재시작, legacy, digest 불일치, save 실패 등 PASS.
- 최종 로컬 `npm test`: `PERSONAL_STANDALONE_SUITE=PASS count=34`, exit 0. 이는 **개발자 수행**이며 Astra 자신의 독립 실행과 구분한다.
- 구현 SHA macOS [Push CI 35611059519](https://github.com/exobiz7/chatagent-personal/actions/runs/35611059519) **SUCCESS**; [PR CI 35611063400](https://github.com/exobiz7/chatagent-personal/actions/runs/35611063400) **SUCCESS**. CI metadata 조회와 실제 workflow checkout 범위는 구별한다.
- **미검증:** 실제 SIGKILL을 이 F04 예약→연결 사이에 주입한 물리 중단, 디스크/전원 장애, 동시 독립 client 동작·모든 runner identity race, 라이브 Personal Business 앱 E2E.
- F02-R1.1은 이전 Astra의 **코드/순수 계약 범위 PASS**; F01의 actual HTTP 분할은 UNVERIFIED. F03 CAS metadata 경쟁은 P1 OPEN. 오프라인 암호화 백업은 별도 수용. 신규 F04 개발 검증만으로 32/33 베타를 승인하지 않는다.

## 6. 독립 실행 안전 경계
- 원본 경로에서는 `git status`, `git show`, `git diff`, 파일 조회만 허용. 수행 가능하면 신규 mode 0700 독립 클론/fixture에서 고정 SHA를 checkout하고 최소 계약·격리 테스트를 실행한다. **실사용 데이터가 아닌 감사자 소유 임시 경로**만 사용한다.
- 원본 repo/PR/refs 수정·삭제·checkout/reset/clean/add/commit/push/merge, 기존 감사 자료 덮어쓰기, 실사용 파일·개인 메모리·Keychain·token·터널·launchd 접근/변경, P8 Stable/Business v2 Canary/M16/STABLE-001 조작 금지.
- 실제 앱 등록·배포·활성화, 실사용 대상 장애 주입·경합/삭제, 비밀값 출력 금지. 안전 검사나 실행 제한이 발생하면 우회하지 않고 UNVERIFIED 기록. 검토자는 구현 코드에 직접 수정하지 않는다.
## 7. 신규 보고서 4개
**권장 신규 폴더:** `/Users/macstudio/CodexReview/chatagent-personal/17b186d679711ddc66ac1aa4152eb2a7733cfacc-f04-rereview/` (없을 때만 0700 생성; 있으면 새 고유 접미사 경로, 과거 산출물 보존).

| 파일명 | 반드시 포함할 내용 |
|---|---|
| `00_EXECUTIVE_SUMMARY.md` | F04 판정(검증 범위 표시), 32/33-tool에 미치는 영향, 사용자 결정 사항 |
| `01_F04_REREVIEW_REPORT.md` | R01~R12 각각 PASS/FAIL/UNVERIFIED, 파일:행, 독립 테스트·CI 증거와 미실행 구분 |
| `02_REMAINING_FINDINGS.md` | 신규/잔여 P0/P1/P2, F03 및 범위 밖 결함 분리, 재현/추정과 최소 수정 |
| `03_GATE_DELTA_AND_NEXT_STEPS.md` | 최초 F04 OPEN 대비 변경, 32/33-tool 별 별도 선행조건, F01/F03/Business 및 사용자 최종 판단 |

검토 후 네 보고서의 **실제 절대 경로**, 고정 구현 SHA, 실행한 검증·미검증, F04 판정, 잔여 P0/P1/P2와 기능별 게이트를 사용자에게 제출하고 **다음 지시를 기다린다**. 구현·배포·승인 선언 금지.
