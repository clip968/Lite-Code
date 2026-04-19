# Stage 2 Operations Workflow Guide

## 문서 목적

이 문서는 `Lite-Code`의 Stage 2 운영 표준을 정리한 가이드다.  
핵심 목표는 다음 두 가지다.

1. `/lite-verify -> /lite-fix` 루프를 통해 실패를 좁은 범위에서 안정적으로 교정한다.
2. 최종 품질 게이트(`/lite-review`) 이전에 검증 근거를 구조화한다.

---

## Stage 2 워크플로 개요

Stage 2는 아래 순서를 따른다.

1. `/lite-triage`
2. `/lite-implement`
3. `/lite-verify`
4. `/lite-fix` (필요 시)
5. `/lite-review`

핵심 규칙:

- verify에서 `FAIL` 또는 `INSUFFICIENT_EVIDENCE`가 나오면 fix로 이동한다.
- fix 이후에는 반드시 verify를 재실행한다.
- reviewer는 최종 승인/반려를 결정하는 품질 게이트를 유지한다.
- 한 번에 하나의 티켓만 구현/수정한다.
- 티켓 범위 밖 수정은 금지한다.

---

## 역할 경계 요약

### Planner (`plan`)
- 책임: 요구사항 해석, 범위/티켓 분해, acceptance criteria 정의
- 제한: 파일 수정/코드 실행 금지

### Coder (`build`)
- 책임: 단일 티켓 구현
- 제한: 지정 파일/범위 밖 수정 금지

### Tester (`tester`)
- 책임: acceptance criteria 기반 검증, 테스트/로그/재현 증거 수집
- 제한: 원칙적으로 파일 수정 금지

### Fixer (`fixer`)
- 책임: verify/review 실패 원인에 대한 최소 수정
- 제한: 새 기능 구현 금지, 좁은 범위 수정

### Reviewer (`reviewer`)
- 책임: 최종 승인/반려 판정
- 제한: 원칙적으로 읽기 전용 검토

---

## 명령별 목적과 기대 산출물

## `/lite-triage`
- 목적: 요청을 실행 가능한 티켓으로 구조화
- 출력: Scope / Non-scope / Constraints / Tickets / AC / Risks

## `/lite-implement`
- 목적: 단일 티켓 구현
- 출력: Target Ticket / Files Changed / Implementation Summary / Known Gaps

## `/lite-verify`
- 목적: 구현 결과 검증 및 다음 단계 결정
- 출력:
  - Verification Target
  - Verification Results (AC별 `PASS | FAIL | INSUFFICIENT_EVIDENCE`)
  - Test & Evidence
  - Failure Analysis (필요 시)
  - Handoff Recommendation (`/lite-fix` 또는 `/lite-review`)

## `/lite-fix`
- 목적: 실패 근거 기반 최소 수정
- 출력:
  - Target Ticket
  - Root Cause
  - Files Changed
  - Fix Summary
  - Re-verify Request
  - Residual Risks / Follow-ups

## `/lite-review`
- 목적: 최종 품질 게이트
- 출력:
  - Decision (`APPROVED | CHANGES_REQUESTED`)
  - Criteria Check
  - Design/Policy Violations
  - Required Follow-up Tickets (필요 시)

---

## Verify-Fix 루프 운영 규칙

## 1) Verify 우선 판정
- acceptance criteria를 기준으로 PASS/FAIL/근거부족 판정
- 근거 없는 “대체로 통과” 표현 금지
- 증거(테스트 결과/로그/재현 절차) 필수

## 2) 실패 시 Fix로 이동
아래 중 하나라도 참이면 `/lite-fix`로 이동:

- 필수 AC 중 하나 이상 `FAIL`
- 핵심 AC가 `INSUFFICIENT_EVIDENCE`
- 재현 가능한 결함 존재
- 제약 위반 정황 확인

## 3) Fix는 최소 변경
- root-cause 중심으로 실패 경로만 교정
- 새 기능 추가 금지
- 티켓 범위 밖 수정 금지

## 4) Fix 후 Verify 재수행
- 교정 결과를 동일 AC 기준으로 다시 검증
- 반복 횟수보다 근거 품질을 우선
- 재검증 없이 review로 직행 금지

## 5) 최종 Review
- verify 근거를 기반으로 reviewer가 승인/반려 결정
- 반려 시 필요한 최소 follow-up ticket만 재실행

---

## 운영 의사결정 표

| Verify 상태 | 의미 | 다음 단계 |
|---|---|---|
| PASS | 필수 AC 충족 + 증거 충분 | `/lite-review` |
| FAIL | 필수 AC 불충족 | `/lite-fix` |
| PARTIAL | 일부 통과/일부 미확정 | `/lite-fix` (핵심 AC 기준) |
| INSUFFICIENT_EVIDENCE 존재 | 근거 부족으로 판정 불가 | `/lite-fix` 또는 검증 보강 후 재-`/lite-verify` |

---

## Dry Run 예시 A (단일 루프 성공)

시나리오: `T-201` “입력 검증 경계값 처리”

### 1) `/lite-implement`
- 변경: validator 조건문 추가
- 보고: AC-1/AC-2 대응 로직 반영

### 2) `/lite-verify`
- AC-1: PASS (경계값 1, 20 통과)
- AC-2: FAIL (빈 문자열 처리 누락)
- 로그: `expected 400, got 200` 재현됨
- Handoff: `/lite-fix`

### 3) `/lite-fix`
- Root Cause: 빈 문자열 early-return 누락
- 수정: 기존 validator 내 guard 조건 1줄 추가
- Re-verify Request: 경계값 + 빈 문자열 케이스 재실행

### 4) `/lite-verify` (재검증)
- AC-1: PASS
- AC-2: PASS
- 근거: 테스트/로그 정상
- Handoff: `/lite-review`

### 5) `/lite-review`
- Decision: `APPROVED`

---

## Dry Run 예시 B (근거부족 루프)

시나리오: `T-202` “에러 응답 구조 유지”

### 1) `/lite-implement`
- 기능 자체는 반영됨
- 단, 응답 스키마 검증 로그 미제공

### 2) `/lite-verify`
- AC-1: PASS
- AC-2: INSUFFICIENT_EVIDENCE (응답 shape 비교 근거 없음)
- Handoff: `/lite-fix` (또는 검증 보강)

### 3) `/lite-fix`
- 코드 수정 없이, 필요한 검증 포인트/로그 수집 경로를 명확화
- 필요 시 최소 범위 instrumentation 추가(티켓 허용 범위 내)

### 4) `/lite-verify` (재검증)
- AC-2: PASS (응답 키/값 구조 비교 근거 확보)
- Handoff: `/lite-review`

### 5) `/lite-review`
- Decision: `APPROVED`

---

## 실패 분석 작성 가이드 (Tester/Fixer 공통)

실패 보고에는 아래 항목이 있어야 한다.

- 무엇이 실패했는가 (AC 기준)
- 어떤 조건에서 재현되는가
- 기대 결과 vs 실제 결과
- 실패가 티켓 목적에 미치는 영향
- 최소 수정 방향(파일/모듈 단위)

금지 사항:

- 근거 없는 원인 단정
- 광범위 리팩터링 제안
- “일단 큰 수정” 접근

---

## 반려/실패 시 부분 반복 원칙

반려 또는 검증 실패 시 아래만 반복한다.

- 실패한 티켓(또는 필요한 최소 follow-up ticket)
- `implement -> verify -> fix -> verify -> review`의 최소 구간

전체 재작업은 금지한다.

---

## 체크리스트

## Verify 전
- [ ] 티켓 ID와 AC가 명확한가
- [ ] 구현 요약과 변경 파일이 준비되었는가
- [ ] 검증 방법(테스트/재현 절차)이 정의되었는가

## Fix 전
- [ ] 실패 근거(로그/재현)가 충분한가
- [ ] 수정 허용 파일 범위가 명시되었는가
- [ ] non-scope 침범 가능성이 없는가

## Review 전
- [ ] 필수 AC가 모두 PASS인가
- [ ] INSUFFICIENT_EVIDENCE 항목이 해소되었는가
- [ ] scope/constraint 위반이 없는가

---

## 운영 팁

- verify 결과를 “판정 + 증거 + 다음 명령” 3요소로 고정하면 handoff 품질이 올라간다.
- fix는 “무엇을 고쳤는지”보다 “왜 그 수정이 AC를 회복하는지”를 중심으로 보고한다.
- reviewer가 빠르게 판단할 수 있도록 AC 매핑을 항상 유지한다.

---

## Definition of Done (Stage 2)

아래를 만족하면 Stage 2 운영이 완료된 것으로 본다.

- `/lite-verify`가 AC별 PASS/FAIL/근거부족을 명확히 보고한다.
- `/lite-fix`가 실패 근거 기반 최소 수정만 수행한다.
- fix 이후 verify 재수행이 누락되지 않는다.
- 최종적으로 `/lite-review`에서 승인/반려가 근거 기반으로 판정된다.
- 부분 반복 원칙이 유지된다.

---

## 한 줄 요약

Stage 2는 `lite-implement -> lite-verify -> lite-fix -> lite-verify -> lite-review`의 증거 기반 루프를 통해, 실패를 좁은 범위에서 교정하고 최종 승인 품질을 안정화하는 운영 단계다.