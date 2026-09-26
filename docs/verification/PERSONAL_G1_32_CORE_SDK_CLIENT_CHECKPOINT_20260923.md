# ChatAgent Personal — G1 32-tool Core MCP SDK Client 검증

Date: 2026-09-23 KST. Base document HEAD: `b7115e5a598002f6f3b8462fee15b5506cd37f64`. This document and modified test will have one new implementation SHA; record it in PR #5 after commit. Product remains development / Draft.

## 목표와 변경 범위
- 실제 목표는 단일 소유자가 ChatGPT 채팅에서 macOS 파일·프로세스·개인 메모리 작업을 실행하는 것. 선행 [32/33 제한 수용 결정](../verification/PERSONAL_32_33_BOUNDED_DECISION_AND_NEXT_GATE_20260923.md)의 G1을 **Business 앱 구성 이전, 격리된 실제 MCP SDK 클라이언트 계약**까지 검증한다.
- `scripts/l1/personal-36-tool-candidate-test.mjs`의 기존 32-core fixture에 공식 `@modelcontextprotocol/sdk` `Client`와 `StreamableHTTPClientTransport`를 추가. 테스트 전용 127.0.0.1 L0와 generated 0600 token을 사용하여 client `initialize`, `listTools`, `callTool`을 검증한다. 같은 격리된 개인 L1/메모리/native helper를 사용한다.
- SDK 경유 32개 이름·create-only schema, 신규 파일 create/read/hash, 개인 프로젝트 등록, owned exec/status/read, 9MiB async hash/status/read/no-replay, 9MiB create-only copy/status/read/**same-key original processId**, 기존 대상 거부, owner-scoped stage inspect/cleanup을 확인한다. 종전 36개 개발 inventory/거부 fixture는 회귀 유지.
- `PERSONAL_CORE_TOOLS=1`은 L0 노출 프로필. 33rd `local_replace_file`은 이번 SDK 프로필에 없으며, F03 P1 제한 수용 대기와 분리한다. 인증·권한·실행 의미 변경 없음. 새 MCP 도구나 운영 자격증명 없음.

## 확인한 테스트
- 목표 테스트 `node scripts/l1/personal-36-tool-candidate-test.mjs`: **PASS**, SDK initialize/list/call, core hash/copy original-ID, owner stage and 기존 36 이름 검증; `isolated_fixture_cleanup=COMPLETE`.
- 최종 로컬 `npm test`: `PERSONAL_STANDALONE_SUITE=PASS count=34`, exit 0. 격리 macOS 테스트만 실행; 34 suites 그대로, 수정된 G1 계약은 기존 suite 안에 추가.
- 정확한 커밋 macOS Push/PR CI는 커밋 이후 조회하여 PR #5 기록에 고정한다.

## 검증되지 않은 경계
- **실제 ChatGPT Business가 연결한 Personal 앱의 `tools/list`·채팅 도구 실행은 여전히 UNVERIFIED.** MCP SDK 로컬 테스트는 실제 Business 앱 설치, 계정·클라우드 connector, tunnel, 사용자 승인 인터페이스의 증거가 아니다.
- F01 *의도적인 실제 raw HTTP socket 분할*은 UNVERIFIED; 기존에 제한된 실행을 이 테스트로 대체/우회하지 않았다. F02/F04 독립 코드·계약 PASS는 실운영 장애·물리 손실/동시 client 보증이 아니다. F03 잔여 P1 OPEN(제한 수용 대기).
- P8 Stable, Business v2 Canary, M16, STABLE-001, 원본 개인 데이터, 실제 자격증명·터널·launchd·운영 앱은 접근·변경하지 않았다. 이 체크포인트는 배포·베타 승인·PR merge를 수반하지 않는다.
