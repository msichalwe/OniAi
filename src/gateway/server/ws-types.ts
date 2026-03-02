import type { WebSocket } from "ws";
import type { ConnectParams } from "../protocol/index.js";

/** Per-connection quality metrics for observability */
export type WsConnectionMetrics = {
  /** Epoch-ms when the connection was established */
  connectedAt: number;
  /** Total messages received from this client */
  messagesIn: number;
  /** Total messages sent to this client */
  messagesOut: number;
  /** Last measured round-trip ping latency in ms (undefined if no pong received yet) */
  lastPingLatencyMs?: number;
  /** Epoch-ms of last ping sent */
  lastPingSentAt?: number;
};

export type GatewayWsClient = {
  socket: WebSocket;
  connect: ConnectParams;
  connId: string;
  presenceKey?: string;
  clientIp?: string;
  canvasCapability?: string;
  canvasCapabilityExpiresAtMs?: number;
  /** Connection quality metrics */
  metrics: WsConnectionMetrics;
};
