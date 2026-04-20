# Lite-Code Install Instructions (for AI agents)

**AI 에이전트에게 지시:** 이 문서를 **순서대로 전부** 실행한 뒤, "검증" 섹션이 모두 통과해야만 설치 완료로 간주한다.
중간 단계에서 실패하면 바로 멈추고 실패 사유와 함께 사용자에게 보고한다.

---

## 0. 전제 조건 (확인 후 진행)

AI는 다음을 먼저 확인한다. 하나라도 없으면 **설치를 중단**하고 사용자에게 안내한다.

- `git --version` 성공
- `node --version` 이 v18 이상
- `opencode --version` 성공 (없으면 사용자에게 https://opencode.ai 설치 요청)

## 1. 저장소 설치

기본 설치 위치: `$HOME/.opencode-profiles/lite-code`
(사용자가 다른 경로를 지정하면 그 경로 사용)

```bash
export LITE_CODE_DIR="${LITE_CODE_DIR:-$HOME/.opencode-profiles/lite-code}"
mkdir -p "$(dirname "$LITE_CODE_DIR")"

if [ -d "$LITE_CODE_DIR/.git" ]; then
  git -C "$LITE_CODE_DIR" pull --ff-only
else
  git clone https://github.com/<OWNER>/<REPO>.git "$LITE_CODE_DIR"
fi
```

> `<OWNER>/<REPO>`는 실제 저장소로 바꾼다. 사용자가 포크를 썼다면 그 URL 사용.

## 2. 쉘 환경변수 설정 (멱등)

AI는 사용자의 기본 쉘(`$SHELL`)을 감지한다:
- bash/zsh: `~/.bashrc` 또는 `~/.zshrc`
- 기타: 사용자에게 위치를 묻는다

아래 블록을 해당 rc 파일에 **중복 없이** 추가한다 (이미 있으면 skip).

```bash
# >>> lite-code profile >>>
export LITE_CODE_DIR="$HOME/.opencode-profiles/lite-code"
export OPENCODE_CONFIG="$LITE_CODE_DIR/opencode.jsonc"
export OPENCODE_CONFIG_DIR="$LITE_CODE_DIR/.opencode"
export PATH="$LITE_CODE_DIR:$PATH"
# <<< lite-code profile <<<
```

검증:
- `grep "lite-code profile" $HOME/.bashrc` (또는 해당 rc) 가 2줄 출력되어야 함.

## 3. 현재 쉘에 즉시 반영

```bash
export LITE_CODE_DIR="$HOME/.opencode-profiles/lite-code"
export OPENCODE_CONFIG="$LITE_CODE_DIR/opencode.jsonc"
export OPENCODE_CONFIG_DIR="$LITE_CODE_DIR/.opencode"
export PATH="$LITE_CODE_DIR:$PATH"
chmod +x "$LITE_CODE_DIR/lcp"
```

## 4. Provider 인증 상태 확인

AI는 직접 로그인하지 않는다. 대신 사용자에게 안내한다.

```bash
opencode
# opencode 세션 안에서:
#   /connect
# 사용자가 OpenAI / OpenRouter / GitHubCopilot / DeepInfra / Google 등
# 필요한 provider에 로그인하도록 안내.
# 인증은 ~/.local/share/opencode/auth.json 에만 저장됨 (저장소와 무관).
```

## 5. 설치 검증 (모두 통과해야 완료)

아래 명령을 차례로 실행하고 기대 결과를 체크한다.

```bash
lcp --list
```
기대: `economy`, `quality`, `full`, `default`, `inherit` 5개 프리셋이 출력됨.

```bash
lcp status
```
기대: 에이전트별 현재 모델 + alias 역매핑 + cost/ctx 요약 표 출력됨.
(카탈로그 캐시가 없으면 자동으로 models.dev에서 1회 fetch 후 `~/.cache/lite-code/models.dev.json` 생성)

```bash
lcp search gpt --connected-only --limit=5
```
기대: 사용자 auth.json에 실제 연결된 provider의 모델만 최대 5개 출력됨.

```bash
node --test "$LITE_CODE_DIR/.opencode/tests/model-resolution.test.js" "$LITE_CODE_DIR/.opencode/tests/catalog.test.js"
```
기대: 모든 테스트가 `ok` 로 통과.

## 6. 사용 방법 요약 (사용자에게 안내)

```bash
# 프리셋 적용
lcp apply default
lcp apply economy

# 개별 모델 지정 (alias 또는 provider/model)
lcp set reviewer smart
lcp set fixer deepinfra/zai-org/GLM-5.1

# 검색 (연결된 provider만)
lcp search gpt-5.4 --connected-only

# 상태 확인
lcp status

# provider 일괄 교체 (카탈로그에 있는 대상만)
lcp swap-provider openai openrouter

# alias 관리 (개인은 ~/.config/opencode/lite-aliases.json 에 저장됨)
lcp alias ls
lcp alias add my-mini openai/gpt-5.4-mini
lcp alias rm my-mini
```

## 7. 업그레이드

```bash
git -C "$LITE_CODE_DIR" pull --ff-only
```

## 8. 제거

```bash
rm -rf "$LITE_CODE_DIR"
# 이후 rc 파일에서 `>>> lite-code profile >>>` ~ `<<< lite-code profile <<<` 블록 삭제
```

---

## 환경변수 레퍼런스

| 변수 | 의미 | 기본값 |
|---|---|---|
| `OPENCODE_CONFIG` | opencode.jsonc 절대 경로 | (없음) |
| `OPENCODE_CONFIG_DIR` | `.opencode` 디렉터리 | (없음) |
| `OPENCODE_CACHE_DIR` | models.dev 캐시 디렉터리 | `~/.cache/lite-code` |
| `OPENCODE_AUTH_PATH` | auth.json 경로 | `~/.local/share/opencode/auth.json` |

## 실패 시 사용자에게 보고할 정보

- 실패한 단계 번호
- 실행한 명령과 stderr 전문
- `lcp status` 출력 (가능하면)
- `node --version`, `opencode --version`, OS 종류
