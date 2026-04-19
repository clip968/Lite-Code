# 자동 워커 모델 라우팅 설계

## 요약

이 설계는 Stage 5-lite 구조를 유지한 채, 고성능 메인 세션 manager가 구현 중심 작업을 저가 worker subagent에 자동 위임하도록 만드는 데 초점을 둔다.

첫 구현 단계에서는 모든 worker를 메인 TUI의 `Tab` 순환 대상으로 노출하지 않는다. 대신 비용 절감 목표에 직접 연결되는 부분을 우선 구현한다.

- `coder`, `tester`, `fixer`, `reviewer`를 bounded `subagent` worker로 유지한다.
- 에이전트별 모델 할당을 실제 프로젝트 명령과 기존 TUI model picker를 통해 쉽게 수행할 수 있게 한다.
- worker에 explicit `agent.<name>.model`이 없으면 picker 목록에서 즉시 보이도록 경고 상태를 표시한다.
- `/lite-auto`가 동일한 worker 이름으로 계속 라우팅되도록 유지하여, 설정한 worker별 모델이 실제 실행에 반영되게 한다.

## 문제 정의

이 저장소는 이미 Stage 5-lite의 `manager -> worker` 위임 구조를 갖고 있지만, 현재 model-config 진입점은 플러그인 커맨드에 머물러 있다. 사용자의 핵심 목표도 수동 에이전트 전환 자체가 아니라 다음에 가깝다.

1. 메인 모델은 오케스트레이션을 담당하는 brain으로 남는다.
2. 구현/검증/수정처럼 실행량이 많은 역할에는 더 저렴한 모델을 배치한다.
3. `/lite-auto`가 그 worker들을 자동으로 호출할 수 있어야 한다.
4. 모델 할당은 OpenCode 내부에서 관리 가능해야 하며, 설정 파일을 직접 편집하지 않아도 되어야 한다.

## 선택한 접근

### 왜 이 접근을 선택했는가

다음 세 가지 선택지를 비교했다.

1. 모든 worker를 `mode: all`로 올려 메인 TUI의 `Tab` 순환 대상에 포함한다.
2. worker를 `subagent`로 유지하면서 모델 설정 UX와 auto 라우팅 연동을 강화한다.
3. worker는 숨긴 채, 수동 노출용 wrapper agent를 따로 추가한다.

선택한 안은 2번이다.

이 방식이 저장소의 Stage 5-lite 목표와 가장 잘 맞는다. 즉, 비싼 메인 모델은 판단과 조율에 집중하고, 실제 구현/검증/수정 노동은 저가 worker가 담당한다. 반대로 모든 worker를 직접 선택 가능한 메인 agent로 노출하면, 자동 위임 구조보다 수동 UX를 우선하게 되고 현재 스펙이 의존하는 packet 기반 worker 경계를 약하게 만들 수 있다.

## 범위

- Stage 5-lite의 `manager -> coder/tester/fixer/reviewer` 위임 구조를 유지한다.
- worker agent는 `mode: subagent`를 유지한다.
- 모델 설정용 실제 프로젝트 명령 진입점, 예를 들어 `/agent-models`를 추가한다.
- 기존 `.opencode/plugins/model-config.ts`의 TUI model picker를 재사용한다.
- 모델 저장 위치는 계속 `opencode.jsonc`의 `agent.<name>.model`을 사용한다.
- 모델 설정 대상은 다음 에이전트를 모두 포함한다.
  - `plan`
  - `build`
  - `coder`
  - `tester`
  - `fixer`
  - `reviewer`

## 범위 제외

- 이번 구현에서 worker agent를 `mode: all` 또는 `mode: primary`로 바꾸지 않는다.
- `reviewer`, `tester`, `fixer`, `coder`를 메인 프롬프트의 `Tab` 순환 대상으로 직접 노출하지 않는다.
- 기존 Stage 5-lite manager 라우팅 모델 자체를 바꾸지 않는다.
- 모델 프리셋 묶음이나 프로필 일괄 전환 기능은 넣지 않는다.
- `.opencode/agents/*.md` frontmatter를 직접 수정하는 방식은 다루지 않는다.

## 아키텍처

### 1. Worker 식별자는 그대로 유지한다

`coder`, `tester`, `fixer`, `reviewer`는 계속 canonical worker 이름으로 유지한다. `/lite-auto`는 이미 이 이름들로 worker를 호출하고 있고, model-config 플러그인도 이 이름 기준으로 에이전트별 모델 값을 저장하고 있다.

이렇게 하면 다음 매핑이 깔끔하게 유지된다.

- manager가 라우팅할 대상 이름 -> worker 이름
- worker 이름 -> `agent.<name>.model`
- `agent.<name>.model` -> 실제 실행 시 사용되는 provider/model

### 2. 모델 설정 진입점

모델 설정은 두 개의 사용자 진입점으로 제공한다.

- command palette 항목: `Configure Agent Models`
- 프로젝트 slash command: `/agent-models` 및 짧은 alias 예: `/models`

두 진입점은 반드시 같은 TUI 선택 흐름을 열어야 한다. 그래야 구현 경로가 하나로 유지되고, 실제 설정 로직도 하나의 소스 오브 트루스로 관리된다.

### 3. 저장 계층

선택된 값은 기존 방식대로 `opencode.jsonc`의 `agent.<name>.model`에 저장한다.

예시:

- `agent.coder.model = "openai/gpt-5.4-mini"`
- `agent.tester.model = "openai/gpt-5.4-mini"`
- `agent.reviewer.model = "openai/gpt-5.4"`

에이전트별 모델 값을 제거하면 전역 `model` 값으로 자연스럽게 fallback된다.

## 컴포넌트 설계

### A. `.opencode/plugins/model-config.ts`

책임:

- 설정 가능한 에이전트 목록 제공
- 에이전트별 현재 유효 모델 읽기
- 런타임 provider/model 목록 표시
- `agent.<name>.model` 업데이트
- 현재 할당 상태와 역할/비용 힌트 표시

예상 변경:

- 현재의 2단계 dialog 흐름은 유지한다.
- 라벨과 설명을 Stage 5-lite 역할에 더 맞게 정리한다.
- 프로젝트 명령에서 재사용 가능한 trigger 경로를 제공한다.
- `Use default` 동작은 유지하되, explicit override가 없는 상태를 실제로 `unset/default`로 표시한다.

### B. `.opencode/commands/agent-models.md`

책임:

- slash 목록에 보이는 실제 프로젝트 명령을 제공한다.
- 사용자가 `/`에서 발견 가능한 모델 설정 진입점 역할을 한다.
- 채팅으로 설정을 흉내 내는 대신, 실제 model-config UI를 열도록 연결한다.

이 명령이 필요한 이유는, 현재 설치된 런타임에서 plugin command의 `slash` 메타데이터가 실제 slash autocomplete와 안정적으로 연결된다는 근거가 없기 때문이다. 반면 `.opencode/commands/*.md` 기반 프로젝트 명령은 slash 탐색에 노출된다.

### C. `/lite-auto` 계약

이번 단계에서는 `/lite-auto`의 라우팅 구조를 다시 설계하지 않는다. 계약은 그대로 유지한다.

- 메인 세션은 manager로 동작한다.
- manager는 이름이 정해진 worker에게 위임한다.
- worker가 사용할 모델은 그 이름에 대응하는 `agent.<name>.model` 설정에서 온다.

즉, 이번 구현은 packet 기반 worker 흐름을 깨지 않는 범위에서만 진행해야 한다.

## 데이터 흐름

### 모델 설정 흐름

1. 사용자가 `/agent-models`를 실행하거나 command palette에서 `Configure Agent Models`를 선택한다.
2. 공통 TUI 흐름이 설정 가능한 에이전트 목록을 보여준다.
3. 사용자가 한 에이전트를 선택한다.
4. TUI가 현재 사용 가능한 provider/model 목록과 `Use default` 항목을 보여준다.
5. 사용자가 모델을 선택하면 플러그인이 `agent.<name>.model` 값을 기록한다.
6. 이후 manual 또는 auto 실행에서 해당 에이전트는 그 설정을 사용한다.

### 자동 실행 흐름

1. 사용자가 `/lite-auto`를 실행한다.
2. 메인 세션 manager가 현재 티켓 상태를 보고 다음 worker를 고른다.
3. manager가 `coder`, `tester`, `fixer`, `reviewer` 중 하나를 이름으로 호출한다.
4. OpenCode가 해당 worker 이름에 대응하는 `agent.<name>.model` 설정을 해석한다.
5. worker는 사용자가 미리 지정한 더 저렴하거나 더 적합한 모델로 실행된다.

## UX 세부 사항

- 에이전트 목록은 flat + searchable 구조를 유지한다.
- 각 에이전트 항목에는 다음 정보를 함께 보여준다.
  - 사람이 읽기 쉬운 label
  - 현재 유효 모델
  - low-tier / high-tier 정책 힌트
  - 짧은 역할 설명
- `coder`, `tester`, `fixer`, `reviewer`에 explicit model이 없으면 title 또는 description에서 즉시 눈에 띄는 `UNSET` 경고를 보여준다.
- 이 경고는 단순히 "global default 사용 중"으로 축약하지 않고, worker가 explicit model 없이 실행되면 invoking primary agent를 inherit한다는 점을 분명히 드러내야 한다.
- 모델 목록은 provider 기준으로 그룹핑한다.
- 성공 toast는 항상 에이전트 이름과 최종 모델 값 또는 `default`를 함께 표시한다.
- 런타임 provider 목록을 불러오지 못하면 명확한 오류 toast를 보여주고, 안전하게 이전 화면으로 돌아가거나 종료한다.

## 오류 처리

- config를 읽지 못하면 오류 toast를 보여주고 진행하지 않는다.
- providers 목록을 읽지 못하면 오류 toast를 보여주고 안전하게 복귀한다.
- config update가 실패하면 가능하면 실제 오류 메시지를 그대로 노출한다.
- slash command wrapper가 UI를 직접 열 수 없는 구조라면, 성공한 척하지 말고 명확히 실패를 드러내야 한다.

## 테스트 전략

### 수동 검증

1. slash command 목록에서 `/agent-models`를 찾을 수 있는지 확인한다.
2. command palette 항목과 동일한 UI가 열리는지 확인한다.
3. `coder`, `tester`, `fixer`, `reviewer`에 서로 다른 모델을 할당한다.
4. `opencode.jsonc`에 기대한 `agent.<name>.model` 값이 기록되는지 확인한다.
5. `Use default`를 선택해 한 에이전트의 override를 제거하고 fallback이 정상 동작하는지 확인한다.
6. 안전한 작업으로 `/lite-auto`를 실행해, worker 이름 기반 라우팅이 깨지지 않는지 확인한다.

### 수용 기준

- AC-1: 사용자는 실제 slash command를 통해 모델 설정 기능을 발견할 수 있다.
- AC-2: model picker는 Stage 5-lite worker를 포함한 모든 오케스트레이션 관련 에이전트를 지원한다.
- AC-3: 모델 선택 시 `agent.<name>.model = "provider/model"`이 저장된다.
- AC-4: `Use default` 선택 시 다른 agent 설정 필드를 깨뜨리지 않고 per-agent model override만 제거된다.
- AC-5: worker 이름을 바꾸지 않기 때문에 `/lite-auto`는 worker별 모델 설정과 계속 호환된다.
- AC-6: 이번 변경으로 `coder`, `tester`, `fixer`, `reviewer`의 bounded `subagent` 역할 경계가 약해지지 않는다.
- AC-7: worker에 explicit model이 없으면 agent picker에서 `UNSET`/inheritance 상태가 항상 보인다.

## 위험과 대응

### 위험 1: slash wrapper와 plugin command가 서로 분리될 수 있음

대응:

- 하나의 shared trigger 경로를 만든다.
- slash command는 얇은 UI 진입점으로만 유지한다.
- 모델 업데이트 로직은 중복 구현하지 않는다.

### 위험 2: 사용자가 즉시 `Tab` 기반 worker 전환도 기대할 수 있음

대응:

- 이번 구현은 자동 저비용 worker 위임을 우선한다는 점을 문서와 설명에서 분명히 한다.
- `Tab` 노출은 auto 경로가 안정화된 뒤의 후속 단계로 다룬다.

### 위험 3: config 갱신 시 다른 agent 설정 필드가 지워질 수 있음

대응:

- 모델 설정 시 기존 merge 동작을 유지한다.
- 모델 override 제거 시 non-model 필드는 보존한다.

## 구현 메모

- 이 설계는 수동 agent 선택 UX보다 auto-delegation 비용 구조를 우선한다.
- 저장소 정책상 사용자가 명시적으로 요청하지 않는 한 git commit은 만들지 않는다.
