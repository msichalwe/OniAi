/**
 * Session transcript rotation — archives oversized JSONL transcripts and
 * cleans up old archives based on retention policy.
 *
 * Rotation flow:
 *   1. Check transcript file size against `maxTranscriptBytes`
 *   2. If exceeded, rename to `<sessionId>.jsonl.rotated.<timestamp>`
 *   3. A fresh transcript is created on the next write (via ensureSessionHeader)
 *
 * Retention flow:
 *   1. Scan session directory for `.rotated.` archives
 *   2. Remove archives older than `retentionDays`
 */

import fs from "node:fs";
import path from "node:path";
import { formatSessionArchiveTimestamp } from "./artifacts.js";

/** Default max transcript size: 50 MB */
const DEFAULT_MAX_TRANSCRIPT_BYTES = 50 * 1024 * 1024;
/** Default retention: 30 days */
const DEFAULT_RETENTION_DAYS = 30;

const ROTATED_ARCHIVE_RE = /\.rotated\.\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}(?:\.\d{3})?Z$/;

export type TranscriptRotationConfig = {
  /** Max transcript file size in bytes before rotation. 0 = disabled. */
  maxTranscriptBytes?: number;
  /** Days to retain rotated archives. 0 = keep forever. */
  retentionDays?: number;
};

export type RotationResult = {
  rotated: boolean;
  archivePath?: string;
  sizeBytes?: number;
};

/**
 * Check a single transcript file and rotate if it exceeds the size limit.
 * Returns info about whether rotation occurred.
 */
export async function rotateTranscriptIfNeeded(
  sessionFilePath: string,
  config?: TranscriptRotationConfig,
): Promise<RotationResult> {
  const maxBytes = config?.maxTranscriptBytes ?? DEFAULT_MAX_TRANSCRIPT_BYTES;
  if (maxBytes <= 0) {
    return { rotated: false };
  }

  let stat: fs.Stats;
  try {
    stat = await fs.promises.stat(sessionFilePath);
  } catch {
    return { rotated: false };
  }

  if (!stat.isFile() || stat.size < maxBytes) {
    return { rotated: false };
  }

  const timestamp = formatSessionArchiveTimestamp();
  const archivePath = `${sessionFilePath}.rotated.${timestamp}`;
  await fs.promises.rename(sessionFilePath, archivePath);

  return { rotated: true, archivePath, sizeBytes: stat.size };
}

/**
 * Clean up old rotated archives in a session directory.
 * Returns the number of archives removed.
 */
export async function cleanRotatedArchives(
  sessionsDir: string,
  config?: TranscriptRotationConfig,
): Promise<{ removed: number; freedBytes: number }> {
  const retentionDays = config?.retentionDays ?? DEFAULT_RETENTION_DAYS;
  if (retentionDays <= 0) {
    return { removed: 0, freedBytes: 0 };
  }

  const cutoffMs = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  let files: string[];
  try {
    files = await fs.promises.readdir(sessionsDir);
  } catch {
    return { removed: 0, freedBytes: 0 };
  }

  let removed = 0;
  let freedBytes = 0;

  for (const file of files) {
    if (!ROTATED_ARCHIVE_RE.test(file)) {
      continue;
    }
    const filePath = path.join(sessionsDir, file);
    try {
      const stat = await fs.promises.stat(filePath);
      if (stat.mtimeMs < cutoffMs) {
        await fs.promises.unlink(filePath);
        removed += 1;
        freedBytes += stat.size;
      }
    } catch {
      // Skip inaccessible files
    }
  }

  return { removed, freedBytes };
}
