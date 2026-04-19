/**
 * TUI-only: 에이전트별 provider/model 설정 (docs/model-config-tui-plugin-spec.md)
 */
import type { TuiPlugin, TuiPluginApi } from "@opencode-ai/plugin/tui";
import type { Agent, Config, Model } from "@opencode-ai/sdk/v2/client";

import {
  ORCHESTRATION_AGENTS,
  applyAgentExplicitModel,
  applyCategoryModel,
  applyWorkerCategoryMode,
  buildModelConfigCommand,
  listMissingExplicitWorkerModels,
  resolveAgentModelState,
  resolveCurrentModelRaw,
} from "./model-config-shared.js";

function formatCost(model: Model): string {
  const cost = model.cost;
  if (!cost) return "";
  const input = cost.input ?? 0;
  const output = cost.output ?? 0;
  if (input === 0 && output === 0) return "Free";
  const inM = input * 1_000_000;
  const outM = output * 1_000_000;
  return `$${inM.toFixed(2)} / $${outM.toFixed(2)} per 1M tokens`;
}

function directoryQuery(api: TuiPluginApi) {
  const d = api.state.path.directory;
  return d ? { directory: d } : {};
}

function formatAgentDescription(
  agent: (typeof ORCHESTRATION_AGENTS)[number],
  state: ReturnType<typeof resolveAgentModelState>,
): string {
  const tierHint =
    agent.costTier === "high"
      ? " (policy: high-tier role)"
      : " (policy: low-tier role)";

  if (state.needsAttention) {
    if (state.notice && state.notice.startsWith("UNSET CATEGORY")) {
      return `${state.notice}${tierHint} · ${agent.role}`;
    }
    return `UNSET - ${state.current}. ${state.notice}${tierHint} · ${agent.role}`;
  }

  const sourceHint =
    state.source === "category-managed"
      ? " (category-managed)"
      : state.source === "explicit"
        ? " (agent-explicit)"
        : state.source === "global"
          ? " (global)"
          : state.source === "runtime"
            ? " (runtime)"
            : "";

  return `${state.current}${sourceHint}${tierHint} · ${agent.role}`;
}

export const tui: TuiPlugin = async (api) => {
  async function showModelSelectInternal(
    title: string,
    currentRaw: string,
    onModelSelect: (value: string) => Promise<void>,
  ) {
    let providersData: { providers?: Array<{ id: string; name: string; models: Record<string, Model> }> } | undefined;
    try {
      const provRes = await api.client.config.providers(directoryQuery(api));
      providersData = provRes.data;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to list providers";
      api.ui.toast({ variant: "error", title: "Providers failed", message: msg });
      await showAgentSelect();
      return;
    }

    const modelOptions: Array<{
      title: string;
      value: string;
      description?: string;
      category?: string;
    }> = [
      {
        title: "Use default",
        value: "",
        description: "Remove explicit model, use global default",
        category: "Default",
      },
    ];

    for (const p of providersData?.providers ?? []) {
      const models = p.models ?? {};
      for (const model of Object.values(models)) {
        if (!model?.id) continue;
        const value = `${p.id}/${model.id}`;
        modelOptions.push({
          title: model.name || model.id,
          value,
          description: formatCost(model),
          category: p.name || p.id,
        });
      }
    }

    api.ui.dialog.replace(() =>
      api.ui.DialogSelect<string>({
        title,
        placeholder: "Search models...",
        options: modelOptions,
        current: currentRaw,
        onSelect: (option) => {
          void onModelSelect(option.value as string);
        },
      }),
    );
  }

  async function applyCategoryModelConfig(categoryName: string, modelValue: string) {
    try {
      const getRes = await api.client.config.get(directoryQuery(api));
      const prev = getRes.data;
      if (!prev) throw new Error("Configuration unavailable");

      const nextConfig = applyCategoryModel(prev, categoryName, modelValue);

      await api.client.config.update({
        ...directoryQuery(api),
        config: nextConfig,
      });

      api.ui.toast({
        variant: "success",
        title: "Category updated",
        message: `${categoryName} → ${modelValue || "default"}`,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Configuration update failed";
      api.ui.toast({ variant: "error", title: "Failed to update", message: msg });
    } finally {
      await showAgentSelect();
    }
  }

  async function applyAgentModelConfig(agentName: string, modelValue: string) {
    try {
      const getRes = await api.client.config.get(directoryQuery(api));
      const prev = getRes.data;
      if (!prev) throw new Error("Configuration unavailable");

      const nextConfig = applyAgentExplicitModel(prev, agentName, modelValue);

      await api.client.config.update({
        ...directoryQuery(api),
        config: nextConfig,
      });

      api.ui.toast({
        variant: "success",
        title: "Model updated",
        message: `${agentName} → ${modelValue || "default"}`,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Configuration update failed";
      api.ui.toast({ variant: "error", title: "Failed to update", message: msg });
    } finally {
      await showAgentSelect();
    }
  }

  async function applyRoutingMode(agentName: string, mode: "category" | "explicit" | "clear", categoryName?: string) {
    try {
      const getRes = await api.client.config.get(directoryQuery(api));
      const config = getRes.data;
      if (!config) throw new Error("Configuration unavailable");

      const nextConfig = applyWorkerCategoryMode(config, agentName, mode, categoryName);
      await api.client.config.update({
        ...directoryQuery(api),
        config: nextConfig,
      });

      if (mode === "category" && categoryName) {
        const catModel = nextConfig?.worker_model_routing?.categories?.[categoryName]?.model;
        if (!catModel) {
          void showModelSelectInternal(
            `Select model for category "${categoryName}"`,
            "",
            (val) => applyCategoryModelConfig(categoryName, val)
          );
          return;
        }
      } else if (mode === "explicit") {
        void showModelSelectForAgent(agentName);
        return;
      }

      await showAgentSelect();
    } catch (e) {
      api.ui.toast({ variant: "error", title: "Routing update failed", message: e instanceof Error ? e.message : "Error" });
      await showAgentSelect();
    }
  }

  async function showCategoryChoice(agentName: string) {
    let config: any;
    try {
      const cfgRes = await api.client.config.get(directoryQuery(api));
      config = cfgRes.data;
    } catch (e) {
      api.ui.toast({ variant: "error", title: "Load failed", message: "Failed to load config" });
      await showAgentSelect();
      return;
    }

    const STANDARD_CATEGORIES = [
      { value: "implementation", title: "implementation" },
      { value: "verification", title: "verification" },
      { value: "repair", title: "repair" },
      { value: "review", title: "review" },
    ];

    const existing = Object.keys(config?.worker_model_routing?.categories || {});
    const options = [...STANDARD_CATEGORIES];
    for (const cat of existing) {
      if (!options.find(o => o.value === cat)) {
        options.push({ value: cat, title: cat, category: "Custom" });
      }
    }

    api.ui.dialog.replace(() =>
      api.ui.DialogSelect<string>({
        title: `Select category for ${agentName}`,
        options,
        onSelect: (option) => {
          void applyRoutingMode(agentName, "category", option.value as string);
        },
      })
    );
  }

  async function showModelSelectForAgent(agentName: string) {
    let config: Config | undefined;
    let agents: Agent[] | undefined;
    try {
      const [cfgRes, agRes] = await Promise.all([
        api.client.config.get(directoryQuery(api)),
        api.client.app.agents(directoryQuery(api)),
      ]);
      config = cfgRes.data;
      agents = agRes.data;
    } catch (e) {
      // Ignored here for brevity, fallback raw
    }

    const currentRaw = resolveCurrentModelRaw(agentName, config, agents);
    const meta = ORCHESTRATION_AGENTS.find((a) => a.name === agentName);
    const agentLabel = meta?.label ?? agentName;

    await showModelSelectInternal(
      `Select explicit model for "${agentLabel}"`,
      currentRaw,
      (val) => applyAgentModelConfig(agentName, val)
    );
  }

  async function showRoutingChoice(agentName: string) {
    const options = [
      { value: "category", title: "Use category", description: "Route using a shared category model" },
      { value: "explicit", title: "Use direct model", description: "Assign a model directly to this worker" },
      { value: "clear", title: "Clear worker routing", description: "Remove agent-specific model and category" },
    ];

    api.ui.dialog.replace(() =>
      api.ui.DialogSelect<string>({
        title: `Configure routing for ${agentName}`,
        options,
        onSelect: (option) => {
          if (option.value === "category") {
            void showCategoryChoice(agentName);
          } else if (option.value === "explicit") {
            void applyRoutingMode(agentName, "explicit");
          } else {
            void applyRoutingMode(agentName, "clear");
          }
        },
      })
    );
  }

  async function showAgentSelect() {
    let config: Config | undefined;
    let agents: Agent[] | undefined;
    try {
      const [cfgRes, agRes] = await Promise.all([
        api.client.config.get(directoryQuery(api)),
        api.client.app.agents(directoryQuery(api)),
      ]);
      config = cfgRes.data;
      agents = agRes.data;
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "Failed to load configuration";
      api.ui.toast({ variant: "error", title: "Load failed", message: msg });
      return;
    }

    const missingWorkers = listMissingExplicitWorkerModels(config);

    const agentOptions = ORCHESTRATION_AGENTS.map((a) => {
      const state = resolveAgentModelState(a.name, config, agents);
      const title =
        missingWorkers.includes(a.name) && state.needsAttention
          ? `${a.label} [UNSET]`
          : a.label;
      return {
        title,
        value: a.name,
        description: formatAgentDescription(a, state),
      };
    });
    api.ui.dialog.replace(() =>
      api.ui.DialogSelect<string>({
        title: "Configure Agent Models",
        options: agentOptions,
        flat: true,
        onSelect: (option) => {
          void showRoutingChoice(option.value as string);
        },
      }),
    );
  }

  api.command.register(() => [
    buildModelConfigCommand(async () => {
      void showAgentSelect();
    }),
  ]);
};

export default { id: "lite-model-config", tui };
