---
description: Use switch-preset.js set/alias/status to manage subagent models
subtask: false
---

When the user runs this command, guide them to change subagent models using the `switch-preset.js` subcommand interface.

## Basic Commands

```bash
# Check current status (alias reverse mapping + full ID + catalog metadata)
node .opencode/scripts/switch-preset.js status

# Set a specific agent model (alias or full ID both accepted)
node .opencode/scripts/switch-preset.js set reviewer smart
node .opencode/scripts/switch-preset.js set tester GitHubCopilot/Gemini-3.1-preview

# Manage aliases (personal overrides stored in ~/.config/opencode/lite-aliases.json)
node .opencode/scripts/switch-preset.js alias ls
node .opencode/scripts/switch-preset.js alias add my-reviewer openai/gpt-5.4
node .opencode/scripts/switch-preset.js alias rm my-reviewer
```

## Additional Notes

- `set` accepts either an `alias` or a `provider/model` string and updates only the `agent.<name>.model` field in `opencode.jsonc`.
- When saving, the resolved full ID is always written; if an alias was provided, a `/* alias */` comment is preserved alongside it.
- The catalog uses a default 7-day TTL cache. Add `--refresh` to force an immediate update.