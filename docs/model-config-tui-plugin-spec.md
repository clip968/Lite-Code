# Model Config TUI Plugin 구현 스펙

## 문서 목적

이 문서는 OpenCode TUI 플러그인 API를 활용하여, 사용자가 **에이전트별 모델(provider/model)을 OpenCode 내부에서 직접 설정**할 수 있는 인터랙티브 UI 플러그인의 구현 스펙이다.

핵심 설계 원칙:

1. 모델 설정은 **사람의 결정**이다. AI tool이 아닌 TUI로 구현한다.
2. 같은 모델이라도 provider가 다를 수 있으므로, **provider/model 전체 경로**를 명시적으로 선택한다.
3. 실제 연결된 provider와 사용 가능한 모델만 표시한다 (런타임 조회).
4. 설정 결과는 `opencode.jsonc`의 `agent` 섹션에 직접 반영한다.

---

## 1. 배경 및 문제

### 현재 상태

- 에이전트별 모델을 변경하려면 `opencode.jsonc`의 `agent` 섹션이나 `.opencode/agents/*.md` frontmatter를 직접 편집해야 한다.
- 같은 모델명이라도 provider에 따라 `anthropic/claude-sonnet-4-20250514`, `openrouter/claude-sonnet-4-20250514`, `bedrock/claude-sonnet-4` 등으로 달라진다.
- 사용자는 현재 어떤 provider가 연결되어 있고, 각 provider에 어떤 모델이 있는지 파악하기 어렵다.

### 해결 방향

OpenCode TUI 플러그인으로 커맨드 팔레트 진입점 + DialogSelect 기반 인터랙티브 설정 UI를 제공한다.

---

## 2. Scope

- TUI 플러그인 파일: `.opencode/plugins/model-config.ts`
- 커맨드 팔레트에 "Model Config" 진입점 등록
- 에이전트 선택 → provider/model 선택 → 설정 반영의 2단계 DialogSelect 흐름
- `opencode.jsonc`의 `agent.[name].model` 필드에 결과 저장
- 현재 설정 조회 및 변경 기능

## 3. Non-scope

- AI tool을 통한 모델 설정 (사람이 직접 하는 UI만 구현)
- server plugin 기능 (TUI-only 플러그인)
- 프리셋 시스템 (향후 확장 가능하나 이번 범위 밖)
- provider 인증/추가/삭제 기능 (OpenCode 내장 기능 사용)
- agent MD 파일의 frontmatter 직접 수정 (`opencode.jsonc` 설정만 변경)
- `@opentui/core`, `@opentui/solid` 직접 사용을 통한 커스텀 렌더링 (DialogSelect 등 제공 API만 사용)

---

## 4. OpenCode TUI Plugin API 요약 (구현에 필요한 부분만)

### 4.1 플러그인 모듈 구조

```typescript
// @opencode-ai/plugin 타입 기준
export type TuiPluginModule = {
  id?: string;
  tui: TuiPlugin;
  server?: never; // TUI-only: server 없음
};

export type TuiPlugin = (
  api: TuiPluginApi,
  options: PluginOptions | undefined,
  meta: TuiPluginMeta,
) => Promise<void>;
```

TUI 플러그인은 `tui` export만 제공한다. `server`는 사용하지 않는다.

### 4.2 TuiPluginApi (사용할 기능)

```typescript
export type TuiPluginApi = {
  app: TuiApp;
  command: {
    register: (cb: () => TuiCommand[]) => () => void;
    trigger: (value: string) => void;
    show: () => void;
  };
  ui: {
    DialogSelect: <Value = unknown>(
      props: TuiDialogSelectProps<Value>,
    ) => JSX.Element;
    toast: (input: TuiToast) => void;
    dialog: TuiDialogStack;
  };
  state: TuiState;
  client: OpencodeClient;
  lifecycle: TuiLifecycle;
};
```

### 4.3 OpencodeClient API (사용할 엔드포인트)

```typescript
// 현재 설정 조회
client.config.get({ directory?, workspace? })
// → ConfigGetResponse (Config 타입)

// 설정 업데이트
client.config.update({ directory?, workspace?, config: Config })
// → ConfigUpdateResponse (Config 타입)

// 연결된 provider + 모델 목록 조회
client.config.providers({ directory?, workspace? })
// → { providers: Provider[], default: { [key: string]: string } }

// 등록된 에이전트 목록 조회
client.app.agents({ directory?, workspace? })
// → Agent[]
```

### 4.4 관련 타입

```typescript
// Provider 타입 (providers API 응답)
export type Provider = {
  id: string;          // e.g. "anthropic", "openai", "openrouter"
  name: string;        // e.g. "Anthropic"
  source: "env" | "config" | "custom" | "api";
  models: {
    [key: string]: Model; // key = modelID
  };
};

// Model 타입 (Provider.models의 값)
export type Model = {
  id: string;          // e.g. "claude-sonnet-4-20250514"
  providerID: string;  // e.g. "anthropic"
  name: string;        // e.g. "Claude Sonnet 4"
  family?: string;
  capabilities: {
    temperature: boolean;
    reasoning: boolean;
    attachment: boolean;
    toolcall: boolean;
    // ...
  };
  cost: {
    input: number;     // per token cost
    output: number;
    cache: { read: number; write: number; };
  };
  // ...
};

// Agent 타입 (agents API 응답)
export type Agent = {
  name: string;        // e.g. "plan", "build", "reviewer"
  description?: string;
  mode: "subagent" | "primary" | "all";
  model?: {
    modelID: string;
    providerID: string;
  };
  // ...
};

// Config.agent 섹션 (설정 저장 대상)
export type AgentConfig = {
  model?: string;      // "provider/model" 형식 e.g. "anthropic/claude-sonnet-4-20250514"
  variant?: string;
  temperature?: number;
  // ...
};

// Config 타입 (설정 파일 구조)
export type Config = {
  model?: string;      // 전역 기본 모델
  agent?: {
    plan?: AgentConfig;
    build?: AgentConfig;
    [key: string]: AgentConfig | undefined;
  };
  // ...
};
```

### 4.5 DialogSelect 타입

```typescript
export type TuiDialogSelectProps<Value = unknown> = {
  title: string;
  placeholder?: string;
  options: TuiDialogSelectOption<Value>[];
  flat?: boolean;                    // true면 카테고리 그룹핑 없이 플랫 리스트
  onSelect?: (option: TuiDialogSelectOption<Value>) => void;
  onFilter?: (query: string) => void;
  skipFilter?: boolean;
  current?: Value;                   // 현재 선택된 값 (하이라이트용)
};

export type TuiDialogSelectOption<Value = unknown> = {
  title: string;         // 표시 이름
  value: Value;          // 선택 시 반환되는 값
  description?: string;  // 보조 텍스트 (비용 등)
  footer?: JSX.Element | string;
  category?: string;     // 카테고리 그룹핑용 (provider 이름으로 사용)
  disabled?: boolean;
};

export type TuiDialogStack = {
  replace: (render: () => JSX.Element, onClose?: () => void) => void;
  clear: () => void;
  readonly open: boolean;
};

export type TuiToast = {
  variant?: "info" | "success" | "warning" | "error";
  title?: string;
  message: string;
  duration?: number;
};
```

### 4.6 Command 등록 타입

```typescript
export type TuiCommand = {
  title: string;
  value: string;
  description?: string;
  category?: string;
  keybind?: string;       // e.g. "ctrl+m"
  onSelect?: () => void;
};
```

---

## 5. 구현 설계

### 5.1 플러그인 파일 위치 및 등록

파일: `.opencode/plugins/model-config.ts`

`opencode.jsonc`의 `plugin` 배열에 등록:

```jsonc
{
  "plugin": [
    "./plugins/orchestrator.ts",
    "./plugins/budget-guard.ts",
    "./plugins/model-config.ts"   // 추가
  ]
}
```

### 5.2 전체 흐름

```
[커맨드 팔레트] → "Configure Agent Models" 선택
       ↓
[Step 1: 에이전트 선택 다이얼로그]
  - client.app.agents()로 에이전트 목록 조회
  - client.config.get()으로 현재 모델 설정 조회
  - 각 에이전트를 옵션으로 표시 (현재 모델을 description에 표시)
  - 에이전트 선택
       ↓
[Step 2: 모델 선택 다이얼로그]
  - client.config.providers()로 provider/model 목록 조회
  - provider를 category로 그룹핑
  - 각 모델을 옵션으로 표시 (비용 정보를 description에 표시)
  - 모델 선택
       ↓
[Step 3: 설정 저장]
  - client.config.update()로 agent.[name].model = "provider/model" 저장
  - toast로 성공 알림
  - Step 1로 돌아가 계속 설정 가능 (Esc로 종료)
```

### 5.3 모듈 구조

플러그인은 단일 파일로 구현한다. 내부 논리적 구조:

```
model-config.ts
├── tui (export)          — TuiPlugin 엔트리포인트
├── showAgentSelect()     — Step 1: 에이전트 선택 다이얼로그
├── showModelSelect()     — Step 2: 모델 선택 다이얼로그
├── applyModelConfig()    — Step 3: 설정 저장
├── formatCost()          — 비용 표시 포매팅 유틸
└── ORCHESTRATION_AGENTS  — Lite-Code 에이전트 메타데이터 상수
```

### 5.4 핵심 상수

Lite-Code 오케스트레이션에서 모델 설정 대상인 에이전트 목록.
이 상수를 기준으로 에이전트 선택 목록을 구성한다.

```typescript
const ORCHESTRATION_AGENTS: ReadonlyArray<{
  name: string;
  label: string;
  role: string;
  costTier: "high" | "low";
}> = [
  { name: "plan", label: "Planner", role: "계획/분석", costTier: "high" },
  { name: "build", label: "Coder (build)", role: "구현", costTier: "low" },
  { name: "reviewer", label: "Reviewer", role: "최종 검수", costTier: "high" },
  { name: "tester", label: "Tester", role: "검증", costTier: "low" },
  { name: "fixer", label: "Fixer", role: "수정", costTier: "low" },
  { name: "coder", label: "Coder (auto)", role: "자동 모드 구현", costTier: "low" },
] as const;
```

`costTier`는 AGENTS.md의 모델 사용 정책(planner/reviewer → 고성능, coder/tester/fixer → 저가)을 반영하여 description에 힌트로 표시하기 위한 참고 정보이다. 선택을 제한하지는 않는다.

### 5.5 Step 1: 에이전트 선택 다이얼로그

**데이터 수집:**

```typescript
const [configRes, agentsRes] = await Promise.all([
  api.client.config.get(),
  api.client.app.agents(),
]);
```

`configRes.data`에서 `Config` 타입을 얻고, `agentsRes.data`에서 `Agent[]`를 얻는다.

**옵션 구성:**

`ORCHESTRATION_AGENTS`를 순회하면서 `TuiDialogSelectOption` 배열을 만든다.

각 옵션:

| 필드 | 값 |
|------|-----|
| `title` | `"{label}"` (예: `"Planner"`) |
| `value` | `name` (예: `"plan"`) |
| `description` | 현재 설정된 모델 표시. Config 기준 우선순위: ① `config.agent?.[name]?.model`, ② `Agent.model` (agents API), ③ `config.model` (전역 기본), ④ `"(default)"` |
| `category` | 없음 (플랫 리스트) |

**현재 모델 결정 로직:**

```
function resolveCurrentModel(agentName, config, agents):
  1. configAgentModel = config.agent?.[agentName]?.model
     → 있으면 이 값 반환 (명시적 에이전트별 설정)
  2. runtimeAgent = agents.find(a => a.name === agentName)
     runtimeModel = runtimeAgent?.model
     → 있으면 "{runtimeModel.providerID}/{runtimeModel.modelID}" 반환
  3. config.model
     → 있으면 이 값 + " (global default)" 반환
  4. "(not set)" 반환
```

**다이얼로그 호출:**

```typescript
api.ui.dialog.replace(() =>
  api.ui.DialogSelect({
    title: "Configure Agent Models",
    options: agentOptions,
    flat: true,
    onSelect: (option) => showModelSelect(option.value),
  })
);
```

### 5.6 Step 2: 모델 선택 다이얼로그

**데이터 수집:**

```typescript
const providersRes = await api.client.config.providers();
```

`providersRes.data`에서 `{ providers: Provider[], default: { [key: string]: string } }`를 얻는다.

**옵션 구성:**

`providers` 배열을 순회하면서, 각 provider의 `models` 객체를 순회하여 `TuiDialogSelectOption` 배열을 만든다.

각 옵션:

| 필드 | 값 |
|------|-----|
| `title` | `Model.name` 또는 `Model.id` (예: `"Claude Sonnet 4"`) |
| `value` | `"{Provider.id}/{Model.id}"` (예: `"anthropic/claude-sonnet-4-20250514"`) |
| `description` | 비용 정보 포매팅 결과 (예: `"$3.00 / $15.00 per 1M tokens"`) |
| `category` | `Provider.name` (예: `"Anthropic"`) — provider별 그룹핑 |

추가로, 리스트 맨 앞에 "기본값 사용 (설정 제거)" 옵션을 넣는다:

| 필드 | 값 |
|------|-----|
| `title` | `"Use default"` |
| `value` | `""` (빈 문자열) |
| `description` | `"Remove agent-specific model, use global default"` |
| `category` | `"Default"` |

**비용 포매팅 함수:**

```
function formatCost(model: Model): string
  input = model.cost.input   // per-token cost
  output = model.cost.output
  → "$X.XX / $X.XX per 1M tokens" 형식으로 변환
  (input * 1_000_000, output * 1_000_000을 소수점 2자리까지)
  cost가 0이면 "Free" 표시
```

**현재 선택값 하이라이트:**

`current` 파라미터에 해당 에이전트의 현재 모델 값을 전달하여 하이라이트 표시.

**다이얼로그 호출:**

```typescript
api.ui.dialog.replace(() =>
  api.ui.DialogSelect<string>({
    title: `Select model for "${agentLabel}"`,
    placeholder: "Search models...",
    options: modelOptions,
    current: currentModelValue,
    onSelect: (option) => applyModelConfig(agentName, option.value),
  })
);
```

### 5.7 Step 3: 설정 저장

**저장 로직:**

```
async function applyModelConfig(agentName: string, modelValue: string):
  1. 현재 config 조회: config = await client.config.get()
  2. agent 섹션 준비:
     agent = { ...(config.data?.agent ?? {}) }
  3. 모델 값 적용:
     if modelValue === "" (기본값 사용 선택):
       if agent[agentName] exists:
         delete agent[agentName].model
         if agent[agentName]에 다른 필드가 없으면:
           delete agent[agentName]
     else:
       agent[agentName] = { ...(agent[agentName] ?? {}), model: modelValue }
  4. config update 호출:
     await client.config.update({ config: { agent } })
  5. toast 알림:
     api.ui.toast({
       variant: "success",
       title: "Model updated",
       message: `${agentName} → ${modelValue || "default"}`,
     })
  6. Step 1로 돌아감 (showAgentSelect 재호출)
```

`client.config.update()`는 전달된 필드만 merge하는 partial update이다.
전체 config를 덮어쓰지 않도록, `agent` 섹션만 전달한다.

**에러 처리:**

```
try:
  await client.config.update(...)
catch error:
  api.ui.toast({
    variant: "error",
    title: "Failed to update",
    message: error.message 또는 "Configuration update failed",
  })
  Step 1로 돌아감
```

### 5.8 커맨드 등록

```typescript
api.command.register(() => [
  {
    title: "Configure Agent Models",
    value: "lite-model-config",
    description: "에이전트별 모델/프로바이더 설정",
    category: "Lite-Code",
    onSelect: () => showAgentSelect(),
  },
]);
```

커맨드 팔레트(Ctrl+K 등)에서 "model" 또는 "agent"로 검색하면 나타난다.

---

## 6. opencode.jsonc 설정 결과 예시

플러그인 사용 전:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "model": "openai/gpt-5.4-mini"
}
```

플러그인으로 설정 후:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "model": "openai/gpt-5.4-mini",
  "agent": {
    "plan": { "model": "anthropic/claude-sonnet-4-20250514" },
    "build": { "model": "openai/gpt-5.4-mini" },
    "reviewer": { "model": "anthropic/claude-sonnet-4-20250514" },
    "tester": { "model": "openai/gpt-5.4-mini" },
    "fixer": { "model": "openai/gpt-5.4-mini" },
    "coder": { "model": "openai/gpt-5.4-mini" }
  }
}
```

---

## 7. 제약 조건

1. **TUI 전용 플러그인**: `server` export 없이 `tui` export만 사용한다. AI tool 등록 금지.
2. **기존 설정 비파괴**: `agent` 섹션의 `model` 필드만 수정한다. 같은 `AgentConfig` 내 다른 필드(`temperature`, `variant`, `permission` 등)를 건드리지 않는다.
3. **런타임 조회 기반**: 모델/provider 목록을 하드코딩하지 않는다. 항상 `client.config.providers()`로 조회한다.
4. **에러 안전성**: API 호출 실패 시 toast로 알리고 다이얼로그를 닫거나 이전 단계로 돌아간다. 예외가 전파되어 플러그인이 죽지 않도록 한다.
5. **peer dependency**: `@opentui/core`와 `@opentui/solid`는 optional peer dependency이므로, 직접 import하지 않고 `api.ui.*`로 제공되는 컴포넌트만 사용한다.
6. **플러그인 제거 시 영향 없음**: 이 플러그인을 삭제해도 workflow는 정상 동작한다. 설정된 `opencode.jsonc`의 `agent` 값은 그대로 유지된다.

---

## 8. 파일 목록

| 파일 | 변경 유형 | 설명 |
|------|-----------|------|
| `.opencode/plugins/model-config.ts` | 신규 생성 | TUI 플러그인 본체 |
| `opencode.jsonc` | 수정 | `plugin` 배열에 `"./plugins/model-config.ts"` 추가 |

---

## 9. 티켓

### T-MC-1: TUI 플러그인 본체 구현

- **Goal**: `.opencode/plugins/model-config.ts`에 에이전트별 모델 설정 TUI 플러그인을 구현한다.
- **Files to modify**: `.opencode/plugins/model-config.ts` (신규 생성)
- **Constraints**:
  - `tui` export만 사용 (`server` 없음)
  - `api.ui.DialogSelect`, `api.ui.dialog`, `api.ui.toast`, `api.command.register`, `api.client` 만 사용
  - `@opentui/core`, `@opentui/solid` 직접 import 금지
  - 모든 API 호출에 try-catch 적용
  - 기존 `AgentConfig`의 `model` 외 필드 보존
- **Acceptance criteria**:
  - AC-1: `tui` export가 `TuiPlugin` 시그니처를 만족한다
  - AC-2: 커맨드 팔레트에 "Configure Agent Models" 항목이 등록된다
  - AC-3: 에이전트 선택 다이얼로그가 `ORCHESTRATION_AGENTS` 6개 에이전트를 표시한다
  - AC-4: 각 에이전트의 현재 모델이 description에 표시된다 (§5.5 resolveCurrentModel 로직)
  - AC-5: 에이전트 선택 후 모델 선택 다이얼로그가 provider별로 그룹핑되어 표시된다
  - AC-6: 각 모델의 비용 정보가 description에 표시된다
  - AC-7: "Use default" 옵션이 모델 선택 목록 최상단에 존재한다
  - AC-8: 모델 선택 시 `client.config.update()`로 `agent.[name].model`이 저장된다
  - AC-9: "Use default" 선택 시 해당 에이전트의 `model` 필드가 삭제된다
  - AC-10: 저장 성공 시 toast 알림이 표시된다
  - AC-11: 저장 후 에이전트 선택 다이얼로그로 돌아온다 (변경된 설정이 반영되어 표시)
  - AC-12: API 호출 실패 시 error toast가 표시되고 플러그인이 crash하지 않는다
- **Non-scope**: 프리셋 시스템, provider 인증, agent MD 파일 수정
- **Dependencies**: 없음
- **Risk level**: low

### T-MC-2: opencode.jsonc 플러그인 등록

- **Goal**: `opencode.jsonc`의 `plugin` 배열에 `"./plugins/model-config.ts"`를 추가한다.
- **Files to modify**: `opencode.jsonc`
- **Constraints**:
  - 기존 plugin 항목 유지
  - JSONC 형식 유지 (주석 보존)
- **Acceptance criteria**:
  - AC-1: `plugin` 배열에 `"./plugins/model-config.ts"` 항목이 존재한다
  - AC-2: 기존 plugin 항목이 모두 유지된다
  - AC-3: 기존 주석이 보존된다
- **Non-scope**: 플러그인 본체 구현
- **Dependencies**: T-MC-1
- **Risk level**: low

---

## 10. 전체 코드 구조 (의사 코드)

```typescript
import type { TuiPluginModule, TuiPlugin } from "@opencode-ai/plugin";

const ORCHESTRATION_AGENTS = [
  { name: "plan", label: "Planner", role: "계획/분석", costTier: "high" },
  { name: "build", label: "Coder (build)", role: "구현", costTier: "low" },
  { name: "reviewer", label: "Reviewer", role: "최종 검수", costTier: "high" },
  { name: "tester", label: "Tester", role: "검증", costTier: "low" },
  { name: "fixer", label: "Fixer", role: "수정", costTier: "low" },
  { name: "coder", label: "Coder (auto)", role: "자동 모드 구현", costTier: "low" },
] as const;

function formatCost(model): string {
  // model.cost.input, model.cost.output을 1M 토큰 단위로 변환
  // "$X.XX / $X.XX per 1M tokens" 형식 반환
  // cost가 모두 0이면 "Free" 반환
}

function resolveCurrentModel(agentName, config, agents): string {
  // §5.5 로직: config.agent → Agent.model → config.model → "(not set)"
}

const tui: TuiPlugin = async (api) => {

  async function showAgentSelect() {
    // 1. config + agents 병렬 조회
    // 2. ORCHESTRATION_AGENTS 기반으로 옵션 구성
    //    - title: label
    //    - value: name
    //    - description: resolveCurrentModel() 결과 + costTier 힌트
    // 3. dialog.replace → DialogSelect 표시
    //    - onSelect → showModelSelect(agentName)
  }

  async function showModelSelect(agentName: string) {
    // 1. providers 조회
    // 2. "Use default" 옵션 + provider별 모델 옵션 구성
    //    - title: model.name || model.id
    //    - value: "provider.id/model.id"
    //    - description: formatCost(model)
    //    - category: provider.name
    // 3. dialog.replace → DialogSelect 표시
    //    - current: 현재 설정된 모델값
    //    - onSelect → applyModelConfig(agentName, value)
  }

  async function applyModelConfig(agentName: string, modelValue: string) {
    // 1. config.get()으로 현재 설정 읽기
    // 2. agent 섹션에서 model 필드만 수정/삭제
    // 3. config.update() 호출
    // 4. toast 알림
    // 5. showAgentSelect() 재호출
  }

  // 커맨드 등록
  api.command.register(() => [
    {
      title: "Configure Agent Models",
      value: "lite-model-config",
      description: "에이전트별 모델/프로바이더 설정",
      category: "Lite-Code",
      onSelect: () => showAgentSelect(),
    },
  ]);
};

export default { tui } satisfies TuiPluginModule;
```

---

## 11. 검증 방법

### 수동 검증 절차

1. OpenCode 시작 → 플러그인 로드 확인 (에러 없음)
2. 커맨드 팔레트 열기 → "model" 검색 → "Configure Agent Models" 항목 확인
3. 선택 → 에이전트 목록 표시 확인 (6개 에이전트, 현재 모델 표시)
4. 에이전트 선택 → 모델 목록 표시 확인 (provider별 그룹핑, 비용 정보)
5. 모델 선택 → toast 표시 + 에이전트 목록 복귀 + 변경 반영 확인
6. "Use default" 선택 → model 필드 삭제 확인
7. `opencode.jsonc` 열어서 `agent` 섹션 변경 확인
8. Esc → 다이얼로그 닫힘 확인
9. 플러그인 제거 후 → workflow 정상 동작 확인

### 에러 케이스

1. provider가 하나도 연결되지 않은 상태 → 빈 모델 목록 + "Use default" 만 표시
2. API 호출 실패 → error toast, 플러그인 crash 없음
3. config에 agent 섹션이 없는 초기 상태 → 정상 동작 (신규 생성)

---

## 12. 향후 확장 가능성 (참고)

이번 스펙 범위에는 포함하지 않으나, 동일 플러그인 구조로 확장 가능한 기능:

- **프리셋 시스템**: "cost-optimized" / "max-quality" 같은 프리셋 저장 및 일괄 적용
- **전역 기본 모델 변경**: `config.model` 자체를 UI로 변경
- **모델 추천 힌트**: `costTier` 기반으로 "recommended" 배지 표시
- **커맨드별 모델 설정**: `config.command.[name].model` 변경 UI

---

## 13. 참조 문서

- AGENTS.md §모델 사용 정책
- `@opencode-ai/plugin` TUI API: `.opencode/node_modules/@opencode-ai/plugin/dist/tui.d.ts`
- `@opencode-ai/sdk` v2 타입: `.opencode/node_modules/@opencode-ai/sdk/dist/v2/gen/types.gen.d.ts`
- `@opencode-ai/sdk` v2 클라이언트: `.opencode/node_modules/@opencode-ai/sdk/dist/v2/gen/sdk.gen.d.ts`
