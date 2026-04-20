# Lite-Code Install Instructions (for AI agents)

**Instructions for AI agents:** Execute **all steps in order**. Installation is only considered complete when all "Verification" sections pass.  
If any step fails, stop immediately and report the failure reason to the user.

---

## 0. Prerequisites (verify before proceeding)

AI must verify the following. If any are missing, **halt installation** and guide the user:

- `git --version` succeeds
- `node --version` shows v18 or higher
- `opencode --version` succeeds (if missing, direct user to install from https://opencode.ai)

## 1. Repository Installation

Default installation location: `$HOME/.opencode-profiles/lite-code`  
(Use a different path if the user specifies one)

```bash
export LITE_CODE_DIR="${LITE_CODE_DIR:-$HOME/.opencode-profiles/lite-code}"
mkdir -p "$(dirname "$LITE_CODE_DIR")"

if [ -d "$LITE_CODE_DIR/.git" ]; then
  git -C "$LITE_CODE_DIR" pull --ff-only
else
  git clone https://github.com/<OWNER>/<REPO>.git "$LITE_CODE_DIR"
fi
```

> Replace `<OWNER>/<REPO>` with the actual repository. If the user uses a fork, use that URL.

## 2. Shell Environment Variables (idempotent)

AI detects the user's default shell (`$SHELL`):
- bash/zsh: `~/.bashrc` or `~/.zshrc`
- Other: ask the user for the location

Add the following block to the appropriate rc file **without duplicates** (skip if already present):

```bash
# >>> lite-code profile >>>
export LITE_CODE_DIR="$HOME/.opencode-profiles/lite-code"
export OPENCODE_CONFIG="$LITE_CODE_DIR/opencode.jsonc"
export OPENCODE_CONFIG_DIR="$LITE_CODE_DIR/.opencode"
export PATH="$LITE_CODE_DIR:$PATH"
# <<< lite-code profile <<<
```

Verify:
- `grep "lite-code profile" $HOME/.bashrc` (or the relevant rc file) should output 2 lines.

## 3. Immediately Apply to Current Shell

```bash
export LITE_CODE_DIR="$HOME/.opencode-profiles/lite-code"
export OPENCODE_CONFIG="$LITE_CODE_DIR/opencode.jsonc"
export OPENCODE_CONFIG_DIR="$LITE_CODE_DIR/.opencode"
export PATH="$LITE_CODE_DIR:$PATH"
chmod +x "$LITE_CODE_DIR/lcp"
```

## 4. Provider Authentication Status Check

AI must not log in directly. Instead, guide the user:

```bash
opencode
# Inside the opencode session:
#   /connect
# Guide the user to authenticate with required providers:
# OpenAI / OpenRouter / GitHubCopilot / DeepInfra / Google etc.
# Auth is stored only in ~/.local/share/opencode/auth.json (independent of the repo).
```

## 5. Installation Verification (all must pass)

Execute the following commands in order and check expected results.

```bash
lcp --list
```
Expected: `economy`, `quality`, `full`, `default`, `inherit` — 5 presets printed.

```bash
lcp status
```
Expected: Table showing per-agent current model + alias reverse mapping + cost/ctx summary.  
(If catalog cache is missing, it will automatically fetch from models.dev once and store in `~/.cache/lite-code/models.dev.json`)

```bash
lcp search gpt --connected-only --limit=5
```
Expected: Up to 5 models from providers actually connected in user's auth.json.

```bash
node --test "$LITE_CODE_DIR/.opencode/tests/model-resolution.test.js" "$LITE_CODE_DIR/.opencode/tests/catalog.test.js"
```
Expected: All tests pass with `ok`.

## 6. Usage Summary (guide the user)

```bash
# Apply preset
lcp apply default
lcp apply economy

# Set individual model (alias or provider/model)
lcp set reviewer smart
lcp set fixer deepinfra/zai-org/GLM-5.1

# Search (connected providers only)
lcp search gpt-5.4 --connected-only

# Check status
lcp status

# Bulk-swap providers (only targets in catalog)
lcp swap-provider openai openrouter

# Manage aliases (personal saved to ~/.config/opencode/lite-aliases.json)
lcp alias ls
lcp alias add my-mini openai/gpt-5.4-mini
lcp alias rm my-mini
```

## 7. Upgrade

```bash
git -C "$LITE_CODE_DIR" pull --ff-only
```

## 8. Uninstall

```bash
rm -rf "$LITE_CODE_DIR"
# Then remove the `>>> lite-code profile >>>` ~ `<<< lite-code profile <<<` block from rc file
```

---

## Environment Variable Reference

| Variable | Meaning | Default |
|---|---|---|
| `OPENCODE_CONFIG` | Absolute path to opencode.jsonc | (none) |
| `OPENCODE_CONFIG_DIR` | `.opencode` directory | (none) |
| `OPENCODE_CACHE_DIR` | models.dev cache directory | `~/.cache/lite-code` |
| `OPENCODE_AUTH_PATH` | auth.json path | `~/.local/share/opencode/auth.json` |

## Information to Report on Failure

- Failed step number
- Executed command and full stderr
- `lcp status` output (if possible)
- `node --version`, `opencode --version`, OS type