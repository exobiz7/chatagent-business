# New-session bootstrap prompt — ChatAgent Personal AIspace Business E2E

이번 세션부터 `chatagent-personal`의 **감사/수퍼바이저 역할**을 이어받아라.

먼저 맥스튜디오의 아래 핸드오프를 읽고, 그 내용의 핵심 상태를 실제 현재 상태와 대조 확인하라.

`/Users/macstudio/dev/personal/chatagent-personal/docs/handoff/PERSONAL_AISPACE_BUSINESS_E2E_SESSION_HANDOFF_20260925.md`

중요 운영 조건:

- repo: `exobiz7/chatagent-personal`
- branch: `feature/personal-c1-bounded-cleanup`
- Draft PR #5 유지. merge 금지.
- beta start / production deploy 금지.
- 기존 P8 Stable / Business v2 Canary / M16 / STABLE-001 변경 금지.
- 별도 AIspace private Personal candidate만 사용.
- candidate root:
  `/Users/macstudio/ChatAgentPersonalCandidate/personal-g1-P7VfXK`
- host effect는 `fixture-work` 안의 disposable E2E 데이터에만 제한.
- 32-tool Core 유지. `local_replace_file` / 33-tool CAS 활성화 금지.
- 비밀값을 채팅·Git·로그에 출력하지 말 것.
- 안전 차단이 발생하면 다른 동등 명령으로 우회하지 말 것.
- F03 final check→rename concurrency window는 OPEN 상태로 유지.
- 사용자가 직접 새 owner passphrase를 설정했다. 그 값을 요청하거나 출력하지 말 것.

현재 E2E는 다음까지 완료된 것으로 핸드오프되어 있다.

1. 실제 Business `local_access_status` ASK 상태 PASS.
2. ASK 상태 `local_create_file` 거부 PASS.
3. 사용자가 owner passphrase를 직접 재등록하고 FULL_HOST 활성화.
4. 실제 Business FULL_HOST 상태 PASS.
5. 실제 create → read → SHA-256 PASS + Mac 독립 검증 PASS.
6. 실제 async copy + 동일 idempotency key 재호출 PASS + Mac 독립 검증 PASS.
   단, terminal EXITED 후 status를 3회 더 읽은 테스트 절차 편차 1건 존재.
7. host process E2E는 Mac-side evidence가 이미 존재:
   - key `366fcbd2-a4b3-4bc3-9b07-062d56a7b0ce`
   - processId `bd5a7238-8204-46c8-8f9d-61d5542e320d`
   - `EXITED`, exitCode 0
   - output `CHATAGENT_PERSONAL_EXEC_E2E_20260925`
   하지만 이전 감독 채팅에는 **AIspace Business 측 실제 반환 보고가 아직 붙지 않았다**.

세션 시작 시 우선 다음만 하라.

1. repo HEAD/worktree, owner mode, L1/L0/tunnel running/ready 상태를 읽기 전용으로 재검증.
2. 핸드오프와 실제 상태가 다르면 실제 상태를 우선하고 차이를 보고.
3. host process E2E의 AIspace Business 반환 결과가 사용자에게 이미 있으면 먼저 받아서 검증을 닫는다.
4. 결과가 없다면 기존 processId에 대한 read-only status/read와 **완전히 동일한 idempotency key의 동일 start**만 사용해 Business 측 idempotency evidence를 닫는다. 새 프로세스를 만들거나 다른 key를 쓰지 않는다.
5. 그 다음 disposable Personal Memory E2E로 진행한다. 정확한 tool schema를 먼저 확인하고 production/user data를 사용하지 않는다.
6. host-effect 검증이 끝나면 FULL_HOST를 ASK로 되돌리고 실제 Business `local_access_status`로 파일/프로세스 접근 비활성화를 확인한다.
7. 최종 verification/closure 문서를 작성하되 PR은 Draft, beta는 HOLD로 유지한다.

불필요하게 처음부터 다시 감사하거나 이미 PASS한 단계를 반복하지 말고, 핸드오프의 **현재 edge부터** 이어가라.
