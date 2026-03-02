import type { GatewayClient } from "./server-methods/types.js";

const CONTROL_PLANE_RATE_LIMIT_MAX_REQUESTS = 3;
const CONTROL_PLANE_RATE_LIMIT_WINDOW_MS = 60_000;

type Bucket = {
  count: number;
  windowStartMs: number;
};

const controlPlaneBuckets = new Map<string, Bucket>();

function normalizePart(value: unknown, fallback: string): string {
  if (typeof value !== "string") {
    return fallback;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : fallback;
}

export function resolveControlPlaneRateLimitKey(client: GatewayClient | null): string {
  const deviceId = normalizePart(client?.connect?.device?.id, "unknown-device");
  const clientIp = normalizePart(client?.clientIp, "unknown-ip");
  if (deviceId === "unknown-device" && clientIp === "unknown-ip") {
    // Last-resort fallback: avoid cross-client contention when upstream identity is missing.
    const connId = normalizePart(client?.connId, "");
    if (connId) {
      return `${deviceId}|${clientIp}|conn=${connId}`;
    }
  }
  return `${deviceId}|${clientIp}`;
}

export type ControlPlaneWriteBudgetResult = {
  allowed: boolean;
  retryAfterMs: number;
  remaining: number;
  /** Absolute epoch-ms when the current window resets. */
  resetsAtMs: number;
  maxRequests: number;
  windowMs: number;
  key: string;
};

export function consumeControlPlaneWriteBudget(params: {
  client: GatewayClient | null;
  nowMs?: number;
}): ControlPlaneWriteBudgetResult {
  const nowMs = params.nowMs ?? Date.now();
  const key = resolveControlPlaneRateLimitKey(params.client);
  const bucket = controlPlaneBuckets.get(key);

  if (!bucket || nowMs - bucket.windowStartMs >= CONTROL_PLANE_RATE_LIMIT_WINDOW_MS) {
    controlPlaneBuckets.set(key, {
      count: 1,
      windowStartMs: nowMs,
    });
    return {
      allowed: true,
      retryAfterMs: 0,
      remaining: CONTROL_PLANE_RATE_LIMIT_MAX_REQUESTS - 1,
      resetsAtMs: nowMs + CONTROL_PLANE_RATE_LIMIT_WINDOW_MS,
      maxRequests: CONTROL_PLANE_RATE_LIMIT_MAX_REQUESTS,
      windowMs: CONTROL_PLANE_RATE_LIMIT_WINDOW_MS,
      key,
    };
  }

  if (bucket.count >= CONTROL_PLANE_RATE_LIMIT_MAX_REQUESTS) {
    const retryAfterMs = Math.max(
      0,
      bucket.windowStartMs + CONTROL_PLANE_RATE_LIMIT_WINDOW_MS - nowMs,
    );
    return {
      allowed: false,
      retryAfterMs,
      remaining: 0,
      resetsAtMs: bucket.windowStartMs + CONTROL_PLANE_RATE_LIMIT_WINDOW_MS,
      maxRequests: CONTROL_PLANE_RATE_LIMIT_MAX_REQUESTS,
      windowMs: CONTROL_PLANE_RATE_LIMIT_WINDOW_MS,
      key,
    };
  }

  bucket.count += 1;
  return {
    allowed: true,
    retryAfterMs: 0,
    remaining: Math.max(0, CONTROL_PLANE_RATE_LIMIT_MAX_REQUESTS - bucket.count),
    resetsAtMs: bucket.windowStartMs + CONTROL_PLANE_RATE_LIMIT_WINDOW_MS,
    maxRequests: CONTROL_PLANE_RATE_LIMIT_MAX_REQUESTS,
    windowMs: CONTROL_PLANE_RATE_LIMIT_WINDOW_MS,
    key,
  };
}

/** Query the current write budget for a client without consuming a request. */
export function getControlPlaneWriteBudgetStatus(params: {
  client: GatewayClient | null;
  nowMs?: number;
}): Omit<ControlPlaneWriteBudgetResult, "key" | "allowed"> {
  const nowMs = params.nowMs ?? Date.now();
  const key = resolveControlPlaneRateLimitKey(params.client);
  const bucket = controlPlaneBuckets.get(key);

  if (!bucket || nowMs - bucket.windowStartMs >= CONTROL_PLANE_RATE_LIMIT_WINDOW_MS) {
    return {
      retryAfterMs: 0,
      remaining: CONTROL_PLANE_RATE_LIMIT_MAX_REQUESTS,
      resetsAtMs: 0,
      maxRequests: CONTROL_PLANE_RATE_LIMIT_MAX_REQUESTS,
      windowMs: CONTROL_PLANE_RATE_LIMIT_WINDOW_MS,
    };
  }

  if (bucket.count >= CONTROL_PLANE_RATE_LIMIT_MAX_REQUESTS) {
    const retryAfterMs = Math.max(
      0,
      bucket.windowStartMs + CONTROL_PLANE_RATE_LIMIT_WINDOW_MS - nowMs,
    );
    return {
      retryAfterMs,
      remaining: 0,
      resetsAtMs: bucket.windowStartMs + CONTROL_PLANE_RATE_LIMIT_WINDOW_MS,
      maxRequests: CONTROL_PLANE_RATE_LIMIT_MAX_REQUESTS,
      windowMs: CONTROL_PLANE_RATE_LIMIT_WINDOW_MS,
    };
  }

  return {
    retryAfterMs: 0,
    remaining: Math.max(0, CONTROL_PLANE_RATE_LIMIT_MAX_REQUESTS - bucket.count),
    resetsAtMs: bucket.windowStartMs + CONTROL_PLANE_RATE_LIMIT_WINDOW_MS,
    maxRequests: CONTROL_PLANE_RATE_LIMIT_MAX_REQUESTS,
    windowMs: CONTROL_PLANE_RATE_LIMIT_WINDOW_MS,
  };
}

export const __testing = {
  resetControlPlaneRateLimitState() {
    controlPlaneBuckets.clear();
  },
};
