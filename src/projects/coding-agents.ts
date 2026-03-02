import type { CodingAgentKind, CodingAgentConfig } from "./types.js";

/**
 * Default configurations for known coding agent CLIs.
 */
export const CODING_AGENT_DEFAULTS: Record<CodingAgentKind, CodingAgentConfig> = {
  "claude-code": {
    kind: "claude-code",
    binary: "claude",
    defaultArgs: ["--print", "--output-format", "stream-json"],
    timeoutSeconds: 1800, // 30 min
    background: true,
  },
  codex: {
    kind: "codex",
    binary: "codex",
    defaultArgs: ["--quiet"],
    timeoutSeconds: 1800,
    background: true,
  },
  aider: {
    kind: "aider",
    binary: "aider",
    defaultArgs: ["--yes", "--no-auto-commits"],
    timeoutSeconds: 1200,
    background: true,
  },
  custom: {
    kind: "custom",
    binary: "",
    timeoutSeconds: 600,
    background: true,
  },
};

/**
 * Build the exec command for a coding agent invocation.
 */
export function buildCodingAgentCommand(params: {
  config: CodingAgentConfig;
  prompt: string;
  cwd?: string;
  files?: string[];
  model?: string;
}): { argv: string[]; cwd?: string; timeoutMs: number } {
  const { config, prompt } = params;
  const argv: string[] = [config.binary];

  if (config.defaultArgs) {
    argv.push(...config.defaultArgs);
  }

  // Model override
  const model = params.model ?? config.model;
  if (model) {
    switch (config.kind) {
      case "claude-code":
        argv.push("--model", model);
        break;
      case "codex":
        argv.push("--model", model);
        break;
      case "aider":
        argv.push("--model", model);
        break;
    }
  }

  // Add files for aider
  if (params.files && params.files.length > 0 && config.kind === "aider") {
    for (const f of params.files) {
      argv.push(f);
    }
  }

  // Add the prompt
  switch (config.kind) {
    case "claude-code":
      // claude --print "prompt" streams output
      argv.push(prompt);
      break;
    case "codex":
      argv.push(prompt);
      break;
    case "aider":
      argv.push("--message", prompt);
      break;
    default:
      argv.push(prompt);
  }

  return {
    argv,
    cwd: params.cwd ?? config.cwd,
    timeoutMs: (config.timeoutSeconds ?? 1800) * 1000,
  };
}

/**
 * Detect which coding agent CLIs are available on the system.
 * Returns the list of detected agents.
 */
export function detectAvailableCodingAgents(): CodingAgentKind[] {
  // This is a synchronous best-effort check. The actual availability
  // is confirmed at exec time; this is for system prompt hints.
  const agents: CodingAgentKind[] = [];
  const { execSync } = require("node:child_process");

  for (const kind of ["claude-code", "codex", "aider"] as const) {
    const binary = CODING_AGENT_DEFAULTS[kind].binary;
    try {
      execSync(`which ${binary} 2>/dev/null`, { stdio: "pipe", timeout: 3000 });
      agents.push(kind);
    } catch {
      // not found
    }
  }
  return agents;
}

/**
 * Format guidance for the agent on how to use coding agents.
 * Included in system prompt when coding agents are detected.
 */
export function formatCodingAgentGuidance(availableAgents: CodingAgentKind[]): string {
  if (availableAgents.length === 0) return "";

  const lines: string[] = [];
  lines.push("## Coding Agents (External CLI Tools)");
  lines.push("The following coding agent CLIs are available on this system:");
  lines.push("");

  for (const kind of availableAgents) {
    const config = CODING_AGENT_DEFAULTS[kind];
    switch (kind) {
      case "claude-code":
        lines.push(`- **Claude Code** (\`${config.binary}\`): Anthropic's coding agent. Best for complex multi-file changes, refactoring, and feature implementation.`);
        lines.push(`  Usage: \`exec(command="claude --print '<prompt>'", background=true, yieldMs=5000)\``);
        lines.push(`  For long tasks: \`exec(command="claude --print '<prompt>'", background=true)\` then monitor with \`process(action=poll, sessionId=<id>)\``);
        break;
      case "codex":
        lines.push(`- **Codex CLI** (\`${config.binary}\`): OpenAI's coding agent. Good for code generation and editing.`);
        lines.push(`  Usage: \`exec(command="codex --quiet '<prompt>'", background=true, yieldMs=5000)\``);
        break;
      case "aider":
        lines.push(`- **Aider** (\`${config.binary}\`): AI pair programmer. Good for iterative changes with git integration.`);
        lines.push(`  Usage: \`exec(command="aider --yes --no-auto-commits --message '<prompt>' <files>", background=true)\``);
        break;
    }
  }

  lines.push("");
  lines.push("### Coding Agent Patterns");
  lines.push("- **Short tasks (<2 min):** Use `exec` with `yieldMs=120000` to wait for completion inline.");
  lines.push("- **Medium tasks (2-10 min):** Use `exec` with `background=true`, then `process(action=poll, sessionId=<id>, timeout=30000)` periodically.");
  lines.push("- **Long tasks (10-30+ min):** Use `exec` with `background=true`. The system will emit a heartbeat event when the process exits. Monitor via `process(action=status, sessionId=<id>)` if needed.");
  lines.push("- **Parallel delegation:** Spawn multiple coding agent runs with different prompts, each in background. Check results as they complete.");
  lines.push("- After a coding agent finishes, always review its output and run tests to verify the changes.");
  lines.push("- Use `plan` tool to track multi-step development work across coding agent runs.");
  lines.push("- Use `task` tool to queue development work items that span multiple sessions.");
  lines.push("");
  lines.push("### Project Context");
  lines.push("Before starting development work in a project directory, scan the project to understand its structure:");
  lines.push("1. Check for `.oni-project.json` (auto-generated project context)");
  lines.push("2. Read `CHANGELOG.md`, `README.md`, `package.json` to understand the project");
  lines.push("3. Use `grep`/`find` to locate relevant code before making changes");
  lines.push("4. After changes, run the project's test suite to verify");
  lines.push("");

  return lines.join("\n");
}
