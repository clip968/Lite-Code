# Last Plan (Stage 3 State)

## Purpose
이 파일은 가장 최근 `/lite-triage` 결과를 사람이 빠르게 확인하고, 중단된 작업을 재개(resume)할 수 있도록 요약 저장하는 상태 파일이다.

- Source of truth: 최신 triage 결과(원문 또는 축약본)
- Update timing: triage가 완료될 때마다 갱신
- Read audience: planner / coder / tester / fixer / reviewer / operator

---

## Metadata

- plan_version: `v1`
- workflow_stage: `stage3` | `stage5-lite`
- updated_at: `YYYY-MM-DDTHH:mm:ssZ`
- generated_by_command: `/lite-triage` | `/lite-auto`
- execution_mode: `manual` | `auto` (Stage 5-lite)
- plan_id: `PLAN-YYYYMMDD-XXX`
- request_summary: `<사용자 요청 한 줄 요약>`
- manager_summary: `<Stage 5-lite: manager 한 줄 요약 (auto 시)>`
- auto_route: `<Stage 5-lite: TICKET_READY | IMPLEMENTING | VERIFYING | …>`
- current_worker: `manager` | `coder` | `tester` | `fixer` | `reviewer` | `NONE`
- loop_count: `<auto 루프 카운트>`
- waiting_reason: `<WAITING_USER/BLOCKED 시만>`

---

## 1) Scope
- ...

## 2) Non-scope
- ...

## 3) Constraints
- ...

## 4) Tickets

### T-XXX - <title>
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

---

## 5) Acceptance Criteria (Global)
- ...

---

## 6) Risks / Assumptions

### Risk 1
- Risk:
- Why it matters:
- Mitigation:

### Assumptions
- ...

---

## 7) Recommended Execution Order
1. T-...
2. T-...
3. T-...

---

## 8) Current Resume Pointer
- current_ticket: `T-...` | `NONE`
- current_step: `/lite-implement` | `/lite-verify` | `/lite-fix` | `/lite-review` | `/lite-auto` | `IDLE`
- last_outcome: `PASS` | `FAIL` | `CHANGES_REQUESTED` | `BLOCKED` | `IN_PROGRESS` | `NONE`
- next_recommended_command: `/lite-implement` | `/lite-verify` | `/lite-fix` | `/lite-review` | `/lite-triage` | `/lite-auto`

---

## 9) Operator Notes
- 수동 운영 메모를 짧게 기록한다.
- 추측 대신 근거(로그/결과/티켓 ID)를 남긴다.

### Example snapshot (operator-maintained)
- current_ticket: `T-203`
- current_step: `/lite-review`
- last_outcome: `PASS`
- next_recommended_command: `/lite-review`
- updated_at: `2026-04-19T02:15:00Z`

---
## Update Rules (Stage 3 + Stage 5-lite)
- 이 파일은 triage 결과를 덮어쓰는 방식으로 최신화한다.
- `/lite-auto`만으로 단일 티켓 계획을 세운 경우에도 동일하게 **요약·재개 포인터**를 유지한다 (`workflow_stage: stage5-lite`, `generated_by_command: /lite-auto`).
- 구현/검증/수정 중 상태 변화는 `tickets.json`과 `run-log.json`에 기록하고, 필요 시 `Current Resume Pointer`만 동기화한다.
- 실제 결과를 모르는 시점에 `PASS`/`DONE`으로 서술하지 않는다.
- 티켓 범위 밖 “좋아 보이는 개선”은 이 파일에 계획으로 추가하지 않는다(필요 시 새 triage로 분리).