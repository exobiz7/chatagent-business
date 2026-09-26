# Codex Astra — F02-R1 한정 독립 재검토 프롬프트 (붙여넣기용)

당신은 ChatAgent Personal의 **구현 담당자와 분리된 독립 기술·데이터 무결성 검토자**입니다. 이전 Astra 보고서의 F02-R1 및 읽기 감사 기록 회귀에 대한 수정분만 검토하십시오. 이 요청은 구현·배포·승인을 지시하지 않습니다. 사용자가 검토 산출물을 읽은 후 최종 승인 여부를 결정합니다.

**반드시 먼저 다음 핸드오프 전체를 읽으십시오.**

`/Users/macstudio/dev/personal/chatagent-personal/docs/handoff/PERSONAL_ASTRA_F02_R1_REREVIEW_HANDOFF_20260921.md`

- private repo: `exobiz7/chatagent-personal` / Draft PR #5: https://github.com/exobiz7/chatagent-personal/pull/5
- **이번 고정 소스 SHA:** `70c6858b70a12b3cd8037b9ec1c67bf38f519ce8`
- 직전 Astra 검토 SHA: `8465c12c28f4aeb835ab0bfaf739d7a814376e44`
- 원본 저장소 (조회 전용): `/Users/macstudio/dev/personal/chatagent-personal`
- 직전 Astra 보고서 (조회 전용): `/Users/macstudio/CodexReview/chatagent-personal/8465c12c28f4aeb835ab0bfaf739d7a814376e44-f01-f02-rereview/`
- 이번 구현 기록: `docs/verification/PERSONAL_F02_R1_REMEDIATION_20260921.md`

핸드오프 자체가 후속 문서 커밋에 존재해도 코드 검토 SHA는 위 값으로 고정하십시오. 브랜치 최신 HEAD를 임의로 새 감사 대상으로 채택하지 마십시오.
## 수행할 작업

1. 이전 보고서의 `02_REMAINING_FINDINGS.md` 중 F02-R1과 읽기 감사 회귀 부분을 읽고, 직전 SHA 대비 새 SHA의 변경 코드·테스트를 독립적으로 확인하십시오.
2. `scripts/l1/l1-file-transport.mjs` 및 실제 `scripts/l0-ui-probe.mjs` 호출을 검토하십시오. file/create·write·replace·개발용 copy에서 fetch 실패, JSON 해석 실패, 비정상 JSON 응답이 `effect=UNCERTAIN,retryable=false`로 전달되는지, 실제 실행 여부를 단정하거나 자동 재시도하지 않는지 확인하십시오.
3. 정상 수신된 L1 `COMMITTED`/`UNCERTAIN`, `audit=UNCERTAIN`, known refusal 및 성공 결과가 변경 없이 전해지는지 확인하십시오. 읽기·프로세스·비동기 작업 응답을 **파일 mutation 효과**로 오분류하지 마십시오.
4. `scripts/l1/file-effect-status.mjs`와 `broker-server.mjs`의 읽기/조회 성공·실패 감사 기록 복원이 실제 코드·테스트에 부합하는지 확인하십시오. 읽기 감사 저장 실패는 파일 내용 변경 성공이라고 판정하지 마십시오.
5. 핸드오프의 **T01~T12 전 항목**을 PASS / FAIL / UNVERIFIED로 판정하고 파일:행, 기준 SHA, 독립 증거 및 미검증을 명시하십시오. 기존 개발자의 PASS 및 CI 결과는 별도 참고 증거로 구분하십시오.
6. 허용되는 경우 새로 생성한 자기 소유의 0700 독립 임시 클론·fixture에서 선택된 **순수 계약 테스트**를 실행할 수 있습니다. 원본 파일이나 실제 네트워크·서비스·개인정보를 대상으로 장애를 주입하지 마십시오. 실행이 차단되면 우회하지 말고 UNVERIFIED로 표기하십시오.

개발자 증거: 로컬 `npm test` **34/34 PASS**, 동일 SHA macOS [Push 35569503294](https://github.com/exobiz7/chatagent-personal/actions/runs/35569503294)와 [PR 35569507201](https://github.com/exobiz7/chatagent-personal/actions/runs/35569507201) 모두 SUCCESS. 모의 transport 주입 성공을 실제 소켓 단절·전원 손실·Business 앱 E2E의 성공으로 확대하지 마십시오.
## 제한과 필수 결과물

**원본 저장소·소스·문서·Git refs·PR 수정/삭제/checkout/reset/clean/add/commit/push 금지.** 기존 감사 폴더 덮어쓰기·삭제 금지. 실제 업무 파일·개인 메모리·Keychain·자격증명·터널·launchd, P8 Stable·Business v2 Canary·M16·STABLE-001 서비스 및 Personal Business 앱에 접근하거나 설정을 바꾸지 마십시오. 비밀값·사용자 데이터는 출력하지 마십시오. 안전 검사로 허용되지 않은 테스트는 다른 방식으로 우회하지 마십시오.

새 산출물 폴더가 존재하지 않으면 mode 0700으로 만들고 다음 네 보고서를 작성하십시오:
`/Users/macstudio/CodexReview/chatagent-personal/70c6858b70a12b3cd8037b9ec1c67bf38f519ce8-f02-r1-rereview/`

1. `00_EXECUTIVE_SUMMARY.md` — 사용자용 결과와 32/33-tool에 미치는 영향.
2. `01_F02_R1_REREVIEW_REPORT.md` — T01~T12 PASS/FAIL/UNVERIFIED와 소스·테스트 증거.
3. `02_REMAINING_FINDINGS.md` — 미해결·신규 결함, P0/P1/P2, 최소 수정·제한 조건.
4. `03_GATE_DELTA_AND_NEXT_STEPS.md` — 이전 F02 FAIL 대비 변경, 기능별 잔여 게이트 및 사용자 결정 사항.

이미 이 폴더가 존재한다면 별도의 새 고유 접미사 경로를 사용하십시오. 이전 보고서와 원본 저장소에는 쓰지 마십시오. F01의 HTTP split E2E는 UNVERIFIED, F03·F04는 OPEN, 오프라인 백업은 별도 범위로 남기십시오. **이 한정 재검토만으로 제품 전체 승인·베타 시작을 선언하지 마십시오.**

마지막에는 실제 생성한 네 파일의 절대 경로, 검토 SHA, F02-R1 및 읽기 감사 복원의 판정, 잔여 P0/P1/P2와 미검증 항목을 간결히 보고하고 사용자의 최종 승인·다음 작업 지시까지 대기하십시오.
