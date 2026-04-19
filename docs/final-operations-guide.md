# Final Operations Guide (Stage 1~4 + Stage 5-lite)

## 문서 목적

이 문서는 `Lite-Code`의 경량 오케스트레이션 운영 기준을 **Stage 1~4 및 Stage 5-lite(auto)** 관점에서 정리한 가이드다.  
목표는 다음과 같다.

1. 운영자가 문서만 보고도 현재 단계와 다음 액션을 판단할 수 있게 한다.
2. 역할(Manager/Planner/Coder/Tester/Fixer/Reviewer) 경계를 명확히 유지한다.
3. 비용 통제(고성능 모델은 조율·검수에, 저가 worker는 구현·검증·수정에)와 품질 게이트(verify/review)를 함께 달성한다.
4. plugin은 보조 계층으로만 유지하고, 정책의 주체는 문서/agent/command에 둔다.
5. **Manual** `/lite-*`와 **Auto** `/lite-auto`를 혼동하지 않고 전환할 수 있다.

---

## 1) 운영 원칙 (공통)

- **티켓 단위 실행**: 한 번에 하나의 티켓만 구현/수정한다.
- **범위 통제**: 티켓 범위 밖 수정 금지, “좋아 보이는 추가 개선” 금지.
- **증거 중심 판단**: verify/review는 테스트·로그·재현 근거 없이 완료로 간주하지 않는다.
- **부분 반복 원칙**: 실패/반려 시 필요한 티켓만 반복한다. 전체 재작업 금지.
- **역할 분리**:
  - 상위 판단: planner/reviewer
  - 실행 반복: coder/tester/fixer
- **얇은 plugin 원칙**: plugin 제거 시에도 기본 workflow는 유지되어야 한다.

---

## 2) 역할 및 매핑 (고정)

운영 용어:
- `manager` (Stage 5-lite — **현재 메인 세션**에서 `/lite-auto`로 동작)
- `planner`
- `coder` (manual에서는 `build`, auto에서는 custom `coder` worker)
- `reviewer`
- `tester`
- `fixer`

OpenCode agent 매핑:
- `manager` → 메인 세션(별도 subagent 아님)
- `planner` → built-in `plan`
- `coder` (manual) → built-in `build`
- `coder` (auto) → custom subagent `coder`
- `reviewer` → custom subagent `reviewer`
- `tester` → custom subagent `tester`
- `fixer` → custom subagent `fixer`

---

## 3) 표준 명령 세트 (고정)

- `/lite-triage`
- `/lite-implement`
- `/lite-verify`
- `/lite-fix`
- `/lite-review`
- `/lite-auto` (Stage 5-lite **auto** 전용)

권장 실행 전략:
- `/lite-triage`: `agent: plan`, `subtask: true`
- `/lite-implement`: `agent: build`, `subtask: false`
- `/lite-verify`: `agent: tester`, `subtask: true`
- `/lite-fix`: `agent: fixer`, `subtask: true`
- `/lite-review`: `agent: reviewer`, `subtask: true`
- `/lite-auto`: **메인 세션 manager**, `subtask: false` — 내부에서만 worker subagent 호출

---

## 4) Stage별 운영 정의

## Stage 1 — 최소 실행 골격

### 목적
- plan/build/review 기본 루프 정착
- 티켓 단위 구현과 반려 시 부분 반복 확립

### 흐름
1. `/lite-triage`
2. `/lite-implement`
3. `/lite-review`

### 합격 기준
- triage가 재현 가능한 티켓 세트를 생성한다.
- implement가 티켓 범위 내 수정만 수행한다.
- review가 승인/반려를 명확히 판정한다.
- 반려 시 필요한 티켓만 재실행하는 루프가 유지된다.

---

## Stage 2 — verify/fix 루프 도입

### 목적
- 구현과 최종 리뷰 사이에 검증 전용 단계 추가
- 실패를 root-cause 기반 최소 수정으로 빠르게 수렴

### 흐름
1. `/lite-triage`
2. `/lite-implement`
3. `/lite-verify`
4. `/lite-fix` (필요 시)
5. `/lite-review`

### 핵심 규칙
- verify에서 `FAIL` 또는 `INSUFFICIENT_EVIDENCE`면 fix로 이동
- fix 후 반드시 verify 재수행
- reviewer는 최종 품질 게이트 유지

### 합격 기준
- `/lite-verify`가 AC별 `PASS/FAIL/INSUFFICIENT_EVIDENCE`를 명확히 보고
- `/lite-fix`가 실패 근거 기반 최소 수정만 수행
- `implement -> verify -> fix -> review` 루프가 재현 가능
- tester/fixer/reviewer 역할 경계가 섞이지 않음

---

## Stage 3 — 상태 기반 재개(resume) 운영

### 목적
- 중단/반려/재시도 상황에서 현재 위치와 다음 액션을 가시화
- 자동화보다 **운영 가시성** 우선

### 상태 파일 구조
- `.opencode/state/last-plan.md`
- `.opencode/state/tickets.json`
- `.opencode/state/run-log.json`

### 운영 규칙
- `last-plan.md`: 최신 triage 결과 요약
- `tickets.json`: 티켓 상태 전이 추적
- `run-log.json`: 실행/검증/수정 이벤트 로그 기록
- plugin 없이도 수동 운영 가능한 단순 포맷 유지

### 합격 기준
- 운영자가 state 파일만 보고 현재 단계와 다음 명령을 판단 가능
- 반려/재작업/완료 상태별 다음 행동이 문서화되어 있음
- resume 절차가 단계별로 재현 가능

---

## Stage 5-lite — thin supervisor (auto)

### 목적
- 사용자는 **`/lite-auto`** 한 번(또는 자연어로 auto 흐름 시작)으로 **단일 active ticket**에 대해 구현→검증→수정→(조건부)리뷰까지 **메인 manager**가 worker를 위임해 진행할 수 있다.
- **oh-my-opencode** 급 자동화가 아니라, **고정 역할 + 제한된 전이 + 상한 있는 fix 루프**만 허용한다.

### 한계·중단 조건 (필수 이해)
- 한 번에 **하나의 ticket**만 auto 루프에 태운다.
- **fix**는 기본 1회·최대 2회; 초과 시 auto 중단 후 수동 handoff.
- 요구가 모호하거나 범위를 안전히 고정할 수 없으면 **질문** 또는 **`/lite-triage`** 로 승격.
- **고위험 경로**(`AGENTS.md`, `opencode.jsonc`, `.opencode/plugins/**` 등) 변경 시 **reviewer** 생략 불가.
- plugin은 기록/경고만 — **routing brain이 아니다**.

### 수동 폴백 (언제든)
- 동일 티켓에 대해 `/lite-implement`, `/lite-verify`, `/lite-fix`, `/lite-review`를 **직접** 호출해 이어갈 수 있다.
- auto가 멈춘 지점은 `tickets.json`, `run-log.json`, `last-plan.md`로 추적한다 (`run-log`의 `/lite-auto`는 **RECORDED** 등 보수적 기록 — worker 성공을 plugin이 추정하지 않음).

### Dry-run 시나리오 A — Happy path (개념)
1. 사용자: `/lite-auto T-701 로그인 버그 수정`
2. manager: 티켓 `T-701` 확정 → `coder` worker packet 전달 → 구현 완료 보고
3. manager: `tester` packet → 모든 필수 AC `PASS`
4. manager: 저위험 변경으로 판단 → 자체 evidence snapshot으로 **DONE** 보고(또는 `reviewer` 1회)
5. 상태 파일 갱신(실제 성공은 **증거**가 있을 때만)

### Dry-run 시나리오 B — Verify 실패 → Fix → 재검증
1. `tester`: AC-2 `FAIL` → manager가 `fixer` packet (1차)
2. `fixer` 완료 → `tester` 재호출
3. `PASS` 후 종료 또는 reviewer 트리거 시 `reviewer` 호출

### Dry-run 시나리오 C — 사용자 승인 필요
1. manager가 **파괴적 셸/git** 또는 대규모 이동이 필요함을 감지
2. **자동 실행 거부** → 승인 질문 또는 manual 단계 안내
3. `auto_status: WAITING_USER` 등으로 상태에 남김

상세 스펙: `docs/stage5-lite-supervisor-implementation-spec.md`

---

## Stage 4 — budget/risk 경고 보조

### 목적
- 고가 모델 과다 사용과 위험 명령에 대한 **warn-first** 가드 추가
- 생산성 저하를 최소화하면서 비용/리스크를 조기 인지

### 구성
- `.opencode/plugins/budget-guard.ts`
- (필요 시) `.opencode/plugins/orchestrator.ts`와 함께 운영

### 정책 원칙
- block-first 금지, 경고 중심
- 불명확한 비용 신호는 우선 경고로 시작
- plugin은 판단 주체가 아니라 보조 계층

### 합격 기준
- 고가 모델 반복 사용 시 최소 1개 이상 경고 가능
- 위험 bash 명령에 대해 최소 1개 이상 경고 가능
- plugin 제거 시 workflow가 유지됨
- 정책(문서)과 구현(plugin)의 역할 경계가 명확함

---

## 5) 티켓 단위 실행 규칙 (상시 적용)

모든 티켓은 최소 다음 필드를 포함해야 한다.

- Goal
- Files to modify
- Constraints
- Acceptance criteria
- Non-scope

권장 템플릿:

```/dev/null/ticket-template.txt#L1-7
Ticket: T-XXX
Goal:
Files to modify:
Constraints:
Acceptance criteria:
Non-scope:
```

---

## 6) 명령별 운영 체크리스트

## `/lite-triage` 체크
- Scope / Non-scope / Constraints가 충돌 없이 분리되었는가
- 티켓이 구현 가능한 단위로 분해되었는가
- AC가 측정 가능하게 정의되었는가
- 위험/가정이 분리 기재되었는가

## `/lite-implement` 체크
- 단일 티켓만 대상으로 했는가
- 허용 파일 범위만 수정했는가
- Non-scope 침범이 없는가
- AC 매핑 근거를 보고에 포함했는가

## `/lite-verify` 체크
- AC별 상태가 모두 명시되었는가
- 최소 1개 이상 검증 근거(테스트/로그/재현)가 있는가
- 결과에 따라 `/lite-fix` 또는 `/lite-review`가 명확히 제시되었는가

## `/lite-fix` 체크
- 실패 근거 기반 root-cause가 명시되었는가
- 최소 수정 원칙을 지켰는가
- 재검증 요청이 구체적인가

## `/lite-review` 체크
- 최종 판정이 근거 기반인가
- verify/fix 결과와 모순이 없는가
- 반려 시 최소 후속 티켓만 제시했는가

---

## 7) 상태 전이 운영 가이드 (요약)

대표 상태 예시:
- `PLANNED`
- `READY`
- `IN_PROGRESS`
- `VERIFY_PENDING`
- `VERIFY_FAILED`
- `FIX_IN_PROGRESS`
- `REVERIFY_PENDING`
- `REVIEW_PENDING`
- `CHANGES_REQUESTED`
- `DONE`
- `BLOCKED`

대표 경로:
- Stage 1 happy path:
  - `PLANNED -> READY -> IN_PROGRESS -> REVIEW_PENDING -> DONE`
- Stage 2 verify/fix loop:
  - `PLANNED -> READY -> IN_PROGRESS -> VERIFY_PENDING -> VERIFY_FAILED -> FIX_IN_PROGRESS -> REVERIFY_PENDING -> REVIEW_PENDING -> DONE`
- 반려 후 부분 반복:
  - `... -> REVIEW_PENDING -> CHANGES_REQUESTED -> IN_PROGRESS(or FIX_IN_PROGRESS) -> ... -> DONE`

---

## 8) 운영 중 금지 사항

- 티켓 범위 밖 파일 수정
- 근거 없는 승인/통과 판정
- 실패 근거 없이 추측 수정
- 플러그인에 핵심 정책을 하드코딩
- 과도한 자동화로 경량 원칙 훼손

---

## 9) 장애/실패 대응 원칙

1. 증거 확보 우선: 로그/재현/실패 AC 식별
2. 원인 분리: 증상과 root-cause 구분
3. 최소 수정 적용: fix는 좁게, 빠르게
4. verify 재수행: 수정 후 반드시 재검증
5. review 판정: 승인/반려를 명확히 종료

---

## 10) Stage 1~4 최종 완료 조건

아래를 모두 만족하면 운영 체계가 완료된 것으로 본다.

- Stage 1:
  - native 구조와 충돌 없이 triage/implement/review 루프가 안정 동작
- Stage 2:
  - verify/fix 루프가 독립적으로 재현 가능하고 역할 경계가 명확
- Stage 3:
  - state 파일 기반으로 현재 위치 판단 및 resume가 가능
- Stage 4:
  - budget/risk 경고가 warn-first로 동작하며 workflow를 깨지 않음
- 전체 공통:
  - 정책은 문서/agent/command에 존재
  - plugin은 보조 역할에 머무름
  - 부분 반복 원칙이 일관되게 유지됨

---

## 11) 운영자용 Quick Start

### Manual (Stage 1~4)
1. 요청 수신 → `/lite-triage`
2. 티켓 1개 선택 → `/lite-implement`
3. 검증 수행 → `/lite-verify`
4. 실패 시 최소 수정 → `/lite-fix`
5. 재검증 → `/lite-verify`
6. 최종 판정 → `/lite-review`
7. 상태 파일/로그 업데이트 확인 (`.opencode/state/*`)

### Auto (Stage 5-lite)
1. 요청 수신 → `/lite-auto` (또는 자연어로 auto 흐름 시작)
2. manager가 **단일 티켓**·packet·worker 순서 결정
3. 필요 시 동일 세션에서 worker 연쇄(상한 준수)
4. 중단·승인 필요 시 사용자 입력 대기 → 이어서 manual `/lite-*` 가능
5. 상태 파일 동기화 확인 (`tickets.json` 우선, `run-log.json` 근거, `last-plan.md` 포인터)

---

## One-line Summary

`Lite-Code`의 최종 운영 표준은 native `plan/build` + custom `reviewer/tester/fixer`/`coder`(auto), prefixed commands(`/lite-auto` 포함), state 기반 resume, warn-first thin plugin을 조합해 **예측 가능하고 비용 통제 가능한 경량 오케스트레이션**을 유지하는 것이다.