---
description: Switch worker model preset (economy / quality / full / default)
subtask: false
---

사용자가 이 명령을 실행하면, 서브에이전트 모델 프리셋 전환 방법을 안내한다.

## 안내 내용

아래 쉘 명령어를 보여주고 실행 여부를 묻는다.

### 프리셋 목록 보기
```bash
node .opencode/scripts/switch-preset.js --list
```

### 프리셋 적용
```bash
# 저비용 모드
node .opencode/scripts/switch-preset.js economy

# 균형 모드 (reviewer만 고급)
node .opencode/scripts/switch-preset.js quality

# 최고 품질 모드
node .opencode/scripts/switch-preset.js full

# 기본값 복원 (global default 상속)
node .opencode/scripts/switch-preset.js default
```

## 추가 안내

- 프리셋은 `.opencode/scripts/presets.json`에서 직접 편집하여 커스텀 프리셋을 만들 수 있다.
- 적용 후 OpenCode를 재시작해야 변경 사항이 반영된다.
- 개별 에이전트의 모델만 바꾸고 싶으면 `/subagent-model` 명령을 사용한다.
