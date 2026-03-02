export type ProjectStack = {
  language: string;
  framework?: string;
  runtime?: string;
  packageManager?: string;
  testRunner?: string;
  linter?: string;
  formatter?: string;
  buildTool?: string;
  database?: string;
};

export type ProjectScript = {
  name: string;
  command: string;
};

export type ProjectError = {
  source: string;
  message: string;
  file?: string;
  line?: number;
  detectedAtMs: number;
};

export type ProjectFeature = {
  name: string;
  status: "planned" | "in-progress" | "done" | "deprecated";
  description?: string;
};

export type ProjectContext = {
  version: 1;
  /** Absolute path to project root. */
  projectRoot: string;
  /** Project name (from package.json, Cargo.toml, etc.). */
  name?: string;
  /** Project description. */
  description?: string;
  /** Detected tech stack. */
  stack: ProjectStack;
  /** Key project files that exist. */
  keyFiles: string[];
  /** Directory structure summary (top-level dirs). */
  topDirs: string[];
  /** Available scripts (npm scripts, Makefile targets, etc.). */
  scripts: ProjectScript[];
  /** Recent git branch info. */
  gitBranch?: string;
  /** Recent git status summary. */
  gitStatus?: string;
  /** Last N changelog entries (parsed from CHANGELOG.md if present). */
  recentChanges?: string[];
  /** Known errors/issues from last build/test run. */
  errors?: ProjectError[];
  /** Feature tracking (from a features file or parsed from README). */
  features?: ProjectFeature[];
  /** README excerpt (first ~500 chars). */
  readmeExcerpt?: string;
  /** When the context was last scanned. */
  scannedAtMs: number;
  /** Custom notes the agent can append. */
  agentNotes?: string[];
};

export type CodingAgentKind = "claude-code" | "codex" | "aider" | "custom";

export type CodingAgentConfig = {
  /** Which coding agent CLI to use. */
  kind: CodingAgentKind;
  /** CLI binary name or path. */
  binary: string;
  /** Default arguments to pass. */
  defaultArgs?: string[];
  /** Working directory (default: project root). */
  cwd?: string;
  /** Timeout in seconds before the coding agent is killed (0 = no timeout). */
  timeoutSeconds?: number;
  /** Whether to run in background (default: true for long tasks). */
  background?: boolean;
  /** Model override for the coding agent. */
  model?: string;
};
