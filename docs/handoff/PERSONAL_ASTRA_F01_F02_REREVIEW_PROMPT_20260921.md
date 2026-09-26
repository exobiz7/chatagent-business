# Codex Astra — F01/F02 변경분 독립 재검토 프롬프트 (붙여넣기용)

당신은 ChatAgent Personal의 **구현 담당자와 분리된 독립 코드 품질·데이터 무결성 검토자**입니다. 이전 정적 감사에서 발견된 F01(UTF-8 입력 손상)과 F02(파일 작업 후 효과 상태의 불확실성)에 대한 수정만 재검토하십시오. 이 요청은 코드 수정·배포·승인 요청이 아닙니다. 최종 승인자는 사용자입니다.

**먼저 전체 핸드오프를 읽으십시오.**

`/Users/macstudio/dev/personal/chatagent-personal/docs/handoff/PERSONAL_ASTRA_F01_F02_REREVIEW_HANDOFF_20260921.md`

- Private repo: `exobiz7/chatagent-personal` / Draft PR #5: https://github.com/exobiz7/chatagent-personal/pull/5
- **고정 소스 SHA:** `8465c12c28f4aeb835ab0bfaf739d7a814376e44`
- 이전 독립 감사 SHA: `90f1b89cb71b247a768e589fdc7987f6a6835d1c`
- 원본 경로: `/Users/macstudio/dev/personal/chatagent-personal` (조회 전용).
- 이전 감사 산출물: `/Users/macstudio/CodexReview/chatagent-personal/90f1b89cb71b247a768e589fdc7987f6a6835d1c-static-n78czyco/`
- 개발자 변경·테스트 기록: `docs/verification/PERSONAL_F01_F02_REMEDIATION_20260921.md`

핸드오프 자체가 문서 전용 후속 커밋에 있어도 **검토 소스 SHA는 위 값으로 고정**하십시오. HEAD가 다르다는 이유만으로 범위를 변경하지 마십시오.
## 수행할 재검토

1. 이전 감사의 F01/F02 원문을 읽고, 두 SHA 사이의 실제 코드 diff와 테스트 추가 내용을 독립적으로 확인하십시오. 변경이 직접 영향을 주는 호출 체인만 따라가되, F03·F04는 해결됐다고 추정하지 마십시오.
2. **F01:** L0와 L1에서 HTTP 청크별 문자열 변환이 제거됐는지, raw Buffer의 바이트 제한과 엄격한 UTF-8·JSON 처리가 옳은지, 일반 요청과 텍스트 파일 요청의 제한이 적절히 분리됐는지 검토하십시오. 한국어·emoji·경로·인수·메모리의 데이터 무결성을 확인하고, 미검증 경로를 표시하십시오.
3. **F02:** CAS helper 이후 관측(open/stat/read/close) 실패, 완료 후 감사 저장 실패, 작업 실패와 실패 감사 저장의 이중 실패가 각각 어떤 code/effect/retryable/audit로 전달되는지 검토하십시오. L1과 L0를 거쳐 MCP `structuredContent`에서 상태가 보존되는지 확인하십시오. 비반복 계약을 약화시키지 마십시오.
4. 핸드오프의 **U01~U05, E01~E06, G01** 각 항목을 PASS / FAIL / UNVERIFIED로 판정하십시오. 소스 파일:행, 이전 대비 차이, 본인이 실제 실행한 검증과 개발자의 기존 증거를 분리하여 기록하십시오.
5. 사용자가 소유한 테스트 전용 데이터에서만 허용된 범위의 기능 검증을 수행할 수 있습니다. 과거 추가 안전 검사로 차단되었던 작업을 다른 경로로 우회하지 마십시오. 새 소켓 청크 분할 또는 실제 장애 실험이 허용되지 않으면 정적 검토를 완료하고 해당 실행 항목은 UNVERIFIED로 남기십시오.

**검증 사실:** 개발자 로컬 `npm test` 33/33 PASS, 동일 SHA macOS Push CI `35564200755` 및 PR CI `35564375860` SUCCESS. 다만 의도적 실제 HTTP 분할 전송과 실제 디스크/전원 손실의 검증을 완료했다는 주장은 금지합니다.
## 금지사항·산출물·최종 보고

**원본 코드·문서·Git 작업 트리·PR 수정/삭제/checkout/reset/clean/commit/push 금지.** 기존 감사 폴더와 결과물을 덮어쓰거나 삭제하지 마십시오. P8 Stable, Business v2, M16, 실제 업무 데이터·개인 메모리·키·토큰·터널·launchd·운영 서비스·앱을 접근하거나 변경하지 마십시오. 임의의 외부 네트워크 테스트나 실제 배포·등록·병합을 수행하지 마십시오.

쓰기 및 허용된 테스트는 자신이 새로 만든 0700 독립 복사본·격리 fixture·새 산출물 폴더에 한정합니다. 실행 권한이 차단되면 우회하지 않고 UNVERIFIED와 제한 사유를 기록하십시오. 수정 제안은 보고서에만 남기고 코드를 적용하지 마십시오.

**다음 신규 산출물 4개를 실제로 생성하십시오.** 권장 경로는 `/Users/macstudio/CodexReview/chatagent-personal/8465c12c28f4aeb835ab0bfaf739d7a814376e44-f01-f02-rereview/`입니다. 이미 해당 경로가 있으면 별도 고유 이름을 사용하십시오.

- `00_EXECUTIVE_SUMMARY.md`: 보스용 핵심 요약, F01/F02 상태와 32/33-tool 베타에 미치는 영향.
- `01_F01_F02_REREVIEW_REPORT.md`: 체크리스트 개별 판정과 코드·검증 증거.
- `02_REMAINING_FINDINGS.md`: 미해결·신규 결함과 최소 수정 제안, F03/F04 별도 OPEN 유지.
- `03_GATE_DELTA_AND_NEXT_STEPS.md`: 이전 감사 대비 게이트 변경 가능 범위, 다음 검증, 사용자 승인 조건.

마지막에는 실제 파일 4개 절대 경로, 고정 SHA, F01/F02별 PASS·FAIL·UNVERIFIED 및 남은 P0/P1 건수, 32/33-tool 기능별 검토 의견을 간결히 보고하십시오. **이 재검토만으로 제품 전체 승인이나 베타 시작을 선언하지 말고 사용자의 최종 결정과 다음 지시를 기다리십시오.**
