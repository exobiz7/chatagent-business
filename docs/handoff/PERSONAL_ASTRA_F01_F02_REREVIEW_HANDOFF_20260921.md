# ChatAgent Personal — Codex Astra F01/F02 한정 독립 재검토 핸드오프

> 문서 성격: 독립 검토 **작업 지시 및 증거 인덱스**. PASS 보고서나 출시 승인이 아님.
>
> 사용자 결정: Astra의 산출물과 핵심 요약을 제품 소유자가 읽고 기능별 최종 승인 여부를 결정한다.

## 0. 정확한 검토 대상 및 위치

| 필드 | 값 |
|---|---|
| Private GitHub 저장소 | `exobiz7/chatagent-personal` |
| Draft PR | https://github.com/exobiz7/chatagent-personal/pull/5 |
| **이번 고정 소스 SHA** | `8465c12c28f4aeb835ab0bfaf739d7a814376e44` |
| 직전 독립 감사 소스 SHA | `90f1b89cb71b247a768e589fdc7987f6a6835d1c` |
| 원본 로컬 저장소 (읽기 전용) | `/Users/macstudio/dev/personal/chatagent-personal` |
| 변경 범위 | 위 직전 독립 감사 SHA부터 이번 SHA까지의 **실제 코드 diff에서 F01/F02 수정과 영향** |
| 이번 검토 제외 | F03 동시 메타데이터 보존, F04 async-copy 예약→processId 복구 구현, 별도 백업 수용, Business 앱 등록 |
| 실제 최종 승인자 | 사용자. Astra는 의견·검증 증거만 제출 |

핸드오프 자체가 이후 문서 전용 커밋으로 추가되어도, **감사 코드는 위 `8465c12…` SHA에 고정**한다. 최신 브랜치 HEAD로 자동 변경하지 않는다. 원본 작업 트리·운영 서비스는 건드리지 않는다.

## 1. 첫 확인: 기존 독립 감사 자료와 F01/F02 수정보고

- **기존 Astra 산출물 루트** (읽기 전용): `/Users/macstudio/CodexReview/chatagent-personal/90f1b89cb71b247a768e589fdc7987f6a6835d1c-static-n78czyco/`
- 이전 보고서: `00_EXECUTIVE_SUMMARY.md`, `01_INDEPENDENT_REVIEW_REPORT.md`, `02_FINDINGS_AND_REPRO.md`, `03_GATE_DECISION_MATRIX.md`. 기존 P0 1건(F01), P1 3건(F02/F03/F04) 및 미검증 항목을 그대로 보존한다.
- **신규 개발 증거**: `docs/verification/PERSONAL_F01_F02_REMEDIATION_20260921.md` (이번 소스 SHA에 포함).
- 기존 전체 감사 지시: `docs/handoff/PERSONAL_ASTRA_INDEPENDENT_REVIEW_HANDOFF_20260921.md`. 과거 SHA 기준 문서이므로 이 재검토 지시보다 우선하지 않는다.
## 2. 정확한 소스·테스트 경로 (저장소 루트 기준)

| 구분 | 읽기 전용 검토 경로 | 확인 내용 |
|---|---|---|
| F01 공통 | `scripts/l1/bounded-json-body.mjs` | raw Buffer 합산·실제 바이트 제한·fatal UTF-8 변환·JSON 오류 |
| F01 L0 | `scripts/l0-ui-probe.mjs` | 인증 후 `/mcp`의 16,384 / 350,000 byte envelope 및 대상 도구 |
| F01 L1 | `scripts/l1/broker-server.mjs` | `/agent/file/*` 350,000 byte, 다른 route 8,192 byte, 에러 코드 |
| F02 공통 | `scripts/l1/file-effect-status.mjs` | ISSUED/COMPLETED/FAILED 감사 및 실패 시 효과 상태 |
| F02 네이티브 | `scripts/l1/native-replace-cas.mjs`, `scripts/l1/host-file-ops.mjs` | postcommit 확인/close 오류, 제한된 테스트 주입 |
| F02 L0/L1 | `scripts/l0-ui-probe.mjs`, `scripts/l1/broker-server.mjs` | code/effect/retryable/audit가 MCP 응답까지 보존되는지 |
| 신규 테스트 | `scripts/l1/personal-f01-f02-contract-test.mjs` | 청크 경계 재현·정확한 복원·감사 기록 실패 주입 |
| 기존 회귀 보강 | `scripts/l1/personal-native-cas-test.mjs` | 완료 후 확인 실패 시 불확실성, 변경된 파일 및 재시도 거부 |
| 통합·회귀 | `scripts/l1/personal-native-cas-mcp-test.mjs`, `scripts/run-personal-tests.mjs`, `.github/workflows/personal-macos-ci.yml` | 기존 MCP 사용경로, 33개 전체 스위트 및 CI 범위 |

변경 diff 확인: `git diff --name-status 90f1b89cb71b247a768e589fdc7987f6a6835d1c..8465c12c28f4aeb835ab0bfaf739d7a814376e44`. 그 사이에는 검토용 핸드오프 문서 2개도 포함되므로 실제 수정 코드와 문서를 구분하라. 최소한 위 경로를 직접 열고 필요한 호출 체인을 따라갈 것.

## 3. 검증 증거와 알려진 공백

- 개발자 로컬 `npm test`: **33/33 PASS**, exit 0. 신규 F01/F02 계약 테스트 및 네이티브 CAS 테스트 포함.
- 같은 SHA의 macOS [Push CI 35564200755](https://github.com/exobiz7/chatagent-personal/actions/runs/35564200755): **SUCCESS**.
- 같은 SHA의 macOS [PR CI 35564375860](https://github.com/exobiz7/chatagent-personal/actions/runs/35564375860): **SUCCESS**.
- **F01 한계:** 기존 청크별 문자열 연결의 손상은 독립 바이트 스트림 fixture에서 재현했지만, 새 코드의 **의도적으로 분할한 실제 HTTP socket → L0 → L1** 실행 검증은 아직 없다. 이미 실행했다고 적지 말 것.
- **F02 한계:** postcommit 관측 실패·audit-save 실패는 격리된 in-process fault injection으로 확인했다. 실제 디스크 오류·전원 손실·MCP 전체 경로에서의 감사 실패 강제 재현은 미실행.
- 개발 증거는 Astra의 독립 재검토 결과를 대체하지 않는다. 결과의 **정적 사실·실제로 실행한 검증·추론·미검증**을 반드시 구분한다.
## 4. F01/F02 재검토 체크리스트: 각 항목 PASS / FAIL / UNVERIFIED

| ID | 검토 항목 | 필요한 판단·증거 |
|---|---|---|
| U01 | 종전 청크별 coercion 결함과 수정 지점 | 원본/현재 diff, 변경 이유, 여러 바이트 문자 경계 |
| U02 | L0/L1 raw byte 수집·UTF-8 의미 | split surrogate/한글/emoji, fatal decode, invalid JSON의 동작 |
| U03 | 바이트 크기·허용 도구 분리 | 일반 16,384/8,192 및 파일 350,000 제한, 262,144 content 상한 |
| U04 | 정상 file/create/replace 및 메모리·argv 전달 | 문자 무결성과 SHA; 검사하지 못한 route는 UNVERIFIED |
| U05 | 실제 HTTP 청크 경계의 검증 상태 | 실제로 수행한 경우에만 로그·원본 바이트/결과 해시 기재 |
| E01 | native helper 결과 이후 모든 관측 예외 | realpath/open/stat/read/close 누락 없이 `CAS_POSTCOMMIT_UNCERTAIN` 인지 |
| E02 | 작업 전 감사 저장 실패 | 파일 효과 실행이 시작되지 않는지, 오류 코드·경계 |
| E03 | 이미 완료한 파일 작업 이후 완료 감사 실패 | `effect=COMMITTED,retryable=false`, 원래 효과 한 번 |
| E04 | 작업 실패와 실패 감사의 이중 실패 | 원래 실패를 가리지 않고 `audit=UNCERTAIN` 전달 |
| E05 | L1 JSON → L0 brokerCall → MCP structuredContent | code/effect/retryable/audit의 실제 전달 및 예외 처리 |
| E06 | 기존 파일 교체의 불확실한 결과 | 같은 old SHA로 무작정 재시도하지 않는 계약·실제 결과 확인 |
| G01 | 회귀·패키지 및 범위 불변성 | 고정 SHA 테스트 증거, 새 코드가 F03/F04를 수정·승인하지 않았음 |

**판정 주의:** 정상 경로 및 주입된 fault가 성공했다고 임의의 전원 손실 복구까지 PASS 처리하지 않는다. 반대로 일반적인 단일 사용자 사용에 필요하지 않은 전역 잠금·매 호출 승인·상주 서비스의 추가를 수정 요건으로 단정하지 않는다.
## 5. 독립 실행 방법 및 접근 제한

1. 원본 저장소는 `git status --short`, `git show`, `git diff`, 파일 읽기만 허용. `checkout/reset/clean/add/commit/push` 금지.
2. 검증을 실행할 필요가 있고 허용된다면 **신규 0700 독립 클론·임시 fixture**만 사용, 고정 SHA checkout. 실제 개인 데이터와 키를 쓰지 않는다. 테스트 실행 전에 어떤 파일·서비스에 접근하는지 확인하고 범위를 좁힌다.
3. 우선 방어적 **정적 변경 검토**를 완료한다. 실행 검증은 새로 만든 자체 테스트 바이트/파일에서만 허용된 범위로 제한한다. 환경이 차단하면 우회 시도 없이 `UNVERIFIED`와 이유를 기록한다.
4. `PERSONAL_TEST_SSD_ROOT` 는 설정하지 않는다. 전체 `npm test`는 환경상 대량 프로세스 조회 등의 제한과 충돌할 수 있으므로 가능 여부를 먼저 확인하고, 허용되지 않으면 실행하지 않는다.
5. 발견한 결함은 **원본을 고치지 말고** 행 번호·최소 수정안을 보고서에만 기록한다. 새로운 고정 SHA 승인 없이는 기존 리포트를 재기록하지 않는다.

**절대 금지:** 원본 소스·Git refs·기존 PR의 변경·삭제·덮어쓰기, 원본 디렉터리 checkout/clean/reset, 이미 존재하는 감사 산출물 수정·삭제, macOS 업무 파일·메모리·Keychain·운영 token·터널·launchd·운영 앱 조작, P8 Stable/Business v2 Canary/M16/STABLE-001의 데이터·구성 변경, 실제 Personal Business 앱 등록/배포, 임의의 외부 네트워크 실험, 위험한 경합·우회 테스트, 비밀값 및 실데이터 출력.

**실패 처리:** 쓰기 허용 범위라도 예상하지 못한 파일/프로세스/경로가 보이면 즉시 해당 동작을 중단하고 기존 파일 보존. `rm -rf` 등의 포괄 정리는 금지하며 감사 환경 자신의 명확한 임시 산출물에 한해 정리할 것.
## 6. 새 보고서 4개와 전달 계약

**새 산출물 후보 디렉터리:** `/Users/macstudio/CodexReview/chatagent-personal/8465c12c28f4aeb835ab0bfaf739d7a814376e44-f01-f02-rereview/`. 없을 때만 신규 0700 생성. 이미 존재하면 별도 고유 접미사를 붙여 새 디렉터리를 생성하고 실제 경로를 보고. 기존 `*-static-n78czyco` 폴더에는 쓰지 않는다.

| 산출물 | 핵심 내용 |
|---|---|
| `00_EXECUTIVE_SUMMARY.md` | 보스용 1장 요약: F01/F02 재검토 결과, P0/P1 변동 여부, 32/33 베타에 미치는 영향 |
| `01_F01_F02_REREVIEW_REPORT.md` | U01~U05, E01~E06, G01 각각 PASS/FAIL/UNVERIFIED, 소스:행·증거·테스트 SHA |
| `02_REMAINING_FINDINGS.md` | 아직 남은 F01/F02 결함, 새 발견 사항, 원인·영향·최소 수정, F03/F04는 미해결 항목으로만 명시 |
| `03_GATE_DELTA_AND_NEXT_STEPS.md` | 직전 정적 감사의 32/33 HOLD 대비 **이번 변경의 델타**, 남은 테스트, 기능별 소유자 수용 조건 및 다음 순서 |

검토자는 **기술 검토 의견**만 낸다. F01/F02의 완전 해결 판정이 어렵거나 추가 안전 검사로 실행이 중단되면 수행 가능 범위만 보고하고 나머지는 UNVERIFIED로 둔다. 기존 R01~R12 전부를 처음부터 다시 감사하거나, 이번 재검토만으로 제품 전체 독립 승인·베타 승인·오프라인 백업 승인을 선언하지 않는다.

**완료 시:** 정확한 SHA, 실제 생성한 산출물의 절대 경로 4개, 각 항목 판정, 재현한/미실행 검증, F01/F02 상태와 남은 P0/P1, 32/33 기능별 다음 게이트를 사용자에게 요약하고 **승인·다음 지시까지 대기**한다.
