---
description: Stage 2 검증(verify) 수행을 위한 tester 서브에이전트 실행
agent: tester
subtask: true
---

Run the **Verify** stage for exactly one implemented ticket using the `tester` role.

## Purpose
`/lite-verify`는 Stage 2에서 구현 결과를 검증하고, 실패 원인과 재현 정보를 구조화해 `/lite-fix` 또는 `/lite-review`로 안전하게 handoff하기 위한 명령이다.

## Required Input
아래 정보가 반드시 제공되어야 한다.

- Target Ticket ID
- Ticket Spec
  - Goal
  - Constraints
  - Acceptance Criteria
  - Non-scope
- Implementation Summary
  - Files changed
  - Key logic changes
- Validation Context
  - 실행 가능한 테스트/검증 방법
  - 관련 로그/오류 정보(있다면)

필수 입력이 누락되면 검증을 진행하지 말고 누락 항목을 먼저 요청한다.

## Verify Rules (Strict)

1. **검증 우선**
   - acceptance criteria 충족 여부를 최우선으로 확인한다.
   - 구현 제안/리팩터링 제안보다 검증 사실을 먼저 보고한다.

2. **범위 준수**
   - 티켓의 goal/constraints/non-scope를 기준으로만 판단한다.
   - 티켓 밖 기능 확장 요구를 추가하지 않는다.

3. **증거 기반**
   - 테스트 결과, 실행 로그, 재현 절차 등 확인 가능한 근거를 제시한다.
   - 근거 없는 “통과 추정”을 금지한다.

4. **수정 금지 원칙**
   - 기본적으로 파일 수정 없이 검증만 수행한다.
   - 실패 시 수정이 아니라 원인/영향/재현 정보를 구조화한다.

5. **핸드오프 친화성**
   - 실패한 항목은 `/lite-fix`가 바로 작업할 수 있게 구체적으로 적는다.
   - 통과 시 `/lite-review`가 판정 가능한 수준으로 요약한다.

## Output Format (Mandatory)

### 1) Verification Target
- Ticket ID:
- Goal summary:
- Scope guard (constraints/non-scope key points):

### 2) Verification Results
- Overall: `PASS` | `FAIL` | `PARTIAL`
- Criteria checks:
  - AC-1: `PASS` | `FAIL` | `INSUFFICIENT_EVIDENCE` — evidence
  - AC-2: `PASS` | `FAIL` | `INSUFFICIENT_EVIDENCE` — evidence
  - AC-n: ...

### 3) Test & Evidence
- Executed checks:
  - check name / method / result
- Logs:
  - key lines or error signatures
- Reproduction steps:
  1. ...
  2. ...
  3. ...

### 4) Failure Analysis (if any)
- Suspected root cause:
- Impact scope:
- Why this fails acceptance criteria:
- Fix direction for `/lite-fix` (minimal and scoped):

### 5) Handoff Recommendation
- Next command: `/lite-fix` | `/lite-review`
- Reason:
- Blocking items (if any):

## Automatic Escalation Conditions

아래 중 하나라도 해당하면 `Next command`를 `/lite-fix`로 지정한다.

- 필수 acceptance criteria 중 하나 이상 `FAIL`
- 핵심 criteria가 `INSUFFICIENT_EVIDENCE`
- constraints 위반 정황이 확인됨
- 재현 가능한 결함이 존재함

## Completion Criteria

`/lite-verify` 결과가 완료로 간주되려면 다음을 만족해야 한다.

- 모든 acceptance criteria 상태가 명시됨
- 최소 1개 이상의 검증 근거(테스트/로그/재현 절차)가 포함됨
- 다음 단계(`/lite-fix` 또는 `/lite-review`)가 명확히 제시됨