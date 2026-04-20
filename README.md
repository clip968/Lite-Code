# Lite-Code Orchestration

OpenCode 기반의 경량 오케스트레이션 및 서브에이전트 모델 관리 시스템입니다. 비용 효율적인 개발을 위해 고비용 모델과 저비용 모델을 전략적으로 배치하고 관리합니다.

## ✨ 주요 기능

- **지능형 위임 (Skill Dispatch)**: 메인 에이전트(`build`)가 작업의 복잡도를 판단하여 `coder`, `tester`, `fixer`, `reviewer` 서브에이전트에게 자동으로 업무를 분담합니다.
- **모델 프리셋 관리**: 작업 환경(비용 절약 vs 고품질)에 따라 서브에이전트들의 모델 세트를 한 번에 전환할 수 있습니다.
- **AGENTS.md 기반 정책**: 명확한 역할 분담과 위임 규칙을 정의하여 일관된 협업 구조를 유지합니다.

## 📦 다른 환경에서 사용하기

이 저장소는 **재현 가능한 OpenCode 프로필**로 동작합니다. 다른 컴퓨터/환경에서 아래 중 한 가지 방식으로 쓸 수 있습니다.

### 방식 0: AI에게 설치 맡기기 (권장)

OpenCode 또는 다른 AI 에이전트 채팅창에 한 줄만 입력하세요:

```
Fetch and follow instructions from https://raw.githubusercontent.com/<OWNER>/<REPO>/main/.opencode/INSTALL.md
```

AI가 clone, 환경변수 설정, 검증(`lcp --list`, `lcp status`, 테스트 실행)까지 자동으로 수행합니다.
`<OWNER>/<REPO>`는 실제 GitHub 경로로 바꾸세요. 수동 설치가 필요하면 아래 방식 A/B 참고.

### 방식 A: 저장소를 프로젝트 루트로 사용
```bash
git clone <this-repo> my-project
cd my-project
# provider 인증 (예: OpenAI, DeepInfra, GitHub Copilot)
opencode
# 안에서: /connect
```
`opencode.jsonc`와 `.opencode/` 가 자동으로 인식됩니다. 인증 정보는 저장소에 들어가지 않고 `~/.local/share/opencode/auth.json` 에 저장됩니다.

### 방식 B: 공용 프로필로 여러 저장소에서 공유
Lite-Code 설정을 중앙에 두고 여러 프로젝트에서 재사용하려면 환경변수를 쓰세요.

```bash
# ~/.bashrc / ~/.zshrc 등에
export OPENCODE_CONFIG="$HOME/lite-code/opencode.jsonc"
export OPENCODE_CONFIG_DIR="$HOME/lite-code/.opencode"
```

이 상태에서 어느 디렉터리에서 `opencode`를 실행해도 Lite-Code 오케스트레이션 정책이 적용됩니다. 각 프로젝트의 고유 규칙은 그 프로젝트의 `AGENTS.md`에만 남겨두세요.

### 개인 설정 vs 저장소 설정
| 항목 | 위치 | 커밋? |
|---|---|---|
| provider 인증 (API 키) | `~/.local/share/opencode/auth.json` | ❌ |
| 개인 모델 선호 (override) | `~/.config/opencode/opencode.json` | ❌ |
| 팀 공용 역할별 모델 매핑 | 저장소 `opencode.jsonc` | ✅ |
| 모델 프리셋 | `.opencode/scripts/presets.json` | ✅ |
| 오케스트레이션 정책 | `.opencode/instructions/lite-code.md` | ✅ |
| 런타임 상태 (tickets/run-log) | `.opencode/state/*.json` | ❌ (gitignore) |

---

## 🚀 시작하기

### 1. 모델 프리셋 전환
상황에 맞는 모델 세트를 즉시 적용합니다.

```bash
# 짧은 실행 래퍼 사용 권장
# (저장소 루트에서 1회)
chmod +x ./lcp

# 프리셋 목록 및 현재 설정 확인
./lcp --list

# 저비용 모드 적용 (GPT-4 mini 등)
./lcp economy

# 균형 모드 적용 (Reviewer만 고급 모델)
./lcp quality

# 최고 품질 모드 적용 (모든 워커 고급 모델)
./lcp full
```

### switch-preset 치트시트
```bash
# 프리셋 적용 (하위 호환: apply 없이 preset 이름만 써도 됨)
./lcp apply default

# 카탈로그 검색 후 선택(set/alias 저장)
./lcp search gpt-5.4 --provider=openai
./lcp search gpt-5.4 --connected-only
./lcp search gpt-5.4 --limit=50
./lcp search gpt-5.4 --limit=all

# 개별 agent 모델 지정 (alias 또는 full ID)
./lcp set reviewer smart
./lcp set fixer deepinfra/zai-org/GLM-5.1

# provider 일괄 교체 (카탈로그에 존재하는 대상만 반영)
./lcp swap-provider openai openrouter

# alias 관리 (팀: .opencode/scripts/aliases.json, 개인: ~/.config/opencode/lite-aliases.json)
./lcp alias ls
./lcp alias add my-mini openai/gpt-5.4-mini
./lcp alias rm my-mini

# 현재 상태 요약
./lcp status
```

### 2. 개별 서브에이전트 모델 변경
특정 에이전트의 모델만 세밀하게 조정하고 싶을 때 사용합니다.

- OpenCode 명령창에서 `/subagent-model`을 입력하고 안내에 따라 모델을 변경하세요.

## 🛠️ 주요 구성

| 파일/디렉토리 | 역할 |
|---|---|
| `AGENTS.md` | 이 저장소 고유 규칙 (포인터) |
| `.opencode/instructions/lite-code.md` | Lite-Code 공통 오케스트레이션 정책 (재사용 가능) |
| `.opencode/scripts/` | 모델 프리셋 관리 스크립트 및 데이터 |
| `.opencode/commands/` | `/switch-preset`, `/subagent-model` 등의 커스텀 명령 |
| `.opencode/prompts/` | 각 에이전트의 페르소나 및 위임 로직 (build.md 등) |
| `.opencode/plugins/` | 로컬 플러그인 (디렉터리 기반 자동 로드) |
| `opencode.jsonc` | 프로젝트 핵심 설정 및 에이전트별 모델 할당 |

## 📝 커스텀 프리셋 추가
`.opencode/scripts/presets.json` 파일에 새로운 프리셋 객체를 추가하여 자신만의 모델 조합을 만들 수 있습니다.

```json
"my-custom-preset": {
  "description": "설명",
  "agents": {
    "coder": { "model": "provider/model-id" },
    ...
  }
}
```

---
*주의: 모델 변경 사항을 반영하려면 OpenCode를 재시작해야 할 수 있습니다.*
