# Lightweight Orchestration Implementation Spec

## 문서 목적

이 문서는 `Lite-Code` 저장소의 경량 오케스트레이션 구현 계획에 대한 **최종 동기화본**이다.  
기준은 다음 세 가지다.

1. 초기 제안서의 방향
2. OpenCode 공식 문서의 native config / agent / command / plugin 구조
3. `oh-my-opencode` 조사 결과를 반영한 단순화 원칙

이 문서는 이제 **남은 구현 작업의 source of truth**로 사용한다.  
즉, 이후 구현은 이 문서의 고정 결정 사항과 티켓 순서를 따른다.

---

## 1. Scope

이 스펙의 범위는 다음을 포함한다.

- 현재 Stage 1 산출물을 OpenCode의 **native 구조**에 맞게 재정렬
- 역할 정책 `planner / coder / reviewer / tester / fixer` 유지
- 실제 구현 시 native agent와 custom subagent의 **고정 매핑** 정의
- prefixed command 기반의 워크플로 표준화
- Stage 2의 verify / fix 루프 추가
- Stage 3의 상태 파일 구조 정의 및 얇은 orchestration plugin 추가
- Stage 4의 budget/risk guard 정책 및 얇은 guard plugin 추가
- 최종 운영 문서와 완료 기준 정리

---

## 2. Non-Scope

이 스펙은 다음을 포함하지 않는다.

- `oh-my-opencode` 수준의 대규모 orchestration framework 복제
- 자동 intent classification
- 완전 자동 라우팅
- 다단계 self-healing engine
- Claude marketplace plugin 호환 계층
- 외부 DB 기반 상태 저장
- 비용/회계/청구 시스템
- 조직 단위 정책 엔진
- 범용 OpenCode ecosystem plugin으로의 일반화
- 티켓 범위를 벗어난 리팩터링

---

## 3. Constraints

- 항상 **한 번에 하나의 티켓만 구현**한다.
- OpenCode의 **공식 documented 구조**를 우선 사용한다.
- config는 `opencode.jsonc`의 공식 `agent`, `command`, `plugin`, `permission` 구조를 따른다.
- agent 정의는 가능하면 `.opencode/agents/*.md`의 native markdown 형식을 우선 사용한다.
- command 정의는 `.opencode/commands/*.md`의 YAML frontmatter 기반 형식을 사용한다.
- 권한 제어는 `tools`보다 **`permission` 중심**으로 설계한다.
- 고가 모델은 계획과 최종 검수에 집중한다.
- 저가 모델은 구현, 검증, 수정에 집중한다.
- plugin은 **보조 계층**이어야 하며 정책의 주체가 되면 안 된다.
- plugin은 가능한 한 공식 문서에 나온 hook/event 위에서 시작한다.
- undocumented internal behavior 의존은 최소화한다.
- `.opencode/package.json`은 외부 의존성이 꼭 필요할 때만 추가한다.
- command 이름은 built-in 또는 외부 plugin과의 충돌을 줄이기 위해 **prefix 전략**을 따른다.
- 상태 관리는 `.opencode/state/` 내부의 사람이 읽을 수 있는 단순 파일 구조를 사용한다.
- plugin을 제거해도 기본 workflow는 유지되어야 한다.
- “좋아 보이는 추가 개선”은 티켓에 없으면 하지 않는다.

---

## 4. Fixed Decisions

이 섹션은 더 이상 “검토 대상”이 아니라 **확정 결정 사항**이다.

### 4.1 역할 정책 이름은 유지한다
문서/정책 레벨에서는 다음 역할을 계속 사용한다.

- `planner`
- `coder`
- `reviewer`
- `tester`
- `fixer`

이 이름은 티켓, 문서, 운영 용어에서 유지한다.

### 4.2 실제 OpenCode agent 매핑은 아래처럼 고정한다

- `planner` → OpenCode built-in `plan`
- `coder` → OpenCode built-in `build`
- `reviewer` → custom subagent `reviewer`
- `tester` → custom subagent `tester`
- `fixer` → custom subagent `fixer`

즉, Stage 1부터 custom `planner` / custom `coder`를 계속 유지하는 방향이 아니라,  
**native `plan` / `build`를 우선 활용**하는 방향으로 확정한다.

### 4.3 command 이름은 prefixed 형태로 고정한다

최종 표준 command 이름은 아래로 확정한다.

- `/lite-triage`
- `/lite-implement`
- `/lite-review`
- `/lite-verify`
- `/lite-fix`

기존 generic 이름인 `/triage`, `/implement`, `/review`, `/verify`, `/fix`는  
최종 운영 표준 이름으로 보지 않는다.

### 4.4 command agent / subtask 전략은 아래처럼 고정한다

- `/lite-triage`
  - `agent: plan`
  - `subtask: true`
- `/lite-implement`
  - `agent: build`
  - `subtask: false`
- `/lite-review`
  - `agent: reviewer`
  - `subtask: true`
- `/lite-verify`
  - `agent: tester`
  - `subtask: true`
- `/lite-fix`
  - `agent: fixer`
  - `subtask: true`

이 결정의 목적은 다음과 같다.

- planning / review / verify / fix는 main context를 과도하게 오염시키지 않음
- 구현은 main build 흐름 안에서 자연스럽게 이어짐
- 역할별 세션 경계가 더 분명해짐

### 4.5 role 정의는 native agent markdown를 우선한다

역할 프롬프트는 장기적으로 `.opencode/prompts/*.md` 분리 유지보다  
`.opencode/agents/*.md` 파일 안에서 native agent 정의로 수렴한다.

즉, 최종 방향은 다음과 같다.

- `reviewer` → `.opencode/agents/reviewer.md`
- `tester` → `.opencode/agents/tester.md`
- `fixer` → `.opencode/agents/fixer.md`

`planner`와 `coder`는 각각 built-in `plan`, `build`를 사용하므로  
별도의 custom native agent가 필수는 아니다.

### 4.6 권한 모델은 permission 중심으로 고정한다

역할별 권한은 다음 원칙을 따른다.

- `plan`
  - 읽기/분석 중심
  - 수정 금지
- `build`
  - 구현 중심
  - 필요한 수정 허용
- `reviewer`
  - 수정 금지
  - 필요 시 읽기 및 제한적 검증 허용
- `tester`
  - 기본적으로 수정 금지
  - 검증 목적의 제한적 `bash permission` 허용 가능
- `fixer`
  - 좁은 범위 수정 허용
  - 신규 기능 구현 금지

### 4.7 plugin은 얇게 유지한다

최종 plugin 범위는 아래 두 개로 제한한다.

- `.opencode/plugins/orchestrator.ts`
- `.opencode/plugins/budget-guard.ts`

그리고 책임은 다음으로 제한한다.

- `orchestrator.ts`
  - 상태 파일 기록 보조
- `budget-guard.ts`
  - 고가 모델 과다 사용 / 위험 명령 경고 보조

이 plugin들은 workflow의 핵심 판단 로직을 가지지 않는다.

---

## 5. Final Target Structure

최종 목표 디렉토리 구조는 아래와 같다.

- `AGENTS.md`
- `opencode.jsonc`
- `.opencode/agents/`
  - `reviewer.md`
  - `tester.md`
  - `fixer.md`
- `.opencode/commands/`
  - `lite-triage.md`
  - `lite-implement.md`
  - `lite-review.md`
  - `lite-verify.md`
  - `lite-fix.md`
- `.opencode/plugins/`
  - `orchestrator.ts`
  - `budget-guard.ts`
- `.opencode/state/`
  - `last-plan.md`
  - `tickets.json`
  - `run-log.json`
- `.opencode/package.json` (필요 시에만)
- `docs/`
  - `lightweight-orchestration-implementation-spec.md`
  - `stage1-dry-run.md`
  - `final-operations-guide.md`

---

## 6. Workflow Definition

### Stage 1
- `/lite-triage`
- `/lite-implement`
- `/lite-review`

### Stage 2
- `/lite-triage`
- `/lite-implement`
- `/lite-verify`
- `/lite-fix`
- `/lite-review`

### Stage 3
- Stage 2 workflow 유지
- 상태 파일 기록 및 재개 흐름 추가

### Stage 4
- Stage 3 workflow 유지
- budget/risk 경고 보조 추가

---

## 7. Tickets

### T-101 - Stage 1 native structure alignment

**Goal**
- 현재 Stage 1 산출물을 OpenCode native 구조에 맞게 정렬한다.
- generic command를 prefixed command로 교체한다.
- 기존 prompt 중심 구조를 native agent/command 구조로 전환할 준비를 마친다.

**Files to modify**
- `AGENTS.md`
- `opencode.jsonc`
- `.opencode/commands/`
- 필요 시 `.opencode/agents/`
- 관련 `docs/`

**Constraints**
- Stage 1 범위를 넘지 않는다.
- output contract와 native 구조 정렬에만 집중한다.
- built-in `plan` / `build` 매핑을 반영한다.

**Acceptance criteria**
- Stage 1 command 이름이 `/lite-triage`, `/lite-implement`, `/lite-review`로 정리된다.
- command markdown이 frontmatter 형식으로 정리된다.
- `AGENTS.md`와 command/agent 정의의 출력 계약이 충돌하지 않는다.
- 문서상 `planner -> plan`, `coder -> build` 매핑이 반영된다.

**Test requirements**
- command frontmatter 수동 검토
- role handoff 섹션 수동 검토
- Stage 1 workflow 문서 일관성 확인

**Non-scope**
- tester/fixer 추가
- state 파일 도입
- plugin 도입

**Risk level**
- Low

**Notes**
- 이 티켓은 현재 scaffold를 “개념적 골격”에서 “OpenCode native에 맞는 골격”으로 바꾸는 작업이다.

---

### T-102 - Stage 1 config and agent mapping finalization

**Goal**
- `opencode.jsonc`를 공식 구조에 맞게 보정한다.
- Stage 1의 agent/model/permission 매핑을 최종 확정한다.
- `reviewer` custom subagent의 초기 정의 방향을 고정한다.

**Files to modify**
- `opencode.jsonc`
- `.opencode/agents/reviewer.md`
- 필요 시 관련 문서

**Constraints**
- 공식 `agent`, `command`, `plugin`, `permission` 구조만 우선 사용한다.
- 모델 ID는 환경 의존 값으로 남긴다.
- `tools` 의존 대신 `permission` 중심으로 간다.

**Acceptance criteria**
- `plan`과 `build`의 역할 사용 원칙이 명확하다.
- `reviewer` subagent 정의가 존재하거나 최소 명세가 완성된다.
- config가 documented OpenCode 구조와 충돌하지 않는다.
- Stage 1 command가 올바른 agent에 연결될 수 있는 상태가 된다.

**Test requirements**
- config 구조 수동 검토
- agent permission 전략 검토
- command-to-agent mapping 검토

**Non-scope**
- tester/fixer
- verify/fix command
- plugin 구현

**Risk level**
- Medium

**Notes**
- 초기 scaffold의 `modelRef`, `systemPromptFile` 같은 개념은 공식 native 구조에 맞게 정리되어야 한다.

---

### T-103 - Stage 1 dry-run documentation

**Goal**
- Stage 1의 실제 운영 절차를 문서화한다.
- 한 개의 기능 요청이 `/lite-triage -> /lite-implement -> /lite-review`를 거치는 예시를 만든다.

**Files to modify**
- `docs/stage1-dry-run.md`
- 필요 시 `AGENTS.md`

**Constraints**
- 문서 중심 작업으로 제한한다.
- 한 개의 대표 시나리오만 먼저 다룬다.

**Acceptance criteria**
- 사용자가 문서만 읽고 Stage 1 workflow를 재현할 수 있다.
- triage ticket 예시가 포함된다.
- implement handoff 예시가 포함된다.
- review 반려 시 부분 반복 원칙이 설명된다.

**Test requirements**
- 운영 시나리오 가독성 검토
- handoff 누락 여부 검토

**Non-scope**
- Stage 2 loop
- 상태 저장
- plugin

**Risk level**
- Low

**Notes**
- 이 티켓이 있어야 실제 사용 흐름이 안정된다.

---

### T-201 - Tester subagent introduction

**Goal**
- `tester` custom subagent를 추가한다.
- 검증 전용 역할의 출력 형식과 권한 전략을 고정한다.

**Files to modify**
- `AGENTS.md`
- `.opencode/agents/tester.md`
- `opencode.jsonc`
- 관련 문서

**Constraints**
- read/verify 중심
- 기본 수정 금지
- 필요한 경우에만 제한적 `bash permission` 허용

**Acceptance criteria**
- `tester` 역할 정의가 문서와 agent file에 반영된다.
- 입력/출력 형식이 구조화된다.
- 테스트 결과, 실패 로그, 재현 방법 항목이 포함된다.
- permission 전략이 역할 목적과 일치한다.

**Test requirements**
- 샘플 verify 결과 포맷 검토
- reviewer가 tester 출력을 근거로 판단 가능한지 검토

**Non-scope**
- fixer
- state
- plugin

**Risk level**
- Medium

**Notes**
- `tester`는 구현 역할이 아니라 검증 역할이다.

---

### T-202 - Fixer subagent introduction

**Goal**
- `fixer` custom subagent를 추가한다.
- 실패 교정 전용 역할의 범위와 handoff 구조를 정의한다.

**Files to modify**
- `AGENTS.md`
- `.opencode/agents/fixer.md`
- `opencode.jsonc`
- 관련 문서

**Constraints**
- 새 기능 구현 금지
- coder보다 더 좁은 범위
- tester 결과를 근거로만 수정

**Acceptance criteria**
- `fixer` 역할 정의가 문서와 agent file에 반영된다.
- 원인, 수정 내용, 재검증 요청 형식이 포함된다.
- permission 및 mode 전략이 명확하다.
- tester -> fixer -> reviewer 흐름이 자연스럽다.

**Test requirements**
- 샘플 failure-to-fix 흐름 검토
- 범위 밖 수정 방지 문구 확인

**Non-scope**
- 신규 기능 개발
- reviewer 대체
- plugin

**Risk level**
- Medium

**Notes**
- `fixer`는 “작은 실패를 빠르게 고치는 역할”로 유지해야 한다.

---

### T-203 - Stage 2 prefixed commands

**Goal**
- `/lite-verify`, `/lite-fix`를 추가하고 command 전략을 확정한다.
- Stage 2 command 세트를 모두 prefixed 표준으로 맞춘다.

**Files to modify**
- `.opencode/commands/lite-verify.md`
- `.opencode/commands/lite-fix.md`
- 필요 시 `.opencode/commands/lite-review.md`
- `opencode.jsonc`
- 관련 문서

**Constraints**
- frontmatter 기반으로 작성한다.
- `subtask: true` 전략을 반영한다.
- main context 오염을 줄인다.

**Acceptance criteria**
- `/lite-verify`가 `tester`에 연결된다.
- `/lite-fix`가 `fixer`에 연결된다.
- command frontmatter에 필요한 필드가 포함된다.
- Stage 2 workflow가 최소 루프로 이어진다.

**Test requirements**
- `/lite-implement -> /lite-verify -> /lite-fix -> /lite-review` 흐름 점검
- command frontmatter 수동 검토

**Non-scope**
- state 자동 기록
- budget guard
- 자동 routing

**Risk level**
- Medium

**Notes**
- command 이름은 이 티켓에서 더 이상 generic 형태를 유지하지 않는다.

---

### T-204 - Stage 2 workflow documentation

**Goal**
- Stage 2 전체 워크플로를 문서에 반영한다.

**Files to modify**
- `AGENTS.md`
- `docs/` 하위 운영 문서

**Constraints**
- reviewer는 최종 품질 게이트를 유지한다.
- verify/fix loop를 명확히 설명한다.

**Acceptance criteria**
- `lite-triage -> lite-implement -> lite-verify -> lite-fix -> lite-review`가 문서화된다.
- 실패/재시도 흐름이 설명된다.
- 역할 차이가 한눈에 드러난다.

**Test requirements**
- 문서만 읽고 흐름 재현 가능한지 검토

**Non-scope**
- 상태 파일
- plugin 구현

**Risk level**
- Low

**Notes**
- Stage 2부터는 role boundary와 loop 설계가 더 중요해진다.

---

### T-301 - State schema design

**Goal**
- `.opencode/state/` 스키마를 설계한다.

**Files to modify**
- `.opencode/state/last-plan.md`
- `.opencode/state/tickets.json`
- `.opencode/state/run-log.json`
- 관련 문서

**Constraints**
- 사람이 읽을 수 있어야 한다.
- 단순해야 한다.
- plugin 없이도 수동 운영이 가능해야 한다.

**Acceptance criteria**
- `last-plan.md`의 목적과 갱신 시점이 정의된다.
- `tickets.json` 상태 전이값이 정의된다.
- `run-log.json` 항목 구조가 정의된다.
- 반려 후 재실행 시나리오를 표현할 수 있다.

**Test requirements**
- 티켓 2개 이상의 상태 변화 예시 검토
- 반려 후 resume 시나리오 검토

**Non-scope**
- 자동 상태 갱신
- 비용 계산
- 외부 DB

**Risk level**
- Medium

**Notes**
- Stage 3의 핵심은 “자동화”보다 “운영 가시성”이다.

---

### T-302 - Thin orchestrator plugin

**Goal**
- 상태 기록 보조용 얇은 orchestrator plugin을 구현한다.

**Files to modify**
- `.opencode/plugins/orchestrator.ts`
- 필요 시 `.opencode/package.json`
- 관련 문서

**Constraints**
- documented hook/event만 우선 사용한다.
- 상태 기록 보조만 담당한다.
- orchestration engine으로 확장 금지

**Acceptance criteria**
- 최소 1~2개 상태 기록 동작이 안전하게 지원된다.
- plugin 책임 범위가 문서와 코드에서 명확하다.
- plugin 제거 시 기본 workflow가 유지된다.
- hook 선택 근거가 문서에 남는다.

**Test requirements**
- 샘플 명령 실행 후 상태 파일 갱신 검토
- plugin 비활성화 시 기본 workflow 유지 여부 확인

**Non-scope**
- 자동 라우팅
- 대규모 manager/hook system
- budget policy

**Risk level**
- High

**Notes**
- `oh-my-opencode`처럼 커지는 순간 이 프로젝트의 원칙을 벗어난다.

---

### T-303 - Resume flow documentation

**Goal**
- 상태 기반 재개 절차를 문서화한다.

**Files to modify**
- `docs/` 하위 운영 문서
- 필요 시 `AGENTS.md`

**Constraints**
- `.opencode/state/` 구조를 그대로 따른다.
- 수동/반자동 운영을 둘 다 설명 가능해야 한다.

**Acceptance criteria**
- 사용자가 state 파일만 보고 현재 위치를 판단할 수 있다.
- 반려/재작업/완료 상태별 다음 행동이 문서화된다.
- resume 절차가 단계별로 정리된다.

**Test requirements**
- 가상 시나리오 2개 이상 검토
- resume 절차만 읽고 다음 command 선택 가능 여부 확인

**Non-scope**
- 자동 resume engine
- 외부 시스템 연동

**Risk level**
- Medium

**Notes**
- 상태 관리는 구현보다도 운영 문서의 명확성이 중요하다.

---

### T-401 - Budget/risk policy design

**Goal**
- budget/risk 정책을 먼저 문서화한다.

**Files to modify**
- `AGENTS.md`
- `docs/` 관련 문서

**Constraints**
- warn-first
- block-first 금지
- 불명확한 비용은 경고 수준에서 시작

**Acceptance criteria**
- 고가 모델 사용 시점이 문서화된다.
- 경고 조건이 문서화된다.
- 위험 명령 승인 원칙이 문서화된다.

**Test requirements**
- 예시 시나리오 기준 경고 규칙 검토
- 정상 사용과 과다 사용 경계 설명 가능 여부 확인

**Non-scope**
- 회계 시스템
- 외부 billing
- 조직 정책 엔진

**Risk level**
- Medium

**Notes**
- 정책이 먼저 있어야 guard plugin도 얇게 유지된다.

---

### T-402 - Thin budget guard plugin

**Goal**
- 얇은 budget/risk guard plugin을 구현한다.

**Files to modify**
- `.opencode/plugins/budget-guard.ts`
- 필요 시 `.opencode/package.json`
- 관련 문서

**Constraints**
- documented hook/event 위에서 시작한다.
- 경고 중심
- 기본 workflow를 깨지 않는다

**Acceptance criteria**
- 상위 모델 과다 호출에 대한 최소 1개 이상 경고가 가능하다.
- 위험 명령 승인 보조 최소 1개 이상이 가능하다.
- plugin 제거 시 command/agent workflow는 유지된다.
- 정책과 구현의 역할 경계가 명확하다.

**Test requirements**
- planner/reviewer 반복 호출 경고 시나리오 검토
- 위험 명령 승인 흐름 예시 검토
- plugin 적용/미적용 비교

**Non-scope**
- 자동 차단
- 외부 billing API
- 고급 감사 기능

**Risk level**
- High

**Notes**
- 이 단계에서도 “경고 도구”를 넘어서면 안 된다.

---

### T-403 - Final operations guide

**Goal**
- Stage 1~4 전체 운영 가이드를 정리한다.

**Files to modify**
- `AGENTS.md`
- `docs/final-operations-guide.md`

**Constraints**
- 운영자가 문서만 보고 다음 행동을 알 수 있어야 한다.
- 구현 세부보다 운영 기준 중심으로 작성한다.

**Acceptance criteria**
- Stage 1~4의 역할/명령/상태/가드 구조가 정리된다.
- 단계 완료 조건이 명시된다.
- 반려 시 부분 반복 원칙이 일관되게 반영된다.

**Test requirements**
- 신규 사용자가 문서만 읽고 전체 구조 이해 가능한지 검토
- 단계별 진입/종료 조건 검토

**Non-scope**
- Stage 5 이상
- 외부 플랫폼 일반화

**Risk level**
- Low

**Notes**
- 이 티켓이 끝나면 운영 지식이 문서로 닫힌다.

---

## 8. Acceptance Criteria Summary

- `T-101`
  - Stage 1이 native OpenCode 구조와 충돌하지 않는다.
- `T-102`
  - fixed agent mapping이 config에 반영된다.
- `T-103`
  - Stage 1 dry run 문서만으로 운영 가능하다.
- `T-201`
  - tester subagent가 정의된다.
- `T-202`
  - fixer subagent가 정의된다.
- `T-203`
  - Stage 2 prefixed commands가 동작 가능한 구조가 된다.
- `T-204`
  - Stage 2 workflow가 문서에 정리된다.
- `T-301`
  - state 스키마가 정의된다.
- `T-302`
  - 얇은 orchestrator plugin이 상태 기록 보조를 수행한다.
- `T-303`
  - 상태 기반 resume 절차가 문서화된다.
- `T-401`
  - budget/risk 정책이 문서화된다.
- `T-402`
  - 얇은 budget guard plugin이 최소 경고 기능을 제공한다.
- `T-403`
  - 최종 운영 가이드가 완성된다.

---

## 9. Risks / Assumptions

### Risk 1
**Risk**
- OpenCode 버전 차이로 config 세부 키나 plugin hook behavior가 달라질 수 있다.

**Why it matters**
- native 구조에 맞춘다고 해도 세부 호환성 이슈가 남을 수 있다.

**Mitigation**
- 공식 문서 기반 구조를 우선 채택한다.
- plugin은 documented hook/event로만 먼저 시작한다.
- 복잡한 내부 동작 의존을 피한다.

### Risk 2
**Risk**
- 문서/agent/command 간 출력 계약 불일치가 다시 생길 수 있다.

**Why it matters**
- handoff가 흔들리면 reviewer/tester/fixer 단계에서 혼선이 발생한다.

**Mitigation**
- T-101에서 contract를 통일한다.
- 새 role 추가 시에도 같은 형식 검토를 반복한다.

### Risk 3
**Risk**
- tester/fixer가 coder와 역할이 섞일 수 있다.

**Why it matters**
- 비용이 올라가고 workflow가 흐려진다.

**Mitigation**
- role별 금지 사항을 명시한다.
- permission 전략을 분리한다.
- 범위 밖 변경은 planner 단계로 되돌린다.

### Risk 4
**Risk**
- 상태 관리와 plugin 계층이 커질 수 있다.

**Why it matters**
- 경량 orchestration이라는 목표가 무너진다.

**Mitigation**
- state schema를 단순하게 유지한다.
- plugin은 기록/경고/보조만 담당한다.
- `oh-my-opencode`식 대규모 하네스를 복제하지 않는다.

### Risk 5
**Risk**
- budget guard가 너무 공격적으로 동작할 수 있다.

**Why it matters**
- 비용 통제는 되더라도 생산성이 저하될 수 있다.

**Mitigation**
- Stage 4 초기에는 경고 중심으로 시작한다.
- 실제 운영 경험을 바탕으로 점진적으로 강화한다.

### Risk 6
**Risk**
- command 이름이 built-in 또는 다른 plugin command와 충돌할 수 있다.

**Why it matters**
- OpenCode에서는 custom command가 built-in을 override할 수 있다.

**Mitigation**
- prefixed command를 표준으로 사용한다.
- generic command 이름은 최종 표준에서 제외한다.

### Assumptions
- OpenCode는 `.opencode/agents/`, `.opencode/commands/`, `.opencode/plugins/` 구조를 지원한다.
- built-in `plan`, `build` agent를 프로젝트 정책에 맞게 사용할 수 있다.
- custom subagent 정의가 project-local 범위에서 가능하다.
- provider/model 식별자는 환경별로 조정 가능하다.
- 사용자는 완전 자동화보다 예측 가능한 반자동 workflow를 선호한다.

---

## 10. Recommended Execution Order

1. `T-101` Stage 1 native structure alignment
2. `T-102` Stage 1 config and agent mapping finalization
3. `T-103` Stage 1 dry-run documentation
4. `T-201` Tester subagent introduction
5. `T-202` Fixer subagent introduction
6. `T-203` Stage 2 prefixed commands
7. `T-204` Stage 2 workflow documentation
8. `T-301` State schema design
9. `T-302` Thin orchestrator plugin
10. `T-303` Resume flow documentation
11. `T-401` Budget/risk policy design
12. `T-402` Thin budget guard plugin
13. `T-403` Final operations guide

---

## 11. Definition of Done

이 계획은 아래가 충족되면 완료된 것으로 본다.

- Stage 1이 OpenCode native 구조와 충돌하지 않는다.
- fixed agent mapping이 실제 구성에 반영된다.
- prefixed command 표준이 정착된다.
- Stage 2에서 verify/fix loop가 독립적으로 동작한다.
- Stage 3에서 상태 파일 기반 resume가 가능하다.
- Stage 4에서 budget/risk 경고가 얇은 plugin 계층으로 동작한다.
- 전체 시스템이 여전히 다음 원칙을 유지한다.
  - 정책은 문서와 agent/command 정의에 둔다.
  - plugin은 보조만 담당한다.
  - `oh-my-opencode`처럼 큰 하네스로 커지지 않는다.

---

## 12. One-line Summary

이 최종 스펙은 OpenCode의 native `plan/build`와 custom `reviewer/tester/fixer` subagent, 그리고 prefixed command 및 thin plugin 조합으로 경량 orchestration을 단계적으로 완성하기 위한 확정 실행 계획이다.