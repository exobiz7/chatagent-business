# ChatAgent Personal — Codex Astra F04-R1 독립 재검토 핸드오프

**문서 성격:** 이전 F04 재검토에서 확인된 legacy runner config intent 불일치 결함의 한정 독립 감사. 제품 승인서·전체 감사서가 아니다.
**이번 검토 고정 구현 SHA:** `fc518c70693e570c54dedd41afb2190653627235`
**직전 Astra 감사 구현 SHA:** `17b186d679711ddc66ac1aa4152eb2a7733cfacc` (F04 부분 해결 / FAIL)
**직전 문서 전용 SHA:** `207c423d4f36e8a218811f19dcef36e49d898f30` (F04 재검토 핸드오프).
**Private repo:** `exobiz7/chatagent-personal`; [Draft PR #5](https://github.com/exobiz7/chatagent-personal/pull/5).
**원본 저장소 — 조회 전용:** `/Users/macstudio/dev/personal/chatagent-personal`.
**최종 수용/사용 제한 및 베타 결정:** 사용자. **감사자:** 독립 Codex Astra.

이 문서는 구현 후속 **문서 전용 커밋**에 추가한다. 문서 커밋과 구현 SHA를 구별하며, 브랜치 최신 HEAD가 이동해도 감사 대상 소스 SHA를 변경하지 않는다.

## 1. 직전 지적·이번 개발자 증거
- 직전 보고서 4종 (보존/조회 전용): `/Users/macstudio/CodexReview/chatagent-personal/17b186d679711ddc66ac1aa4152eb2a7733cfacc-f04-rereview/`. 특히 `02_REMAINING_FINDINGS.md`의 F04-R1 P1 및 `03_GATE_DELTA_AND_NEXT_STEPS.md`.
- 기존 F04 전체 맥락: `/Users/macstudio/CodexReview/chatagent-personal/90f1b89cb71b247a768e589fdc7987f6a6835d1c-static-n78czyco/02_FINDINGS_AND_REPRO.md`. 중복 집계하지 말 것.
- 이번 구현·검증 기록: `docs/verification/PERSONAL_F04_R1_LEGACY_CONFIG_INTENT_20260922.md` (고정 구현 SHA 안에 포함).
- 정확한 소스 diff: `git diff 17b186d679711ddc66ac1aa4152eb2a7733cfacc..fc518c70693e570c54dedd41afb2190653627235 -- scripts/l1/async-copy-jobs.mjs scripts/l1/l6-b05-async-copy-test.mjs`.
## 2. 검토 대상·교차 확인

| 파일 (repo 루트 기준) | 확인 목적 |
|---|---|
| `scripts/l1/async-copy-jobs.mjs` | legacyIdentity의 실제 config 필수 필드·타입 검증, 실제 intent digest 검증 및 별도 reconstructed intent 검증 |
| `scripts/l1/l6-b05-async-copy-test.mjs` | 추가 negative 18조건, 정상 legacy 복구, 신규 형식 복구, non-replay, stage 및 권한 회귀 |
| `scripts/l1/durable-host-processes.mjs` | `start`의 digest 입력 형식·필드 순서, 봉인된 action/nonce/processId, manifest·runner identity |
| `scripts/l1/durable-process-runner.mjs` | 실제 config 읽기 및 `executable`/`argv`/`cwd`/`timeoutMs` 소비 |
| `scripts/l1/broker-core.mjs` | HMAC-sealed actions/copyJobs, state save, audit event와 재개 시 원 record 검증 |
| `scripts/l1/broker-server.mjs`, `scripts/l0-ui-probe.mjs` | same-key start 및 status/read/stop/stage 통로의 변동 유무 확인 |
| `scripts/run-personal-tests.mjs`, `.github/workflows/personal-macos-ci.yml` | 34개 로컬 회귀 및 고정 SHA CI 범위 |

## 3. 검토할 계약·거부 조건
- legacy 기록은 `sourceDev/sourceIno`가 없으므로, 원 action과 copy 예약을 연결할 때 읽은 비공개 `config.json`의 **실제** 실행 필드를 별도로 검증해야 한다.
- `config.executable`, `config.argv`, `config.cwd`, `config.timeoutMs`의 타입·형태를 확인하고 `{executable,argv,cwd,timeoutMs}`의 **정해진 key 순서**로 digest를 구해 봉인된 `action.digest`와 비교한다.
- 검증된 dev/ino를 이용해 원 copy 예약에서 재구성한 intent도 **별개로 동일 action.digest와 비교**한다. nonce/processId·owner/no-follow/size 제한은 유지한다.
- 다른 executable, cwd, timeout, worker/helper/helper SHA, source/destination/source SHA/size/stage, 누락 또는 잘못된 field, dev/ino 및 nonce 변조는 binding/audit 기록 전 거부되어야 한다.
- 온전한 기존 legacy와 신규 형식 예약은 원래 processId에만 연결하고, `RECOVERY_REQUIRED`를 성공/종료나 효과 미발생으로 오인하지 않는다. 재실행·새 stage·새 key를 복구 수단으로 사용하지 않는다.
## 4. 항목별 판정표 — PASS / FAIL / UNVERIFIED

| ID | 독립 확인할 사항 |
|---|---|
| L01 | 고정 소스 SHA, 이전 감사 구현 SHA, 후속 문서 커밋이 혼동 없이 구분되는가? |
| L02 | 실제 config 필수 필드의 타입/형태/범위와 원래 private/no-follow/owner/크기 검증을 모두 유지하는가? |
| L03 | 실제 config 실행 필드로 구성한 intent digest와 원 sealed action.digest를 먼저 비교하는가? |
| L04 | 원 copy 예약으로 재구성한 intent를 위 검증과 **독립적으로** 비교하는가? |
| L05 | 직전 11개 변조 유형 및 이번 18개 negative condition 모두 binding·audit 영속화 전에 거부되는가? |
| L06 | 불일치 시 `processId:null`, `ASYNC_COPY_RECONCILIATION_REQUIRED`, no-launch/no-replay가 유지되는가? |
| L07 | 정상 legacy config의 동일 ID 복구, 원 action 1건 유지, 재시작 후 동일 ID 확인이 가능한가? |
| L08 | 신규 형식, action 없는 예약, pre-config 창, runner 시작 후 binding 전 중단, save 실패의 기존 보수적 계약이 유지되는가? |
| L09 | stage inspect/cleanup의 terminal·소유권·hash/inode·write 권한과 create-only 복사 계약을 손상하지 않는가? |
| L10 | 테스트 실행 순서 변경이 PROCESS_LIMIT fixture 충돌만 해결하고 실패 검증을 생략하지 않는가? |
| L11 | 개발자 로컬 34/34, 대상 SHA Push/PR CI 메타데이터와 독립 실행 결과를 구분하는가? |
| L12 | 실제 SIGKILL/전원/디스크·동시 client·L0/MCP/Business E2E·F01 HTTP split 미검증 및 F03 별도 OPEN을 유지하는가? |

판정에는 정확한 **소스 파일:행**, 고정 SHA, 실행 명령·출력과 미실행 사유를 기재한다. 결함 발견 시 재현/정적 추론을 구별하고 F04와 F04-R1을 중복 집계하지 않는다.
## 5. 기존 증거와 한계
- 개발자 기존 격리 native/detached runner 테스트 PASS. 확장된 legacy config negative 18조건 거부, intact config 동일 processId 복구 및 no-launch 확인. 변경 전 초기 테스트는 예약 슬롯을 추가로 차지하여 후속 정상 runner가 `PROCESS_LIMIT`에 걸렸으나 fixture 순서를 조정한 후 targeted PASS.
- 개발자 최종 `npm test`: `PERSONAL_STANDALONE_SUITE=PASS count=34`, exit 0.
- 구현 SHA macOS [Push CI 35677975755](https://github.com/exobiz7/chatagent-personal/actions/runs/35677975755) **SUCCESS**; [PR CI 35677978208](https://github.com/exobiz7/chatagent-personal/actions/runs/35677978208) **SUCCESS**. headSha/event/conclusion과 실제 checkout/log 확인 범위를 구별할 것.
- 부정 config는 **실행하지 않고** 복구 binding만 시험했다. 실제 broker SIGKILL in-window, disk/power failure, concurrent clients, 전체 runner identity race, live L0/MCP/Personal Business E2E는 UNVERIFIED. 해당 항목을 CI 성공으로 보완된 것으로 표시하지 않는다.
- F02-R1.1 및 읽기 감사는 기존 코드·순수 계약 범위 PASS. F03 native CAS metadata concurrency는 P1 OPEN, F01 actual HTTP split은 UNVERIFIED. 암호화 백업은 별도 선택·수용 항목.

## 6. 실행 권한·안전 경계
- 원본 저장소는 **정적 조회 전용** (`git show/diff/status`, 파일 조회). 독립 실행이 가능할 때만 **새 0700 격리 클론 및 임시 fixture**에서 고정 SHA로 테스트한다. 악의적 config fixture도 실제 실행 파일 실행/운영 서비스 연동 없이 검증한다.
- **금지:** 원본 repo/refs/PR 변경·삭제·checkout/reset/clean/add/commit/push/merge, 기존 Astra 산출물 덮어쓰기, 실제 업무 파일·개인 메모리·Keychain·token·터널·launchd 접근·수정, P8 Stable/Business v2 Canary/M16/STABLE-001 또는 실제 Personal Business 앱 등록·조작·배포, 실사용 대상 장애 주입·경합·삭제·비밀값 출력.
- 실행 제한이나 안전 검사로 막히면 우회하지 말고 해당 항목을 UNVERIFIED로 기록. 결함의 최소 수정/범위 제한 제안은 보고서에만 작성하며 소스·PR에 직접 적용하지 않는다.
## 7. 신규 산출물 4종 및 종료
**권장 폴더:** `/Users/macstudio/CodexReview/chatagent-personal/fc518c70693e570c54dedd41afb2190653627235-f04-r1-rereview/`. 없을 때만 mode 0700으로 생성. 이미 있으면 다른 고유 접미사 폴더를 선택하고 모든 기존 보고서를 보존한다.

| 파일명 | 필수 내용 |
|---|---|
| `00_EXECUTIVE_SUMMARY.md` | F04-R1 결과, 검증 범위, 32/33-tool에 미치는 영향, 사용자 결정사항 |
| `01_F04_R1_REREVIEW_REPORT.md` | L01~L12 개별 PASS/FAIL/UNVERIFIED, 코드:행 및 독립/개발자 검증 구분 |
| `02_REMAINING_FINDINGS.md` | 신규·잔여 P0/P1/P2, F03과 F04 잔여의 중복 제거, 최소 수정 및 미검증 |
| `03_GATE_DELTA_AND_NEXT_STEPS.md` | 이전 F04-R1 FAIL 대비 변동, 32/33 각각의 조건, F01/F03/Business 선행 판단 |

최종 메시지는 **검토 SHA·실제 생성한 네 파일 절대 경로·F04-R1 판정·직접 실행한 검증/미검증·P0/P1/P2 및 32/33 조건**을 요약한다. 전체 제품 승인·베타 시작은 선언하지 말고 사용자 최종 결정과 다음 지시를 기다린다.
