import type { UpdateAvailable } from "../infra/update-startup.js";

export const GATEWAY_EVENT_UPDATE_AVAILABLE = "update.available" as const;
export const GATEWAY_EVENT_CONFIG_RELOAD_ERROR = "config.reload.error" as const;

export type GatewayUpdateAvailableEventPayload = {
  updateAvailable: UpdateAvailable | null;
};

export type GatewayConfigReloadErrorPayload = {
  /** "parse" for JSON parse errors, "validation" for schema violations */
  kind: "parse" | "validation";
  /** Human-readable error summary */
  message: string;
  /** Individual validation issues (empty for parse errors) */
  issues: Array<{ path: string; message: string }>;
  /** ISO timestamp of when the error occurred */
  timestamp: string;
};
