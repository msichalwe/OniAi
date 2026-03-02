import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { scanProject, loadProjectContext, saveProjectContext, resolveProjectContext } from "./scanner.js";
import { formatProjectContextPrompt, formatProjectOneLiner } from "./format.js";
import type { ProjectContext } from "./types.js";

function tmpProject(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "oni-project-scan-"));
}

describe("scanProject", () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = tmpProject();
  });

  afterEach(() => {
    try {
      fs.rmSync(projectDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it("detects a Node.js/TypeScript project", () => {
    fs.writeFileSync(
      path.join(projectDir, "package.json"),
      JSON.stringify({
        name: "test-app",
        description: "A test application",
        dependencies: { express: "^4.0.0" },
        devDependencies: { typescript: "^5.0.0", vitest: "^1.0.0", eslint: "^8.0.0" },
        scripts: { build: "tsc", test: "vitest", start: "node dist/index.js" },
      }),
    );
    fs.writeFileSync(path.join(projectDir, "tsconfig.json"), "{}");
    fs.writeFileSync(path.join(projectDir, "pnpm-lock.yaml"), "");

    const ctx = scanProject(projectDir);
    expect(ctx.name).toBe("test-app");
    expect(ctx.description).toBe("A test application");
    expect(ctx.stack.language).toBe("typescript");
    expect(ctx.stack.framework).toBe("express");
    expect(ctx.stack.packageManager).toBe("pnpm");
    expect(ctx.stack.testRunner).toBe("vitest");
    expect(ctx.stack.linter).toBe("eslint");
    expect(ctx.stack.runtime).toBe("node");
    expect(ctx.scripts).toContainEqual({ name: "build", command: "tsc" });
    expect(ctx.scripts).toContainEqual({ name: "test", command: "vitest" });
    expect(ctx.keyFiles).toContain("package.json");
    expect(ctx.keyFiles).toContain("tsconfig.json");
  });

  it("detects a JavaScript project (no typescript dep)", () => {
    fs.writeFileSync(
      path.join(projectDir, "package.json"),
      JSON.stringify({
        name: "js-app",
        dependencies: { react: "^18.0.0" },
        devDependencies: { jest: "^29.0.0" },
      }),
    );

    const ctx = scanProject(projectDir);
    expect(ctx.stack.language).toBe("javascript");
    expect(ctx.stack.framework).toBe("react");
    expect(ctx.stack.testRunner).toBe("jest");
  });

  it("detects a Python project", () => {
    fs.writeFileSync(path.join(projectDir, "requirements.txt"), "flask==2.0\npytest==7.0\n");
    fs.writeFileSync(path.join(projectDir, "conftest.py"), "");

    const ctx = scanProject(projectDir);
    expect(ctx.stack.language).toBe("python");
    expect(ctx.stack.packageManager).toBe("pip");
    expect(ctx.stack.testRunner).toBe("pytest");
  });

  it("detects a Rust project", () => {
    fs.writeFileSync(path.join(projectDir, "Cargo.toml"), '[package]\nname = "my-app"');

    const ctx = scanProject(projectDir);
    expect(ctx.stack.language).toBe("rust");
    expect(ctx.stack.packageManager).toBe("cargo");
  });

  it("detects a Go project", () => {
    fs.writeFileSync(path.join(projectDir, "go.mod"), "module example.com/app");

    const ctx = scanProject(projectDir);
    expect(ctx.stack.language).toBe("go");
    expect(ctx.stack.buildTool).toBe("go");
  });

  it("detects top-level directories", () => {
    fs.mkdirSync(path.join(projectDir, "src"));
    fs.mkdirSync(path.join(projectDir, "tests"));
    fs.mkdirSync(path.join(projectDir, "docs"));
    fs.mkdirSync(path.join(projectDir, "node_modules")); // should be excluded
    fs.mkdirSync(path.join(projectDir, ".git")); // should be excluded

    const ctx = scanProject(projectDir);
    expect(ctx.topDirs).toContain("src");
    expect(ctx.topDirs).toContain("tests");
    expect(ctx.topDirs).toContain("docs");
    expect(ctx.topDirs).not.toContain("node_modules");
    expect(ctx.topDirs).not.toContain(".git");
  });

  it("parses changelog entries", () => {
    fs.writeFileSync(
      path.join(projectDir, "CHANGELOG.md"),
      "# Changelog\n\n## 1.0.0\n\n- Added feature X\n- Fixed bug Y\n- Improved performance Z\n",
    );

    const ctx = scanProject(projectDir);
    expect(ctx.recentChanges).toEqual(["Added feature X", "Fixed bug Y", "Improved performance Z"]);
  });

  it("parses README excerpt", () => {
    const readmeContent = "# My Project\n\nThis is a great project that does amazing things.";
    fs.writeFileSync(path.join(projectDir, "README.md"), readmeContent);

    const ctx = scanProject(projectDir);
    expect(ctx.readmeExcerpt).toBe(readmeContent);
  });

  it("truncates long README", () => {
    const longReadme = "# Title\n\n" + "x".repeat(600);
    fs.writeFileSync(path.join(projectDir, "README.md"), longReadme);

    const ctx = scanProject(projectDir);
    expect(ctx.readmeExcerpt!.length).toBeLessThanOrEqual(510);
    expect(ctx.readmeExcerpt!.endsWith("...")).toBe(true);
  });

  it("detects git branch", () => {
    fs.mkdirSync(path.join(projectDir, ".git"), { recursive: true });
    fs.writeFileSync(path.join(projectDir, ".git", "HEAD"), "ref: refs/heads/feature/my-branch\n");

    const ctx = scanProject(projectDir);
    expect(ctx.gitBranch).toBe("feature/my-branch");
  });

  it("detects Makefile targets", () => {
    fs.writeFileSync(
      path.join(projectDir, "Makefile"),
      "build:\n\tgo build\n\ntest:\n\tgo test ./...\n\nclean:\n\trm -rf dist\n",
    );

    const ctx = scanProject(projectDir);
    expect(ctx.scripts).toContainEqual({ name: "make build", command: "make build" });
    expect(ctx.scripts).toContainEqual({ name: "make test", command: "make test" });
    expect(ctx.scripts).toContainEqual({ name: "make clean", command: "make clean" });
  });

  it("handles empty project directory", () => {
    const ctx = scanProject(projectDir);
    expect(ctx.stack.language).toBe("unknown");
    expect(ctx.keyFiles).toEqual([]);
    expect(ctx.scripts).toEqual([]);
    expect(ctx.name).toBe(path.basename(projectDir));
  });

  it("detects Next.js framework", () => {
    fs.writeFileSync(
      path.join(projectDir, "package.json"),
      JSON.stringify({
        name: "nextjs-app",
        dependencies: { next: "^14.0.0", react: "^18.0.0" },
        devDependencies: { typescript: "^5.0.0" },
      }),
    );
    const ctx = scanProject(projectDir);
    expect(ctx.stack.framework).toBe("next.js");
  });

  it("detects database from dependencies", () => {
    fs.writeFileSync(
      path.join(projectDir, "package.json"),
      JSON.stringify({
        name: "db-app",
        dependencies: { "drizzle-orm": "^0.28.0" },
        devDependencies: { typescript: "^5.0.0" },
      }),
    );
    const ctx = scanProject(projectDir);
    expect(ctx.stack.database).toBe("drizzle");
  });
});

describe("saveProjectContext / loadProjectContext", () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = tmpProject();
  });

  afterEach(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  it("round-trips project context to disk", () => {
    const ctx = scanProject(projectDir);
    saveProjectContext(projectDir, ctx);
    const loaded = loadProjectContext(projectDir);
    expect(loaded).toBeDefined();
    expect(loaded!.projectRoot).toBe(ctx.projectRoot);
    expect(loaded!.scannedAtMs).toBe(ctx.scannedAtMs);
  });

  it("returns null when no context file exists", () => {
    expect(loadProjectContext(projectDir)).toBeNull();
  });
});

describe("resolveProjectContext", () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = tmpProject();
  });

  afterEach(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  it("scans and caches", () => {
    fs.writeFileSync(
      path.join(projectDir, "package.json"),
      JSON.stringify({ name: "cached-app" }),
    );
    const ctx1 = resolveProjectContext(projectDir);
    expect(ctx1.name).toBe("cached-app");
    // Second call should return cached version
    const ctx2 = resolveProjectContext(projectDir);
    expect(ctx2.scannedAtMs).toBe(ctx1.scannedAtMs);
  });

  it("re-scans when cache is stale", () => {
    fs.writeFileSync(
      path.join(projectDir, "package.json"),
      JSON.stringify({ name: "stale-app" }),
    );
    const ctx1 = resolveProjectContext(projectDir, 0); // maxAge=0 forces rescan
    const ctx2 = resolveProjectContext(projectDir, 0);
    expect(ctx2.scannedAtMs).toBeGreaterThanOrEqual(ctx1.scannedAtMs);
  });
});

describe("formatProjectContextPrompt", () => {
  it("formats a project context into prompt text", () => {
    const ctx: ProjectContext = {
      version: 1,
      projectRoot: "/tmp/test",
      name: "my-app",
      description: "A cool app",
      stack: {
        language: "typescript",
        framework: "next.js",
        runtime: "node",
        packageManager: "pnpm",
        testRunner: "vitest",
        database: "postgres",
      },
      keyFiles: ["package.json", "tsconfig.json"],
      topDirs: ["src", "tests", "docs"],
      scripts: [
        { name: "build", command: "tsc" },
        { name: "test", command: "vitest" },
      ],
      gitBranch: "main",
      recentChanges: ["Added auth module", "Fixed login bug"],
      scannedAtMs: Date.now(),
    };
    const prompt = formatProjectContextPrompt(ctx);
    expect(prompt).toContain("my-app");
    expect(prompt).toContain("A cool app");
    expect(prompt).toContain("typescript");
    expect(prompt).toContain("next.js");
    expect(prompt).toContain("pnpm");
    expect(prompt).toContain("vitest");
    expect(prompt).toContain("postgres");
    expect(prompt).toContain("`build`");
    expect(prompt).toContain("main");
    expect(prompt).toContain("Added auth module");
  });

  it("includes errors and features when present", () => {
    const ctx: ProjectContext = {
      version: 1,
      projectRoot: "/tmp/test",
      name: "buggy-app",
      stack: { language: "typescript" },
      keyFiles: [],
      topDirs: [],
      scripts: [],
      errors: [{ source: "tsc", message: "Type error in auth.ts", file: "src/auth.ts", line: 42, detectedAtMs: Date.now() }],
      features: [
        { name: "Auth", status: "done" },
        { name: "Payments", status: "in-progress" },
      ],
      scannedAtMs: Date.now(),
    };
    const prompt = formatProjectContextPrompt(ctx);
    expect(prompt).toContain("Known Issues");
    expect(prompt).toContain("Type error in auth.ts");
    expect(prompt).toContain("src/auth.ts:42");
    expect(prompt).toContain("✅ Auth");
    expect(prompt).toContain("🔄 Payments");
  });
});

describe("formatProjectOneLiner", () => {
  it("formats a compact one-liner", () => {
    const ctx: ProjectContext = {
      version: 1,
      projectRoot: "/tmp/test",
      name: "my-app",
      stack: { language: "typescript", framework: "next.js" },
      keyFiles: [],
      topDirs: [],
      scripts: [],
      gitBranch: "main",
      scannedAtMs: Date.now(),
    };
    expect(formatProjectOneLiner(ctx)).toBe("my-app · typescript · next.js · @main");
  });
});
