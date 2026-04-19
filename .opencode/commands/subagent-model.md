---
description: Switch the model for a specific subagent by editing opencode.jsonc
subtask: false
---

사용자가 이 명령을 실행하면, **서브에이전트의 모델을 직접 변경**한다.

## 실행 절차

### 1단계: 현재 상태 확인

`opencode.jsonc`를 읽고, 현재 설정된 서브에이전트 모델 목록을 아래 형식으로 보여준다.

```
현재 서브에이전트 모델 설정:
  coder   → openai/gpt-5.4-mini (explicit)
  tester  → (not set, inherits global: openai/gpt-5.4-mini)
  fixer   → (not set, inherits global: openai/gpt-5.4-mini)
  reviewer → openai/gpt-5.4 (explicit)
```

확인 대상 워커: `coder`, `tester`, `fixer`, `reviewer`
각 워커의 현재 모델은 `agent.<name>.model` 필드에서 읽는다.
명시적 설정이 없으면 최상위 `model` 필드를 global default로 표시한다.

### 2단계: 사용자에게 변경 사항 요청

아래를 묻는다:
- 어떤 서브에이전트의 모델을 바꿀 것인지
- 어떤 `provider/model` 값으로 설정할 것인지

예시 입력:
- "coder를 anthropic/claude-sonnet-4로 바꿔줘"
- "tester와 fixer를 openai/gpt-5.4-mini로 설정해줘"
- "reviewer 모델 설정을 제거해줘" (global default로 돌아감)

### 3단계: opencode.jsonc 편집

`opencode.jsonc`의 `agent` 블록을 수정한다.

**모델 설정 시:**
```jsonc
{
  "agent": {
    "<name>": { "model": "provider/model-id" }
  }
}
```

**모델 제거 시 (global default로 복귀):**
- `agent.<name>` 객체에서 `model` 키만 제거한다.
- `model` 외에 다른 속성이 없으면 `agent.<name>` 객체 자체를 제거한다.
- `model` 외에 다른 속성이 있으면 그 속성들은 유지한다.

### 4단계: 변경 확인

편집 완료 후 변경된 결과를 다시 1단계 형식으로 출력하여 사용자에게 확인시킨다.

## 제약

- `opencode.jsonc`의 기존 주석과 다른 설정 필드는 건드리지 않는다.
- `coder`, `tester`, `fixer`, `reviewer` 외의 에이전트도 `agent` 블록에 존재하면 그대로 유지한다.
- `worker_model_routing` 블록이 존재하면 이를 존중한다: category-managed 워커는 category 모델이 우선함을 안내한다.
