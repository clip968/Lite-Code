# Lite-Code v2 오케스트레이션 구현 계획서

## 1. 문서 목적

이 문서는 Lite-Code를 "역할 분리 실험" 단계에서 "상태·계약·평가 기반 운영 시스템" 단계로 전환하기 위한 v2 계획서이다.  
핵심은 기능 추가 자체가 아니라, 이미 존재하는 선언을 **강제 가능하고 측정 가능한 실행 규칙**으로 바꾸는 것이다.

---

## 2. 문제 정의

### 2.1 오케스트레이션이 얇음
현재는 프롬프트와 로그 중심이다. 상태 전이와 라우팅 규칙이 코드로 강제되지 않아 편차가 크다.

### 2.2 컨텍스트 전달 비용
메인 에이전트의 직접 탐색이 반복되면 토큰 비용, 컨텍스트 오염, 중복 탐색이 증가한다.

### 2.3 장기 지식과 실행 지식 혼합
장기 구조 지식(Wiki)과 run-local 결과(테스트 실패, patch 요약)가 분리되지 않으면 재사용성이 떨어진다.

### 2.4 평가 루프 약함
모델 조합/라우팅 정책의 성능을 지표로 비교하는 체계가 부족하다.

### 2.5 병렬 도입 리스크
좋은 아이디어라도 여러 축을 동시에 도입하면 어떤 변경이 효과를 냈는지 알 수 없고, 운영 리스크가 급증한다.

---

## 3. v2 핵심 원칙

1. **문서 먼저, 코드 나중**: 설계 합의를 문서에서 고정 후 구현한다.
2. **작게 시작, 강하게 측정**: P0에서 평가 하네스와 라우팅을 먼저 고정한다.
3. **결정은 코드에서 강제**: 라우팅/상태 전이는 `orchestrator.ts` + 순수 함수 모듈에서 검증한다.
4. **역할별 구조화 출력 강도 차등화**: tester/reviewer는 JSON 강제, coder/fixer는 diff + tail JSON.

---

## 4. 목표 아키텍처

```text
User Request
  ↓
Plan/Triage (JSON Task Packet)
  ↓
Deterministic Router
  ↓
Curator (optional) -> Context Packet + Wiki refs
  ↓
Coder/Fixer/Tester/Reviewer
  ↓
State Machine Validation
  ↓
Run Log v2 + Metrics
```

---

## 5. 메모리 계층

- **Task Packet**: 현재 티켓 실행 최소 정보(JSON 스키마 고정)
- **Working Memory**: run-local 결과(테스트, 실패 근거, patch 요약)
- **LLM Wiki**: 장기 구조 지식(개념, 의사결정, 플레이북)

핵심 규칙:

```text
long-term knowledge -> wiki/
run-local evidence -> working memory
immediate execution input -> task packet
```

---

## 6. Context Curator + Wiki 통합 정책

Wiki 조회는 Curator의 하위 기능으로 취급한다. 즉, build/coder가 Wiki를 직접 광범위하게 주입받지 않는다.

### 6.1 Curator 역할
- 관련 파일/심볼/테스트 후보 수집
- 관련 Wiki 문서 경로 제안
- 구조화된 Context Packet 반환

### 6.2 Curator 금지 사항
- 파일 수정 금지
- 구현/승인 판단 금지
- 장문 리포트 금지

### 6.3 Context Packet 예시

```json
{
  "ticket_id": "T-901",
  "relevant_files": [{"path": "src/auth/token.ts", "reason": "token validation"}],
  "key_symbols": [{"name": "parseRefreshToken", "file": "src/auth/token.ts"}],
  "test_files": [{"path": "tests/auth/token.test.ts", "reason": "token AC"}],
  "wiki_refs": ["wiki/concepts/auth-flow.md"],
  "summary": "Parsing and service-layer assumption mismatch.",
  "confidence": 0.82
}
```

### 6.4 Wiki 스코프
초기 도입 디렉터리:

```text
wiki/
  concepts/
  decisions/
  playbooks/
```

`wiki/modules/` 파일 미러링은 v2 비범위로 둔다.

---

## 7. 상태기계(v2 축소판)

### 7.1 코어 상태

```text
PLANNED
CONTEXT_READY
IMPLEMENTING
VERIFYING
VERIFIED_FAIL
REVIEWING
REVIEW_CHANGES
DONE
BLOCKED
```

### 7.2 전이 규칙

```text
PLANNED -> CONTEXT_READY | BLOCKED
CONTEXT_READY -> IMPLEMENTING | BLOCKED
IMPLEMENTING -> VERIFYING | REVIEWING | BLOCKED
VERIFYING -> REVIEWING | VERIFIED_FAIL | BLOCKED
VERIFIED_FAIL -> FIXING | BLOCKED
FIXING -> VERIFYING | BLOCKED
REVIEWING -> DONE | REVIEW_CHANGES | BLOCKED
REVIEW_CHANGES -> IMPLEMENTING | FIXING | BLOCKED
```

### 7.3 기존 12-state 매핑
- READY -> CONTEXT_READY
- IN_PROGRESS -> IMPLEMENTING
- VERIFY_PENDING/REVERIFY_PENDING -> VERIFYING
- VERIFY_FAILED -> VERIFIED_FAIL
- FIX_IN_PROGRESS -> FIXING
- REVIEW_PENDING -> REVIEWING
- CHANGES_REQUESTED -> REVIEW_CHANGES
- CANCELLED -> BLOCKED(흡수)

---

## 8. Handoff / Output 계약

### 8.1 Task Packet 입력(JSON 강제)
필수 필드:
- `packet_version`, `request_id`, `schema_version`
- `run_id`, `parent_run_id`
- `ticket_id`, `worker_role`, `goal`
- `allowed_files`, `forbidden_files`
- `constraints`, `acceptance_criteria`, `test_requirements`, `non_scope`
- `context_refs`, `risk_level`, `budget_hint`, `iteration`, `mode`

`recommended_next_role`는 제거한다.

### 8.2 역할별 출력 강도
- **tester/reviewer/curator**: JSON 스키마 강제
- **coder/fixer**: diff 요약 + tail JSON(`files_touched`, `scope_check`)

---

## 9. 라우팅 정책

라우팅은 프롬프트 가이드가 아니라 코드에서 결정적으로 처리한다.

### 9.1 판단 축
- `task_type`, `risk_level`, `interface_change`
- `requires_runtime_verification`
- `context_clarity`, `scope_size`, `prior_failure_evidence`

### 9.2 규칙(코드화 대상)

```text
if context_clarity == low:
  curator -> coder
elif task_type == review_only:
  reviewer
elif task_type == test_only:
  tester
elif risk_level in [high, critical] and interface_change:
  curator -> coder -> tester -> reviewer
elif task_type == bugfix and prior_failure_evidence:
  curator -> fixer -> tester -> reviewer
elif requires_runtime_verification:
  curator -> coder -> tester
else:
  coder
```

### 9.3 reviewer mandatory
아래 중 하나면 reviewer 필수:
- public API 변경
- auth/payment/permission 핵심 로직
- migration/config/schema 변경
- fix loop 1회 이상
- scope 확장 발생

---

## 10. 역할 재정의(v2)

- **plan**: 티켓 분해 + JSON Task Packet 생성
- **build/manager**: 워크플로 감독, 라우팅/상태 검증 트리거
- **curator**: 읽기 전용 컨텍스트 패킷 + Wiki refs 생성
- **coder**: bounded 구현
- **tester**: AC 검증(JSON 증거)
- **fixer**: 실패 증거 기반 수리
- **reviewer**: 승인/변경요청 + wiki_update 플래그

---

## 11. 평가 및 검증

### 11.1 핵심 질문
1. Curator가 비용 대비 성공률을 개선하는가?
2. Wiki refs가 반복 탐색을 줄이는가?
3. 결정적 라우팅이 scope violation을 줄이는가?
4. 구조화 출력이 fix loop를 줄이는가?

### 11.2 지표
- `first_pass_success_rate`
- `review_rejection_rate`
- `fix_loop_rate`
- `average_handoffs`
- `scope_violation_rate`
- `tokens_input/output`
- `cost_per_success`
- `wall_time_per_ticket`
- `blocked_rate`

### 11.3 데이터셋
- P0에서 gold ticket 5~10개 먼저 구축
- 이후 20~30개로 확장

---

## 12. 단계별 구현 계획

### P0. 평가 하네스 + 결정적 라우팅
- gold tickets 구축
- run-log v2 필드 확장
- metrics 스크립트/리포트
- routing 함수 + 단위 테스트

### P1. Task Packet JSON + 상태기계 축소
- packet schema 도입
- planner JSON 출력
- tickets 상태 12 -> 8 축소
- state transition validator 도입

### P2. Curator 도입(실험)
- curator agent/prompt/schema 추가
- 호출 조건 함수 + context cache
- on/off A/B 비교

### P3. Wiki 최소 도입
- concepts/decisions/playbooks 템플릿
- reviewer의 wiki_update 플래그 기반 수동 반영

---

## 13. Phase별 Kill Criteria

| Phase | Pass 기준 | Kill 기준 |
|---|---|---|
| P0 | gold ticket 재실행 지표 재현 가능 | 재현율 50% 미만 |
| P0 | 라우팅 도입 후 scope violation 개선 | handoff 1.5배↑ + 품질 악화 |
| P1 | packet 파싱 실패율 5% 미만 | 실패율 5% 이상 지속 |
| P1 | 상태 전이 오류가 낮음 | BLOCKED 고착 비율 10% 초과 |
| P2 | cost/success 개선 또는 성공률 개선 | 비용만 증가, 성공률 개선 없음 |
| P3 | wiki hit rate 20% 이상 | 2주 연속 20% 미만 |

---

## 14. 기대 효과

1. 메인 세션의 탐색 부담 감소
2. 핸드오프 입력/출력 형식 표준화
3. 장기 지식과 실행 증거 분리
4. 라우팅/모델 정책을 지표 기반으로 비교 가능
5. "Lite" 철학을 유지하면서 운영 신뢰성 향상

---

## 15. 리스크 및 완화

### 15.1 JSON 파싱 실패
- 완화: soft-fail 기간 운영 후 hard-fail 전환

### 15.2 Curator 토큰 과소비
- 완화: 호출 조건 함수 + off 스위치

### 15.3 Wiki stale
- 완화: modules 미도입, curator refs 중심 운용

### 15.4 상태 전이 버그
- 완화: validator + 전이 테스트 + BLOCKED 모니터링

---

## 16. 최종 결론

v2의 본질은 기능 확장이 아니라 **실험 구조의 운영화**다.  
즉, 라우팅/상태/패킷/평가를 순차 도입해 Lite-Code를 "프롬프트 중심 흐름"에서 "측정 가능한 오케스트레이션 시스템"으로 전환한다.

---

## 17. 다음 실행 순서

1. 문서 v2 고정
2. P0 구현(평가 하네스 + 결정적 라우팅)
3. P1 구현(JSON packet + 상태기계 축소)
4. P2/P3 스켈레톤 + 실험 플래그

---

## 18. 기존 자산 매핑

- `AGENTS.md`: 역할/권한 정책의 기준 문서(유지)
- `opencode.jsonc`: 역할별 모델 라우팅 + curator 모델 추가 지점
- `.opencode/plugins/orchestrator.ts`: 현재 run-log 기록기 -> v2에서 라우팅/상태/packet 검증 연계
- `.opencode/state/tickets.json`: 상태 선언 저장소 -> v2에서 8-state로 축소
- `.opencode/state/run-log.json`: 실행 로그 -> v2 metrics 원천

