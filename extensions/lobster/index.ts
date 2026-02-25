import type {
  AnyAgentTool,
  OniAIPluginApi,
  OniAIPluginToolFactory,
} from "../../src/plugins/types.js";
import { createLobsterTool } from "./src/lobster-tool.js";

export default function register(api: OniAIPluginApi) {
  api.registerTool(
    ((ctx) => {
      if (ctx.sandboxed) {
        return null;
      }
      return createLobsterTool(api) as AnyAgentTool;
    }) as OniAIPluginToolFactory,
    { optional: true },
  );
}
