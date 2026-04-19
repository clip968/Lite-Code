---
description: Stage 1 triage/planning entrypoint for lightweight orchestration
agent: plan
subtask: true
---

Run a **planning-only triage pass** for the incoming request.

## 목적
요구사항을 구현 전에 구조화하여, `build`가 바로 실행 가능한 티켓 세트로 변환한다.  
이 단계에서는 구현/수정 없이 분석과 계획만 수행한다.

## 실행 규칙
- 코드 구현 금지
- 파일 수정 금지
- 실행/테스트 수행 금지
- 애매한 요구사항은 가정/질문으로 분리
- 티켓은 작고 독립적으로 분해
- 티켓마다 완료 조건을 측정 가능하게 작성

## 출력 형식 (반드시 고정)

### 1) Scope
- ...

### 2) Non-scope
- ...

### 3) Constraints
- ...

### 4) Tickets (ID 포함)

#### T-XXX - <title>
- Goal:
- Files to modify:
- Constraints:
- Acceptance criteria:
- Test requirements:
- Non-scope:
- Dependencies:
- Risk level:
- Notes:

(필요한 만큼 반복)

### 5) Acceptance Criteria (티켓별)
- T-XXX:
  - AC-1:
  - AC-2:

### 6) Risks / Assumptions
- Risk:
- Why it matters:
- Mitigation:

### 7) Blocking Questions (optional)
- ...

## 티켓 품질 기준
각 티켓은 반드시 다음을 포함한다.
- 명확한 Goal
- 구체적 파일 범위
- 제약 조건
- 검증 가능한 Acceptance criteria
- 비범위(Non-scope)
- 선행 의존성(있다면)

## 최종 체크
출력 직전에 다음을 확인한다.
- [ ] Scope/Non-scope가 충돌 없이 분리되었는가
- [ ] 모든 티켓이 실행 가능한 단위인가
- [ ] 각 티켓의 acceptance criteria가 측정 가능한가
- [ ] 위험 요소와 가정이 명시되었는가