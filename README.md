# Lite-Code Orchestration

OpenCode 기반의 경량 오케스트레이션 및 서브에이전트 모델 관리 시스템입니다. 비용 효율적인 개발을 위해 고비용 모델과 저비용 모델을 전략적으로 배치하고 관리합니다.

## ✨ 주요 기능

- **지능형 위임 (Skill Dispatch)**: 메인 에이전트(`build`)가 작업의 복잡도를 판단하여 `coder`, `tester`, `fixer`, `reviewer` 서브에이전트에게 자동으로 업무를 분담합니다.
- **모델 프리셋 관리**: 작업 환경(비용 절약 vs 고품질)에 따라 서브에이전트들의 모델 세트를 한 번에 전환할 수 있습니다.
- **AGENTS.md 기반 정책**: 명확한 역할 분담과 위임 규칙을 정의하여 일관된 협업 구조를 유지합니다.

## 🚀 시작하기

### 1. 모델 프리셋 전환
상황에 맞는 모델 세트를 즉시 적용합니다.

```bash
# 프리셋 목록 및 현재 설정 확인
node .opencode/scripts/switch-preset.js --list

# 저비용 모드 적용 (GPT-4 mini 등)
node .opencode/scripts/switch-preset.js economy

# 균형 모드 적용 (Reviewer만 고급 모델)
node .opencode/scripts/switch-preset.js quality

# 최고 품질 모드 적용 (모든 워커 고급 모델)
node .opencode/scripts/switch-preset.js full
```

### 2. 개별 서브에이전트 모델 변경
특정 에이전트의 모델만 세밀하게 조정하고 싶을 때 사용합니다.

- OpenCode 명령창에서 `/subagent-model`을 입력하고 안내에 따라 모델을 변경하세요.

## 🛠️ 주요 구성

| 파일/디렉토리 | 역할 |
|---|---|
| `AGENTS.md` | 오케스트레이션 정책 및 에이전트 역할 정의 |
| `.opencode/scripts/` | 모델 프리셋 관리 스크립트 및 데이터 |
| `.opencode/commands/` | `/switch-preset`, `/subagent-model` 등의 커스텀 명령 |
| `.opencode/prompts/` | 각 에이전트의 페르소나 및 위임 로직 (build.md 등) |
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
