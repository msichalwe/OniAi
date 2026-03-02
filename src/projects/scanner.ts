import fs from "node:fs";
import path from "node:path";
import type { ProjectContext, ProjectScript, ProjectStack } from "./types.js";

const PROJECT_CONTEXT_FILENAME = ".oni-project.json";
const MAX_README_EXCERPT = 500;
const MAX_CHANGELOG_ENTRIES = 10;

function tryReadJson(filePath: string): Record<string, unknown> | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
}

function tryReadText(filePath: string, maxBytes = 8192): string | null {
  try {
    const fd = fs.openSync(filePath, "r");
    const buf = Buffer.alloc(maxBytes);
    const bytesRead = fs.readSync(fd, buf, 0, maxBytes, 0);
    fs.closeSync(fd);
    return buf.subarray(0, bytesRead).toString("utf-8");
  } catch {
    return null;
  }
}

function fileExists(p: string): boolean {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function detectStack(projectRoot: string): ProjectStack {
  const stack: ProjectStack = { language: "unknown" };

  const pkg = tryReadJson(path.join(projectRoot, "package.json")) as {
    scripts?: Record<string, string>;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  } | null;

  if (pkg) {
    stack.language = "typescript";
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

    // Runtime
    if (fileExists(path.join(projectRoot, "bun.lockb")) || fileExists(path.join(projectRoot, "bun.lock"))) {
      stack.runtime = "bun";
    } else if (fileExists(path.join(projectRoot, "deno.json")) || fileExists(path.join(projectRoot, "deno.jsonc"))) {
      stack.runtime = "deno";
    } else {
      stack.runtime = "node";
    }

    // Package manager
    if (fileExists(path.join(projectRoot, "pnpm-lock.yaml"))) stack.packageManager = "pnpm";
    else if (fileExists(path.join(projectRoot, "yarn.lock"))) stack.packageManager = "yarn";
    else if (fileExists(path.join(projectRoot, "bun.lockb")) || fileExists(path.join(projectRoot, "bun.lock"))) stack.packageManager = "bun";
    else if (fileExists(path.join(projectRoot, "package-lock.json"))) stack.packageManager = "npm";

    // Framework
    if (allDeps["next"]) stack.framework = "next.js";
    else if (allDeps["nuxt"]) stack.framework = "nuxt";
    else if (allDeps["@sveltejs/kit"]) stack.framework = "sveltekit";
    else if (allDeps["astro"]) stack.framework = "astro";
    else if (allDeps["react"]) stack.framework = "react";
    else if (allDeps["vue"]) stack.framework = "vue";
    else if (allDeps["express"]) stack.framework = "express";
    else if (allDeps["fastify"]) stack.framework = "fastify";
    else if (allDeps["hono"]) stack.framework = "hono";
    else if (allDeps["elysia"]) stack.framework = "elysia";

    // Language check
    if (!allDeps["typescript"] && !fileExists(path.join(projectRoot, "tsconfig.json"))) {
      stack.language = "javascript";
    }

    // Test runner
    if (allDeps["vitest"]) stack.testRunner = "vitest";
    else if (allDeps["jest"]) stack.testRunner = "jest";
    else if (allDeps["mocha"]) stack.testRunner = "mocha";
    else if (allDeps["playwright"]) stack.testRunner = "playwright";

    // Linter/formatter
    if (allDeps["oxlint"]) stack.linter = "oxlint";
    else if (allDeps["eslint"]) stack.linter = "eslint";
    else if (allDeps["biome"] || allDeps["@biomejs/biome"]) stack.linter = "biome";
    if (allDeps["prettier"]) stack.formatter = "prettier";
    else if (allDeps["@biomejs/biome"]) stack.formatter = "biome";

    // Build tool
    if (allDeps["vite"]) stack.buildTool = "vite";
    else if (allDeps["webpack"]) stack.buildTool = "webpack";
    else if (allDeps["esbuild"]) stack.buildTool = "esbuild";
    else if (allDeps["tsup"]) stack.buildTool = "tsup";
    else if (allDeps["turbo"]) stack.buildTool = "turbo";

    // Database
    if (allDeps["prisma"] || allDeps["@prisma/client"]) stack.database = "prisma";
    else if (allDeps["drizzle-orm"]) stack.database = "drizzle";
    else if (allDeps["mongoose"]) stack.database = "mongodb";
    else if (allDeps["pg"] || allDeps["postgres"]) stack.database = "postgres";
    else if (allDeps["better-sqlite3"]) stack.database = "sqlite";
  } else if (fileExists(path.join(projectRoot, "Cargo.toml"))) {
    stack.language = "rust";
    stack.packageManager = "cargo";
    stack.buildTool = "cargo";
  } else if (fileExists(path.join(projectRoot, "go.mod"))) {
    stack.language = "go";
    stack.buildTool = "go";
  } else if (fileExists(path.join(projectRoot, "requirements.txt")) || fileExists(path.join(projectRoot, "pyproject.toml"))) {
    stack.language = "python";
    if (fileExists(path.join(projectRoot, "pyproject.toml"))) stack.packageManager = "poetry/pip";
    else stack.packageManager = "pip";
    if (fileExists(path.join(projectRoot, "pytest.ini")) || fileExists(path.join(projectRoot, "conftest.py"))) {
      stack.testRunner = "pytest";
    }
  } else if (fileExists(path.join(projectRoot, "Gemfile"))) {
    stack.language = "ruby";
    stack.packageManager = "bundler";
  }

  return stack;
}

function detectScripts(projectRoot: string): ProjectScript[] {
  const scripts: ProjectScript[] = [];
  const pkg = tryReadJson(path.join(projectRoot, "package.json")) as {
    scripts?: Record<string, string>;
  } | null;
  if (pkg?.scripts) {
    for (const [name, command] of Object.entries(pkg.scripts)) {
      if (typeof command === "string") {
        scripts.push({ name, command });
      }
    }
  }
  if (fileExists(path.join(projectRoot, "Makefile"))) {
    const content = tryReadText(path.join(projectRoot, "Makefile"), 4096);
    if (content) {
      const targetPattern = /^([a-zA-Z_][\w-]*)\s*:/gm;
      let match: RegExpExecArray | null;
      while ((match = targetPattern.exec(content)) !== null) {
        scripts.push({ name: `make ${match[1]}`, command: `make ${match[1]}` });
      }
    }
  }
  return scripts;
}

function detectKeyFiles(projectRoot: string): string[] {
  const candidates = [
    "package.json", "tsconfig.json", "Cargo.toml", "go.mod", "pyproject.toml",
    "requirements.txt", "Gemfile", "Makefile", "Dockerfile", "docker-compose.yml",
    "docker-compose.yaml", ".env.example", ".gitignore",
    "CHANGELOG.md", "README.md", "LICENSE", "AGENTS.md", "SOUL.md",
    "TOOLS.md", "MEMORY.md", "HEARTBEAT.md",
    "vitest.config.ts", "jest.config.js", "jest.config.ts",
    "biome.json", "tailwind.config.js", "tailwind.config.ts",
    "next.config.js", "next.config.ts", "vite.config.ts",
    "prisma/schema.prisma", "drizzle.config.ts",
  ];
  return candidates.filter((f) => fileExists(path.join(projectRoot, f)));
}

function detectTopDirs(projectRoot: string): string[] {
  try {
    const entries = fs.readdirSync(projectRoot, { withFileTypes: true });
    const skip = new Set(["node_modules", "dist", "build", ".git", "__pycache__", "target", "vendor", ".next", ".nuxt", ".oni"]);
    return entries
      .filter((e) => e.isDirectory() && !e.name.startsWith(".") && !skip.has(e.name))
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
}

function parseRecentChangelog(projectRoot: string): string[] | undefined {
  const content = tryReadText(path.join(projectRoot, "CHANGELOG.md"), 4096);
  if (!content) return undefined;
  const lines = content.split("\n");
  const entries: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("- ") && trimmed.length > 3) {
      entries.push(trimmed.slice(2).trim());
      if (entries.length >= MAX_CHANGELOG_ENTRIES) break;
    }
  }
  return entries.length > 0 ? entries : undefined;
}

function parseReadmeExcerpt(projectRoot: string): string | undefined {
  for (const name of ["README.md", "readme.md", "README.txt", "README"]) {
    const content = tryReadText(path.join(projectRoot, name), MAX_README_EXCERPT + 200);
    if (content) {
      const trimmed = content.trim();
      return trimmed.length > MAX_README_EXCERPT
        ? `${trimmed.slice(0, MAX_README_EXCERPT)}...`
        : trimmed;
    }
  }
  return undefined;
}

function detectGitBranch(projectRoot: string): string | undefined {
  try {
    const headContent = tryReadText(path.join(projectRoot, ".git", "HEAD"), 256);
    if (!headContent) return undefined;
    const match = headContent.match(/ref: refs\/heads\/(.+)/);
    return match ? match[1]!.trim() : headContent.trim().slice(0, 12);
  } catch {
    return undefined;
  }
}

function detectProjectName(projectRoot: string): { name?: string; description?: string } {
  const pkg = tryReadJson(path.join(projectRoot, "package.json"));
  if (pkg) {
    return {
      name: typeof pkg.name === "string" ? pkg.name : undefined,
      description: typeof pkg.description === "string" ? pkg.description : undefined,
    };
  }
  return { name: path.basename(projectRoot) };
}

/**
 * Scan a project directory and produce a ProjectContext.
 */
export function scanProject(projectRoot: string): ProjectContext {
  const resolved = path.resolve(projectRoot);
  const { name, description } = detectProjectName(resolved);
  const stack = detectStack(resolved);
  const keyFiles = detectKeyFiles(resolved);
  const topDirs = detectTopDirs(resolved);
  const scripts = detectScripts(resolved);
  const recentChanges = parseRecentChangelog(resolved);
  const readmeExcerpt = parseReadmeExcerpt(resolved);
  const gitBranch = detectGitBranch(resolved);

  return {
    version: 1,
    projectRoot: resolved,
    name,
    description,
    stack,
    keyFiles,
    topDirs,
    scripts,
    gitBranch,
    recentChanges,
    readmeExcerpt,
    scannedAtMs: Date.now(),
  };
}

export function loadProjectContext(projectRoot: string): ProjectContext | null {
  try {
    const raw = fs.readFileSync(path.join(projectRoot, PROJECT_CONTEXT_FILENAME), "utf-8");
    return JSON.parse(raw) as ProjectContext;
  } catch {
    return null;
  }
}

export function saveProjectContext(projectRoot: string, context: ProjectContext) {
  fs.writeFileSync(
    path.join(projectRoot, PROJECT_CONTEXT_FILENAME),
    JSON.stringify(context, null, 2),
    "utf-8",
  );
}

/**
 * Scan or refresh project context. Uses cached version if recent (< maxAgeMs).
 */
export function resolveProjectContext(projectRoot: string, maxAgeMs = 5 * 60_000): ProjectContext {
  const cached = loadProjectContext(projectRoot);
  if (cached && (Date.now() - cached.scannedAtMs) < maxAgeMs) {
    return cached;
  }
  const context = scanProject(projectRoot);
  try {
    saveProjectContext(projectRoot, context);
  } catch {
    // best-effort persist
  }
  return context;
}
