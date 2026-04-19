# Stage 4 Budget/Risk Policy (Warn-First)

## 문서 목적

이 문서는 `Lite-Code`의 Stage 4에서 사용하는 **budget/risk 정책 기준**을 정의한다.  
핵심 원칙은 다음과 같다.

1. **warn-first**: 우선 경고하고, 기본 워크플로를 막지 않는다.
2. **thin guard**: plugin은 보조 계층이며 정책의 주체가 아니다.
3. **role discipline**: 고가 모델은 분기점(계획/최종검수)에 집중한다.
4. **partial retry**: 실패 시 전체 재작업이 아니라 필요한 티켓만 반복한다.

---

## 적용 범위

Stage 4 및 **Stage 5-lite(auto)** 에서 아래 요소에 적용한다.

- 역할: `manager`(메인 세션), `planner`, `coder`(manual `build` + auto `coder` worker), `tester`, `fixer`, `reviewer`
- 명령: `/lite-triage`, `/lite-implement`, `/lite-verify`, `/lite-fix`, `/lite-review`, **`/lite-auto`**
- 보조 계층: `.opencode/plugins/budget-guard.ts`
- 상태 가시성: `.opencode/state/*` (선택적/보조적 활용)

---

## Non-scope

이 정책은 아래를 포함하지 않는다.

- 자동 차단(block-first) 기본 정책
- 외부 billing API/회계 시스템 연동
- 조직 단위 중앙 정책 엔진
- 비용 정산/청구 자동화
- 완전 자동 라우팅/강제 오케스트레이션

---

## 기본 정책 원칙

## 1) Warn-first
- 위험 징후가 감지되면 우선 경고한다.
- 경고 자체는 기본적으로 실행을 막지 않는다.
- 운영자는 경고 근거를 보고 다음 명령을 선택한다.

## 2) 최소 침습성
- guard는 “보조 판단”만 제공한다.
- 티켓 범위, acceptance criteria, 역할 경계는 기존 문서(`AGENTS.md`, command/agent 정의)가 우선한다.

## 3) 예측 가능성
- 경고 조건은 문서화된 규칙으로 관리한다.
- 모호한 추론형 차단은 사용하지 않는다.

## 4) 단계적 강화
- 초기에는 경고 중심으로 시작한다.
- 반복적 오탐/미탐 데이터가 쌓이면 조건을 보정한다.
- 차단 정책이 필요해도 별도 승인 후 제한적으로 도입한다.

---

## 모델 사용 예산 정책

## A. 역할별 모델 사용 우선순위
- 고성능 모델 우선: `planner`, **`manager`(/lite-auto 메인 세션)**, `reviewer`(수동 최종 게이트·필수 트리거 시)
- 저가/고속 모델 우선: manual `build`, **auto `coder` worker**, `tester`, `fixer`

### Stage 5-lite (manager-aware) 보정
- **manager가 고가 모델을 상주하는 것 자체는 정상**이며 과도 경고 대상이 아니다.
- 경고 초점은 **구현·검증·수정 루프가 메인 고가 모델에 반복적으로 묶이는 패턴**(worker 위임 대신)이다.
- `.opencode/plugins/budget-guard.ts`는 `build`/`tester`/`fixer`/`coder` 역할에서 고가 모델이 임계치 이상 반복될 때 **Stage 5-lite 위임 힌트**(warn-only)를 낼 수 있다.
- 정확한 비용 계산기·hard block은 **비적용**(기존 Stage 4 원칙 유지).

## B. 고가 모델 과다 사용 경고 조건 (구현 기준)
아래 중 하나라도 충족하면 경고한다.

1. `tool.execute.before` (tool="task")의 `input.args`에서 감지된 고가 모델 호출 횟수가 임계치 초과
2. `implement/verify/fix` 루프에 고가 모델이 반복 사용됨
3. 동일 티켓에서 분기점 외 호출이 지속 증가 (실행 세션 내 누적 기준)

## C. 경고 메시지 최소 포함 항목
- 감지 시각
- 감지 조건(임계치/패턴)
- 관련 티켓 ID(가능하면)
- 권장 조치(예: 다음 루프는 저가 모델 역할로 복귀)

## D. 운영 가이드
- 경고 1~2회: 진행 가능, 원인 확인
- 반복 경고: triage 품질(티켓 분해/AC 명확성) 재점검
- 구조적 반복: planner 단계에서 티켓 재분해

---

## 위험 명령(risky command) 정책

## A. 정의 및 감지 대상
위험 명령은 데이터 손실, 환경 파괴, 복구 난이도 증가 가능성이 있는 실행을 의미한다.

감지 대상:
- `tool.execute.before` (tool="bash", "sh", "shell")
- `args.command`, `args.script` 및 관련 입력 필드 파싱

예시 패턴(비포괄):
- 파괴적 파일 삭제/초기화 계열 (`rm -rf`, `del`, `erase` 등)
- 무차별 권한 상승/권한 오남용 계열 (`chmod 777`, `chown` 등)
- 무검증 스크립트 파이프 실행 계열 (`curl ... | sh` 등)
- 강제 히스토리 변경 및 파괴적 git 작업 (`git reset --hard`, `git push --force` 등)

## B. 기본 처리
- 기본은 **경고만** 출력한다.
- 명령 실행 자체를 기본 차단하지 않는다.
- 단, 운영자가 수동으로 중단/재검토할 수 있어야 한다.

## C. 경고 시 권장 확인 체크리스트
- [ ] 티켓 범위 내 작업인가?
- [ ] 되돌릴 수 있는가(rollback 가능성)?
- [ ] 실행 근거(테스트 실패/로그 근거)가 충분한가?
- [ ] 더 안전한 대안이 있는가?

---

## Stage 4·5-lite 운영 플로우에서의 경고 해석

표준 **manual** 플로우:
`/lite-triage -> /lite-implement -> /lite-verify -> /lite-fix(필요 시) -> /lite-review`

**auto(Stage 5-lite)** 플로우(개념):
`/lite-auto` (manager) → worker `coder` → `tester` → (`fixer`≤2) → (`reviewer` 조건부) → 종료

경고 해석 원칙:
1. `/lite-triage`: 과도 경고는 티켓 과분화/과대범위 신호일 수 있음
2. `/lite-implement`: 고가 모델 경고가 반복되면 scope lock 재확인
3. `/lite-verify`: 근거부족 + 고가 모델 경고 동시 발생 시 검증 설계 보강
4. `/lite-fix`: 위험 명령 경고 시 최소 수정 원칙 재확인
5. `/lite-review`: reviewer는 경고 존재 자체보다 **근거와 수용기준 충족**을 우선 판단
6. `/lite-auto`: 위험 bash 경고는 **사용자 승인 모델**과 충돌하지 않게 warn-only로 유지한다. manager가 직접 파괴적 명령을 자동 실행하지 않도록 **command 계약**이 우선한다.

---

## 경고 등급(권장)

## Level 1 — Info
- 단발성 경고
- 즉시 진행 가능, 로그만 남김

## Level 2 — Caution
- 동일 유형 경고 반복
- 다음 단계 진입 전 원인 점검 권장

## Level 3 — High Attention
- 고가 모델 과다 + verify 실패/근거부족이 동반
- planner 재호출 또는 티켓 재정렬 강력 권장

> 주의: Stage 4 기본 정책은 여전히 warn-first이며, 위 등급은 “차단”이 아니라 “운영 주의 수준”이다.

---

## 정책 위반 신호와 대응

## 위반 신호
- 구현 루프에서 고가 모델이 지속 사용됨
- verify 근거 없이 review 승인 시도
- 위험 명령 경고를 반복 무시
- 티켓 범위 밖 수정이 누적됨

## 대응
1. 현재 티켓 진행 일시 정리
2. 실패/경고 근거를 `run-log`에 남김
3. 필요한 최소 후속 티켓만 생성
4. `/lite-triage`로 범위 재정의 후 부분 반복

---

## 기록/감사(경량)

권장 기록 대상:
- 경고 발생 시각/유형
- 티켓 ID/명령 단계
- 권장 조치 및 실제 조치
- 후속 결과(해소/미해소)

기록 위치(권장):
- `.opencode/state/run-log.json`
- 필요 시 운영 문서 내 간단한 회고 섹션

---

## 완료 기준 (Stage 4 policy)

아래를 만족하면 Stage 4 정책이 유효하게 운영된 것으로 본다.

- 고가 모델 과다 사용에 대해 최소 1개 이상의 경고 규칙이 동작한다.
- 위험 명령에 대해 최소 1개 이상의 경고 규칙이 동작한다.
- 경고가 workflow를 깨지 않고 보조적으로 작동한다.
- reviewer는 경고 유무가 아니라 acceptance/evidence 기반으로 최종 판정한다.
- 반려/실패 시 부분 반복 원칙이 유지된다.

---

## 한 줄 요약

Stage 4·5-lite budget/risk 정책은 **warn-first, thin-guard, evidence-first** 원칙으로 고가 모델 과사용(특히 worker 위임 대신 메인 루프에 묶인 경우)과 위험 실행을 경고하되, **manager 상주 자체를 병적으로 다루지 않으며**, 기본 오케스트레이션 흐름을 깨지 않는 경량 운영 기준이다.