# Personal Business 후보 — 실사용 E2E 별도 승인 패킷

Date: 2026-09-23 KST. Status: **PREPARED, NOT AUTHORIZED / NOT REGISTERED**. Relevant branch: `feature/personal-c1-bounded-cleanup`, Draft PR #5. Pin implementation SHA to the corresponding G1 SDK-client evidence commit before any future actual candidate test.

## 목표·테스트 범위
별도의 **새 Personal 전용 private Business 앱 후보**에서 실제 채팅이 32-tool discovery 및 소유자 승인된 시험용 파일·프로세스·개인 메모리 효과를 실행하는지 확인한다. 새 Personal 후보를 P8 Stable, Business v2 Canary, M16, STABLE-001과 독립된 개발 프로필로 취급한다. 기존 앱 교체·마이그레이션·PR merge·베타 시작을 포함하지 않는다.

| 승인 전에 정할 항목 | 승인될 때만 수행할 조치 |
|---|---|
| 연결할 Business workspace/계정 및 앱 후보명 | **새 private Personal 후보 한 개만** 생성. 기존 앱 설정/URL/secret 변경 금지 |
| 독립 Personal 인증·프로세스·라우팅 계획 | 신규 0700 Personal state, 별도 L1/L0 token, 별도 loopback ports, 독립 tunnel/connector endpoint 및 폐기·회수 경로 |
| 시험 데이터 | 임의 생성한 0700 임시 루트와 fixture 파일/프로젝트만. 실제 개인/업무 문서·기존 동기화 경로 접근 금지 |
| Owner 승인·종료 | 별도 명시된 FULL_HOST 진입, 테스트 종료 후 회수/비활성화 절차. 무단 permission 상승·실서비스 활성화 금지 |

실행은 **명시적 사용자 승인 이후**로 제한한다. 승인 없이 credential 또는 tunnel을 생성·재사용하거나 새 앱을 등록하지 않는다.
## 승인 후 실행할 게이트 (모두 독립 증거 기록)
1. 프로세스·포트·state·키·앱 ID가 기존 제품과 겹치지 않는지 사전 점검. 사용할 소스 SHA, native helper build/pin, L0/L1 flags와 `PERSONAL_CORE_TOOLS=1`을 기록하고 32개 이름을 정확히 확인한다. 33번째 CAS는 OFF.
2. 실제 ChatGPT Business 채팅에서 `local_access_status` 및 32개 `tools/list`를 확인한다. owner 승인 없이 mutation 되지 않는지 확인하고 정해진 FULL_HOST 시험만 허용한다.
3. 시험 전용 새 파일 create/read/hash, owner-scoped `personal_project_register`·task/checkpoint/context, owned executable `local_exec_start/status/read`의 원 processId 및 결과를 확인한다.
4. 임시 원본 SHA를 고정한 native `local_async_copy_start`에 **새 destination**을 사용하고 status/read/final SHA 확인. 같은 key는 새 copy를 실행하지 않고 원 ID만 반환해야 한다. 실패/RECOVERY_REQUIRED는 재시도하지 말고 원 ID로 조회·수동 판단한다.
5. negative: 잘못된 SHA, 기존 destination, 보호된 state 경로 및 무단 도구/권한 등은 새 effect 없이 거부돼야 한다. 응답의 source/provenance와 `UNCERTAIN`·`retryable:false` 전달을 확인한다.
6. 기록·검증 후 private 앱·독립 터널·키를 **사용자 승인된 방법으로** 비활성화·회수한다. fixture 데이터 처리도 경로/소유 inode를 검증하여 수행한다. 보존할 감사 결과는 자격증명과 분리한다.

**중지 조건:** 도구 개수나 설명 불일치, 예상치 못한 접근, 변경된 SHA, 반복된 RECOVERY_REQUIRED, 이전 효과의 결과 불확실성, 테스트/실사용 root 혼동, 불명확한 삭제·재시도. 즉시 추가 mutation을 중지하고 owner에게 현재 사실만 보고한다.

## 미검증 유지와 결론
- 이 문서 자체가 실제 Business 연결을 증명하지 않는다. F01 real HTTP split, 실제 운영 disk/power/SIGKILL, 동시 client 및 F03의 check→rename race는 별도 미검증이다.
- 33-tool CAS는 이 게이트에서 활성화하지 않으며, 향후 owner가 **비경합·복구 가능 파일과 metadata 한계**를 명시적으로 수용한 경우에만 별도 시험.
- 승인 전 상태: 등록·배포 없음, 기존 앱 불변, PR #5 Draft, 베타 HOLD. 승인 후에도 실제 통합 결과를 검토하기 전 전체 제품 승인 금지.
