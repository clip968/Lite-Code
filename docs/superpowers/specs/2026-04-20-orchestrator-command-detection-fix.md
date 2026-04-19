# Orchestrator Command Detection Bug Fix — Progress Spec

Date: 2026-04-20

## 1. Bug Description

`.opencode/plugins/orchestrator.ts`의 `detectCommand(args)` 함수가 `args.prompt` 내부에서 `/lite-triage`, `/lite-implement`, `/lite-verify`, `/lite-fix`, `/lite-review`, `/lite-auto` 같은 패턴을 정규식으로 스캔하고 있었다.

OpenCode에서 `task` 서브에이전트를 호출할 때 프롬프트 본문(`args.prompt`)에 이들 문자열이 포함되면 오케스트레이터 플러그인이 실제 수명주기 명령으로 오탐지하고, `ctx.$.file(STATE_PATH)`를 호출해 `.opencode/state/run-log.json`을 읽으려 시도한다. 서브에이전트 컨텍스트에서는 `ctx.$.file`이 undefined이므로 런타임 에러(`ctx.$.file is not a function`)가 발생한다.

### 영향

- `fixer` 서브에이전트 호출 시 런타임 크래시
- `coder`, `tester`, `reviewer` 프롬프트에 lifecycle command 문자열이 포함된 경우에도 동일 에러 가능

## 2. Root Cause

`.opencode/plugins/orchestrator.ts` 109–115행:

```ts
function detectCommand(args?: Record<string, unknown>): string {
  const raw = typeof args?.prompt === "string" ? args.prompt : "";
  const cmd =
    raw.match(/\/lite-(triage|implement|verify|fix|review|auto)\b/)?.[0] ??
    (typeof args?.command === "string" ? args.command : "");
  return cmd || "unknown";
}
```

`args.prompt`를 먼저 검사해서 정규식 매칭이 나오면 그것을 우선 반환. `args.command`가 실제 명령 식별자(예: `"task"`)여도 prompt 본문의 매칭이 우선.

`updateLifecycleStatus()`는 `tool.execute.before`/`tool.execute.after` 훅에서 `input.tool === "task"`일 때 `detectCommand(input.args)`를 호출하므로, 모든 `task` 호출이 영향을 받음.

## 3. Fix

### 변경 파일

| 파일 | 변경 |
|------|------|
| `.opencode/plugins/orchestrator.ts` | `detectCommand`을 `args.command` 전용으로 단순화; 함수 `export` 추가 |
| `.opencode/tests/orchestrator.test.js` | 회귀 테스트 신규 추가 |

### 구현

```ts
export function detectCommand(args?: Record<string, unknown>): string {
  const cmd = typeof args?.command === "string" ? args.command : "";
  return cmd || "unknown";
}
```

- `args.prompt`를 완전히 무시
- `args.command`가 문자열이면 그대로 반환, 빈 문자열 또는 누락이면 `"unknown"`
- `export` 키워드를 추가하여 테스트에서 직접 import 가능하게 함

## 4. Regression Tests

`.opencode/tests/orchestrator.test.js` (신규):

```
test 1: detectCommand ignores /lite-* strings embedded in prompt bodies
  → args: { prompt: "Please run /lite-fix after review...", command: "task" }
  → expected: "task"
  → passes ✓

test 2: detectCommand still accepts explicit slash commands from args.command
  → args: { command: "/lite-fix", prompt: "plain text" }
  → expected: "/lite-fix"
  → passes ✓
```

실행: `npx tsx --test .opencode/tests/orchestrator.test.js`

## 5. Test Results Summary

| 항목 | 결과 |
|------|------|
| 신규 회귀 테스트 (2개) | 2/2 PASS |
| 기존 `model-config-plugin-source.test.js` | PASS |
| 기존 `model-config-shared.test.js` | FAIL (사전 존재: export 이름 불일치) |
| 기존 `command-wrapper.test.js` | FAIL (사전 존재: 명령 파일 없음) |
| **이번 변경이 기존 테스트에 미친 영향** | **없음** |

## 6. Subagent Workflow Evaluation

이번 버그픽스는 AGENTS.md에 정의된 Stage 5-lite 서브에이전트 체인을 실전으로 사용한 첫 사례다.

### 6.1 Subagent 호출 결과

| Subagent | 결과 | 비고 |
|----------|------|------|
| `coder` (Qwen3-Coder) | 실패 | 모델 루프 현상으로 JSON 형태의 깨진 문자열을 반복 출력. 실제 파일이 정상적인 JS가 아닌 문자열 리터럴로 작성됨. build가 직접 구현으로 대체 |
| `tester` (GLM-5) | 성공 | AC-1/AC-2/AC-3 모두 PASS. 구체적 증거와 재현 단계 포함한 정형 보고서 반환 |
| `reviewer` (GPT-5.4) | 중단 | 호출했으나 tool execution aborted로 종료. 빌드가 직접 검증으로 대체 |

### 6.2 발견된 인프라 문제

1. **coder 모델 루프**: Qwen3-Coder가 프롬프트를 반복 출력하는 현상. 모델 설정 변경으로 해결된 이전 `ProviderModelNotFoundError`와는 별개의 품질 문제. 긴 구조적 프롬프트(manager packet)에서 특히 심하게 발생. 짧은 프롬프트(`Reply with exactly one line: pong`)에서는 정상 동작.

2. **orchestrator 플러그인 버그** (본 문서의 수정 대상): `ctx.$.file` 미지원 컨텍스트에서 `task` 프롬프트 본문의 lifecycle command 문자열을 오탐지하여 런타임 크래시.

3. **fixer 런타임 에러**: `ctx.$.file is not a function` — 원인은 위 2번과 동일.

### 6.3 개선 권장사항

- coder 모델 교체 또는 manager packet 형식 간소화 검토
- 기존 깨진 테스트(`model-config-shared.test.js`, `command-wrapper.test.js`) 사전 수정 필요
- 서브에이전트 컨텍스트에서 `ctx.$.file` 사용 시 가드 추가 검토 (본 수정이 근원적 해결이지만 방어적으로도 고려)

## 7. Remaining Steps

- [ ] reviewer 서브에이전트 품질 게이트 재시도 (선택)
- [ ] 기존 깨진 테스트 수정 (별도 티켓)
- [ ] 이 변경 사항 git commit (사용자 요청 시)