/**
 * Circuit breaker for outbound delivery channels.
 *
 * States:
 * - CLOSED: normal operation, requests pass through
 * - OPEN: fast-fail, requests are rejected immediately
 * - HALF_OPEN: probe mode, one request is allowed through to test recovery
 *
 * Opens after `threshold` consecutive failures within `windowMs`.
 * Probes every `probeIntervalMs` in OPEN state.
 * Closes on first success in HALF_OPEN state.
 */

export type CircuitState = "closed" | "open" | "half_open";

export type CircuitBreakerConfig = {
  /** Consecutive failures to open the circuit. @default 5 */
  threshold?: number;
  /** Window for counting failures in ms. @default 60_000 */
  windowMs?: number;
  /** How long to stay open before probing in ms. @default 30_000 */
  probeIntervalMs?: number;
};

export type CircuitBreakerStatus = {
  state: CircuitState;
  consecutiveFailures: number;
  lastFailureAt: number | null;
  lastSuccessAt: number | null;
  openedAt: number | null;
};

export type CircuitBreaker = {
  /** Check if a request should be allowed through. */
  canExecute: () => boolean;
  /** Record a successful execution (closes circuit if half-open). */
  onSuccess: () => void;
  /** Record a failed execution (may open circuit). */
  onFailure: () => void;
  /** Get the current circuit state for observability. */
  status: () => CircuitBreakerStatus;
  /** Force-reset to closed state. */
  reset: () => void;
};

const DEFAULT_THRESHOLD = 5;
const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_PROBE_INTERVAL_MS = 30_000;

export function createCircuitBreaker(config?: CircuitBreakerConfig): CircuitBreaker {
  const threshold = config?.threshold ?? DEFAULT_THRESHOLD;
  const windowMs = config?.windowMs ?? DEFAULT_WINDOW_MS;
  const probeIntervalMs = config?.probeIntervalMs ?? DEFAULT_PROBE_INTERVAL_MS;

  let state: CircuitState = "closed";
  let consecutiveFailures = 0;
  let firstFailureAt: number | null = null;
  let lastFailureAt: number | null = null;
  let lastSuccessAt: number | null = null;
  let openedAt: number | null = null;

  function canExecute(): boolean {
    const now = Date.now();

    if (state === "closed") {
      return true;
    }

    if (state === "half_open") {
      // Only one probe at a time — already in probe mode
      return true;
    }

    // state === "open" — check if probe interval has elapsed
    if (openedAt && now - openedAt >= probeIntervalMs) {
      state = "half_open";
      return true;
    }

    return false;
  }

  function onSuccess(): void {
    consecutiveFailures = 0;
    firstFailureAt = null;
    lastSuccessAt = Date.now();
    if (state === "half_open" || state === "open") {
      state = "closed";
      openedAt = null;
    }
  }

  function onFailure(): void {
    const now = Date.now();
    lastFailureAt = now;

    if (state === "half_open") {
      // Probe failed — re-open
      state = "open";
      openedAt = now;
      return;
    }

    // Reset failure count if window has elapsed
    if (firstFailureAt && now - firstFailureAt > windowMs) {
      consecutiveFailures = 0;
      firstFailureAt = null;
    }

    if (!firstFailureAt) {
      firstFailureAt = now;
    }

    consecutiveFailures += 1;

    if (consecutiveFailures >= threshold && state === "closed") {
      state = "open";
      openedAt = now;
    }
  }

  function status(): CircuitBreakerStatus {
    return {
      state,
      consecutiveFailures,
      lastFailureAt,
      lastSuccessAt,
      openedAt,
    };
  }

  function reset(): void {
    state = "closed";
    consecutiveFailures = 0;
    firstFailureAt = null;
    lastFailureAt = null;
    openedAt = null;
  }

  return { canExecute, onSuccess, onFailure, status, reset };
}

/**
 * Registry of per-channel circuit breakers.
 */
const channelBreakers = new Map<string, CircuitBreaker>();

export function getChannelCircuitBreaker(
  channel: string,
  config?: CircuitBreakerConfig,
): CircuitBreaker {
  let breaker = channelBreakers.get(channel);
  if (!breaker) {
    breaker = createCircuitBreaker(config);
    channelBreakers.set(channel, breaker);
  }
  return breaker;
}

export function getAllCircuitBreakerStatuses(): Record<string, CircuitBreakerStatus> {
  const statuses: Record<string, CircuitBreakerStatus> = {};
  for (const [channel, breaker] of channelBreakers) {
    statuses[channel] = breaker.status();
  }
  return statuses;
}

export function resetAllCircuitBreakers(): void {
  for (const breaker of channelBreakers.values()) {
    breaker.reset();
  }
}
