---
description: Switch worker model preset (economy / quality / full / default)
subtask: false
---

When the user runs this command, guide them to switch subagent model presets.

## Instructions

Show the following shell commands and ask whether to execute them.

### View preset list
```bash
node .opencode/scripts/switch-preset.js --list
```

### Apply a preset
```bash
# Low-cost mode
node .opencode/scripts/switch-preset.js economy

# Balanced mode (reviewer only uses a high-end model)
node .opencode/scripts/switch-preset.js quality

# Maximum quality mode
node .opencode/scripts/switch-preset.js full

# Restore defaults (inherits global defaults)
node .opencode/scripts/switch-preset.js default
```

## Additional Notes

- You can create custom presets by editing `.opencode/scripts/presets.json` directly.
- After applying a preset, restart OpenCode for changes to take effect.
- To change only a single agent's model, use the `/subagent-model` command instead.