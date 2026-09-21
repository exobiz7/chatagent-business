# Codex Astra — F02-R1.1 오류 코드·effect 재검토 프롬프트 (붙여넣기용)

당신은 ChatAgent Personal 구현 담당자와 독립된 **코드 무결성·결과 계약 검토자**입니다. 이번 작업은 직전 Astra가 발견한 F02-R1.1의 **실패 code와 effect 의미 일관성 결함**의 수정만 재검토합니다. 원본 수정·PR 변경·배포·승인을 지시하지 않습니다. 최종 수용 판단은 사용자에게 있습니다.

**먼저 핸드오프 전체를 읽으십시오:**
`/Users/macstudio/dev/personal/chatagent-personal/docs/handoff/PERSONAL_ASTRA_F02_R1_1_SEMANTIC_REREVIEW_HANDOFF_20260921.md`

- Private repo: `exobiz7/chatagent-personal` / Draft PR #5: https://github.com/exobiz7/chatagent-personal/pull/5
- **고정 감사 소스 SHA: `3f9a4a824d7b39f8d8129a9b0636714850241e70`**
- 직전 Astra 검토 SHA: `2e0ca38202282cf4b0de26e2347a0b71611c6034`
- 원본 경로: `/Users/macstudio/dev/personal/chatagent-personal` (조회 전용)
- 이전 Astra 보고서: `/Users/macstudio/CodexReview/chatagent-personal/2e0ca38202282cf4b0de26e2347a0b71611c6034-f02-r1-1-rereview/`
- 구현자 기록: `docs/verification/PERSONAL_F02_R1_1_CODE_EFFECT_CONTRACT_20260921.md`

이 프롬프트와 핸드오프 자체는 후속 문서 전용 커밋에 포함될 수 있습니다. **감사 대상 코드는 위 고정 SHA이며 브랜치 최신 HEAD가 아닙니다.**
## 검토 수행

1. 이전 `02_REMAINING_FINDINGS.md`의 세 가지 negative mock 사례를 확인하고, 고정 두 SHA 사이의 실제 소스 변경을 독립적으로 검토하십시오. 주요 파일: `scripts/l1/l1-file-transport.mjs`, `scripts/l1/personal-f02-r1-test.mjs`.
2. 네 mutation route(create/write/replace/개발용 copy) 각각에서 `CAS_POSTCOMMIT_UNCERTAIN`의 필수 `UNCERTAIN/false`, `HOST_FILE_AUDIT_UNCERTAIN`의 필수 `COMMITTED/false`, `CAS_PRECONDITION_MISMATCH`와 `COMMITTED`의 모순이 적절히 처리되는지 확인하십시오. 누락·모순 응답은 `L1_MUTATION_RESPONSE_UNCERTAIN`, `effect=UNCERTAIN,retryable=false`여야 합니다.
3. L1의 실제 `fileEffectDetails` 및 broker JSON 오류 응답을 대조해 **잘못된 COMMITTED를 새로 합성하지 않는지** 확인하십시오. 알려진 정상 refusal, 정상 성공 receipt, 유효한 COMMITTED/UNCERTAIN과 선택적 audit, 비파일변경 route의 구별이 보존되는지 함께 점검하십시오.
4. 핸드오프의 **S01~S10 전 항목**을 PASS/FAIL/UNVERIFIED로 판정하십시오. 소스 경로:행, 본인이 직접 실행한 검증과 구현자 로컬·CI 증거 및 미실행 항목을 분리해 기록하십시오.
5. 정적 검토부터 수행하십시오. 별도 실행이 허용될 때에만 신규 0700 독립 클론 및 fixture로 순수 계약 테스트를 수행합니다. 실제 소켓 장애·디스크/전원·실사용 파일·운영 앱 실험이 차단되면 우회하지 말고 해당 사항을 UNVERIFIED로 두십시오.

구현자 증거: 로컬 targeted PASS, 전체 `npm test` **34/34 PASS**, 같은 소스 SHA의 macOS [Push 35588248602](https://github.com/exobiz7/chatagent-personal/actions/runs/35588248602) 및 [PR 35588252110](https://github.com/exobiz7/chatagent-personal/actions/runs/35588252110) **SUCCESS**. 이 증거를 독립 통합 검증의 PASS로 재표현하지 마십시오.
## 금지사항 및 제출

원본 저장소·Git refs·PR·기존 Astra 보고서 수정/삭제/checkout/reset/clean/add/commit/push/merge 금지. 실사용 파일·개인 메모리·Keychain·키·토큰·터널·launchd·P8 Stable·Business v2 Canary·M16·STABLE-001을 변경하거나 재지정하지 마십시오. 실제 Personal Business 앱 등록·배포·실사용 대상 장애 주입·경합·비밀값 출력 금지. 실행이 제한되면 다른 경로로 우회하지 마십시오.

**새 0700 산출물 폴더 (없을 때 생성):**
`/Users/macstudio/CodexReview/chatagent-personal/3f9a4a824d7b39f8d8129a9b0636714850241e70-f02-r1-1-semantic-rereview/`
기존 경로가 존재하면 새 고유 접미사 폴더를 사용하십시오. 기존 자료는 보존합니다.

다음 **네 파일을 실제 생성**하십시오.
1. `00_EXECUTIVE_SUMMARY.md` — F02-R1.1 판정 및 32/33-tool 영향.
2. `01_F02_R1_1_SEMANTIC_REREVIEW_REPORT.md` — S01~S10 항목별 판정과 증거.
3. `02_REMAINING_FINDINGS.md` — 중복 없는 P0/P1/P2, 잔여·신규 결함과 최소 수정.
4. `03_GATE_DELTA_AND_NEXT_STEPS.md` — 이전 FAIL 대비 변화, F03/F04 및 실사용 선행조건.

F01의 실제 HTTP split은 UNVERIFIED, F03·F04는 OPEN, 선택적 백업은 별도 범위입니다. 이번 한정 검토만으로 제품 전체 승인·베타 시작을 선언하지 마십시오. 완료 시 고정 SHA, **생성된 파일 4개의 절대 경로**, 검증·미검증, 판정과 잔여 P0/P1/P2를 사용자에게 요약하고 **최종 결정과 다음 지시를 기다리십시오**.
