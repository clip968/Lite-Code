# Stage 3 Resume Flow Guide

## 문서 목적

이 문서는 `Lite-Code`의 Stage 3에서 **상태 파일 기반 재개(resume) 절차**를 표준화한다.  
핵심 목표는 다음과 같다.

1. `.opencode/state/` 파일만 보고 현재 작업 위치를 판단할 수 있다.
2. 중단 지점에서 다음 명령(`/lite-*`)을 일관된 규칙으로 선택할 수 있다.
3. 반려/실패 시 전체 재작업이 아니라 **부분 반복 원칙**을 유지한다.

---

## 적용 범위

Stage 3는 Stage 2 워크플로를 유지하면서 상태 기록/재개 절차를 추가한다.

기본 흐름 (**manual**):

1. `/lite-triage`
2. `/lite-implement`
3. `/lite-verify`
4. `/lite-fix` (필요 시)
5. `/lite-review`

**Stage 5-lite(auto)** 는 동일 상태 파일을 사용하되, 엔트리포인트가 **`/lite-auto`** 이다. manager(메인 세션)가 worker(`coder`/`tester`/`fixer`/`reviewer`)를 순차 위임한다. 재개 시에도 **`tickets.json`의 공식 `status`가 최우선**이며, `run-log.json`의 `/lite-auto` 항목은 **보수적으로** 기록된다(플러그인이 worker 성공을 추정하지 않음). `last-plan.md`에는 `workflow_stage: stage5-lite`, `generated_by_command: /lite-auto` 등을 남길 수 있다.

Stage 3 추가점:

- 상태 파일 3종을 통해 현재 위치와 다음 행동을 결정
- 수동 운영(문서 기반)과 반자동 운영(플러그인 보조) 모두 지원

---

## 상태 파일 구조

Stage 3에서 사용하는 상태 파일:

- `.opencode/state/last-plan.md`
- `.opencode/state/tickets.json`
- `.opencode/state/run-log.json`

### 1) `last-plan.md`
역할:
- 최신 triage 결과 요약 보관
- 현재 우선 티켓 및 다음 추천 명령의 빠른 참조점

주요 확인 항목:
- `current_ticket`
- `current_step`
- `last_outcome`
- `next_recommended_command`

### 2) `tickets.json`
역할:
- 티켓 단위 상태 전이(transition) 기록
- 현재 티켓의 공식 상태(예: `IN_PROGRESS`, `VERIFY_FAILED`, `DONE`) 관리

주요 확인 항목:
- `tickets[].id`
- `tickets[].status`
- `tickets[].depends_on`
- `tickets[].history`

### 3) `run-log.json`
역할:
- 실행 이벤트 타임라인(명령, 결과, 근거 참조) 기록
- 실패 원인 및 재현 근거의 추적점 제공

주요 확인 항목:
- `entries[].command`
- `entries[].status`
- `entries[].summary`
- `entries[].nextAction`
- `entries[].evidenceRef`

---

## Resume 판단 우선순위

재개 시 아래 순서로 확인한다.

1. `tickets.json`의 해당 티켓 `status` (가장 우선)
2. `run-log.json`의 최신 `entries` (`timestamp` 기준)
3. `last-plan.md`의 `Current Resume Pointer`

충돌 시 규칙:
- `tickets.json` 상태를 우선 신뢰
- `run-log.json`으로 근거 보강
- `last-plan.md`는 요약/보조 지표로 사용

---

## 상태별 다음 명령 선택 규칙

아래 표를 기준으로 다음 명령을 선택한다.

| 티켓 상태 | 의미 | 다음 명령 |
|---|---|---|
| `PLANNED` | 계획만 있고 실행 전 | `/lite-triage` 또는 준비 완료 시 `/lite-implement` |
| `READY` | 실행 준비 완료 | `/lite-implement` |
| `IN_PROGRESS` | 구현/수정 진행 중 | `/lite-implement` 또는 중단 원인 해소 후 재개 |
| `VERIFY_PENDING` | 구현 후 검증 대기 | `/lite-verify` |
| `VERIFY_FAILED` | 검증 실패 | `/lite-fix` |
| `FIX_IN_PROGRESS` | 수정 진행 중 | `/lite-fix` |
| `REVERIFY_PENDING` | 수정 후 재검증 대기 | `/lite-verify` |
| `REVIEW_PENDING` | 최종 판정 대기 | `/lite-review` |
| `CHANGES_REQUESTED` | 리뷰 반려 | 최소 follow-up 티켓으로 `/lite-implement` 또는 `/lite-fix` |
| `BLOCKED` | 필수 입력/제약 충돌 | 차단 원인 해소 후 이전 단계 명령 재진입 |
| `DONE` | 완료 | 다음 티켓 선택 또는 종료 |
| `CANCELLED` | 취소 | 재개 없음 (새 triage 필요) |

---

## 명령 선택 결정 트리 (실무형)

1. 현재 티켓 상태 확인 (`tickets.json`)
2. 상태가 `VERIFY_FAILED` 또는 핵심 AC 근거 부족이면 `/lite-fix`
3. 상태가 `REVERIFY_PENDING`이면 `/lite-verify`
4. 상태가 `REVIEW_PENDING`이면 `/lite-review`
5. 상태가 `CHANGES_REQUESTED`이면 reviewer가 요청한 최소 티켓만 재실행
6. 상태가 `BLOCKED`면 blocker 해소 정보부터 확보 (요구사항/범위/근거)
7. 상태가 `DONE`이면 다음 의존성 해소된 티켓으로 이동

---

## 반려/실패 시 부분 반복 원칙

반드시 아래 원칙을 지킨다.

- 전체 파이프라인 재시작 금지
- 실패한 티켓(또는 reviewer가 지정한 최소 follow-up)만 반복
- 반복 단위는 가능한 짧게 유지:
  - 구현 실패 계열: `/lite-implement -> /lite-review`
  - 검증 실패 계열: `/lite-fix -> /lite-verify -> /lite-review`

---

## Resume 절차 (수동 운영)

### Step 1) 현재 티켓 식별
- `last-plan.md`의 `current_ticket` 확인
- 없으면 `tickets.json`에서 `DONE`이 아닌 가장 우선순위 티켓 선택

### Step 2) 상태 확인
- `tickets.json`에서 해당 티켓의 현재 `status` 확인
- 최신 `history` 이벤트로 마지막 전이 원인 확인

### Step 3) 근거 확인
- `run-log.json` 최신 entry에서:
  - 마지막 명령
  - 결과 상태
  - `evidenceRef` 존재 여부 확인

### Step 4) 다음 명령 선택
- 상태별 규칙표에 따라 `/lite-*` 선택
- `INSUFFICIENT_EVIDENCE`가 핵심 AC에 있으면 `/lite-fix` 또는 검증 보강 후 `/lite-verify`

### Step 5) 실행 후 상태 동기화
- 실행 결과를 `run-log.json`에 기록
- 티켓 상태 전이를 `tickets.json`에 반영
- 필요 시 `last-plan.md`의 Resume Pointer 갱신

---

## Resume 절차 (반자동 운영)

반자동 운영에서는 플러그인이 상태 기록을 보조할 수 있다.  
단, 원칙은 동일하다.

- 정책 판단(다음 명령 선택)은 문서/역할 계약 기반
- 플러그인은 기록/경고 보조만 수행
- 플러그인을 제거해도 수동 절차로 동일하게 재개 가능해야 함

---

## 시나리오 예시 A: Verify 실패 후 재개

상황:
- `tickets.json`: `status = VERIFY_FAILED`
- `run-log.json`: 최근 entry에서 AC-2 `FAIL`, 재현 절차 있음

다음 행동:
1. `/lite-fix` 실행 (실패 원인 기반 최소 수정)
2. 상태를 `REVERIFY_PENDING`으로 전이
3. `/lite-verify` 재실행
4. 통과 시 `REVIEW_PENDING` -> `/lite-review`

---

## 시나리오 예시 B: Review 반려 후 재개

상황:
- `tickets.json`: `status = CHANGES_REQUESTED`
- reviewer가 `T-FIX-1` 최소 수정 티켓 제시

다음 행동:
1. `T-FIX-1`만 선택
2. 성격에 따라 `/lite-implement` 또는 `/lite-fix`
3. 필요한 경우 `/lite-verify`
4. `/lite-review` 재판정

금지:
- 원 티켓 전체 재구현
- 비범위 개선 동반 처리

---

## 차단 상태(BLOCKED) 처리 규칙

`BLOCKED`는 멈춤이 아니라 **명시적 해소 대기 상태**다.

확인 항목:
- 무엇이 부족한가? (입력 누락/제약 충돌/근거 부족)
- 왜 현재 범위에서 안전한 진행이 불가능한가?
- 재개를 위해 필요한 최소 정보는 무엇인가?

해소 후:
- 직전 유효 상태로 되돌려 동일 명령 재시도
- 또는 triage 재수행으로 티켓 재정렬

---

## 운영 체크리스트

재개 전에:

- [ ] 현재 티켓 ID가 명확하다.
- [ ] 티켓 상태가 최신이다 (`tickets.json`).
- [ ] 마지막 실행 근거가 확인된다 (`run-log.json`).
- [ ] 다음 명령 선택 이유를 설명할 수 있다.

재개 후:

- [ ] 상태 전이가 기록되었다.
- [ ] 실패/반려 시 최소 반복 원칙을 지켰다.
- [ ] 비범위 변경이 없었다.
- [ ] 다음 실행자가 이어받을 수 있게 요약이 남았다.

---

## 자주 발생하는 실수

- `last-plan.md`만 보고 재개 결정을 내림 (상태 충돌 위험)
- `VERIFY_FAILED`인데 곧바로 `/lite-review`로 이동
- `CHANGES_REQUESTED` 이후 전체 재작업 수행
- `INSUFFICIENT_EVIDENCE`를 PASS로 오해
- 상태는 바꿨지만 근거 로그를 남기지 않음

---

## Definition of Done (Stage 3 Resume)

아래를 만족하면 resume 체계가 작동 중인 것으로 본다.

- 상태 파일만으로 현재 위치와 다음 행동을 판단 가능
- 실패/반려 케이스에서 부분 반복이 재현 가능
- `implement/verify/fix/review` 루프가 상태 전이와 일치
- 플러그인 유무와 무관하게 수동 재개가 가능

---

## 한 줄 요약

Stage 3 resume의 핵심은 `.opencode/state/`를 기준으로 **현재 티켓 상태를 먼저 판정하고, 상태 규칙에 맞는 `/lite-*` 명령을 선택해 최소 범위로 반복 실행**하는 것이다.