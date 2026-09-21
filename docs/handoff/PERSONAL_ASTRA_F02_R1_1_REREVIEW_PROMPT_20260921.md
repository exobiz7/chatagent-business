# Codex Astra — F02-R1.1 한정 독립 재검토 프롬프트 (붙여넣기용)

당신은 ChatAgent Personal의 **구현 담당자와 분리된 독립 코드·데이터 무결성 검토자**입니다. 이번 요청은 이전 Astra가 지적한 F02-R1.1의 파일 mutation 응답 envelope 보완만 재검토하는 작업입니다. 소스·PR 수정이나 배포·승인을 지시하지 않습니다. 사용자가 보고서를 검토하여 최종 수용 여부를 결정합니다.

**먼저 아래 핸드오프 전체를 읽으십시오.**
`/Users/macstudio/dev/personal/chatagent-personal/docs/handoff/PERSONAL_ASTRA_F02_R1_1_REREVIEW_HANDOFF_20260921.md`

- Private repo: `exobiz7/chatagent-personal`; Draft PR #5 https://github.com/exobiz7/chatagent-personal/pull/5
- **검토 고정 소스 SHA:** `2e0ca38202282cf4b0de26e2347a0b71611c6034`
- 직전 Astra 검토 SHA: `70c6858b70a12b3cd8037b9ec1c67bf38f519ce8`
- 원본 저장소: `/Users/macstudio/dev/personal/chatagent-personal` (읽기 전용).
- 이전 Astra 결과: `/Users/macstudio/CodexReview/chatagent-personal/70c6858b70a12b3cd8037b9ec1c67bf38f519ce8-f02-r1-rereview/`
- 이번 개발 기록: `docs/verification/PERSONAL_F02_R1_1_RESPONSE_ENVELOPE_20260921.md`

핸드오프가 후속 문서 커밋에 있더라도 **감사 대상은 위 소스 SHA로 고정**하십시오. 이동하는 브랜치 HEAD로 임의 변경하지 마십시오.
## 수행 범위

1. 이전 보고서의 F02-R1.1 발견 사항과 정확한 SHA간 코드를 비교하십시오. `scripts/l1/l1-file-transport.mjs`의 네 파일 변경 route에서 정상 receipt 및 실패 envelope 검증을 직접 검토하십시오.
2. 빈 객체, 무관한 객체, 필드 누락·타입 오류, 불완전한 code/effect/retryable/audit 및 모순된 응답을 받으면 `L1_MUTATION_RESPONSE_UNCERTAIN`, `effect=UNCERTAIN`, `retryable=false`가 되는지 확인하십시오. 실제 파일 효과가 발생했는지는 추정하지 마십시오.
3. 실제 L1의 성공 receipt 구조를 `host-file-ops.mjs`, `native-create-only.mjs`, `native-replace-cas.mjs`와 대조해 정상 경로를 오거부하지 않는지 검토하십시오. 명확한 사전 거부, 기존 `COMMITTED`/`UNCERTAIN`, 추가 `commitMode` 및 `audit` 상태를 보존하는지 확인하십시오.
4. L0 `brokerCall`·`toolError` → MCP `structuredContent`까지 전달되는지 코드상 확인하고, 실제 실행하지 않은 통합 경로는 `UNVERIFIED`로 남기십시오. read-only·process·async-copy route를 파일 mutation 효과로 표시하지 마십시오.
5. 핸드오프의 **V01~V10 전 항목**을 PASS / FAIL / UNVERIFIED로 판정하십시오. 개발자 증거와 직접 확인한 증거를 별도로 기록하고, 발견 사항은 파일:행·재현 조건·영향·최소 수정 제안으로 설명하십시오.

개발자 증거: 로컬 전체 **34/34 PASS**, 같은 SHA의 macOS Push CI `35574127600`와 PR CI `35574131631` 모두 SUCCESS. 이는 기존 격리 테스트와 mock 기반 응답 검증이며 실제 malformed wire-response/소켓 장애/Business E2E의 증거는 아닙니다.
## 권한·결과물·종료조건

원본 저장소의 파일·Git refs·PR 변경/삭제/이동/checkout/reset/clean/add/commit/push/merge 금지. 기존 감사 폴더 수정·삭제 금지. 실사용 파일·프로젝트 메모리·키·토큰·터널·launchd 및 P8 Stable·Business v2 Canary·M16 서비스 접근·재지정 금지. 실제 Personal Business 앱 등록·배포·운영 장애 주입 금지. 비밀값·실데이터 보고 금지. 안전 검사로 실행이 차단되면 다른 경로로 우회하지 마십시오.

우선 읽기 전용 정적 검토를 수행하고, 허용되는 독립 검증만 **새 0700 임시 클론·fixture**에서 고정 SHA로 수행하십시오. 실행 불가 항목은 이유와 함께 `UNVERIFIED`로 보고하고 원본 코드는 수정하지 마십시오.

**새 산출물 폴더:** `/Users/macstudio/CodexReview/chatagent-personal/2e0ca38202282cf4b0de26e2347a0b71611c6034-f02-r1-1-rereview/` (없으면 0700으로 생성; 이미 존재하면 다른 신규 고유 경로).
- `00_EXECUTIVE_SUMMARY.md` — 사용자용 핵심 요약, 기능별 베타에 미치는 영향.
- `01_F02_R1_1_REREVIEW_REPORT.md` — V01~V10 각 PASS/FAIL/UNVERIFIED, 코드·테스트 증거.
- `02_REMAINING_FINDINGS.md` — P0/P1/P2, 남은 결함 및 재현/미검증, 최소 수정.
- `03_GATE_DELTA_AND_NEXT_STEPS.md` — F02-R1.1 이전 대비 변경, 32/33-tool 별 남은 조건.

F01의 실제 HTTP split은 UNVERIFIED, F03·F04는 OPEN, 선택적 백업은 별도 수용입니다. 이번 재검토만으로 전체 독립 감사나 베타 승인을 선언하지 마십시오. 마지막에는 정확한 검토 SHA, 실제 4개 파일의 절대 경로, 직접 실행한 검증·미검증, F02-R1.1 판정과 남은 P0/P1/P2를 요약하여 제출하고 **사용자 승인·다음 지시까지 대기하십시오**.
