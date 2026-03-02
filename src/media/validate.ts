/**
 * Unified media validation facade — consolidates path, MIME, and size checks
 * into a single entry point so all inbound media code paths apply consistent
 * validation rules.
 */

import type { MediaKind } from "./constants.js";
import { normalizeMimeType, kindFromMime } from "./mime.js";

/** Maximum default file size: 100 MB */
const DEFAULT_MAX_SIZE_BYTES = 100 * 1024 * 1024;

/** MIME types that are never allowed as inbound media */
const BLOCKED_MIMES = new Set([
  "application/x-msdownload",
  "application/x-executable",
  "application/x-sharedlib",
  "application/vnd.microsoft.portable-executable",
]);

export type MediaValidationInput = {
  /** Original file path or name (for extension-based detection) */
  filePath?: string;
  /** MIME type if already known */
  mime?: string | null;
  /** File size in bytes */
  sizeBytes?: number;
  /** Max allowed size in bytes (default: 100 MB) */
  maxSizeBytes?: number;
  /** If provided, only these media kinds are accepted */
  allowedKinds?: MediaKind[];
};

export type MediaValidationResult =
  | { valid: true; mime: string | undefined; kind: MediaKind }
  | { valid: false; reason: string };

/**
 * Validate inbound media against path, MIME, size, and kind constraints.
 *
 * Usage:
 * ```ts
 * const result = validateInboundMedia({ filePath: "photo.jpg", sizeBytes: 1024 });
 * if (!result.valid) { log.warn(result.reason); return; }
 * // result.mime and result.kind are available
 * ```
 */
export function validateInboundMedia(input: MediaValidationInput): MediaValidationResult {
  // Path traversal check
  if (input.filePath) {
    const normalized = input.filePath.replace(/\\/g, "/");
    if (normalized.includes("..") || normalized.includes("\0")) {
      return { valid: false, reason: "path traversal detected" };
    }
  }

  // Size check
  const maxSize = input.maxSizeBytes ?? DEFAULT_MAX_SIZE_BYTES;
  if (input.sizeBytes !== undefined && input.sizeBytes > maxSize) {
    return {
      valid: false,
      reason: `file too large: ${input.sizeBytes} bytes exceeds limit of ${maxSize} bytes`,
    };
  }

  // Synchronous MIME validation using already-known metadata.
  // For full MIME sniffing (async, reads file bytes), callers should use
  // detectMime() separately before calling this function.
  const resolvedMime = normalizeMimeType(input.mime) ?? undefined;

  if (resolvedMime && BLOCKED_MIMES.has(resolvedMime)) {
    return { valid: false, reason: `blocked MIME type: ${resolvedMime}` };
  }

  const kind = kindFromMime(resolvedMime);

  // Kind restriction check
  if (input.allowedKinds && input.allowedKinds.length > 0 && !input.allowedKinds.includes(kind)) {
    return {
      valid: false,
      reason: `media kind "${kind}" not allowed (expected: ${input.allowedKinds.join(", ")})`,
    };
  }

  return { valid: true, mime: resolvedMime, kind };
}
