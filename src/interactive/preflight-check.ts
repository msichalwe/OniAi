import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// ── Types ───────────────────────────────────────────────────────────

export type PreflightInputResult = {
  input: "mic" | "screen" | "camera";
  available: boolean;
  tool: string | null;
  permission: boolean;
  error: string | null;
  fix: string | null;
};

export type PreflightResult = {
  platform: string;
  results: PreflightInputResult[];
  summary: string;
};

// ── Preflight Check ─────────────────────────────────────────────────

/**
 * Run pre-flight checks for each requested interactive input.
 * Tests tool availability and OS-level permissions before starting
 * capture loops. Returns a structured result with per-input status
 * and actionable fix suggestions.
 */
export async function runPreflightChecks(
  requestedInputs: Set<string>,
): Promise<PreflightResult> {
  const results: PreflightInputResult[] = [];
  const tmpDir = path.join(os.tmpdir(), "oni-interactive-preflight");
  await fs.mkdir(tmpDir, { recursive: true });

  if (requestedInputs.has("mic")) {
    results.push(await checkMic());
  }

  if (requestedInputs.has("screen")) {
    results.push(await checkScreen(tmpDir));
  }

  if (requestedInputs.has("camera")) {
    results.push(await checkCamera(tmpDir));
  }

  // Clean up preflight temp dir
  await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});

  const passed = results.filter((r) => r.available && r.permission);
  const failed = results.filter((r) => !r.available || !r.permission);
  const lines: string[] = [];

  if (passed.length > 0) {
    lines.push(`Ready: ${passed.map((r) => r.input).join(", ")}`);
  }
  if (failed.length > 0) {
    for (const f of failed) {
      lines.push(`${f.input}: ${f.error}${f.fix ? ` → ${f.fix}` : ""}`);
    }
  }

  return {
    platform: process.platform,
    results,
    summary: lines.join("\n"),
  };
}

// ── Per-input checks ────────────────────────────────────────────────

async function checkMic(): Promise<PreflightInputResult> {
  // Check for sox or ffmpeg
  const tool = await findTool(["sox", "ffmpeg"]);
  if (!tool) {
    return {
      input: "mic",
      available: false,
      tool: null,
      permission: false,
      error: "No audio capture tool found",
      fix: "Install sox: brew install sox  (or: brew install ffmpeg)",
    };
  }

  // Quick permission test: try a very brief recording (0.1s)
  try {
    if (tool === "sox") {
      await execAsync("sox", [
        "-q", "-t", "coreaudio", "default",
        "-t", "raw", "-r", "16000", "-c", "1", "-b", "16", "-e", "signed-integer",
        "-n", "trim", "0", "0.1",
      ], 5_000);
    } else {
      // ffmpeg: capture 0.1s of audio to /dev/null
      await execAsync("ffmpeg", [
        "-f", "avfoundation", "-i", ":0",
        "-t", "0.1", "-f", "null", "-",
      ], 5_000);
    }
    return {
      input: "mic",
      available: true,
      tool,
      permission: true,
      error: null,
      fix: null,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const isPermission = msg.includes("permission") || msg.includes("denied") || msg.includes("not allowed");
    return {
      input: "mic",
      available: true,
      tool,
      permission: !isPermission,
      error: isPermission
        ? "Microphone permission denied"
        : `Mic test failed: ${truncate(msg, 80)}`,
      fix: isPermission
        ? "System Settings → Privacy & Security → Microphone → enable for Terminal"
        : null,
    };
  }
}

async function checkScreen(tmpDir: string): Promise<PreflightInputResult> {
  if (process.platform !== "darwin") {
    return {
      input: "screen",
      available: false,
      tool: null,
      permission: false,
      error: "Screen capture only supported on macOS",
      fix: null,
    };
  }

  // screencapture is built into macOS, but requires Screen Recording permission
  const testFile = path.join(tmpDir, "screen-test.jpg");

  try {
    await execAsync("screencapture", ["-x", "-t", "jpg", testFile], 10_000);

    // Check if file was created and has content
    const stat = await fs.stat(testFile).catch(() => null);
    if (!stat || stat.size < 100) {
      return {
        input: "screen",
        available: true,
        tool: "screencapture",
        permission: false,
        error: "Screen Recording permission not granted (empty capture)",
        fix: "System Settings → Privacy & Security → Screen Recording → enable for Terminal",
      };
    }

    await fs.unlink(testFile).catch(() => {});
    return {
      input: "screen",
      available: true,
      tool: "screencapture",
      permission: true,
      error: null,
      fix: null,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      input: "screen",
      available: true,
      tool: "screencapture",
      permission: false,
      error: `Screen capture failed: ${truncate(msg, 80)}`,
      fix: "System Settings → Privacy & Security → Screen Recording → enable for Terminal",
    };
  }
}

async function checkCamera(tmpDir: string): Promise<PreflightInputResult> {
  if (process.platform !== "darwin") {
    return {
      input: "camera",
      available: false,
      tool: null,
      permission: false,
      error: "Camera capture only supported on macOS",
      fix: null,
    };
  }

  // Check for imagesnap (needs homebrew install)
  const tool = await findTool(["imagesnap"]);
  if (!tool) {
    return {
      input: "camera",
      available: false,
      tool: null,
      permission: false,
      error: "imagesnap not installed",
      fix: "Install imagesnap: brew install imagesnap",
    };
  }

  const testFile = path.join(tmpDir, "camera-test.jpg");

  try {
    await execAsync("imagesnap", ["-w", "0.5", testFile], 10_000);

    const stat = await fs.stat(testFile).catch(() => null);
    if (!stat || stat.size < 100) {
      return {
        input: "camera",
        available: true,
        tool: "imagesnap",
        permission: false,
        error: "Camera permission not granted or no camera found",
        fix: "System Settings → Privacy & Security → Camera → enable for Terminal",
      };
    }

    await fs.unlink(testFile).catch(() => {});
    return {
      input: "camera",
      available: true,
      tool: "imagesnap",
      permission: true,
      error: null,
      fix: null,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const isPermission = msg.includes("permission") || msg.includes("denied");
    return {
      input: "camera",
      available: true,
      tool: "imagesnap",
      permission: false,
      error: isPermission
        ? "Camera permission denied"
        : `Camera test failed: ${truncate(msg, 80)}`,
      fix: "System Settings → Privacy & Security → Camera → enable for Terminal",
    };
  }
}

// ── Helpers ─────────────────────────────────────────────────────────

function execAsync(cmd: string, args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: timeoutMs }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(`${cmd} failed: ${err.message}${stderr ? ` — ${stderr.slice(0, 200)}` : ""}`));
        return;
      }
      resolve(stdout);
    });
  });
}

async function findTool(tools: string[]): Promise<string | null> {
  for (const tool of tools) {
    try {
      await execAsync("which", [tool], 3_000);
      return tool;
    } catch {
      // not found
    }
  }
  return null;
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + "…" : s;
}
