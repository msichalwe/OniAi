import type { OniAIPluginApi } from "oni/plugin-sdk";
import { emptyPluginConfigSchema } from "oni/plugin-sdk";
import { createDiagnosticsOtelService } from "./src/service.js";

const plugin = {
  id: "diagnostics-otel",
  name: "Diagnostics OpenTelemetry",
  description: "Export diagnostics events to OpenTelemetry",
  configSchema: emptyPluginConfigSchema(),
  register(api: OniAIPluginApi) {
    api.registerService(createDiagnosticsOtelService());
  },
};

export default plugin;
