import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __testing as controlPlaneRateLimitTesting,
  getControlPlaneWriteBudgetStatus,
  resolveControlPlaneRateLimitKey,
} from "./control-plane-rate-limit.js";
import { handleGatewayRequest } from "./server-methods.js";
import type { GatewayRequestHandler } from "./server-methods/types.js";

const noWebchat = () => false;

describe("gateway control-plane write rate limit", () => {
  beforeEach(() => {
    controlPlaneRateLimitTesting.resetControlPlaneRateLimitState();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-19T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    controlPlaneRateLimitTesting.resetControlPlaneRateLimitState();
  });

  function buildContext(logWarn = vi.fn()) {
    return {
      logGateway: {
        warn: logWarn,
      },
    } as unknown as Parameters<typeof handleGatewayRequest>[0]["context"];
  }

  function buildConnect(): NonNullable<
    Parameters<typeof handleGatewayRequest>[0]["client"]
  >["connect"] {
    return {
      role: "operator",
      scopes: ["operator.admin"],
      client: {
        id: "oni-control-ui",
        version: "1.0.0",
        platform: "darwin",
        mode: "ui",
      },
      minProtocol: 1,
      maxProtocol: 1,
    };
  }

  function buildClient() {
    return {
      connect: buildConnect(),
      connId: "conn-1",
      clientIp: "10.0.0.5",
    } as Parameters<typeof handleGatewayRequest>[0]["client"];
  }

  async function runRequest(params: {
    method: string;
    context: Parameters<typeof handleGatewayRequest>[0]["context"];
    client: Parameters<typeof handleGatewayRequest>[0]["client"];
    handler: GatewayRequestHandler;
  }) {
    const respond = vi.fn();
    await handleGatewayRequest({
      req: {
        type: "req",
        id: crypto.randomUUID(),
        method: params.method,
      },
      respond,
      client: params.client,
      isWebchatConnect: noWebchat,
      context: params.context,
      extraHandlers: {
        [params.method]: params.handler,
      },
    });
    return respond;
  }

  it("allows 3 control-plane writes and blocks the 4th in the same minute", async () => {
    const handlerCalls = vi.fn();
    const handler: GatewayRequestHandler = (opts) => {
      handlerCalls(opts);
      opts.respond(true, undefined, undefined);
    };
    const logWarn = vi.fn();
    const context = buildContext(logWarn);
    const client = buildClient();

    await runRequest({ method: "config.patch", context, client, handler });
    await runRequest({ method: "config.patch", context, client, handler });
    await runRequest({ method: "config.patch", context, client, handler });
    const blocked = await runRequest({ method: "config.patch", context, client, handler });

    expect(handlerCalls).toHaveBeenCalledTimes(3);
    expect(blocked).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        code: "UNAVAILABLE",
        retryable: true,
      }),
    );
    expect(logWarn).toHaveBeenCalledTimes(1);
  });

  it("resets the control-plane write budget after 60 seconds", async () => {
    const handlerCalls = vi.fn();
    const handler: GatewayRequestHandler = (opts) => {
      handlerCalls(opts);
      opts.respond(true, undefined, undefined);
    };
    const context = buildContext();
    const client = buildClient();

    await runRequest({ method: "update.run", context, client, handler });
    await runRequest({ method: "update.run", context, client, handler });
    await runRequest({ method: "update.run", context, client, handler });

    const blocked = await runRequest({ method: "update.run", context, client, handler });
    expect(blocked).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ code: "UNAVAILABLE" }),
    );

    vi.advanceTimersByTime(60_001);

    const allowed = await runRequest({ method: "update.run", context, client, handler });
    expect(allowed).toHaveBeenCalledWith(true, undefined, undefined);
    expect(handlerCalls).toHaveBeenCalledTimes(4);
  });

  it("uses connId fallback when both device and client IP are unknown", () => {
    const key = resolveControlPlaneRateLimitKey({
      connect: buildConnect(),
      connId: "conn-fallback",
    });
    expect(key).toBe("unknown-device|unknown-ip|conn=conn-fallback");
  });

  it("keeps device/IP-based key when identity is present", () => {
    const key = resolveControlPlaneRateLimitKey({
      connect: buildConnect(),
      connId: "conn-fallback",
      clientIp: "10.0.0.10",
    });
    expect(key).toBe("unknown-device|10.0.0.10");
  });

  it("includes budget details in rate-limit error response", async () => {
    const handler: GatewayRequestHandler = (opts) => {
      opts.respond(true, undefined, undefined);
    };
    const context = buildContext();
    const client = buildClient();

    await runRequest({ method: "config.patch", context, client, handler });
    await runRequest({ method: "config.patch", context, client, handler });
    await runRequest({ method: "config.patch", context, client, handler });
    const blocked = await runRequest({ method: "config.patch", context, client, handler });

    const errorArg = blocked.mock.calls[0][2];
    expect(errorArg.details).toEqual(
      expect.objectContaining({
        method: "config.patch",
        remaining: 0,
        maxRequests: 3,
        windowMs: 60_000,
      }),
    );
    expect(typeof errorArg.details.resetsAtMs).toBe("number");
    expect(errorArg.details.resetsAtMs).toBeGreaterThan(Date.now() - 1);
  });

  it("getControlPlaneWriteBudgetStatus returns full budget without consuming", async () => {
    const handler: GatewayRequestHandler = (opts) => {
      opts.respond(true, undefined, undefined);
    };
    const context = buildContext();
    const client = buildClient();

    // Before any writes — full budget
    const before = getControlPlaneWriteBudgetStatus({ client });
    expect(before.remaining).toBe(3);
    expect(before.maxRequests).toBe(3);
    expect(before.retryAfterMs).toBe(0);

    // After 2 writes — still has remaining
    await runRequest({ method: "config.apply", context, client, handler });
    await runRequest({ method: "config.apply", context, client, handler });

    const mid = getControlPlaneWriteBudgetStatus({ client });
    expect(mid.remaining).toBe(1);
    expect(mid.maxRequests).toBe(3);
    expect(mid.windowMs).toBe(60_000);
    expect(mid.resetsAtMs).toBeGreaterThan(0);

    // Calling status again doesn't consume budget
    const midAgain = getControlPlaneWriteBudgetStatus({ client });
    expect(midAgain.remaining).toBe(1);
  });
});
