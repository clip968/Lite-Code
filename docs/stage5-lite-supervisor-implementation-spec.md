# Stage 5-lite Supervisor Orchestration Implementation Spec

## 문서 목적

이 문서는 `Lite-Code`의 Stage 1~4 경량 오케스트레이션 위에, 사용자가 기대하는 **“상주 메인 모델(manager) + 저가 worker subagent 자동 위임”** 구조를 추가하기 위한 Stage 5-lite 구현 스펙이다.

핵심 목표는 다음과 같다.

1. 사용자는 자연어 요청 또는 단일 auto entrypoint만으로 작업을 시작할 수 있다.
2. 메인 모델은 상주하면서 요구 해석, 범위 통제, 위임, 결과 통합을 담당한다.
3. 실제 구현/검증/수정은 worker subagent가 맡아 토큰과 비용을 절감한다.
4. `oh-my-opencode` 수준의 대규모 자동화 프레임워크로 비대화되지 않도록 **자동화 범위와 상태 전이를 제한**한다.
5. 기존 Stage 1~4 manual workflow는 유지하고, Stage 5-lite는 그 위에 얹히는 **thin supervisor mode**로 구현한다.

이 문서는 구현 전 고정 결정사항, 계약, 티켓, 수용 기준을 명시하는 **source of truth**다.  
이후 구현은 이 문서의 범위, 제약, 티켓 순서를 우선한다.

---

## 1. Scope

이 스펙의 범위는 다음을 포함한다.

- 메인 모델이 현재 세션에 상주한 상태로 worker subagent를 자동 호출하는 Stage 5-lite supervisor mode 설계
- 기존 manual command 세트(`/lite-triage`, `/lite-implement`, `/lite-verify`, `/lite-fix`, `/lite-review`)를 유지하면서 새로운 auto entrypoint 추가
- auto mode 전용 `manager` 운영 규칙 정의
- auto mode에서 사용할 `coder` subagent 추가
- `tester`, `fixer`, `reviewer` worker 계약을 manager 중심 구조에 맞게 정렬
- manager → worker 위임 패킷(packet) 계약 정의
- worker → manager 응답 계약 정의
- 단일 active ticket 기반의 제한된 자동 상태 전이 정의
- Stage 3 상태 파일(`last-plan.md`, `tickets.json`, `run-log.json`)을 auto mode와 호환되게 확장
- Stage 4 budget/risk guard를 auto mode와 호환되게 정렬
- manager가 언제 자동 진행하고, 언제 사용자에게 확인/질문/중단해야 하는지 결정 규칙 정의
- manual override/debug workflow와 auto mode의 경계 문서화

---

## 2. Non-scope

이 스펙은 다음을 포함하지 않는다.

- `oh-my-opencode` 수준의 범용 orchestration framework 복제
- 범용 intent taxonomy 설계
- 완전 자동 멀티티켓 스케줄링
- 여러 ticket의 동시 병렬 구현
- worker가 또 다른 worker를 자유롭게 호출하는 중첩 delegation 구조
- 무한 self-healing loop
- 외부 DB 기반 상태 저장
- 비용/청구/회계 시스템
- 조직 단위 정책 엔진
- plugin 내부에 대규모 decision engine 구현
- undocumented internal runtime reverse engineering
- 프로젝트 전역 대규모 리팩터링
- Stage 1~4 manual command 제거
- “사람 승인 없이 위험 작업까지 완전 자동 처리” 구조

---

## 3. Constraints

- 항상 **한 번에 하나의 active ticket만 자동 실행**한다.
- Stage 5-lite는 기존 Stage 1~4를 대체하지 않고 **thin supervisor layer**로 추가된다.
- 메인 manager는 고성능 모델을 사용하되, **판단/조율 중심**이어야 하며 구현 노동을 직접 떠맡지 않는다.
- 구현/검증/수정은 가능한 한 저가 worker subagent로 위임한다.
- auto mode는 worker를 호출하더라도 **역할 경계**를 흐리지 않는다.
- worker는 manager의 명시적 packet 없이 작업을 시작하지 않는다.
- worker는 다른 worker를 호출하지 않는다. 오직 manager만 위임할 수 있다.
- 자동 루프는 **최대 1개 active ticket + 제한된 fix loop**만 허용한다.
- fix loop는 기본 1회, 최대 2회까지만 허용한다.
- 위험 명령 또는 파괴적 작업은 manager가 자동 진행하지 않고 사용자 확인을 요구한다.
- 상태 기록은 실제 결과와 모순되는 허위 성공 상태를 남기지 않는다.
- plugin은 계속 **thin layer**여야 하며 routing의 주체가 되지 않는다.
- manual commands는 계속 사용 가능해야 한다.
- auto mode는 실패 시 manual mode로 자연스럽게 fallback 가능해야 한다.
- auto mode에서도 “좋아 보이는 추가 개선”은 금지한다.
- manager는 요구가 모호하거나 범위를 1개 ticket로 고정할 수 없으면 자동 구현을 중단하고 질문/triage로 승격한다.
- config/agent/command/prompt/state/plugin 계약은 서로 충돌하지 않아야 한다.

---

## 4. Problem Statement and Design Goal

현재 Stage 1~4 구조는 다음 장점이 있다.

- 역할이 명확하다.
- 상태와 검증 근거를 남기기 쉽다.
- 비용 통제가 가능하다.
- plugin이 얇다.

하지만 사용자 기대치와는 다음 차이가 있다.

- 사용자가 `/lite-triage`, `/lite-implement`, `/lite-verify`, `/lite-fix`, `/lite-review`를 직접 순서대로 호출해야 한다.
- 메인 모델이 “상주 manager”로서 subagent를 자동 조율하지 않는다.
- 구현 단계가 메인 흐름에 붙어 있어 manager 중심의 token 최적화 구조가 아니다.

Stage 5-lite의 목표는 이 간극을 메우는 것이다.

즉, 사용자는 자연어로 요청하거나 auto entrypoint를 통해 작업을 시작하고,  
메인 manager는 다음을 자동 판단한다.

- 지금 바로 구현 가능한가
- ticket을 먼저 만들어야 하는가
- coder를 부를지 tester를 부를지 fixer를 부를지
- 지금 review로 마무리할 수 있는가
- 사용자 확인이 필요한가

단, 그 자동화는 좁고 예측 가능해야 한다.  
Stage 5-lite는 “자유롭게 일하는 것처럼 보이는 자동 orchestration”을 제공하되, 내부 구조는 **고정 역할 + 단일 ticket + 제한된 전이 규칙**으로 유지한다.

---

## 5. Core Design Principles

### 5.1 Thin Supervisor
- manager는 상주 brain이다.
- worker는 hands/eyes다.
- manager는 범위와 정책을 결정하고, worker는 국소 작업을 수행한다.

### 5.2 One Active Ticket
- auto mode에서는 동시에 여러 ticket를 실행하지 않는다.
- manager가 다중 ticket가 필요하다고 판단하면 계획만 만들고 첫 ticket만 실행하거나 사용자 선택을 요청한다.

### 5.3 Deterministic Routing
- manager의 전이 규칙은 제한적이고 설명 가능해야 한다.
- “AI가 알아서 다 한다”가 아니라, 정해진 조건에서만 다음 worker를 선택한다.

### 5.4 Packetized Delegation
- manager는 전체 대화/전체 저장소를 worker에게 넘기지 않는다.
- worker는 필요한 파일 범위, 제약, AC, 직전 증거만 담긴 작은 packet만 받는다.

### 5.5 Evidence-first
- verify/review는 계속 증거 중심이다.
- 자동 모드라고 해서 PASS/APPROVED를 추정하지 않는다.

### 5.6 Manual Override
- 사용자는 언제든 기존 `/lite-*` 수동 명령으로 전환할 수 있어야 한다.
- auto mode는 fallback 가능한 보조 계층이다.

### 5.7 No Plugin-owned Brain
- 판단은 manager prompt/command/state 규칙에 둔다.
- plugin은 기록과 경고만 담당한다.

---

## 6. Target Architecture

### 6.1 Role Model

Stage 5-lite에서의 운영 역할은 다음과 같다.

- `manager`
  - 현재 메인 세션에 상주하는 고성능 모델
  - 요구 해석, routing, 범위 통제, 사용자 커뮤니케이션 담당
- `coder`
  - custom subagent
  - 단일 ticket 구현 전담
- `tester`
  - custom subagent
  - acceptance criteria 검증 전담
- `fixer`
  - custom subagent
  - verify 실패에 대한 최소 수정 전담
- `reviewer`
  - custom subagent
  - 선택적 최종 품질 게이트
  - high-risk 또는 low-confidence 경우에만 호출 가능

### 6.2 Manager Placement

`manager`는 별도 subagent가 아니라 **현재 사용자와 대화 중인 메인 세션의 역할**이다.  
즉, Stage 5-lite의 핵심은 “메인 세션이 manager처럼 행동한다”는 점이다.

따라서 구현 시 다음 원칙을 따른다.

- `/lite-auto`는 가능한 한 **현재 메인 세션에서 실행**되어야 한다.
- `/lite-auto`를 별도 subtask manager로 돌려 메인 세션을 비우는 구조는 금지한다.
- manager는 worker subagent만 호출한다.

### 6.3 Worker Model

worker는 모두 bounded executor여야 한다.

공통 원칙:
- worker는 manager packet 기반으로만 일한다.
- worker는 자기 역할 밖 결정을 하지 않는다.
- worker는 broad refactor를 제안하거나 실행하지 않는다.
- worker는 추가 정보가 필요하면 추측하지 말고 manager에게 되돌린다.
- worker는 다른 worker를 부르지 않는다.

### 6.4 Execution Modes

Stage 5-lite 이후 실행 모드는 두 가지다.

#### Manual Mode
기존 방식 유지:
- `/lite-triage`
- `/lite-implement`
- `/lite-verify`
- `/lite-fix`
- `/lite-review`

#### Auto Mode
새 방식:
- `/lite-auto`

Auto mode는 manager가 내부적으로 worker를 호출해 아래 개념적 단계를 자동 수행한다.
- ticket synthesis or resume
- implement
- verify
- fix (if needed)
- review / finalize

---

## 7. Fixed Decisions

### 7.1 Existing Stage 1~4 structure remains valid
기존 manual workflow는 제거하지 않는다.

### 7.2 Stage 5-lite adds one new auto entrypoint
새로운 표준 auto command는 다음으로 고정한다.

- `/lite-auto`

필요 시 향후 `/lite-resume-auto` 같은 보조 명령을 검토할 수 있으나, Stage 5-lite 첫 구현 범위에는 포함하지 않는다.

### 7.3 Manager is not implemented as a plugin brain
manager의 routing, packet 작성, stop condition 판단은 command/prompt/agent 계약으로 구현한다.  
plugin이 manager처럼 판단하지 않는다.

### 7.4 Add a custom `coder` subagent
auto mode에서는 구현을 메인 manager가 직접 하지 않고, `coder` subagent로 위임한다.

### 7.5 Existing manual `/lite-implement` stays as built-in `build`
manual mode에서는 기존 설계를 유지한다.
- `coder` 운영 용어 → built-in `build` (manual mode)
- auto mode의 worker `coder` → custom subagent (auto mode)

즉, Stage 5-lite에서는 동일한 “coder” 개념이 수동/자동 모드에서 다른 실체를 가질 수 있다.  
문서에서는 이 차이를 명확히 설명해야 한다.

### 7.6 Reviewer becomes conditional in auto mode
auto mode에서 최종 review는 기본적으로 manager가 수행한다.  
단, 아래 중 하나라도 해당하면 `reviewer`를 추가 호출한다.

- 변경 파일이 고위험 경로를 포함함
- verify evidence가 경계선 수준임
- manager confidence가 낮음
- permission/config/plugin/AGENTS 변경이 포함됨
- 사용자가 독립 reviewer를 명시적으로 요구함

### 7.7 Single-ticket automatic loop only
manager는 한 번에 하나의 active ticket만 자동 루프에 태운다.

### 7.8 Fix loop cap is mandatory
- 기본 1회
- 최대 2회
- 2회 초과 시 사용자에게 보고하고 auto mode 중단

### 7.9 No nested commands inside worker unless explicitly needed
auto mode의 내부 위임은 개념적으로 Stage 1~4의 역할 계약을 재사용하되, 구현 시 불필요한 nested command indirection은 피한다.  
즉, worker는 가능하면 직접 역할 prompt로 호출하고, manual commands는 operator/debug용으로 남긴다.

### 7.10 State schema must remain human-readable
새 필드가 추가되어도 `tickets.json`, `run-log.json`, `last-plan.md`는 사람이 읽고 재개할 수 있어야 한다.

---

## 8. Target File Changes

Stage 5-lite 구현 시 수정/추가 대상은 최소 다음을 포함한다.

### New files
- `docs/stage5-lite-supervisor-implementation-spec.md`
- `.opencode/commands/lite-auto.md`
- `.opencode/agents/coder.md`

### Files likely to modify
- `AGENTS.md`
- `opencode.jsonc`
- `.opencode/agents/tester.md`
- `.opencode/agents/fixer.md`
- `.opencode/agents/reviewer.md`
- `.opencode/commands/lite-review.md`
- `.opencode/plugins/orchestrator.ts`
- `.opencode/plugins/budget-guard.ts`
- `.opencode/state/last-plan.md`
- `.opencode/state/tickets.json`
- `.opencode/state/run-log.json`
- `docs/final-operations-guide.md`
- 필요 시 `docs/resume-flow.md`
- 필요 시 `docs/budget-risk-policy.md`

### Files explicitly out of scope by default
- business/domain code unrelated to orchestration
- large external dependency additions
- unrelated docs rewrite
- external infrastructure config

---

## 9. Manager Interaction Model

## 9.1 User Experience Goal

사용자는 다음 중 하나로 작업을 시작할 수 있다.

1. 자연어 요청
   - 예: “이 버그 고쳐줘”
   - 예: “runtime logic fix plan 기준으로 진행해줘”
2. 명시적 auto command
   - 예: `/lite-auto T-601 기준으로 구현 시작`
   - 예: `/lite-auto docs 갱신까지 자동으로 진행`

manager는 요청을 받아 아래를 판단한다.

- 이미 active ticket가 있는가
- 새 ticket를 합성해야 하는가
- 바로 구현 가능한가
- 정보가 부족한가
- 위험 작업인가
- verify/fix/review 어느 단계부터 시작해야 하는가

## 9.2 Manager Turn Responsibilities

한 번의 `/lite-auto` 실행 또는 auto turn에서 manager는 다음을 수행한다.

1. 요청 정규화
2. active ticket 탐색 또는 생성
3. 상태 파일 확인
4. routing 결정
5. worker packet 작성
6. worker 실행
7. worker 응답 검토
8. 상태 파일 업데이트
9. 필요 시 다음 worker 한 번 더 실행
10. 완료/중단/질문/사용자확인 중 하나로 종료

## 9.3 Manager Stop Conditions

manager는 다음 상황에서 자동 진행을 멈춘다.

- 요구사항이 모호해 ticket를 1개로 고정할 수 없음
- 수정 가능 파일 범위를 안전하게 제한할 수 없음
- worker가 out-of-scope 수정 필요를 보고함
- 위험 명령/파괴적 작업이 필요함
- fix loop 상한 도달
- verify evidence가 계속 부족함
- reviewer까지 돌렸는데도 결론이 불확실함
- 사용자 의사결정이 필요함

---

## 10. Routing and Decision Policy

## 10.1 High-level Routing States

Stage 5-lite의 manager는 아래 상태만 다룬다.

- `IDLE`
- `TICKET_READY`
- `IMPLEMENTING`
- `VERIFYING`
- `FIXING`
- `REVIEWING`
- `WAITING_USER`
- `DONE`
- `BLOCKED`

이 상태는 내부 라우팅 개념이며, `tickets.json`의 공식 status 값과는 별도로 설명용이다.  
공식 상태는 기존 Stage 3 상태 스키마를 확장하여 사용한다.

## 10.2 Initial Routing Rules

### Rule A: Direct execution 가능
다음 조건을 모두 만족하면 manager는 새 ticket를 만들어 auto loop를 시작할 수 있다.
- 요청 범위가 하나의 ticket로 축약 가능
- 수정 대상이 대략 식별 가능
- acceptance criteria를 manager가 최소 수준으로 정의할 수 있음
- 위험 작업이 아님

### Rule B: Clarification required
다음 중 하나면 manager는 먼저 질문한다.
- 목표가 모호함
- 여러 ticket로 쪼개야 하는 대규모 작업임
- 허용 파일 범위가 불명확함
- acceptance criteria가 전혀 보이지 않음

### Rule C: Escalate to planning
다음 중 하나면 manager는 triage 수준 계획을 먼저 만든다.
- 구조 변경이 큼
- 여러 ticket가 필요함
- 운영 정책/설계 결정이 포함됨
- 현재 요청만으로 바로 코딩하면 위험함

단, Stage 5-lite에서는 대규모 planning automation을 만들지 않는다.  
manager는 **짧은 plan + 첫 ticket 제안** 정도까지만 수행하고, 필요하면 manual `/lite-triage`를 권장한다.

## 10.3 Worker Selection Rules

### From `TICKET_READY`
- 코드/설정/문서 변경이 필요한 ticket → `coder`
- 검증만 필요한 상황 → `tester`
- 이미 verify failure evidence가 있고 수정 대상이 명확함 → `fixer`

### From `IMPLEMENTING`
- `coder` 성공 + 실행 검증 필요 → `tester`
- `coder` 성공 + docs-only 변경이며 runtime 영향 없음 → manager review
- `coder` blocked → `WAITING_USER`

### From `VERIFYING`
- 모든 mandatory AC가 `PASS` → manager review
- 하나라도 `FAIL` → `fixer`
- 핵심 AC가 `INSUFFICIENT_EVIDENCE` → `fixer` 또는 `WAITING_USER`
- 검증 자체가 불가능함 → `WAITING_USER`

### From `FIXING`
- `fixer` 성공 → `tester`
- `fixer` blocked → `WAITING_USER`
- fix loop 상한 도달 → `WAITING_USER`

### From `REVIEWING`
- manager confidence 높고 고위험 조건 없음 → `DONE`
- 고위험/저신뢰 조건 있음 → `reviewer`
- `reviewer` approved → `DONE`
- `reviewer` changes requested → `coder` 또는 `fixer`

## 10.4 Reviewer Trigger Rules

manager는 아래 중 하나라도 해당하면 `reviewer`를 호출해야 한다.

- 변경 파일에 `AGENTS.md` 포함
- 변경 파일에 `opencode.jsonc` 포함
- 변경 파일이 `.opencode/plugins/` 아래를 포함
- 변경 파일이 `.opencode/agents/` 또는 permission-related file을 포함
- risky command warning이 발생함
- verify 결과가 PASS지만 evidence가 경계선 수준임
- manager가 “low confidence”로 판단함
- 사용자가 독립 review를 원함

## 10.5 Auto Loop Cap

한 번의 auto run에서 manager가 수행할 수 있는 worker 호출 수는 보수적으로 제한한다.

권장 상한:
- `coder` 1회
- `tester` 최대 2회
- `fixer` 최대 2회
- `reviewer` 최대 1회

이 상한은 “무한 자동화”를 방지하기 위한 정책이며, 초과 시 사용자에게 handoff한다.

---

## 11. Ticket Model for Auto Mode

## 11.1 Ticket Creation Policy

manager는 auto mode에서 ticket가 없으면 임시 계획이 아닌 **실행 가능한 단일 ticket**를 생성해야 한다.

좋은 auto ticket은 최소 다음을 포함한다.

- Ticket ID
- Title
- Goal
- Files to modify
- Constraints
- Acceptance criteria
- Non-scope
- Risk level

## 11.2 Ticket ID Policy

자동 생성 ticket의 권장 형식:
- `T-AUTO-001` 같은 별도 형식은 피한다.
- 기존 파서/상태 스키마와의 호환성을 위해 숫자 기반 형식을 우선한다.
- 권장 형식:
  - `T-601`, `T-602` 같은 정규 ticket
  - 후속 수정 ticket은 `T-FIX-1`, `T-FIX-2`

구현 시 ticket parser가 아래를 인식해야 한다.
- `T-101`
- `T-601`
- `T-FIX-1`

## 11.3 Auto-generated Ticket Quality Bar

manager가 만든 ticket는 다음을 만족해야 한다.

- 한 번에 구현 가능한 범위
- 파일 범위가 대략이라도 명시됨
- acceptance criteria가 최소 2개 이상 측정 가능
- non-scope가 포함됨
- 위험 작업 여부가 명시됨

---

## 12. Delegation Packet Contract

## 12.1 Purpose

manager는 worker에게 전체 대화 대신 **작은 실행 패킷(packet)** 을 전달한다.  
이 패킷이 Stage 5-lite token 최적화의 핵심이다.

## 12.2 Required Packet Fields

모든 worker packet은 최소 아래 필드를 포함해야 한다.

- `packet_version`
- `request_id`
- `ticket_id`
- `ticket_title`
- `worker_role`
- `goal`
- `files_in_scope`
- `read_context`
- `write_scope`
- `constraints`
- `acceptance_criteria`
- `non_scope`
- `input_artifacts`
- `previous_step_summary`
- `expected_output_contract`
- `risk_level`
- `iteration`
- `mode` (`auto`)

## 12.3 Field Semantics

### `files_in_scope`
worker가 읽거나 검토해야 하는 파일 경로 목록이다.

### `read_context`
worker가 꼭 읽어야 할 핵심 맥락 요약이다.
예:
- 관련 문서 요약
- 직전 verify 실패 요약
- 수정 대상 함수/파일 포인터

### `write_scope`
worker가 수정 가능한 파일 범위다.  
`tester`와 `reviewer`는 기본적으로 빈 값 또는 read-only여야 한다.

### `input_artifacts`
로그, 재현 절차, 이전 run-log 요약 등이다.

### `previous_step_summary`
직전 단계 결과를 3~8개 bullet 안에 요약한 값이다.

### `expected_output_contract`
worker가 어떤 섹션 구조로 답해야 하는지 명시한다.

## 12.4 Packet Size Constraints

manager는 token 절감을 위해 아래 제한을 지킨다.

- packet에 전체 repo 요약을 넣지 않는다.
- 필요한 파일/심볼만 포함한다.
- 직전 단계 로그는 전체가 아니라 핵심 증거만 요약한다.
- 한번에 너무 많은 파일을 넣지 않는다.
- worker가 추가 정보가 필요하면 먼저 요청하게 한다.

권장 기준:
- 핵심 파일 1~8개
- 이전 단계 요약 200~500자 수준
- 실패 로그는 핵심 signature 위주
- 전체 대화 transcript 전달 금지

## 12.5 Worker Freedom Boundary

worker는 packet 안에서 다음 자유를 가진다.

- 파일 범위 내에서 구현 디테일 선택
- 필요한 추가 읽기 수행
- 최소한의 내부 계획 수립
- evidence 수집 방식 선택

하지만 다음은 금지된다.

- 범위 밖 수정
- 다른 worker 호출
- broad refactor
- 정책 변경
- acceptance criteria 재정의

---

## 13. Worker Response Contract

모든 worker 응답은 manager가 기계적으로 읽기 쉬운 구조여야 한다.  
Stage 5-lite 구현자는 각 worker prompt가 이 구조를 강제하도록 작성해야 한다.

## 13.1 Common Requirements

- 섹션 헤더 고정
- 장황한 배경 설명 금지
- evidence와 판단 분리
- blockers 명시
- out-of-scope 요구 시 즉시 보고

## 13.2 Coder Output Contract

`coder`는 최소 다음을 반환해야 한다.

1. Target Ticket  
2. Files Changed  
3. Implementation Summary  
4. Acceptance Criteria Mapping  
5. Known Gaps / Follow-ups  
6. Escalations (if any)

## 13.3 Tester Output Contract

`tester`는 최소 다음을 반환해야 한다.

1. Verification Target  
2. Verification Results  
3. Test & Evidence  
4. Failure Analysis  
5. Handoff Recommendation

각 AC는 반드시 아래 중 하나여야 한다.
- `PASS`
- `FAIL`
- `INSUFFICIENT_EVIDENCE`

## 13.4 Fixer Output Contract

`fixer`는 최소 다음을 반환해야 한다.

1. Target Ticket  
2. Root Cause  
3. Files Changed  
4. Fix Summary  
5. Re-verify Request  
6. Residual Risks / Follow-ups

## 13.5 Reviewer Output Contract

`reviewer`는 최소 다음을 반환해야 한다.

1. Decision  
2. Criteria Check  
3. Verify/Fix Evidence Check  
4. Design/Policy Violations  
5. Required Follow-up Tickets

## 13.6 Malformed Response Handling

manager는 worker 응답이 계약을 벗어나면 다음 중 하나로 처리한다.

- 응답이 근본적으로 유효하지 않으면 `INSUFFICIENT_EVIDENCE` 또는 `BLOCKED`
- 핵심 섹션이 누락되면 같은 worker에 좁은 재요청
- 반복적으로 malformed면 auto mode 중단 후 manual handoff

---

## 14. State Model Extensions

Stage 5-lite는 새 상태 파일을 크게 늘리지 않고 기존 세 파일을 확장한다.

- `.opencode/state/last-plan.md`
- `.opencode/state/tickets.json`
- `.opencode/state/run-log.json`

## 14.1 `tickets.json` Extensions

기존 구조를 유지하면서 ticket별로 아래 필드를 추가할 수 있다.

- `execution_mode`: `manual` | `auto`
- `manager_owned`: boolean
- `route_reason`: string
- `loop_count`: number
- `last_worker`: `manager` | `coder` | `tester` | `fixer` | `reviewer`
- `approval_required`: boolean
- `auto_status`: `IDLE` | `RUNNING` | `WAITING_USER` | `DONE` | `BLOCKED`
- `artifacts`: string[]
- `resume_hint`: string

주의:
- 기존 status 값 체계는 유지한다.
- 새로운 필드는 optional이거나 backward compatible해야 한다.
- 기존 manual tickets를 깨지 않아야 한다.

## 14.2 `run-log.json` Extensions

기존 구조를 유지하면서 entry `notes` 또는 optional top-level field에 다음 정보를 담을 수 있다.

- `mode`: `manual` | `auto`
- `workerRole`
- `routeReason`
- `requiresUserApproval`
- `loopIteration`
- `reviewMode`: `manager` | `reviewer`
- `delegationCount`
- `parentRunId`
- `artifactSummary`

중요:
- `/lite-auto`가 worker를 불렀다고 해서 실제 실행되지 않은 `/lite-implement` 성공을 허위로 기록하면 안 된다.
- auto mode에서는 `/lite-auto` 실행 자체와 그 안의 delegation 결과를 구분해 기록해야 한다.
- run-log는 “manager가 무엇을 판단했고 어떤 worker를 호출했는지”를 보수적으로 보여줘야 한다.

## 14.3 `last-plan.md` Extensions

Stage 5-lite에서는 explicit triage 없이도 manager가 생성한 single-ticket plan을 `last-plan.md`에 남길 수 있다.

권장 추가 메타데이터:
- `workflow_stage: stage5-lite`
- `generated_by_command: /lite-auto`
- `execution_mode: auto`
- `manager_summary`
- `auto_route`
- `current_worker`
- `loop_count`
- `waiting_reason` (있다면)

## 14.4 State Update Timing

state 업데이트는 다음 시점에만 한다.

- manager가 새 ticket를 확정했을 때
- worker 실행이 끝나 결과가 확인되었을 때
- manager가 다음 액션을 결정했을 때
- auto mode가 사용자 질문/승인 대기로 멈췄을 때
- 최종 완료/차단 시

실제 결과를 모르는 시점에는 `PASS`, `APPROVED`, `DONE`를 기록하지 않는다.

---

## 15. Command and Agent Contract Changes

## 15.1 New Command: `/lite-auto`

`/lite-auto`는 Stage 5-lite의 단일 auto entrypoint다.

### 목적
- manager mode를 활성화한다.
- 현재 요청을 해석한다.
- active ticket를 결정한다.
- 적절한 worker를 자동으로 호출한다.
- 필요 시 verify/fix/review까지 연쇄 진행한다.
- 최종적으로 완료/중단/질문/승인요청 상태를 사용자에게 보고한다.

### 핵심 규칙
- 메인 세션에서 동작해야 한다.
- worker만 subtask로 호출한다.
- 하나의 active ticket만 처리한다.
- 범위가 크면 질문 또는 triage로 승격한다.
- manual commands는 제거하지 않는다.

### 권장 출력 형식
1. Mode / Decision  
2. Active Ticket  
3. Actions Executed This Turn  
4. Evidence Snapshot  
5. Current State / Next Step  
6. User Input Needed (if any)

## 15.2 New Agent: `coder`

`coder`는 auto mode 전용 bounded implementer다.

### 목적
- manager packet 기반으로 단일 ticket 구현
- 좁은 범위 수정
- manager가 바로 tester로 넘길 수 있는 구조화된 결과 반환

### 권한 원칙
- 허용 파일만 수정
- broad refactor 금지
- architecture change 금지
- ambiguity 시 중단/보고

## 15.3 Existing `tester` / `fixer` / `reviewer` alignment

기존 agent는 다음 점만 Stage 5-lite에 맞게 조정한다.

- manager packet 입력 형식과 호환
- section header 고정 강화
- auto mode에서도 evidence-first 유지
- out-of-scope 변경 요구 시 즉시 escalation
- reviewer는 manager fallback/secondary gate 역할을 명시

## 15.4 Existing Manual Commands Stay

다음 명령은 유지한다.

- `/lite-triage`
- `/lite-implement`
- `/lite-verify`
- `/lite-fix`
- `/lite-review`

이들은:
- manual override
- debugging
- explicit operator control
- auto mode 실패 시 fallback
용도로 계속 사용한다.

---

## 16. Risk and Approval Model

## 16.1 Risk Levels

Stage 5-lite manager는 ticket마다 risk level을 붙인다.

- `low`
- `medium`
- `high`

## 16.2 Automatic User Approval Required

다음 중 하나라도 해당하면 manager는 자동 진행 전에 사용자 확인을 요구해야 한다.

- 파괴적 명령 가능성
- 대규모 파일 삭제/이동
- `git reset --hard`, `rm -rf`, `curl | sh` 류 위험 패턴 필요
- scope 밖 파일 수정 없이는 해결이 불가능
- 설정/권한/플러그인 변경이 포함되며 영향이 큼
- acceptance criteria보다 큰 설계 변경이 필요함

## 16.3 Reviewer Mandatory Cases

다음 경우 reviewer를 생략하면 안 된다.

- `.opencode/plugins/` 수정
- `AGENTS.md` 수정
- `opencode.jsonc` 수정
- permission 관련 agent file 수정
- manager가 “high risk”로 분류
- verify evidence가 충분하나 리스크가 남아 있음

## 16.4 Auto Refusal Cases

manager는 다음 상황에서 자동 구현을 거부하고 질문/triage/manual fallback을 제안해야 한다.

- 요청이 여러 독립 feature를 동시에 요구함
- acceptance criteria를 manager가 최소 수준으로도 정의할 수 없음
- 예상 수정 범위가 넓고 불명확함
- worker에게 넘길 수 있는 안전한 packet를 만들 수 없음
- 반복 fix 후에도 root cause가 좁혀지지 않음

---

## 17. Token Optimization Strategy

## 17.1 Main Idea

비용 절감의 핵심은 “자동화 자체”보다 **메인 manager가 전체 구현/검증 로그를 직접 오래 들고 있지 않는 것**이다.

## 17.2 Required Optimizations

- manager는 worker에게 packet만 전달한다.
- worker 결과는 항상 요약 구조로 받는다.
- 전체 테스트 로그 대신 실패 signature와 artifact ref만 사용한다.
- 같은 ticket의 fix/reverify는 이전 전체 대화가 아니라 직전 요약만 전달한다.
- state 파일은 장기 기억 역할을 하고, manager는 거기서 resume pointer만 읽는다.

## 17.3 Optional Optimizations

구현 환경이 허용하면 아래를 사용할 수 있다.

- 같은 ticket 내 worker session 재사용
- verify/fix pair의 session continuity
- reviewer 생략 조건 최적화
- artifact path 기반 lazy loading

단, 이 최적화는 “supported/runtime-confirmed”일 때만 사용한다.

## 17.4 Explicit Anti-patterns

다음은 금지한다.

- manager가 worker 응답 원문 전체를 계속 붙들고 다음 worker에 전달
- 모든 파일 내용을 packet에 복사
- 모든 단계마다 reviewer 호출
- verify 실패 시 broad re-implementation 수행
- plugin으로 자연어 결과를 복잡하게 파싱해 상태 판단

---

## 18. Orchestrator Plugin Requirements for Stage 5-lite

Stage 5-lite 구현 시 `.opencode/plugins/orchestrator.ts`는 다음 방향으로 보정되어야 한다.

## 18.1 Recognize `/lite-auto`
- `/lite-auto`를 감지할 수 있어야 한다.
- 단, `/lite-auto`가 내부적으로 worker를 여러 번 불렀다고 해서 fake command success chain을 기록하면 안 된다.

## 18.2 Conservative Logging
- manager run은 `STARTED`로 시작
- 실제 worker 결과가 확인되기 전에는 terminal success 기록 금지
- auto cycle의 결과는 보수적으로 기록

## 18.3 Distinguish Manager and Worker Notes
권장 기록 예:
- command: `/lite-auto`
- agent: `manager`
- notes:
  - delegatedWorkers
  - routeReason
  - loopCount
  - finalReviewMode
  - waitingForUser

## 18.4 Preserve Manual Compatibility
- 기존 `/lite-*` manual command logging을 깨지 않는다.
- auto mode 지원이 manual mode 의미를 바꾸면 안 된다.

## 18.5 Do Not Infer Natural-language Success
- worker 자유 응답을 억지로 “PASS/FAIL”로 복잡 파싱하는 heavy inference engine을 만들지 않는다.
- 가능한 한 manager prompt/worker output contract에서 구조를 강제하고, plugin은 그 구조를 활용하는 정도에 머문다.

---

## 19. Budget/Risk Guard Requirements for Stage 5-lite

Stage 5-lite 구현 시 `.opencode/plugins/budget-guard.ts`는 다음을 만족해야 한다.

## 19.1 Manager-aware warning
- manager가 고가 모델을 상주 사용하는 사실은 허용한다.
- 경고의 초점은 manager 자체가 아니라 **worker로 내려야 할 반복 구현/검증 작업을 manager가 계속 직접 처리하는 경우**다.

## 19.2 Keep warn-first
- 여전히 warn-only 정책
- auto mode를 차단하는 policy engine으로 바꾸지 않는다

## 19.3 Detect risky worker actions
- worker가 실행하려는 위험 명령에 대한 경고는 유지한다.
- auto mode에서도 사용자 승인 필요 흐름과 충돌하지 않아야 한다.

## 19.4 No fake budget precision
- 정확한 비용 계산기를 만들지 않는다.
- high-cost overuse warning만 유지한다.

---

## 20. Suggested Manager Algorithm

구현자는 `/lite-auto` prompt/command에 아래 알고리즘을 반영해야 한다.

### Step 1. Normalize request
- 사용자 요청을 한 문장으로 요약
- active ticket 존재 여부 확인
- 상태 파일에서 resume pointer 확인

### Step 2. Decide ticket source
- active ticket가 있으면 그 ticket 재개
- 없고 단일 범위면 새 ticket 생성
- 없고 다중 범위/모호하면 질문 또는 triage 제안

### Step 3. Choose next action
- ticket status와 latest evidence 기준으로 다음 worker 결정
- risky/high-uncertainty면 사용자 확인 또는 reviewer 경로 선택

### Step 4. Build worker packet
- 필요한 파일 범위만 포함
- AC, constraints, non-scope 명시
- 직전 step summary 포함
- expected output contract 포함

### Step 5. Execute worker
- worker를 1회 실행
- 결과 구조를 검토
- malformed면 좁은 재요청 또는 auto stop

### Step 6. Update state
- ticket status 갱신
- run-log entry append/update
- last-plan resume pointer 동기화

### Step 7. Continue or stop
- 성공이면 다음 worker 한 번 더 실행 가능
- fix loop 상한 도달 시 stop
- 추가 정보 필요 시 stop
- terminal 상태면 요약 보고

### Step 8. Final response to user
- 무엇을 했는지
- 어떤 근거가 있는지
- 지금 상태가 무엇인지
- 다음 자동 단계 또는 필요한 사용자 입력이 무엇인지

---

## 21. Suggested `/lite-auto` Output Contract

사용자에게 보이는 `/lite-auto` 결과는 아래 구조를 권장한다.

### 1) Mode / Decision
- Mode: `AUTO`
- Decision: `PROCEEDING` | `WAITING_USER` | `DONE` | `BLOCKED`

### 2) Active Ticket
- ID:
- Title:
- Goal:
- Risk level:

### 3) Actions Executed This Turn
- manager action 1
- worker call 1
- worker call 2
- state update summary

### 4) Evidence Snapshot
- changed files:
- verify result:
- fix result:
- review result:
- artifact refs:

### 5) Current State / Next Step
- current status:
- next automatic step:
- fallback manual command:

### 6) User Input Needed (if any)
- approval needed:
- missing information:
- choice required:

이 출력은 운영자가 “지금 무엇이 자동으로 진행됐고, 어디서 멈췄는지”를 빠르게 파악하도록 돕는다.

---

## 22. Migration Strategy

Stage 5-lite는 한 번에 전면 전환하지 않는다.  
다음 원칙으로 점진 도입한다.

### Phase 1
- 문서/스펙 정리
- `coder` subagent 추가
- `/lite-auto` command 정의
- 상태 스키마 확장 정의

### Phase 2
- manager prompt/command 구현
- auto mode에서 `coder -> tester -> fixer -> reviewer` 연결
- orchestrator plugin `/lite-auto` 지원

### Phase 3
- budget/risk guard auto mode 정렬
- final operations guide 갱신
- manual fallback 및 dry-run 검증

이 순서를 지키면 기존 Stage 1~4를 깨지 않고 Stage 5-lite를 추가할 수 있다.

---

## 23. Tickets

### Ticket: T-601
### Goal:
Stage 5-lite의 핵심 운영 개념과 auto/manual 모드 경계를 문서에 고정한다.

### Files to modify:
- `AGENTS.md`
- `docs/final-operations-guide.md`
- 필요 시 `docs/resume-flow.md`

### Constraints:
- Stage 1~4 manual workflow는 제거하지 않는다.
- Stage 5-lite는 thin supervisor layer로 설명해야 한다.
- manager와 plugin의 책임을 혼동하지 않는다.

### Acceptance criteria:
- 문서에 `manager`의 역할이 “현재 메인 세션의 상주 orchestrator”로 명시된다.
- manual mode와 auto mode의 차이가 명확히 문서화된다.
- auto mode가 한 번에 하나의 active ticket만 처리한다는 정책이 명시된다.
- manual override/fallback 경로가 문서에 포함된다.

### Non-scope:
- 실제 command/agent/plugin 구현
- 상태 스키마 코드 변경

---

### Ticket: T-602
### Goal:
auto mode 전용 bounded implementer인 `coder` subagent를 추가한다.

### Files to modify:
- `.opencode/agents/coder.md`

### Constraints:
- `coder`는 worker 역할만 수행한다.
- broad refactor 금지 원칙을 강하게 명시한다.
- manager packet 기반 입력을 전제로 작성한다.

### Acceptance criteria:
- `coder` agent 정의가 단일 ticket 구현에 최적화된다.
- 입력 요구사항에 packet fields 또는 equivalent fields가 반영된다.
- 출력 형식이 manager가 후속 verify에 넘기기 쉬운 구조로 고정된다.
- out-of-scope/blocked 조건이 명시된다.

### Non-scope:
- manual `/lite-implement` 변경
- tester/fixer/reviewer 수정

---

### Ticket: T-603
### Goal:
`/lite-auto` command를 추가하여 메인 manager가 worker를 자동 라우팅할 수 있는 prompt 계약을 정의한다.

### Files to modify:
- `.opencode/commands/lite-auto.md`

### Constraints:
- `/lite-auto`는 메인 세션에서 동작해야 한다.
- worker만 subtask로 호출해야 한다.
- 한 번에 하나의 active ticket만 다뤄야 한다.
- 자동 루프 상한과 stop condition을 명시해야 한다.

### Acceptance criteria:
- `/lite-auto` command에 manager 알고리즘이 반영된다.
- ticket 생성/재개/질문/중단 규칙이 포함된다.
- worker selection 규칙이 포함된다.
- 사용자에게 보여줄 output contract가 포함된다.
- 위험 작업 시 승인 요구 규칙이 포함된다.

### Non-scope:
- plugin logging 구현
- budget guard 정렬

---

### Ticket: T-604
### Goal:
기존 worker(`tester`, `fixer`, `reviewer`)를 manager packet 기반 Stage 5-lite auto mode와 정렬한다.

### Files to modify:
- `.opencode/agents/tester.md`
- `.opencode/agents/fixer.md`
- `.opencode/agents/reviewer.md`
- 필요 시 `.opencode/commands/lite-review.md`

### Constraints:
- 각 worker의 역할 경계를 흐리지 않는다.
- output contract는 manager가 읽기 쉬운 구조로 더 엄격하게 만든다.
- verify/fix/review evidence-first 원칙은 유지한다.

### Acceptance criteria:
- tester/fixer/reviewer가 manager packet 입력과 호환된다.
- output section 구조가 고정된다.
- malformed/insufficient evidence 시 행동이 명시된다.
- reviewer의 conditional use policy가 문서와 충돌하지 않는다.

### Non-scope:
- 실제 auto command 구현
- state plugin 구현

---

### Ticket: T-605
### Goal:
Stage 3 상태 스키마와 orchestrator plugin을 Stage 5-lite auto mode와 호환되게 확장한다.

### Files to modify:
- `.opencode/plugins/orchestrator.ts`
- `.opencode/state/tickets.json`
- `.opencode/state/run-log.json`
- `.opencode/state/last-plan.md`

### Constraints:
- 허위 성공 상태 기록 금지
- `/lite-auto`와 manual `/lite-*`를 혼동하지 않는다
- state는 사람이 읽을 수 있는 단순 포맷 유지
- plugin이 routing brain이 되지 않는다

### Acceptance criteria:
- `/lite-auto` 실행이 run-log에 보수적으로 기록된다.
- auto mode delegation 정보가 notes 또는 호환 필드에 기록된다.
- tickets 상태가 auto mode와 manual mode 모두에서 일관되게 유지된다.
- last-plan resume pointer가 auto mode를 반영할 수 있다.
- manual flow 기록을 깨지 않는다.

### Non-scope:
- heavy natural-language outcome parser
- 외부 상태 저장소

---

### Ticket: T-606
### Goal:
Stage 4 budget/risk guard를 manager-aware auto mode에 맞게 정렬한다.

### Files to modify:
- `.opencode/plugins/budget-guard.ts`
- `docs/budget-risk-policy.md`
- 필요 시 `docs/final-operations-guide.md`

### Constraints:
- warn-first 정책 유지
- manager 상주 자체를 과도 경고로 취급하지 않는다
- 반복 구현/검증을 manager가 직접 처리하는 경우에 경고 초점을 둔다
- risky command는 여전히 승인 모델과 충돌하지 않아야 한다

### Acceptance criteria:
- auto mode에서 manager/worker 역할 차이를 고려한 경고 기준이 문서화된다.
- risky command 경고가 auto mode에서도 유지된다.
- undocumented runtime hook 의존을 늘리지 않는다.
- guard가 workflow를 차단하지 않는다.

### Non-scope:
- 비용 계산기
- hard blocking policy

---

### Ticket: T-607
### Goal:
Stage 5-lite dry-run 및 운영 문서를 정리하여 다른 agent가 구현/운영/검증을 재현 가능하게 만든다.

### Files to modify:
- `docs/final-operations-guide.md`
- 필요 시 `docs/resume-flow.md`
- 필요 시 새 dry-run 문서

### Constraints:
- 문서는 실제 구현 범위를 과장하지 않는다.
- manual fallback 경로를 반드시 포함한다.
- auto mode의 한계와 stop condition을 명시한다.

### Acceptance criteria:
- auto mode happy path 예시가 문서에 포함된다.
- auto mode fail/fix/review path 예시가 문서에 포함된다.
- 사용자 승인 필요 케이스가 문서에 포함된다.
- 운영자가 상태 파일만 보고 현재 위치를 파악할 수 있다.

### Non-scope:
- 새 orchestration framework 추가
- unrelated docs rewrite

---

## 24. Acceptance Criteria Summary (Global)

Stage 5-lite는 아래를 만족해야 완료로 간주한다.

- 메인 manager가 상주 세션에서 worker를 자동 위임할 수 있다.
- auto mode 전용 `coder` subagent가 추가된다.
- `/lite-auto`가 단일 active ticket 기준으로 동작한다.
- manager가 worker packet을 사용해 좁은 컨텍스트만 전달한다.
- worker output contract가 구조화되어 manager가 후속 라우팅을 결정할 수 있다.
- verify/fix/review evidence-first 원칙이 자동 모드에서도 유지된다.
- fix loop 상한이 구현된다.
- reviewer는 conditional gate로 동작한다.
- 상태 파일이 `/lite-auto`를 보수적으로 기록한다.
- 허위 성공 상태가 기록되지 않는다.
- 위험 명령은 warn-first + user approval 모델을 유지한다.
- manual Stage 1~4 commands가 계속 동작한다.
- 전체 구조가 `oh-my-opencode` 수준의 대규모 framework로 비대화되지 않는다.

---

## 25. Risks / Assumptions

### Risk 1
**Risk**  
현재 세션에서 동작하는 manager-style auto command 지원 방식이 런타임 문서와 일부 다를 수 있다.

**Why it matters**  
`/lite-auto`가 잘못 구현되면 manager가 메인 세션이 아니라 별도 subtask로 돌아 사용자 기대와 달라질 수 있다.

**Mitigation**  
구현 시 “메인 세션 유지”를 최우선 요구사항으로 두고, current-session command 방식이 지원되지 않으면 우회 대신 명시적 제한을 문서화한다.

---

### Risk 2
**Risk**  
auto mode가 편하다는 이유로 manager가 직접 구현/수정까지 떠맡아 worker 분리가 무너질 수 있다.

**Why it matters**  
토큰 절감 목표가 실패하고 Stage 5-lite가 사실상 “비싼 모델 단독 작업”이 된다.

**Mitigation**  
`coder`/`tester`/`fixer` 위임 규칙을 명시하고, manager 직접 구현은 예외 상황에서만 허용하거나 금지한다.

---

### Risk 3
**Risk**  
worker packet이 점점 커져 결국 manual mode보다 더 무거워질 수 있다.

**Why it matters**  
auto mode의 비용 장점이 사라지고 manager가 계속 컨텍스트 과부하를 겪게 된다.

**Mitigation**  
packet size constraint를 문서와 prompt에 강제하고, artifact ref + summary 중심 구조를 유지한다.

---

### Risk 4
**Risk**  
fix loop가 과도하게 자동 반복되면 small self-healing engine처럼 비대화될 수 있다.

**Why it matters**  
경량 orchestration 원칙이 깨지고 실패 상황에서 오히려 예측 가능성이 떨어진다.

**Mitigation**  
fix loop cap을 강제하고, 2회 초과 시 무조건 사용자 handoff로 중단한다.

---

### Risk 5
**Risk**  
reviewer를 조건부로 만들면서 품질 게이트가 약해질 수 있다.

**Why it matters**  
고위험 변경이 manager 단독 판단으로 통과될 수 있다.

**Mitigation**  
plugin/config/permission/AGENTS 수정 등 high-risk trigger에서는 reviewer mandatory 규칙을 둔다.

---

### Risk 6
**Risk**  
상태 파일이 auto mode와 manual mode를 동시에 반영하면서 복잡해질 수 있다.

**Why it matters**  
resume 판단이 어려워지고 사람이 읽기 힘들어진다.

**Mitigation**  
기존 상태 구조는 유지하고, optional field와 notes 중심으로 확장한다.

---

### Risk 7
**Risk**  
manager가 요청을 과도하게 자동 triage하려다 scope가 넓은 작업까지 무리하게 시작할 수 있다.

**Why it matters**  
티켓 품질이 낮아지고 worker가 불필요하게 헤매며 token 낭비가 생긴다.

**Mitigation**  
single-ticket synthesis가 안 되면 질문 또는 manual `/lite-triage` 승격을 강제한다.

---

### Assumptions
- 기존 `.opencode/agents/*.md` 구조는 custom worker 추가에 적합하다.
- 기존 `.opencode/commands/*.md` 구조는 `/lite-auto` 추가를 수용할 수 있다.
- Stage 3 상태 파일은 backward compatible 확장이 가능하다.
- documented tool/task/subtask 메커니즘으로 worker delegation이 가능하다.
- 사용자는 Stage 5-lite에서도 필요 시 manual override를 허용한다.
- worker 출력 형식 강제만으로도 plugin에 heavy parser를 넣지 않고 운영 가능하다.

---

## 26. Recommended Execution Order

1. `T-601` Stage 5-lite 운영 문서/경계 확정
2. `T-602` `coder` subagent 추가
3. `T-603` `/lite-auto` manager command 설계 및 구현
4. `T-604` worker 계약 정렬
5. `T-605` state/orchestrator auto mode 확장
6. `T-606` budget/risk guard auto mode 정렬
7. `T-607` dry-run 및 운영 문서 마무리

이 순서를 따르면 문서 → worker → manager → state → guard 순으로 리스크를 줄이며 구현할 수 있다.

---

## 27. Definition of Done

이 스펙은 아래가 모두 충족되면 구현 완료로 본다.

- 사용자 요청을 받은 메인 세션이 manager처럼 동작한다.
- `/lite-auto`를 통해 worker subagent 자동 위임이 가능하다.
- `coder` subagent가 bounded implementation worker로 동작한다.
- `tester`/`fixer`/`reviewer`가 manager packet/response 계약에 맞춰 정렬된다.
- auto mode가 단일 active ticket 기준으로 구현된다.
- manager가 직접 구현보다 조율에 집중한다.
- verify/fix/review evidence-first 원칙이 유지된다.
- reviewer mandatory trigger가 구현된다.
- fix loop 상한이 동작한다.
- state 파일이 auto/manual 모두를 읽을 수 있는 수준으로 유지된다.
- `/lite-auto` 실행이 허위 성공 없이 기록된다.
- budget/risk guard가 auto mode와 충돌하지 않는다.
- manual `/lite-*` workflow가 계속 사용 가능하다.
- 전체 구조가 thin supervisor 원칙을 유지한다.

---

## 28. One-line Summary

Stage 5-lite는 기존 Stage 1~4 경량 오케스트레이션 위에 **“메인 manager 상주 + bounded worker subagent 자동 위임 + 단일 ticket 자동 루프 + manual fallback”** 을 추가하여, `oh-my-opencode`보다 훨씬 가볍지만 사용자가 체감하는 자동 orchestration에 가까운 구조를 제공하기 위한 구현 스펙이다.