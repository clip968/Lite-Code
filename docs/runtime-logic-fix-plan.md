# Runtime Logic Fix Plan

## 문서 목적

이 문서는 `Lite-Code`의 경량 오케스트레이션 구현에서 발견된 **runtime logic issue**를 수정하기 위한 계획 문서다.  
대상은 주로 다음 구성 요소다.

- `.opencode/plugins/orchestrator.ts`
- `.opencode/plugins/budget-guard.ts`
- `.opencode/commands/lite-review.md`
- `.opencode/agents/reviewer.md`
- `opencode.jsonc`

이 문서는 구현 전에 범위, 제약, 수정 티켓, 수용 기준을 고정하기 위한 **fix plan**이다.

---

## 1. Scope

이 계획의 범위는 다음을 포함한다.

- Stage 3 상태 기록 플러그인의 잘못된 성공 기록 로직 수정
- Stage 3 상태 전이/다음 액션 계산 로직 보정
- Stage 4 budget/risk guard의 위험 명령 감지 로직 보정
- 문서화되지 않았거나 런타임 보장이 약한 훅 사용 여부 재검토
- reviewer command와 reviewer agent의 출력 계약 정렬
- ticket ID 파싱 로직을 reviewer follow-up ticket 형식과 일치시키는 작업
- `opencode.jsonc`의 plugin 등록 방식 정리

---

## 2. Non-scope

이 계획은 다음을 포함하지 않는다.

- 전체 orchestration framework 재설계
- Stage 5 이상 확장
- external DB 상태 저장
- 완전 자동 상태 머신 구축
- 실제 OpenCode 내부 undocumented runtime에 의존한 복잡한 추론 로직 추가
- 기존 문서 전면 재작성
- budget/risk를 block-first 정책으로 전환
- 역할 체계(`planner/coder/tester/fixer/reviewer`) 변경

---

## 3. Constraints

- 한 번에 하나의 티켓만 구현한다.
- 수정은 발견된 runtime logic issue의 직접 원인에 한정한다.
- 플러그인은 여전히 **thin layer**로 유지한다.
- undocumented runtime behavior 의존은 최소화한다.
- 가능한 한 documented hook/event 기준으로만 수정한다.
- 상태 기록은 “추정 성공”이 아니라 “검증 가능한 상태” 기준이어야 한다.
- reviewer/fixer/tester의 역할 경계를 흐리지 않는다.
- “좋아 보이는 리팩터링”은 금지한다.
- config는 실제 사용 목적이 불분명한 항목을 최소화한다.
- 문서/agent/command/output contract는 상호 충돌하지 않아야 한다.

---

## 4. Tickets

### Ticket: T-501
### Goal:
`orchestrator.ts`가 실행 전 단계에서 성공 상태를 기록하는 문제를 제거하고, 사실과 다른 run-log 생성 가능성을 없앤다.

### Files to modify:
- `.opencode/plugins/orchestrator.ts`
- 필요 시 `.opencode/state/run-log.json` 예시
- 필요 시 관련 docs

### Constraints:
- 실행 결과를 실제로 알 수 없는 시점에는 `PASS` / `APPROVED`를 기록하지 않는다.
- state plugin은 orchestration engine처럼 커지지 않는다.
- documented hook/event 범위 안에서만 해결한다.

### Acceptance criteria:
- `/lite-verify`가 실행되기 전 자동으로 `PASS`로 기록되지 않는다.
- `/lite-review`가 실행되기 전 자동으로 `APPROVED`로 기록되지 않는다.
- state entry는 최소한 “시작됨/대기/unknown”과 같은 보수적 상태만 기록하거나, 결과를 모를 경우 기록을 생략한다.
- Stage 3 resume 판단에 오해를 주는 허위 성공 상태가 제거된다.

### Non-scope:
- full outcome inference engine 구현
- review/verify 결과를 자연어로 파싱하는 복잡한 로직
- 외부 상태 저장소 연동

---

### Ticket: T-502
### Goal:
`orchestrator.ts`의 stage 판정, next action 계산, ticket ID 파싱을 실제 workflow와 맞게 보정한다.

### Files to modify:
- `.opencode/plugins/orchestrator.ts`
- `.opencode/state/tickets.json` 예시
- `.opencode/state/last-plan.md` 예시
- 필요 시 관련 docs

### Constraints:
- Stage 1과 Stage 2의 분기를 혼동하지 않는다.
- `/lite-review`를 Stage 1 전용으로 고정 분류하지 않는다.
- follow-up ticket 형식(`T-FIX-1` 등)을 파싱 가능하게 한다.
- hard-coded happy path만 전제하지 않는다.

### Acceptance criteria:
- `/lite-review`가 Stage 1/2 공용 품질 게이트라는 점이 로직에 반영된다.
- `implement -> review` (Stage 1)와 `implement -> verify` (Stage 2) 흐름을 혼동하지 않는다.
- `verify -> fix`, `fix -> verify`, `review -> changes requested` 같은 루프를 오해하지 않는 보수적 next action 계산이 가능하다.
- `T-101`뿐 아니라 `T-FIX-1` 형식도 ticket ID로 인식된다.

### Non-scope:
- 전체 상태 머신 자동화
- planner 없이 다음 티켓 자동 선택
- run-log만으로 완전한 상태 복원 구현

---

### Ticket: T-503
### Goal:
`budget-guard.ts`의 위험 bash 명령 감지 로직이 실제 hook input shape와 맞도록 수정한다.

### Files to modify:
- `.opencode/plugins/budget-guard.ts`
- 필요 시 `docs/budget-risk-policy.md`

### Constraints:
- warn-first 정책 유지
- 위험 명령 감지는 documented hook input 기준으로 단순하게 유지
- false negative를 줄이는 것이 우선
- block-first로 바꾸지 않는다

### Acceptance criteria:
- 위험 명령 감지가 `input.tool` 문자열 형태에서도 동작 가능하다.
- documented example과 충돌하지 않는 방식으로 tool type을 판별한다.
- bash command 추출 실패 시 조용히 무시하되, 정상 케이스는 경고 가능하다.
- `rm -rf`, `git reset --hard`, `curl ... | sh` 류 패턴이 감지 대상 로직에 유지된다.

### Non-scope:
- 완전한 shell parser 구현
- command allowlist/denylist 정책 엔진 추가
- 실행 차단 기능 추가

---

### Ticket: T-504
### Goal:
`budget-guard.ts`의 high-cost model warning 기능이 실제로 동작 가능한 documented hook 기반인지 검증하고, 아니라면 축소/대체한다.

### Files to modify:
- `.opencode/plugins/budget-guard.ts`
- `docs/budget-risk-policy.md`
- 필요 시 `docs/final-operations-guide.md`

### Constraints:
- documented hook/event가 확인되지 않으면 dead code를 유지하지 않는다.
- 구현 불확실성이 높으면 기능 축소가 기능 보존보다 우선이다.
- thin guard 원칙을 유지한다.

### Acceptance criteria:
- `model.execute.before`가 documented/runtime-supported임이 확인되면 유지하고 근거를 문서에 남긴다.
- 확인되지 않으면 해당 로직을 제거하거나 “향후 확인 필요”로 문서화된 비활성 설계로 축소한다.
- Stage 4 plugin이 “동작하는 경고”만 포함하도록 정리된다.
- 문서가 실제 구현 범위를 과장하지 않는다.

### Non-scope:
- undocumented internal hook reverse engineering
- 모델 호출 감시를 위한 별도 추적 시스템 구축
- 비용 계산기 구현

---

### Ticket: T-505
### Goal:
`lite-review.md`와 `reviewer.md`의 계약을 Stage 2 evidence gate 기준으로 일치시킨다.

### Files to modify:
- `.opencode/commands/lite-review.md`
- `.opencode/agents/reviewer.md`
- 필요 시 `AGENTS.md`

### Constraints:
- reviewer는 최종 품질 게이트 역할을 유지한다.
- verify evidence 요구사항은 command와 agent 모두에서 일관되어야 한다.
- broad refactor 요구 금지 원칙 유지

### Acceptance criteria:
- reviewer agent가 Stage 2에서 verify/fix evidence를 필수 입력으로 인식한다.
- reviewer command와 agent의 출력 형식이 실질적으로 충돌하지 않는다.
- verify evidence 누락 시 반려 가능성이 문서와 에이전트 정의 양쪽에 반영된다.
- final review가 acceptance-first / evidence-based 원칙을 일관되게 따르도록 정렬된다.

### Non-scope:
- reviewer 역할 자체 변경
- tester/fixer 출력 형식 전면 개편
- Stage 1 review 규칙 제거

---

### Ticket: T-506
### Goal:
`opencode.jsonc`의 plugin 등록 방식과 최소 config 원칙을 정리한다.

### Files to modify:
- `opencode.jsonc`
- 필요 시 `docs/final-operations-guide.md`

### Constraints:
- local plugin auto-load와 config plugin registration이 중복되면 정리한다.
- config는 실제 필요한 최소 항목만 유지한다.
- runtime ambiguity를 늘리는 경로 기반 plugin 중복 선언은 피한다.

### Acceptance criteria:
- `.opencode/plugins/` 자동 로드가 충분하면 `plugin` 항목 중복 선언을 제거한다.
- config가 실제 운영 방식과 일치한다.
- 문서가 “plugin은 어디서 어떻게 로드되는가”를 과장 없이 설명한다.
- config 변경이 Stage 1~4 정책과 충돌하지 않는다.

### Non-scope:
- provider/model 대규모 설정 추가
- permission 정책 재설계
- command를 다시 config inline 방식으로 옮기는 작업

---

## 5. Acceptance Criteria (Global)

- runtime log/state가 실제 결과와 모순되는 허위 성공 상태를 기록하지 않는다.
- risky command warning이 최소 documented tool hook 기준으로 동작 가능하다.
- undocumented model hook 의존은 제거되거나 명확히 제한된다.
- review gate 문서/agent/command 계약이 일치한다.
- ticket 추적과 follow-up ID 형식이 충돌하지 않는다.
- config와 local plugin 구조가 중복/충돌 없이 정리된다.
- 전체 수정이 여전히 “경량 orchestration” 원칙을 유지한다.

---

## 6. Risks / Assumptions

### Risk 1
**Risk**  
OpenCode의 실제 런타임 hook shape가 문서 예시보다 더 제한적일 수 있다.

**Why it matters**  
plugin 수정이 문서상 타당해도 실제 런타임에서 기대대로 동작하지 않을 수 있다.

**Mitigation**  
documented hook만 우선 사용하고, 불확실한 기능은 축소한다.

---

### Risk 2
**Risk**  
state plugin에 너무 많은 상태 추론 로직을 넣으면 thin plugin 원칙이 무너질 수 있다.

**Why it matters**  
프로젝트가 “경량 orchestration”에서 “작은 프레임워크”로 비대화될 수 있다.

**Mitigation**  
보수적 기록만 허용하고, 정책 판단은 docs/agent/command에 남긴다.

---

### Risk 3
**Risk**  
reviewer contract 정렬 과정에서 Stage 1의 단순성까지 과도하게 무거워질 수 있다.

**Why it matters**  
Stage 1 사용성이 떨어지고 문서가 복잡해질 수 있다.

**Mitigation**  
Stage 2 evidence gate 요구사항은 유지하되, Stage 1 최소 흐름은 계속 허용한다.

---

### Risk 4
**Risk**  
plugin auto-load와 config registration 중 어느 방식이 실제 프로젝트 런타임에서 우선되는지 차이가 있을 수 있다.

**Why it matters**  
설정 정리 과정에서 오히려 로드 누락이 생길 수 있다.

**Mitigation**  
실제 운영 기준을 문서화하고, 중복 선언을 제거하되 런타임 확인 절차를 남긴다.

---

### Assumptions
- `.opencode/plugins/`의 local plugin auto-load는 유효하다.
- `.opencode/commands/*.md`와 `.opencode/agents/*.md`는 현재 구조대로 사용 가능하다.
- Stage 3 상태 기록은 “완전 자동화”보다 “운영 보조”가 핵심이다.
- 현재 발견된 핵심 로직 이슈는 plugin/state/review contract 계층에 집중되어 있다.

---

## 7. Recommended Execution Order

1. `T-501` Orchestrator false-success logging fix
2. `T-503` Risky bash detection fix
3. `T-504` Model hook validity review and reduction
4. `T-502` Stage/next-action/ticket parsing correction
5. `T-505` Reviewer contract alignment
6. `T-506` Config/plugin loading cleanup

---

## 8. Definition of Done

이 fix plan은 아래가 충족되면 완료된 것으로 본다.

- Stage 3 상태 기록이 허위 성공 상태를 남기지 않는다.
- Stage 3 resume 판단을 오도하는 hard-coded happy path가 제거된다.
- Stage 4 위험 명령 경고가 실제 입력 형태 기준으로 동작 가능하다.
- undocumented hook 의존이 제거되거나 명확히 축소된다.
- reviewer gate의 command/agent 계약이 일치한다.
- config/plugin 로딩 방식이 실제 운영 구조와 정합적이다.
- 전체 수정이 여전히 thin plugin / evidence-first / partial retry 원칙을 유지한다.

---

## 9. One-line Summary

이 문서는 Lite-Code의 orchestration runtime logic에서 발견된 허위 성공 기록, 위험 명령 감지 누락, undocumented hook 의존, review contract 불일치, config 중복 문제를 **작고 검증 가능한 티켓 단위 수정**으로 정리하기 위한 실행 계획이다.