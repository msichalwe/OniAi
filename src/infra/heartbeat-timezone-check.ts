/**
 * Heartbeat timezone validation — warns at startup if the configured
 * timezone string is invalid, rather than silently falling back to UTC.
 */

import type { OniAIConfig } from "../config/config.js";

export type TimezoneValidationResult = {
  valid: boolean;
  /** The configured timezone string (raw) */
  configured?: string;
  /** The resolved timezone (may differ if fallback applied) */
  resolved: string;
  /** Warning message if timezone is invalid */
  warning?: string;
};

/**
 * Validate the heartbeat active-hours timezone config.
 * Returns a warning if the timezone string is invalid.
 */
export function validateHeartbeatTimezone(cfg: OniAIConfig): TimezoneValidationResult | null {
  const activeHours = cfg.agents?.defaults?.heartbeat?.activeHours;
  if (!activeHours?.timezone) {
    return null; // No timezone configured — nothing to validate
  }

  const raw = activeHours.timezone.trim();
  if (!raw || raw === "user" || raw === "local") {
    return null; // Special keywords, always valid
  }

  // Validate as IANA timezone
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: raw }).format(new Date());
    return { valid: true, configured: raw, resolved: raw };
  } catch {
    // Invalid timezone — resolve what it would fall back to
    const fallback = resolveUserTimezoneForValidation(cfg);
    return {
      valid: false,
      configured: raw,
      resolved: fallback,
      warning: `heartbeat activeHours.timezone "${raw}" is invalid (not a recognized IANA timezone); falling back to "${fallback}". Check spelling — did you mean one of the standard names?`,
    };
  }
}

function resolveUserTimezoneForValidation(cfg: OniAIConfig): string {
  const userTz = cfg.agents?.defaults?.userTimezone?.trim();
  if (userTz) {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: userTz }).format(new Date());
      return userTz;
    } catch {
      // Invalid user timezone too
    }
  }
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}
