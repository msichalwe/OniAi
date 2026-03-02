/**
 * Tracks per-channel startup health for graceful degradation.
 *
 * When a channel fails to start, the gateway continues running with
 * degraded health rather than appearing fully healthy.
 */

export type ChannelStartupState = "healthy" | "degraded" | "failed" | "stopped";

export type ChannelStartupInfo = {
  state: ChannelStartupState;
  /** Error message if state is "failed" */
  error?: string;
  /** Timestamp of last state change */
  updatedAt: number;
};

const channelHealth = new Map<string, ChannelStartupInfo>();

export function setChannelStartupState(
  channelId: string,
  state: ChannelStartupState,
  error?: string,
): void {
  channelHealth.set(channelId, {
    state,
    error: error ?? undefined,
    updatedAt: Date.now(),
  });
}

export function getChannelStartupState(channelId: string): ChannelStartupInfo | undefined {
  return channelHealth.get(channelId);
}

export function getAllChannelStartupHealth(): Record<string, ChannelStartupInfo> {
  const result: Record<string, ChannelStartupInfo> = {};
  for (const [id, info] of channelHealth) {
    result[id] = info;
  }
  return result;
}

/** Returns true if any channel is in a non-healthy state */
export function hasChannelStartupFailures(): boolean {
  for (const info of channelHealth.values()) {
    if (info.state === "failed" || info.state === "degraded") {
      return true;
    }
  }
  return false;
}

export function clearChannelStartupHealth(): void {
  channelHealth.clear();
}
