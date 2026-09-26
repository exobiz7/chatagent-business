# ChatAgent Personal — 별도 Business 후보의 맥스튜디오 로컬 준비 상태

Date: 2026-09-24 KST. Source SHA: `f91eea57269340f55240a2ac760a0f536e99c770`. 사용자 승인: 별도 private Personal Business 후보 한 개와 시험용 데이터만 사용한 E2E. 이 문서는 새 후보의 **로컬 준비 증거**이지 ChatGPT Business 앱 생성·실제 채팅 E2E 성공 보고가 아니다.

## 실제로 수행한 일
- 별도 새 owner-private root 생성: `/Users/macstudio/ChatAgentPersonalCandidate/personal-g1-P7VfXK` (0700). 원본 repo, P8 Stable, Business v2 Canary, M16 및 STABLE-001의 루트·포트·자격증명과 공유하지 않도록 신규 하위 디렉터리 `broker-state`, `memory-state`, `secrets`, `bin`, `fixture-work`, `logs` 사용.
- 0600 신규 독립 L1 agent key, L0 MCP key, local owner passphrase를 생성해 파일로만 보관. 값은 로깅·PR·챗에 기록하지 않음. 새로운 L1 broker 초기화·pair는 완료했지만 **FULL_HOST 활성화하지 않음**.
- 네이티브 create-only/copy 헬퍼 2개를 후보 전용 0700 bin에 빌드하고 SHA-256을 전용 `CANDIDATE_SETUP_MANIFEST.json`에 기록. Native CAS는 32-tool core에서 OFF, 기본 노출은 `PERSONAL_CORE_TOOLS=1`.
- 후보 manifest를 다시 읽어 owner/mode, 세 개의 secret 0600, 별도 디렉터리 0700, native SHA 2건, paired but not FULL_HOST를 확인: **`PREPARED_LOCAL_CANDIDATE_PREFLIGHT=PASS`**. 설치된 `tunnel-client` 버전은 `0.0.14+0f870e50`으로 확인. 현재 실행 쉘에는 새 tunnel ID 및 runtime key 없음.

## 미착수/차단
- **L0/L1 리스너를 시작하지 않음, Secure MCP Tunnel 연결하지 않음, ChatGPT Business 앱 생성·도구 스캔·실제 채팅 E2E 수행하지 않음.** 앱 초안, 앱 ID, tool scan 성공 또는 베타 승인을 주장하지 않는다. 기존 tunnel/credentials 재사용 금지.
- 후속 의존 사항: 사용자가 **대상 Business workspace(관리자/소유자)**를 지정하고, 그 workspace에 연결된 **새 Secure MCP Tunnel ID**와 독립 tunnel runtime key를 로컬에서 제공해야 한다. 비밀 키·owner passphrase는 채팅·GitHub에 붙여넣지 않는다. 새 터널 생성 권한·workspace association도 확인한다.
- 연결 구성 시 loopback L0 MCP endpoint `/mcp`로만 라우팅하며, tunnel-client의 MCP 전용 `extra_headers` 및 `discovery_extra_headers`에 **로컬 파일 참조** 형태로 독립 `x-chatagent-l0-credential`을 주입한다. OpenAI control-plane key와 L0/L1 키의 역할을 분리하고, public ingress/ngrok·기존 앱 tunnel 경유를 허용하지 않는다.
- 사용자 지정 Business workspace 선택과 새 Platform tunnel 권한 확인 후 로컬 리스너/터널 health → draft app Scan Tools 32 → 실제 owner-approved disposable chat effects → 종료·비활성화 순으로 진행한다. 33-tool은 OFF. `RECOVERY_REQUIRED`/UNCERTAIN은 같은 원 ID 조회·무반복.
- F01 실제 HTTP split 및 물리 장애·동시 client·F03 마지막 check→rename 경쟁은 여전히 UNVERIFIED/OPEN. PR #5 Draft; 소스 기능 변경 없음.
