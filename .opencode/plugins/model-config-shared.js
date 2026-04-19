export const ORCHESTRATION_AGENTS = [
  { name: "plan", label: "Planner", role: "계획/분석", costTier: "high" },
  { name: "build", label: "Coder (build)", role: "구현", costTier: "low" },
  { name: "reviewer", label: "Reviewer", role: "최종 검수", costTier: "high" },
  { name: "tester", label: "Tester", role: "검증", costTier: "low" },
  { name: "fixer", label: "Fixer", role: "수정", costTier: "low" },
  { name: "coder", label: "Coder (auto)", role: "자동 모드 구현", costTier: "low" },
];

export const REQUIRED_EXPLICIT_WORKER_MODELS = ["reviewer", "tester", "fixer", "coder"];

export function buildModelConfigCommand(onSelect) {
  return {
    title: "Configure Agent Models",
    value: "lite-model-config",
    description: "에이전트별 모델/프로바이더 설정",
    category: "Lite-Code",
    suggested: true,
    slash: {
      name: "agent-models",
      aliases: ["models", "configure-agent-models"],
    },
    onSelect,
  };
}

export function resolveCurrentModel(agentName, config, agents) {
  return resolveAgentModelState(agentName, config, agents).current;
}

export function resolveCurrentModelRaw(agentName, config, agents) {
  return resolveAgentModelState(agentName, config, agents).raw;
}

export function resolveAgentModelState(agentName, config, agents) {
  const routing = config?.worker_model_routing;
  const categoryName = routing?.workers?.[agentName]?.category;
  const explicit = config?.agent?.[agentName]?.model;

  if (categoryName) {
    const categoryModel = routing?.categories?.[categoryName]?.model;
    if (categoryModel) {
      return {
        current: categoryModel,
        raw: categoryModel,
        source: "category-managed",
        needsAttention: false,
        notice: "",
        category: categoryName,
      };
    } else {
      return {
        current: explicit ? explicit : "(not set)",
        raw: explicit ? explicit : "",
        source: "unset",
        needsAttention: true,
        notice: `UNSET CATEGORY - ${categoryName} has no model`,
        category: categoryName,
      };
    }
  }

  if (explicit) {
    return {
      current: explicit,
      raw: explicit,
      source: "explicit",
      needsAttention: false,
      notice: "",
    };
  }

  const runtimeAgent = agents?.find((agent) => agent.name === agentName);
  const runtimeModel = runtimeAgent?.model;
  let current = "(not set)";
  let source = "unset";

  if (runtimeModel?.providerID && runtimeModel?.modelID) {
    current = `${runtimeModel.providerID}/${runtimeModel.modelID}`;
    source = "runtime";
  } else if (config?.model) {
    current = `${config.model} (global default)`;
    source = "global";
  }

  const needsAttention = REQUIRED_EXPLICIT_WORKER_MODELS.includes(agentName);
  let notice = "";
  if (needsAttention) {
    if (source === "runtime") {
      notice = `Explicit worker model not set; will inherit the invoking primary agent (currently ${current}).`;
    } else if (source === "global") {
      notice = `Explicit worker model not set; will inherit the invoking primary agent (global default: ${config.model}).`;
    } else {
      notice = "Explicit worker model not set; will inherit the invoking primary agent.";
    }
  }

  return {
    current,
    raw: "",
    source,
    needsAttention,
    notice,
  };
}

export function listMissingExplicitWorkerModels(config) {
  return REQUIRED_EXPLICIT_WORKER_MODELS.filter((agentName) => {
    const state = resolveAgentModelState(agentName, config, []);
    return state.needsAttention;
  });
}

export function materializeAgentModels(config) {
  const routing = config?.worker_model_routing;
  if (!routing) return config;

  const nextAgent = { ...(config.agent ?? {}) };

  for (const [worker, wConf] of Object.entries(routing.workers || {})) {
    const cat = wConf?.category;
    if (cat) {
      const catModel = routing.categories?.[cat]?.model;
      if (catModel) {
        nextAgent[worker] = { ...nextAgent[worker], model: catModel };
      }
    }
  }

  return { ...config, agent: nextAgent };
}

export function applyWorkerCategoryMode(config, agentName, mode, categoryName) {
  const nextConfig = { ...config };
  
  if (!nextConfig.worker_model_routing) {
    nextConfig.worker_model_routing = { workers: {}, categories: {} };
  } else {
    nextConfig.worker_model_routing = { 
      workers: { ...nextConfig.worker_model_routing.workers },
      categories: { ...nextConfig.worker_model_routing.categories }
    };
  }

  if (mode === "category") {
    nextConfig.worker_model_routing.workers[agentName] = { category: categoryName };
  } else {
    if (nextConfig.worker_model_routing.workers[agentName]) {
      delete nextConfig.worker_model_routing.workers[agentName];
    }
  }
  
  if (mode === "clear") {
    nextConfig.agent = { ...(nextConfig.agent || {}) };
    const existing = nextConfig.agent[agentName];
    if (existing && typeof existing === "object") {
      const { model: _removedModel, ...rest } = existing;
      if (Object.keys(rest).length === 0) delete nextConfig.agent[agentName];
      else nextConfig.agent[agentName] = rest;
    }
  }
  
  return nextConfig;
}

export function applyCategoryModel(config, categoryName, modelValue) {
  const nextConfig = { ...config };
  if (!nextConfig.worker_model_routing) {
    nextConfig.worker_model_routing = { workers: {}, categories: {} };
  } else {
    nextConfig.worker_model_routing = { 
      workers: { ...nextConfig.worker_model_routing.workers },
      categories: { ...nextConfig.worker_model_routing.categories }
    };
  }
  
  nextConfig.worker_model_routing.categories[categoryName] = { model: modelValue };
  return materializeAgentModels(nextConfig);
}

export function applyAgentExplicitModel(config, agentName, modelValue) {
  const nextConfig = { ...config, agent: { ...(config.agent || {}) } };
  
  if (modelValue === "") {
    const existing = nextConfig.agent[agentName];
    if (existing && typeof existing === "object") {
      const { model: _removedModel, ...rest } = existing;
      if (Object.keys(rest).length === 0) delete nextConfig.agent[agentName];
      else nextConfig.agent[agentName] = rest;
    }
  } else {
    nextConfig.agent[agentName] = {
      ...(nextConfig.agent[agentName] ?? {}),
      model: modelValue,
    };
  }
  return materializeAgentModels(nextConfig);
}
