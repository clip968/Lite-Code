# Stage 1 Dry Run Operations Guide

## 문서 목적

이 문서는 `Lite-Code`의 Stage 1 운영 흐름을 실제로 재현할 수 있도록 만드는 **실행 예시 문서**다.  
대상 흐름은 아래 3단계다.

1. `/lite-triage`
2. `/lite-implement`
3. `/lite-review`

이 문서만 읽어도 다음을 할 수 있어야 한다.

- 요청을 티켓으로 분해한다.
- 티켓 1개를 범위 안에서 구현한다.
- 리뷰에서 승인/반려를 판정한다.
- 반려 시 필요한 티켓만 부분 반복한다.

---

## Stage 1 고정 규칙 요약

### 역할/에이전트 매핑
- `planner` → built-in `plan`
- `coder` → built-in `build`
- `reviewer` → custom subagent `reviewer`

### 명령/실행 전략
- `/lite-triage`: `agent: plan`, `subtask: true`
- `/lite-implement`: `agent: build`, `subtask: false`
- `/lite-review`: `agent: reviewer`, `subtask: true`

### 운영 원칙
- 한 번에 하나의 티켓만 구현한다.
- 티켓 범위 밖 수정 금지.
- 요구가 모호하면 추측 구현하지 않고 triage로 되돌린다.
- 반려 시 전체 재작업 금지, 필요한 티켓만 반복한다.

---

## 빠른 실행 체크리스트

실행 전에 아래를 확인한다.

- [ ] 현재 단계가 Stage 1인지 확인
- [ ] 티켓 포맷(Goal / Files / Constraints / AC / Non-scope) 준비
- [ ] 구현 대상 티켓이 정확히 1개인지 확인
- [ ] 리뷰 판단 기준(acceptance criteria) 준비

---

## Dry Run 시나리오 (예시)

아래는 “사용자 프로필 API에 닉네임 길이 검증 추가”라는 가상의 요청을 기준으로 한 예시다.

### 요청(입력 예시)
- 목표: 닉네임이 2~20자가 아니면 400 응답
- 제약: 기존 API 응답 스키마 유지, 새 의존성 추가 금지
- 비범위: DB 스키마 변경, 인증 로직 변경

---

## 1) `/lite-triage` 실행 예시

### 입력 프롬프트 예시
- “프로필 업데이트 API의 nickname 검증(2~20자)을 Stage 1 기준으로 triage 해줘.  
  기존 응답 스키마 유지, 신규 의존성 금지, DB/인증 변경은 non-scope.”

### 기대 출력(요약 예시)

#### 1. Scope
- 프로필 업데이트 엔드포인트에서 nickname 길이 검증 추가
- 유효하지 않은 입력 시 400 + 기존 에러 응답 구조 반환

#### 2. Non-scope
- DB 컬럼/마이그레이션 변경
- 인증/권한 처리 변경
- 에러 응답 포맷 전면 개편

#### 3. Constraints
- 새 라이브러리 추가 금지
- 기존 라우터 구조 유지
- 기존 응답 스키마 유지

#### 4. Tickets

##### T-101 - nickname 길이 검증 추가
- Goal:
  - nickname이 2~20자가 아닐 때 요청 거부
- Files to modify:
  - `src/routes/profile.ts`
  - `src/validators/profile.ts`
- Constraints:
  - 새 의존성 추가 금지
  - 기존 응답 shape 유지
- Acceptance criteria:
  - 길이 1자: 400
  - 길이 21자: 400
  - 길이 2~20자: 기존 성공 플로우 유지
- Test requirements:
  - 경계값(1,2,20,21) 케이스 확인
- Non-scope:
  - DB/인증 로직 변경 금지
- Dependencies:
  - None
- Risk level:
  - Low
- Notes:
  - 기존 validator 유틸 우선 활용

#### 5. Acceptance Criteria (티켓별)
- T-101:
  - AC-1: 1자/21자 nickname에서 400 반환
  - AC-2: 2~20자 nickname에서 정상 처리
  - AC-3: 응답 JSON 구조가 기존과 동일

#### 6. Risks / Assumptions
- Risk: 기존 validator가 trim 처리를 이미 수행할 수 있음
- Mitigation: 기존 동작 확인 후 중복 처리 회피

---

## 2) `/lite-implement` 실행 예시

### 입력
- Target Ticket: `T-101`
- 포함 필드:
  - Goal / Files to modify / Constraints / Acceptance criteria / Non-scope

### 구현자가 지켜야 할 것
- `T-101`만 구현
- 지정 파일만 수정
- 비범위 변경 금지
- 출력은 구조화된 구현 보고로 반환

### 기대 출력 포맷(요약 예시)

#### 1. Target Ticket
- ID: T-101
- Title: nickname 길이 검증 추가
- Goal: 경계값 검증 및 기존 응답 형태 유지

#### 2. Files Changed
- `src/validators/profile.ts`: nickname length rule(2~20) 추가
- `src/routes/profile.ts`: validator 실패 시 400 응답 연결

#### 3. Implementation Summary
- Key logic added/updated:
  - nickname 길이 경계 검증 추가
- How constraints were respected:
  - 신규 의존성 없음, 기존 응답 구조 재사용
- Acceptance criteria mapping:
  - AC-1 → 경계값 실패 시 400 분기 추가
  - AC-2 → 유효 길이는 기존 서비스 호출 경로 유지
  - AC-3 → 기존 에러 응답 formatter 유지

#### 4. Known Gaps / Follow-ups
- Remaining risks: 입력 trim 여부는 기존 유틸 동작에 의존
- Assumptions: nickname은 문자열로 전달됨

---

## 3) `/lite-review` 실행 예시

리뷰는 “acceptance criteria 우선”으로 판정한다.

### 입력
- 티켓 명세(T-101)
- 구현 요약
- 변경 파일
- 검증 근거(테스트/로그)

### 승인 예시
- Decision: `APPROVED`
- Criteria Check:
  - AC-1 PASS
  - AC-2 PASS
  - AC-3 PASS
- Design/Policy Violations:
  - Scope violation: NO
  - Constraint violation: NO
- Required Follow-up Tickets:
  - None

### 반려 예시
- Decision: `CHANGES_REQUESTED`
- 사유 예:
  - AC-3이 불충족(에러 응답 키 이름 변경됨)
- Required Follow-up Tickets:
  - `T-FIX-1`: 기존 에러 응답 스키마 복원 (`src/routes/profile.ts`)

---

## 반려 시 부분 반복 원칙 (핵심)

반려되면 아래처럼 진행한다.

1. 반려에서 지정한 최소 수정 티켓만 생성/선택
2. `/lite-implement`로 해당 티켓만 수정
3. `/lite-review`로 재판정
4. 승인될 때까지 필요한 범위만 반복

금지:
- 전체 기능 재구현
- 티켓 범위 밖 “겸사 개선”

---

## 운영 중 자주 발생하는 실수

- 한 번에 여러 티켓 구현
- acceptance criteria 없이 구현 시작
- non-scope 침범(예: 인증/DB까지 변경)
- 리뷰에 근거(테스트/로그) 없이 승인 요청

---

## Definition of Ready / Done (Stage 1)

### Ready
- triage 결과에 티켓 필수 필드가 모두 존재
- 구현 대상 티켓 1개가 명확히 선택됨

### Done
- `/lite-review`에서 `APPROVED`
- scope/constraint 위반 없음
- 필요한 경우 후속 티켓이 분리되어 기록됨

---

## 한 줄 요약

Stage 1은 `/lite-triage -> /lite-implement -> /lite-review`를 티켓 단위로 반복하는 흐름이며, 반려 시에도 전체 재작업이 아니라 **필요한 티켓만 부분 반복**하는 것이 표준 운영 방식이다.