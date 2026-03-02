import type { ProjectContext } from "./types.js";

/**
 * Format a ProjectContext into a concise prompt section for agent injection.
 * Designed to be included in system prompt or bootstrap context.
 */
export function formatProjectContextPrompt(ctx: ProjectContext): string {
  const lines: string[] = [];

  lines.push(`## Project: ${ctx.name ?? "unknown"}`);
  if (ctx.description) {
    lines.push(ctx.description);
  }
  lines.push("");

  // Stack
  const stackParts: string[] = [`Language: ${ctx.stack.language}`];
  if (ctx.stack.framework) stackParts.push(`Framework: ${ctx.stack.framework}`);
  if (ctx.stack.runtime) stackParts.push(`Runtime: ${ctx.stack.runtime}`);
  if (ctx.stack.packageManager) stackParts.push(`Package manager: ${ctx.stack.packageManager}`);
  if (ctx.stack.testRunner) stackParts.push(`Test runner: ${ctx.stack.testRunner}`);
  if (ctx.stack.linter) stackParts.push(`Linter: ${ctx.stack.linter}`);
  if (ctx.stack.formatter) stackParts.push(`Formatter: ${ctx.stack.formatter}`);
  if (ctx.stack.buildTool) stackParts.push(`Build: ${ctx.stack.buildTool}`);
  if (ctx.stack.database) stackParts.push(`Database: ${ctx.stack.database}`);
  lines.push("### Stack");
  lines.push(stackParts.join(" | "));
  lines.push("");

  // Git
  if (ctx.gitBranch) {
    lines.push(`Branch: ${ctx.gitBranch}`);
  }

  // Structure
  if (ctx.topDirs.length > 0) {
    lines.push(`Directories: ${ctx.topDirs.join(", ")}`);
  }
  if (ctx.keyFiles.length > 0) {
    lines.push(`Key files: ${ctx.keyFiles.join(", ")}`);
  }
  lines.push("");

  // Scripts
  if (ctx.scripts.length > 0) {
    lines.push("### Available Scripts");
    const shown = ctx.scripts.slice(0, 15);
    for (const s of shown) {
      lines.push(`- \`${s.name}\`: ${s.command}`);
    }
    if (ctx.scripts.length > 15) {
      lines.push(`- ... and ${ctx.scripts.length - 15} more`);
    }
    lines.push("");
  }

  // Recent changes
  if (ctx.recentChanges && ctx.recentChanges.length > 0) {
    lines.push("### Recent Changes");
    for (const change of ctx.recentChanges.slice(0, 5)) {
      lines.push(`- ${change}`);
    }
    lines.push("");
  }

  // Errors
  if (ctx.errors && ctx.errors.length > 0) {
    lines.push("### Known Issues");
    for (const err of ctx.errors.slice(0, 5)) {
      const loc = err.file ? ` (${err.file}${err.line ? `:${err.line}` : ""})` : "";
      lines.push(`- [${err.source}]${loc}: ${err.message}`);
    }
    lines.push("");
  }

  // Features
  if (ctx.features && ctx.features.length > 0) {
    lines.push("### Features");
    for (const feat of ctx.features) {
      const marker =
        feat.status === "done" ? "✅" :
        feat.status === "in-progress" ? "🔄" :
        feat.status === "deprecated" ? "⚠️" : "📋";
      lines.push(`- ${marker} ${feat.name}${feat.description ? ` — ${feat.description}` : ""}`);
    }
    lines.push("");
  }

  // Agent notes
  if (ctx.agentNotes && ctx.agentNotes.length > 0) {
    lines.push("### Agent Notes");
    for (const note of ctx.agentNotes) {
      lines.push(`- ${note}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Build a compact one-line project summary (for logging/status).
 */
export function formatProjectOneLiner(ctx: ProjectContext): string {
  const parts: string[] = [];
  if (ctx.name) parts.push(ctx.name);
  parts.push(ctx.stack.language);
  if (ctx.stack.framework) parts.push(ctx.stack.framework);
  if (ctx.gitBranch) parts.push(`@${ctx.gitBranch}`);
  return parts.join(" · ");
}
