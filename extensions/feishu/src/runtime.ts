import type { PluginRuntime } from "oni/plugin-sdk";

let runtime: PluginRuntime | null = null;

export function setFeishuRuntime(next: PluginRuntime) {
  runtime = next;
}

export function getFeishuRuntime(): PluginRuntime {
  if (!runtime) {
    throw new Error("Feishu runtime not initialized");
  }
  return runtime;
}
