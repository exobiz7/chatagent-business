# Codex Astra — F04-R1 한정 독립 재검토 실행 프롬프트 (붙여넣기용)

당신은 ChatAgent Personal 구현 담당자와 분리된 **독립 코드·복구 무결성 검토자**입니다. 이번 요청은 이전 Astra가 FAIL로 판정한 **legacy config의 실제 실행 내용과 봉인된 action intent 불일치 허용** 문제에 대한 수정만 독립 재검토하는 작업입니다. 원본 수정·PR 승인·등록·배포·전체 제품 승인을 지시하지 않습니다. 사용자가 검토 결과를 바탕으로 최종 수용 여부를 결정합니다.

**먼저 다음 핸드오프 문서 전체를 읽으십시오.**
`/Users/macstudio/dev/personal/chatagent-personal/docs/handoff/PERSONAL_ASTRA_F04_R1_REREVIEW_HANDOFF_20260922.md`

- Private repo: `exobiz7/chatagent-personal`; Draft PR #5: https://github.com/exobiz7/chatagent-personal/pull/5
- **이번 고정 구현 SHA: `fc518c70693e570c54dedd41afb2190653627235`**
- 직전 Astra 검토 구현 SHA: `17b186d679711ddc66ac1aa4152eb2a7733cfacc`
- 원본 저장소 (조회 전용): `/Users/macstudio/dev/personal/chatagent-personal`
- 이전 Astra 결과: `/Users/macstudio/CodexReview/chatagent-personal/17b186d679711ddc66ac1aa4152eb2a7733cfacc-f04-rereview/`
- 이번 구현자 증거: `docs/verification/PERSONAL_F04_R1_LEGACY_CONFIG_INTENT_20260922.md`

핸드오프와 이 프롬프트는 이후 **문서 전용 커밋**으로 저장됩니다. 감사 대상은 반드시 위 고정 구현 SHA이며 브랜치 최신 HEAD가 아닙니다.
## 수행 범위

1. 이전 `02_REMAINING_FINDINGS.md`의 F04-R1 원인·11개 불일치 수용 사례를 확인하고, 두 구현 SHA 사이 `scripts/l1/async-copy-jobs.mjs`와 `scripts/l1/l6-b05-async-copy-test.mjs`의 정확한 변경을 독립적으로 검토하십시오.
2. legacy `config.json`에서 읽은 **실제** `executable`, `argv`, `cwd`, `timeoutMs`의 타입·형태를 검증하고, 이를 봉인된 `action.digest`와 직접 대조한 뒤, 원래 copy 예약으로 재구성한 intent도 별도로 대조하는지 검증하십시오. `durable-host-processes.mjs`가 실제 사용한 digest 키 순서와 일치하는지 교차 확인하십시오.
3. 변경된 실행 파일/작업 디렉터리/시간 제한, worker/helper/helper SHA/source/destination/source SHA/size/stage argv, 누락·타입 오류, dev/ino 및 nonce 불일치가 **원 copy processId 연결·ASYNC_COPY_RECONCILED 저장 전에 거부**되는지 직접 확인하십시오. 원 config를 실행하는 테스트는 금지합니다.
4. 정상 legacy 및 신규 예약이 원래 sealed processId에만 연결되는지, no-action·pre-config·post-launch 중단·save failure·runner RECOVERY_REQUIRED 및 stage 권한·terminal gate가 유지되는지 확인하십시오. 임의 새 실행·효과 발생·종료를 추정하지 마십시오.
5. 핸드오프의 **L01~L12 전 항목**을 PASS/FAIL/UNVERIFIED로 판정하십시오. 파일:행과 재현 조건을 명시하고 자신이 직접 실행한 것, 개발자 테스트·CI 메타데이터, 실행하지 않은 것을 분리하십시오. 기존 문제 해결과 다른 신규 결함을 중복 집계하지 마십시오.

개발자 증거: legacy 변조 **18조건 거부**, intact config 동일 ID 회복, 최종 격리 테스트 PASS, 전체 `npm test` **34/34 PASS**. 동일 구현 SHA macOS [Push 35677975755](https://github.com/exobiz7/chatagent-personal/actions/runs/35677975755) 및 [PR 35677978208](https://github.com/exobiz7/chatagent-personal/actions/runs/35677978208) **SUCCESS**. 실제 SIGKILL·disk/power·live MCP/Business E2E의 증거로 확대하지 마십시오.
## 권한·필수 산출물·종료

원본 repo·Git refs·PR·기존 Astra 보고서에 변경·삭제·checkout/reset/clean/add/commit/push/merge를 하지 마십시오. 원본에서는 정적 조회만 수행하고, 가능하면 **신규 mode 0700 독립 클론·임시 fixture**에서 정확한 SHA의 격리 테스트만 실행하십시오. 실제 업무 파일·개인 메모리·Keychain·token·터널·launchd, P8 Stable·Business v2 Canary·M16·STABLE-001 및 Personal Business 앱 접근/등록/배포/조작 금지. 실사용 대상 장애 주입·동시 경합·삭제 및 비밀값 출력 금지. 실행 제한이 있으면 우회하지 말고 UNVERIFIED로 보고하십시오.

신규 산출물 권장 폴더:
`/Users/macstudio/CodexReview/chatagent-personal/fc518c70693e570c54dedd41afb2190653627235-f04-r1-rereview/`
폴더가 없을 때만 0700으로 생성하고, 존재한다면 별도의 고유 폴더를 생성하십시오. 기존 자료는 모두 보존합니다.

다음 **4개 파일을 실제 생성**하십시오.
1. `00_EXECUTIVE_SUMMARY.md` — F04-R1 판정, 검증 한계, 32/33-tool 영향.
2. `01_F04_R1_REREVIEW_REPORT.md` — L01~L12 각각 PASS/FAIL/UNVERIFIED와 소스:행·독립 증거.
3. `02_REMAINING_FINDINGS.md` — 잔여·신규 P0/P1/P2, F03의 별도 OPEN, 최소 수정/제한.
4. `03_GATE_DELTA_AND_NEXT_STEPS.md` — 직전 F04-R1 FAIL 대비 변경 및 32/33별 사용자 판단 사항.

F02-R1.1은 기존 코드·순수 계약 PASS이고 F03/CAS는 P1 OPEN입니다. F01 actual HTTP split, 실사용 L0/MCP/Business E2E, 물리적 장애는 UNVERIFIED이며, 선택적 오프라인 백업은 별도 수용입니다. 이번 한정 검토만으로 제품 전체 승인·베타 시작을 선언하지 마십시오.

마지막에는 **고정 구현 SHA, 실제 네 보고서의 절대 경로, F04-R1 판정, 직접 검증/미검증, 잔여 P0/P1/P2 및 32/33-tool 조건**을 사용자에게 제출하고 최종 결정과 다음 지시를 기다리십시오.
