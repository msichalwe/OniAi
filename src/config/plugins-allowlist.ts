import type { OniAIConfig } from "./config.js";

export function ensurePluginAllowlisted(cfg: OniAIConfig, pluginId: string): OniAIConfig {
  const allow = cfg.plugins?.allow;
  if (!Array.isArray(allow) || allow.includes(pluginId)) {
    return cfg;
  }
  return {
    ...cfg,
    plugins: {
      ...cfg.plugins,
      allow: [...allow, pluginId],
    },
  };
}
