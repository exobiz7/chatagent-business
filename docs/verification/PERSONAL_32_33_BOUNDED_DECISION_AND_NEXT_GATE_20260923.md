# ChatAgent Personal — 32/33-tool 적합성 판단과 다음 실사용 게이트 (제한된 엔지니어링 결정)

Date: 2026-09-23 KST. Source SHA: `bd6b444c95395531df63e8e7ca016f5ef5f77932`. Current documentation HEAD before this record: `c074b669fb9d1a78f8a9284d777480d75f316d38`. Repo/PR: private `exobiz7/chatagent-personal`, Draft #5.

**판단 권한과 범위:** 사용자가 목표 적합성·증거를 바탕으로 다음 결정을 진행하도록 위임함에 따라, **개발·검증 순서 및 제한된 제품 계약**을 정한다. 이 기록은 사용자 본인의 운영 위험 명시적 수용서, 독립 제품 승인, Personal Business 앱 등록·배포 또는 PR merge가 아니다. 모든 고급 기능은 기본 OFF로 유지한다.

## 1. 근거와 차별화된 증거
- F03 독립 감사 (`/Users/macstudio/CodexReview/chatagent-personal/bd6b444c95395531df63e8e7ca016f5ef5f77932-f03-rereview/`): mode/ctime/flags·xattr 탐지 보강은 한정 PASS; 마지막 검사→rename 경쟁 및 신규 inode의 metadata 보존 한계로 **P1 1건 OPEN, 제한 수용 대기**. 독립 native drift3종 + xattr 계약16조건 PASS; 실제 동시 race/ABA는 UNVERIFIED.
- F04-R1 독립 감사 (`/Users/macstudio/CodexReview/chatagent-personal/fc518c70693e570c54dedd41afb2190653627235-f04-r1-rereview/`): actual config intent 불일치 등 30조건 거부·정상 same-ID 복구 **코드/비실행 계약 PASS**. Real Business E2E와 해당 SHA 독립 runner 실행은 포함하지 않음.
- F02-R1.1/read audit: 이전 독립 코드·mock PASS. F01: strict raw-byte decoder 및 분할 in-memory contract PASS, **실제 raw HTTP socket split UNVERIFIED**.
- 개발자 마지막 `npm test` **34/34 PASS** 및 구현 SHA macOS [Push 35745106102](https://github.com/exobiz7/chatagent-personal/actions/runs/35745106102), [PR 35745110650](https://github.com/exobiz7/chatagent-personal/actions/runs/35745110650) SUCCESS. 독립 Astra는 이 SHA의 전체 npm/MCP를 재실행하지 않음.
- **현 시점 재확인** (doc HEAD `c074b66…`, 소스 동일): `personal-f01-f02-contract-test.mjs`, `personal-native-cas-mcp-test.mjs`, `personal-36-tool-candidate-test.mjs` 모두 격리 PASS. 32-tool schema와 create/read/memory/owned exec, 33-tool opted-in replace, 9MiB owned async copy/hash를 **시험 전용 L0/L1·임시 자격증명·임시 파일**에서 확인함. 이는 실제 ChatGPT Business 앱과 다르다.
## 2. 목표 적합성 판단 — 32와 33을 경쟁 제품처럼 취급하지 않음

| 항목 | 32-tool 기본 core | 33-tool 선택형 기존 파일 교체 |
|---|---|---|
| 본래 채팅창 실행자 목표 | 파일 생성·읽기·해시·복사/프로세스·메모리의 유용한 실행 기반 | 기존 코드/문서 파일의 수정 작업에 중요한 보완 |
| 현재 구체적 증거 | 시험용 MCP 기능·name/schema 검증 PASS | native mode/xattr·거부 및 시험용 33 MCP PASS, F03 한정 감사 PASS |
| 본질적 제약 | 기존 파일의 원자적 교체 미제공 | rename 원자적 가시성 ≠ kernel-atomic SHA/metadata CAS, 일부 metadata 불보존 |
| 이번 결정 | **통합 검증의 기준 프로필로 채택**; F03을 32-tool 필수 게이트로 추가하지 않음 | **비경합 조건의 opt-in 계약만 엔지니어링 차원에서 채택**; 제품 전체/실사용 무제한 승인 아님 |

개인 단일 소유자·평범한 작업 위주이므로 전역 lock·매 작업 승인·별도 백업 매니저·다중 사용자 동시성 보장을 새 필수조건으로 만들지 않는다. 단, 자동 실행 대상에 개인 정보·수정 불가능한 업무 원본이나 동기화 중 파일을 포함하는 방식은 이번 조건에 적합하지 않다.

## 3. F03 opt-in 수용의 엄격한 경계 (실사용 활성화 전 사용자 확인 필요)
- 대상은 **사용자 소유, 비경합, 로컬에서 별도로 복구 가능한 regular file**만. 파일을 열고 있는 편집기, OneDrive/iCloud/기타 sync, 태깅/권한 변경, 같은 UID의 다른 writer가 해당 파일에 병렬 기록하는 동안에는 사용하지 않는다. 이런 파일은 copy/new destination 작업으로 우회하거나 작업 종료 후 별도 확인한다.
- 교체는 정확한 기존 SHA-256 기대값과 owner mode, 허용된 0777 mode/xattr만 지원. extended ACL, nonzero flags 및 기타 불가 metadata는 거부한다. **원 inode·owner/group·생성시각·특수 mode 비트 보존은 계약에 포함되지 않는다.**
- 정상 결과도 교체 후 read/hash를 확인한다. `UNCERTAIN` 또는 audit 불확실에서는 즉시 반복 실행하지 말고 원 경로·원 processId/receipt를 조회·조정한다. 같은 SHA 재전송 또는 새 key로 재시작하는 자동 복구는 금지.
- **F03 P1을 무조건 CLOSED로 변경하지 않는다.** 한정 PASS와 잔여 경쟁의 제한 수용 대기를 병기하고, 사용자가 위 제약 및 사전 복구 대책을 명시적으로 수용해야 실사용 33-tool 활성화 판단에 포함할 수 있다.
## 4. 다음 게이트와 중지조건

| 순서 | 독립 게이트 | 필요한 증거·판정 |
|---|---|---|
| G1 | 기본 32-tool의 실제 client 통합 | 별도 새 Personal 후보에서 실제 `tools/list`, owner/status, 테스트 소유 새 파일 create/read/hash, 프로세스·메모리, 동일 key copy 상태·조정, 출처·결과 확인. 실제 사용자 파일·기존 앱 재사용 금지 |
| G2 | F01 actual HTTP split | 기존 메모리 fixture와 구분하여 L0/L1 실제 transport의 UTF-8 정확성 및 한도 검증이 필요. 과거 raw-socket 실행 명령이 제한된 사실을 유지하고 **다른 도구로 우회하지 않는다**. 허가된 별도 검증을 기다리거나 미검증으로 명시해 사용자 결정 |
| G3 | 실제 Personal Business 앱 | 별도 격리 state/자격증명/tunnel/app의 등록·실제 채팅 E2E 및 원상복구 계획. 사용자 **별도 명시 승인 전에는 구성/등록/배포 금지**. P8 Stable, Business v2 Canary, M16, STABLE-001 불변 |
| G4 | opt-in 33-tool | G1/G3와 별도로 owner가 F03 제한을 명시 수용한 뒤, **오직 시험 소유 정지 파일**에서 wrong-SHA/정상 replace/read-back/metadata 보존·거부를 확인. 기본 OFF 유지 |
| 별도 | 실제 disk/power/SIGKILL·동시 client·ABI/FS·선택적 백업 | 여전히 UNVERIFIED로 표기. 운영 위험을 별도 평가하되 범위 밖의 모든 물리 장애를 core의 새 무조건적 개발 선행조건으로 확대하지 않음 |

**중지 조건:** 예상 외 도구 노출·권한 상승/상태 혼용, 원본·보호 파일 변경 가능성, 실제 이펙트 성공 여부 불명확, `RECOVERY_REQUIRED` 반복, SHA·메타데이터 검증 불일치, 인증·파일시스템 경계 위반, 승인되지 않은 앱 접근. 즉시 추가 mutation/자동 재시도 중지하고 사용자가 원 상태를 확인한다.

## 5. 결정 상태
- **정한 것:** 32-tool 통합 검증을 우선, 33-tool은 목표에 필요하므로 비경합 범위의 후속 opt-in 후보로 유지. F03 한정 PASS 수용 가능 범위를 문서화했지만 P1 OPEN과 사용자 실사용 수용 결정은 그대로 둔다.
- **아직 하지 않은 것:** 실제 Business 연결·개인 데이터 접근·계정 credential 취득, betas 시작, 운영 app 생성, 실제 raw-socket split, PR 병합/배포. 코드/CI/감사 결과의 범위 밖을 PASS라 하지 않는다.
- **다음 승인 요청:** 실제로 새 격리 Personal Business 후보를 구성하고 시험하기 전, 사용자가 해당 테스트의 계정·앱·격리 자격증명·시험 데이터/중지 범위를 승인한다. 그 전에는 로컬 fixture와 설계·문서만 진행한다.
