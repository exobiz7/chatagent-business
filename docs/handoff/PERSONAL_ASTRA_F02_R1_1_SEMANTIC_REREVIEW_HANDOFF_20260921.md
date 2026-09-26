# ChatAgent Personal — Astra F02-R1.1 오류 코드·효과 일관성 독립 재검토 핸드오프

> 문서의 성격: 고정 SHA 변경분의 독립 기술 감사 작업 계약. 구현 승인, 베타 승인 또는 제품 전체 재감사가 아니다.
>
> 제품 소유자가 검토 결과와 미검증을 읽고 최종 수용 여부를 결정한다.

| 필드 | 고정 값 |
|---|---|
| Private repository | `exobiz7/chatagent-personal` |
| Draft PR | https://github.com/exobiz7/chatagent-personal/pull/5 |
| **이번 검토 대상 소스 SHA** | `3f9a4a824d7b39f8d8129a9b0636714850241e70` |
| 직전 Astra 검토 SHA | `2e0ca38202282cf4b0de26e2347a0b71611c6034` |
| 원본 Mac 저장소, 조회 전용 | `/Users/macstudio/dev/personal/chatagent-personal` |
| 검토 내용 | F02-R1.1 잔여: mutation 실패 code와 effect 의미 일관성 및 이전 정상 계약 보존 |
| 제외 | F01 전면 재감사, F03/F04 구현, 선택적 백업, Personal Business 등록/배포 |

**본 문서는 후속 문서 전용 커밋으로 추가한다. 브랜치 HEAD가 이동하더라도 감사 대상은 위 코드 SHA에 고정하며, 문서 커밋을 코드 검증 대상으로 대체하지 않는다.**

## 1. 먼저 열어볼 자료
- 이전 Astra 보고서 원본 (읽기 전용): `/Users/macstudio/CodexReview/chatagent-personal/2e0ca38202282cf4b0de26e2347a0b71611c6034-f02-r1-1-rereview/`. 특히 `02_REMAINING_FINDINGS.md`에 기록한 3개 재현 조건과 `03_GATE_DELTA_AND_NEXT_STEPS.md`를 확인할 것.
- 이번 구현자 증거: `docs/verification/PERSONAL_F02_R1_1_CODE_EFFECT_CONTRACT_20260921.md` (고정 소스 SHA에 포함).
- 이전 구현 계약: `docs/verification/PERSONAL_F02_R1_1_RESPONSE_ENVELOPE_20260921.md`. 이전 F01/F02 감사를 새 SHA 전체에 대한 승인으로 인용하지 말 것.
## 2. 변경 diff·계약 근거
- 읽기 전용 비교: `git diff 2e0ca38202282cf4b0de26e2347a0b71611c6034..3f9a4a824d7b39f8d8129a9b0636714850241e70 -- scripts/l1/l1-file-transport.mjs scripts/l1/personal-f02-r1-test.mjs`.
- 직접 변경: `scripts/l1/l1-file-transport.mjs`의 `validFailure` code/effect 검사; `scripts/l1/personal-f02-r1-test.mjs`의 네 route positive/negative assertions.
- 실제 L1 응답 근거: `scripts/l1/file-effect-status.mjs` (`fileEffectDetails`, 완료 후 감사 실패), `scripts/l1/broker-server.mjs` (JSON error serialization), `scripts/l1/native-replace-cas.c` (precondition vs rename), `scripts/l1/native-replace-cas.mjs`, `scripts/l1/native-create-only.mjs`.
- 실제 L0 소비 경로: `scripts/l0-ui-probe.mjs` 의 `brokerCall`, `toolError` 및 각 파일 도구의 catch → MCP `structuredContent`. 참고: 이 변경에서 L0/L1 소스 자체는 수정하지 않았다.
- 기존 성공 영수증 및 read-only 감사: `scripts/l1/host-file-ops.mjs`, `scripts/l1/file-effect-status.mjs`. 이번에는 읽기 감사 복원 코드를 새로 수정하지 않았다.
- 테스트 스위트/CI: `scripts/run-personal-tests.mjs`, `package.json`, `.github/workflows/personal-macos-ci.yml`.

## 3. 특별히 재검토할 의미 계약
| 실패 code | 기대되는 정상 envelope | 불완전·모순된 응답 |
|---|---|---|
| `HOST_FILE_AUDIT_UNCERTAIN` | `effect=COMMITTED,retryable=false`; 선택적 `audit=UNCERTAIN` | 빠진 effect 또는 잘못된 effect → mutation 응답 UNCERTAIN |
| `CAS_POSTCOMMIT_UNCERTAIN` 등 `_UNCERTAIN` 접미 코드 | `effect=UNCERTAIN,retryable=false` | effect 누락 또는 COMMITTED → mutation 응답 UNCERTAIN |
| `CAS_PRECONDITION_MISMATCH`, `PRECONDITION_MISMATCH`, `PRECONDITION_REQUIRED` | 명확한 사전 거부: effect 없음 | COMMITTED/UNCERTAIN 주장 → mutation 응답 UNCERTAIN |
| 일반·미분류 코드 | 임의의 precommit 분류·COMMITTED 추론 금지 | 알려진 완료 감사 코드 외의 COMMITTED 주장 → mutation 응답 UNCERTAIN |

`L1_MUTATION_RESPONSE_UNCERTAIN`, `effect=UNCERTAIN`, `retryable=false`는 파일 변경 발생·미발생을 증명하지 않는다. **온전한 정상 영수증, 알려진 거부 코드, 원래의 유효 COMMITTED/UNCERTAIN 및 audit 필드를 보존**하는지도 반드시 검토한다. 자동 재시도 추가는 범위 밖이다.
## 4. 체크리스트: 항목별 PASS / FAIL / UNVERIFIED
| ID | 감사할 사항 |
|---|---|
| S01 | 정확한 SHA와 직전 SHA의 diff가 구분되었는가? 문서 전용 후속 HEAD로 자동 변경하지 않았는가? |
| S02 | 네 mutation route에서 `CAS_POSTCOMMIT_UNCERTAIN` 및 다른 `_UNCERTAIN` 코드의 필수 effect/retryable 누락·모순을 거부하는가? |
| S03 | `HOST_FILE_AUDIT_UNCERTAIN`을 다른 UNCERTAIN 접미 코드보다 먼저 분기하여 COMMITTED/false만 허용하는가? |
| S04 | 명시된 사전 거부 코드에 COMMITTED/UNCERTAIN이 붙으면 불확실 상태로 처리하며 정상 refusal은 보존하는가? |
| S05 | 일반 uppercase 코드에서 임의의 COMMITTED를 허용하지 않고, 그 외 unknown code를 근거 없이 precommit으로 확정하지 않는가? |
| S06 | 결함 사례 3개를 네 mutation route 모두에서 negative assertion으로 검증하고 각 정상 code/effect 쌍을 positive assertion으로 보존하는가? |
| S07 | 기존 정상 receipt와 선택적 commitMode, 감사 상태 및 비정상 객체 검증을 손상시키지 않았는가? |
| S08 | L1 응답 → L0 brokerCall/toolError → MCP structuredContent의 상태 전달과 비파일 mutation 분리를 코드상 검토했는가? 실행하지 않은 구간은 UNVERIFIED인가? |
| S09 | 개발자 로컬 34/34와 고정 SHA Push·PR CI를 구별하고 자신이 실행한 검사만 독립 증거로 표시하는가? |
| S10 | F01 actual HTTP split, F03 metadata 동시성, F04 async-copy 복구 및 Business E2E/선택적 백업을 OPEN 또는 UNVERIFIED로 분리하는가? |

## 5. 개발자 검증 증거와 경계
- 로컬 targeted `personal-f02-r1-test.mjs`: PASS. 최종 `npm test`: `PERSONAL_STANDALONE_SUITE=PASS count=34`, 종료 코드 0.
- 같은 코드 SHA의 macOS [Push CI 35588248602](https://github.com/exobiz7/chatagent-personal/actions/runs/35588248602): SUCCESS; [PR CI 35588252110](https://github.com/exobiz7/chatagent-personal/actions/runs/35588252110): SUCCESS. 정확한 headSha/event와 실제 checkout/log 증거를 구분할 것.
- 검증은 pure mock L1 error envelope 및 기존 격리 MCP 테스트이다. **실제 malformed wire 응답, 소켓/디스크/전원 장애, 실제 Personal Business 대화 E2E는 신규로 재현하지 않았다.** 개발자 PASS는 독립 감사 대체 불가.
## 6. 독립 실행 제한과 허용 범위
- 첫 단계는 읽기 전용 정적 검토. 원본에서는 `git status`, `git show`, `git diff`, 파일 조회만 수행한다. 독립 실행이 허용되면 **새로 만든 mode 0700 격리 클론·fixture**에서 고정 소스 SHA만 checkout하고 순수 계약 테스트를 수행한다.
- 원본 저장소 변경·삭제·checkout/reset/clean/add/commit/push/merge, 원본 PR 변경·승인, 기존 Astra 보고서 폴더 덮어쓰기·삭제, 실제 사용자 파일·메모리·Keychain·token·터널·launchd·운영 앱 조작 금지.
- P8 Stable, Business v2 Canary, M16, STABLE-001 데이터·서비스·등록을 건드리지 않는다. 실사용 대상으로 네트워크 장애·경합·삭제·권한 변경 실험, 외부 무단 전송 및 비밀값 기록 금지.
- 환경 제한이나 추가 안전 검사로 실행이 차단되면 다른 수단으로 우회하지 않는다. 수행한 정적 검토와 미실행 동적 검증을 구분하여 `UNVERIFIED`로 기록한다. 결함 발견 시 원본을 고치지 말고 보고서에 최소 수정안만 기술한다.

## 7. 필수 보고서 4종과 종료
**신규 산출물 권장 폴더:** `/Users/macstudio/CodexReview/chatagent-personal/3f9a4a824d7b39f8d8129a9b0636714850241e70-f02-r1-1-semantic-rereview/` (없을 때에만 0700 생성). 이미 존재한다면 새 고유 접미사 폴더로 분리한다.

| 파일명 | 필수 기록 |
|---|---|
| `00_EXECUTIVE_SUMMARY.md` | 사용자용 1장 요약, F02-R1.1 의미 계약 판정과 32/33-tool에 미치는 영향 |
| `01_F02_R1_1_SEMANTIC_REREVIEW_REPORT.md` | S01~S10 PASS/FAIL/UNVERIFIED, 소스:행, 독립 실행·개발자 증거·미검증 분리 |
| `02_REMAINING_FINDINGS.md` | 남은/신규 finding, 중복 없는 P0/P1/P2, 재현/가설 구분, 최소 수정 |
| `03_GATE_DELTA_AND_NEXT_STEPS.md` | 직전 F02-R1.1 FAIL 대비 변동, 32/33 각각의 조건, F03/F04·실사용 별도 게이트 |

최종 메시지는 정확한 검토 SHA, 실제 보고서 4개 절대 경로, F02-R1.1 및 읽기 감사 판정, 직접 검증/미검증, P0/P1/P2 집계와 소유자 판단 사항을 포함한다. **제품 전체 승인이나 베타 시작을 선언하지 말고 사용자의 최종 결정과 다음 지시까지 기다린다.**
