# Codex Astra — F04 한정 독립 재검토 실행 프롬프트 (붙여넣기용)

당신은 ChatAgent Personal의 구현 담당자와 분리된 **독립 코드·복구 무결성 검토자**입니다. 이번 요청은 F04, 즉 비동기 복사의 예약 copy record와 원래 durable process action 사이 `processId` 복구 연결만 독립 재검토하는 것입니다. 원본 코드 수정, PR 승인, 등록·배포 또는 전체 제품 승인을 지시하지 않습니다.

**우선 아래 핸드오프 문서 전체를 읽고 그 범위·금지사항에 따르십시오:**
`/Users/macstudio/dev/personal/chatagent-personal/docs/handoff/PERSONAL_ASTRA_F04_REREVIEW_HANDOFF_20260921.md`

- Private repo: `exobiz7/chatagent-personal` / [Draft PR #5](https://github.com/exobiz7/chatagent-personal/pull/5)
- **검토 고정 구현 SHA: `17b186d679711ddc66ac1aa4152eb2a7733cfacc`**
- 직전 브랜치 SHA: `764f297bd148dd54d4983d223bff0166a6dd8632` (문서 전용)
- 직전 독립 구현 SHA: `3f9a4a824d7b39f8d8129a9b0636714850241e70` (F02-R1.1 PASS)
- 원본 경로 (조회 전용): `/Users/macstudio/dev/personal/chatagent-personal`
- 최초 F04 독립 지적: `/Users/macstudio/CodexReview/chatagent-personal/90f1b89cb71b247a768e589fdc7987f6a6835d1c-static-n78czyco/02_FINDINGS_AND_REPRO.md`
- 이번 개발자 증거: `docs/verification/PERSONAL_F04_ASYNC_COPY_RECONCILIATION_20260921.md`

핸드오프와 프롬프트가 **후속 문서 전용 커밋**에 있더라도 감사 대상 코드는 반드시 위 구현 SHA에 고정하십시오. 브랜치 HEAD로 임의 갱신하지 마십시오.
## 검토 지시

1. 이전 F04 P1 보고서의 실패 창과 기대 계약을 읽고 `async-copy-jobs.mjs` 및 `l6-b05-async-copy-test.mjs`의 정확한 SHA 차이를 검토하십시오.
2. 같은 key/원 경로/원 source SHA와 봉인된 action digest·nonce·stage UUID·processId가 일치할 때만 기존 ID를 연결하는지 확인하십시오. 원본 source dev/ino를 복구 과정에서 새로운 값으로 교체하거나 실행자를 재생성하지 않는지도 검토하십시오.
3. 독립 조건별로 판단하십시오: (a) action 없는 예약, (b) 봉인된 action은 있지만 config/runner 미생성, (c) detached runner 시작 후 copy ID binding 전 중단, (d) 이전 형식 기록, (e) 불일치하는 action/config, (f) 바인딩 저장 실패, (g) runner 상태 미확정. 새 효과의 무단 replay, 임의 프로세스 소유권 확장, 부당한 EXITED/COMMITTED 주장이 없어야 합니다.
4. `durable-host-processes.mjs`, `broker-core.mjs`, `async-file-copy-worker.mjs`와 교차 검증하고 status/read/stop, terminal-only stage 검사·정리 조건, 기존 정상 copy·거부·non-replay 동작을 대조하십시오.
5. 핸드오프의 **R01~R12 각 항목**을 PASS/FAIL/UNVERIFIED로 판정하십시오. 독립 실행한 테스트와 개발자가 보고한 34/34 및 CI 증거를 명확히 분리하고 파일:행 근거와 잔여 제한을 기재하십시오.

개발자 증거: 격리 native helper·detached runner를 사용한 복구 fixture PASS, 최종 로컬 전체 **34/34 PASS**, 동일 구현 SHA macOS [Push CI 35611059519](https://github.com/exobiz7/chatagent-personal/actions/runs/35611059519) 및 [PR CI 35611063400](https://github.com/exobiz7/chatagent-personal/actions/runs/35611063400) SUCCESS. **실제 broker SIGKILL/전원·디스크 장애, Business E2E의 증거는 아닙니다.**
## 작업·데이터 안전 및 필수 결과물

원본 repo/파일·Git refs·PR·기존 Astra 보고서를 수정·삭제·checkout/reset/clean/add/commit/push/merge하지 마십시오. 원본에서 정적 조회만 수행하고, 실행이 허용되면 자신 소유의 새 0700 독립 클론과 개인 데이터가 없는 fixture에서 정확한 SHA로 순수/격리 테스트만 실행하십시오. 실사용 파일·메모리·Keychain·자격증명·터널·launchd·P8 Stable·Business v2 Canary·M16·STABLE-001 및 Personal Business 앱에 접근·변경·등록·배포하지 마십시오. 운영 대상 실제 장애 주입, 경합, 삭제, 비밀값 출력 금지. 제한된 작업은 우회하지 말고 UNVERIFIED로 보고하십시오.

새 폴더 `/Users/macstudio/CodexReview/chatagent-personal/17b186d679711ddc66ac1aa4152eb2a7733cfacc-f04-rereview/`가 없을 때만 mode 0700으로 만들고 네 보고서를 생성하십시오. 이미 있으면 고유 접미사의 새로운 폴더를 사용합니다.

1. `00_EXECUTIVE_SUMMARY.md` — F04 판정(정적/독립 실행 범위), 32/33-tool 영향, 사용자 결정 사항.
2. `01_F04_REREVIEW_REPORT.md` — R01~R12 개별 PASS/FAIL/UNVERIFIED, 소스:행, 실제 명령·독립 증거·한계.
3. `02_REMAINING_FINDINGS.md` — 중복 없는 P0/P1/P2, F03 기존 OPEN 및 신규 결함, 최소 수정·제한.
4. `03_GATE_DELTA_AND_NEXT_STEPS.md` — 이전 F04 OPEN 대비 변화, 32/33별 남은 선행조건과 사용자 결정.

F02-R1.1은 코드/mock 범위의 기존 PASS; F03은 P1 OPEN; F01 실제 HTTP split과 Business E2E 등은 UNVERIFIED; 선택적 백업은 별도 수용입니다. 이번 독립 재검토만으로 전체 제품 승인이나 베타 시작을 선언하지 마십시오.

완료 시 **고정 구현 SHA, 실제 생성한 네 보고서 절대 경로, 독립 검증·미검증, F04 판정, 잔여 P0/P1/P2 및 기능별 게이트**를 사용자에게 제출하고 사용자 최종 결정·다음 지시를 기다리십시오.
