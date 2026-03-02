/**
 * In-memory tracker for recent delivery failures, exposed via health-state.
 * Entries auto-expire after a configurable TTL (default 5 minutes).
 */

export type DeliveryFailureEntry = {
  channel: string;
  accountId?: string;
  errorMessage: string;
  retryCount: number;
  timestamp: number;
};

export type DeliveryFailureSummary = {
  /** Total failures in the current window */
  total: number;
  /** Failures grouped by channel */
  byChannel: Record<string, { count: number; lastError: string; lastTimestamp: number }>;
};

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_ENTRIES = 200;

let entries: DeliveryFailureEntry[] = [];
let ttlMs = DEFAULT_TTL_MS;

export function setDeliveryFailureTtl(ms: number): void {
  ttlMs = ms;
}

export function recordDeliveryFailure(entry: DeliveryFailureEntry): void {
  entries.push(entry);
  if (entries.length > MAX_ENTRIES) {
    entries = entries.slice(-MAX_ENTRIES);
  }
}

function pruneExpired(): void {
  const cutoff = Date.now() - ttlMs;
  entries = entries.filter((e) => e.timestamp >= cutoff);
}

export function getDeliveryFailureSummary(): DeliveryFailureSummary {
  pruneExpired();
  const byChannel: DeliveryFailureSummary["byChannel"] = {};
  for (const entry of entries) {
    const existing = byChannel[entry.channel];
    if (!existing || entry.timestamp > existing.lastTimestamp) {
      byChannel[entry.channel] = {
        count: (existing?.count ?? 0) + 1,
        lastError: entry.errorMessage,
        lastTimestamp: entry.timestamp,
      };
    } else {
      existing.count += 1;
    }
  }
  return { total: entries.length, byChannel };
}

export function clearDeliveryFailures(): void {
  entries = [];
}
