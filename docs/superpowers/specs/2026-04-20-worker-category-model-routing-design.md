# 워커 카테고리 기반 모델 라우팅 설계

## 요약

이 설계는 Stage 5-lite의 bounded worker 구조를 유지한 채, `oh-my-opencode` 스타일의 `worker -> category -> model` 레이어를 현재 저장소에 얹는 것을 목표로 한다.

핵심 아이디어는 다음과 같다.

- Stage 5-lite worker 이름(`coder`, `tester`, `fixer`, `reviewer`)은 그대로 유지한다.
- 새 source-of-truth 설정 블록 `worker_model_routing`을 `opencode.jsonc`에 추가한다.
- worker는 직접 model을 가리키는 대신 category를 가리키고, category가 최종 model을 정의한다.
- 실제 OpenCode runtime 호환을 위해 plugin/helper가 해석 결과를 `agent.<worker>.model`로 materialize한다.
- `/lite-auto`와 manual command 구조는 바꾸지 않고, worker가 어떤 model로 실행되는지만 안정적으로 제어한다.

## 문제 정의

현재 저장소는 worker별 model 분리를 위해 `agent.<name>.model`을 직접 지정하는 방식에 의존한다.

이 방식은 OpenCode runtime과는 잘 맞지만, 다음 문제가 있다.

1. worker 역할군을 higher-level policy로 묶기 어렵다.
2. 여러 worker를 같은 low-tier/high-tier 정책으로 관리할 때 중복이 생긴다.
3. 설정의 의도가 `역할(category)`보다 `개별 worker`에만 묶여 보여 확장성이 떨어진다.
4. `oh-my-opencode`처럼 역할 기반 model routing을 하고 싶을 때 현재 구조만으로는 표현력이 부족하다.

반면 OpenCode runtime은 여전히 실제 실행 시 `agent.<name>.model`을 해석한다. 따라서 새 category 레이어를 추가하더라도, 최종 실행 compatibility를 위한 materialization 단계가 필요하다.

## 목표

1. worker별 model routing의 source-of-truth를 category 레벨로 올린다.
2. runtime은 그대로 `agent.<worker>.model`을 사용하게 하여 OpenCode와 즉시 호환되게 한다.
3. 기존 explicit `agent.<worker>.model` 방식도 깨지지 않게 유지한다.
4. UI에서 현재 worker가 `category-managed`인지 `agent-explicit`인지 `global fallback`인지 보이게 한다.
5. worker category가 있지만 category model이 비어 있거나 잘못되었을 때, 이를 항상 눈에 띄게 드러낸다.

## 범위

- `opencode.jsonc`에 `worker_model_routing` 블록 추가
- Stage 5-lite worker 4개만 우선 지원
  - `coder`
  - `tester`
  - `fixer`
  - `reviewer`
- helper/plugin 레벨에서 category resolution 및 materialization 구현
- `Configure Agent Models` UI를 worker-aware picker로 확장
- worker category 상태, resolved model, source 표시
- category-managed worker에 대한 `agent.<worker>.model` 동기화 규칙 정의

## 범위 제외

- `plan`, `build`를 category routing 체계로 옮기지 않는다.
- `/lite-auto` manager의 routing 알고리즘 자체는 바꾸지 않는다.
- `.opencode/agents/*.md`의 worker `mode` 또는 역할 경계를 바꾸지 않는다.
- OpenCode runtime 자체를 수정하지 않는다.
- `oh-my-opencode`처럼 category별 fallback chain 전체를 도입하지 않는다.
- provider capability normalization, concurrency policy, budget routing은 이번 단계에서 다루지 않는다.

## 선택한 접근

세 가지 선택지를 비교했다.

1. 새 `worker_model_routing` 블록을 source-of-truth로 두고 `agent.<worker>.model`을 materialize한다.
2. 새 category 블록만 두고 runtime 쪽 materialization 없이 manager/prompt 해석으로만 처리한다.
3. plugin 내부 상수로 worker-category-model 매핑을 하드코딩한다.

선택한 안은 1번이다.

이 방식은 다음 이유로 가장 적합하다.

- OpenCode runtime이 실제로 사용하는 `agent.<worker>.model`과 즉시 호환된다.
- 새 category abstraction을 도입하되, runtime과 manager 계약을 다시 설계할 필요가 없다.
- 사용자는 category를 기준으로 정책을 관리하고, 시스템은 compatibility를 위해 agent-level materialization을 수행할 수 있다.
- 추후 `plan`, `build` 또는 추가 category/fallback 정책으로 확장하기도 쉽다.

## 데이터 모델

새 설정 블록은 `opencode.jsonc`에 다음 형태로 추가한다.

```jsonc
{
  "worker_model_routing": {
    "workers": {
      "coder": { "category": "implementation" },
      "tester": { "category": "verification" },
      "fixer": { "category": "repair" },
      "reviewer": { "category": "review" }
    },
    "categories": {
      "implementation": { "model": "openai/gpt-5.4-mini" },
      "verification": { "model": "openai/gpt-5.4-mini" },
      "repair": { "model": "openai/gpt-5.4-mini" },
      "review": { "model": "openai/gpt-5.4" }
    }
  }
}
```

### 필드 의미

- `worker_model_routing.workers.<worker>.category`
  - 해당 worker가 어떤 logical category를 따르는지 정의한다.
- `worker_model_routing.categories.<category>.model`
  - category가 최종적으로 어떤 `provider/model`을 사용하는지 정의한다.

### 초기 제약

- worker key는 우선 `coder`, `tester`, `fixer`, `reviewer`만 지원한다.
- category 이름은 자유 문자열이지만, UI와 helper는 참조 무결성을 검사해야 한다.
- category가 존재하더라도 `model`이 비어 있으면 invalid configuration으로 취급한다.

## 해석 규칙

worker의 최종 실행 model은 다음 우선순위로 해석한다.

1. `worker_model_routing.workers.<worker>.category`
2. 해당 category의 `worker_model_routing.categories.<category>.model`
3. 기존 `agent.<worker>.model`
4. global/runtime fallback

이 규칙의 의미는 다음과 같다.

- worker가 category-managed면 category가 explicit agent model보다 우선한다.
- worker에 category가 없으면 기존 `agent.<worker>.model` 방식을 그대로 쓴다.
- 둘 다 없으면 기존 전역 `model` 또는 runtime inheritance/fallback으로 내려간다.

## materialization 규칙

OpenCode runtime 호환을 위해 helper/plugin는 resolved category model을 `agent.<worker>.model`로 materialize한다.

### 규칙

1. worker에 유효한 category가 있고, 그 category에 유효한 `model`이 있으면:
   - `agent.<worker>.model`을 그 값으로 동기화한다.
2. worker에 category가 있지만 category model이 없으면:
   - `agent.<worker>.model`을 자동 생성하거나 덮어쓰지 않는다.
   - UI에 `UNSET CATEGORY` 경고를 노출한다.
3. worker에 category가 없고 explicit `agent.<worker>.model`이 있으면:
   - 기존 explicit 방식으로 계속 동작한다.
4. worker category를 제거하면:
   - source는 explicit/global fallback로 다시 내려간다.
   - category-managed 때문에 생성되었던 `agent.<worker>.model`은 helper가 정리할 수 있어야 한다.

### 설계 의도

이 materialization은 runtime compatibility를 위한 출력 계층이다. 실제 정책의 source-of-truth는 `worker_model_routing`이며, manager가 worker를 고르는 방식 자체는 바꾸지 않는다.

## UX 설계

기존 `Configure Agent Models` UI는 유지하되, worker에 한해 category-aware 동작을 추가한다.

### agent 목록 화면

worker 항목에는 다음 정보를 표시한다.

- worker label
- current category
- resolved model
- source
  - `category-managed`
  - `agent-explicit`
  - `global`
- 경고 상태
  - `[UNSET CATEGORY]`
  - `[UNSET WORKER]`

예시 설명 문자열:

- `implementation -> openai/gpt-5.4-mini (category-managed) · 자동 모드 구현`
- `review -> openai/gpt-5.4 (category-managed) · 최종 검수`
- `UNSET CATEGORY - implementation has no model · 검증`
- `UNSET - explicit worker model not set; will inherit global/runtime fallback · 수정`

### worker 설정 흐름

worker를 선택하면 우선 설정 모드를 고르게 한다.

1. `Use category`
2. `Use direct model`
3. `Clear worker routing`

#### Use category

- 기존 category 선택 또는 새 category 이름 선택
- 이후 category model picker로 이동
- category model을 정하면 helper가 resolved model을 materialize한다.

#### Use direct model

- 기존 방식처럼 worker에 직접 model을 지정한다.
- 이 경우 source는 `agent-explicit`로 표시된다.

#### Clear worker routing

- worker category assignment 제거
- direct model도 제거할지 여부는 명시적으로 분리한다.
- 결과적으로 worker가 global/runtime fallback으로 돌아갈 수 있다.

### category model 설정 흐름

- category 선택 후 provider/model picker를 보여준다.
- category의 model을 바꾸면, 그 category를 참조하는 모든 worker의 materialized `agent.<worker>.model`도 재계산된다.

## 오류 처리

### invalid category reference

- worker가 존재하지 않는 category를 참조하면 UI에 오류를 보여준다.
- materialization은 중단한다.
- 기존 explicit agent model이 있으면 이를 임시 fallback으로 계속 표시할 수 있다.

### category without model

- worker는 `UNSET CATEGORY`로 표시한다.
- `agent.<worker>.model`은 자동 생성하지 않는다.
- 사용자가 category model을 지정할 때까지 unresolved 상태를 유지한다.

### category vs explicit 충돌

- 같은 worker에 category와 explicit agent model이 모두 있으면 category-managed 값을 우선한다.
- UI는 source를 `category-managed`로 보여주고, explicit 값이 shadowed 상태임을 설명할 수 있어야 한다.

## 호환성 정책

### 기존 설정과의 호환성

- 기존 `agent.coder.model`, `agent.tester.model`, `agent.fixer.model`, `agent.reviewer.model` 기반 설정은 계속 유효하다.
- `worker_model_routing`을 도입하지 않은 사용자는 현재 behavior를 그대로 유지한다.
- category-managed worker만 새 레이어의 영향을 받는다.

### Stage 5-lite 계약과의 호환성

- `/lite-auto`는 계속 canonical worker 이름(`coder`, `tester`, `fixer`, `reviewer`)을 사용한다.
- manager packet, worker output contract, fix loop cap, reviewer trigger 정책은 바꾸지 않는다.
- 이번 변경은 worker selection이 아니라 worker model resolution 계층만 바꾼다.

## 테스트 전략

### helper 테스트

다음을 검증한다.

1. worker -> category -> model resolution
2. category-managed precedence가 explicit agent model보다 높은지
3. category 제거 시 fallback이 정상 동작하는지
4. category model 변경 시 materialized `agent.<worker>.model` 값이 올바른지
5. invalid category / unset category를 정확히 감지하는지

### plugin 테스트

다음을 검증한다.

1. plugin source가 새 category resolver/helper를 사용하는지
2. worker picker가 source/status를 표시하도록 연결되어 있는지
3. 기존 command wrapper 및 helper import 경로가 유지되는지

### 수동 검증

1. `opencode.jsonc`에 `worker_model_routing`을 추가한다.
2. `coder`, `tester`, `fixer`, `reviewer`를 category-managed로 설정한다.
3. picker 첫 화면에서 category와 resolved model이 보이는지 확인한다.
4. category model을 바꾸면 관련 worker의 resolved model이 함께 바뀌는지 확인한다.
5. category model을 비우면 `UNSET CATEGORY` 경고가 나타나는지 확인한다.
6. `/lite-auto`, `/lite-verify`, `/lite-fix`, `/lite-review` 실행 시 worker model이 expected value로 적용되는지 확인한다.

## 수용 기준

- AC-1: `opencode.jsonc`에 `worker_model_routing` 블록을 정의할 수 있다.
- AC-2: `coder`, `tester`, `fixer`, `reviewer`는 category-managed 또는 direct-model 방식 중 하나로 설정할 수 있다.
- AC-3: category-managed worker는 resolved category model을 `agent.<worker>.model`로 materialize한다.
- AC-4: category가 유효하지 않거나 model이 비어 있으면 UI에서 즉시 경고한다.
- AC-5: 기존 explicit `agent.<worker>.model` 기반 설정은 backward-compatible하게 유지된다.
- AC-6: `/lite-auto`와 manual orchestration command는 구조 변경 없이 계속 동작한다.
- AC-7: UI에서 각 worker의 source가 `category-managed`, `agent-explicit`, `global` 중 무엇인지 식별 가능하다.

## 위험과 대응

### 위험 1: source-of-truth와 materialized output 이중화

대응:

- `worker_model_routing`을 source-of-truth로 명시한다.
- `agent.<worker>.model`은 generated compatibility layer로 취급한다.
- helper 테스트에서 sync consistency를 강하게 보장한다.

### 위험 2: category-managed와 explicit agent model 충돌

대응:

- precedence를 문서/코드/UI에 모두 명시한다.
- UI에서 shadowed explicit model 상태를 혼동 없이 보여준다.

### 위험 3: OpenCode runtime이 category 개념을 네이티브로 이해하지 못함

대응:

- runtime에 직접 의존하지 않고, plugin/helper materialization으로 해결한다.
- 새 layer는 purely local orchestration policy로 유지한다.

## 구현 메모

- 이 설계는 `oh-my-opencode`의 category routing 철학을 가져오되, 현재 저장소 구조에 맞게 축소한 버전이다.
- full fallback chain system이나 category별 provider priority까지 복제하지 않는다.
- 사용자 요청이 없으므로 이번 단계에서는 구현이 아니라 spec 문서화까지만 수행한다.
