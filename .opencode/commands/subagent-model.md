---
description: Use switch-preset.js set/alias/status to manage subagent models
subtask: false
---

사용자가 이 명령을 실행하면, `switch-preset.js`의 새 서브커맨드 기반으로 서브에이전트 모델을 변경하도록 안내한다.

## 기본 명령

```bash
# 현재 상태 확인 (alias 역매핑 + full ID + 카탈로그 메타)
node .opencode/scripts/switch-preset.js status

# 특정 에이전트 모델 지정 (alias 또는 full ID 모두 허용)
node .opencode/scripts/switch-preset.js set reviewer smart
node .opencode/scripts/switch-preset.js set tester GitHubCopilot/Gemini-3.1-preview

# alias 관리 (개인 override는 ~/.config/opencode/lite-aliases.json)
node .opencode/scripts/switch-preset.js alias ls
node .opencode/scripts/switch-preset.js alias add my-reviewer openai/gpt-5.4
node .opencode/scripts/switch-preset.js alias rm my-reviewer
```

## 추가 안내

- `set`은 `alias` 또는 `provider/model`을 입력받아 `opencode.jsonc`의 `agent.<name>.model`만 갱신한다.
- 저장 시에는 항상 해석된 full ID로 기록되고, alias 입력이면 `/* alias */` 주석이 함께 남는다.
- 카탈로그는 기본 7일 TTL 캐시를 사용한다. 즉시 갱신이 필요하면 `--refresh`를 추가한다.
