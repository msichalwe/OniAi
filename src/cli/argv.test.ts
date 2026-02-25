import { describe, expect, it } from "vitest";
import {
  buildParseArgv,
  getFlagValue,
  getCommandPath,
  getPrimaryCommand,
  getPositiveIntFlagValue,
  getVerboseFlag,
  hasHelpOrVersion,
  hasFlag,
  shouldMigrateState,
  shouldMigrateStateFromPath,
} from "./argv.js";

describe("argv helpers", () => {
  it.each([
    {
      name: "help flag",
      argv: ["node", "oni", "--help"],
      expected: true,
    },
    {
      name: "version flag",
      argv: ["node", "oni", "-V"],
      expected: true,
    },
    {
      name: "normal command",
      argv: ["node", "oni", "status"],
      expected: false,
    },
    {
      name: "root -v alias",
      argv: ["node", "oni", "-v"],
      expected: true,
    },
    {
      name: "root -v alias with profile",
      argv: ["node", "oni", "--profile", "work", "-v"],
      expected: true,
    },
    {
      name: "root -v alias with log-level",
      argv: ["node", "oni", "--log-level", "debug", "-v"],
      expected: true,
    },
    {
      name: "subcommand -v should not be treated as version",
      argv: ["node", "oni", "acp", "-v"],
      expected: false,
    },
    {
      name: "root -v alias with equals profile",
      argv: ["node", "oni", "--profile=work", "-v"],
      expected: true,
    },
    {
      name: "subcommand path after global root flags should not be treated as version",
      argv: ["node", "oni", "--dev", "skills", "list", "-v"],
      expected: false,
    },
  ])("detects help/version flags: $name", ({ argv, expected }) => {
    expect(hasHelpOrVersion(argv)).toBe(expected);
  });

  it.each([
    {
      name: "single command with trailing flag",
      argv: ["node", "oni", "status", "--json"],
      expected: ["status"],
    },
    {
      name: "two-part command",
      argv: ["node", "oni", "agents", "list"],
      expected: ["agents", "list"],
    },
    {
      name: "terminator cuts parsing",
      argv: ["node", "oni", "status", "--", "ignored"],
      expected: ["status"],
    },
  ])("extracts command path: $name", ({ argv, expected }) => {
    expect(getCommandPath(argv, 2)).toEqual(expected);
  });

  it.each([
    {
      name: "returns first command token",
      argv: ["node", "oni", "agents", "list"],
      expected: "agents",
    },
    {
      name: "returns null when no command exists",
      argv: ["node", "oni"],
      expected: null,
    },
  ])("returns primary command: $name", ({ argv, expected }) => {
    expect(getPrimaryCommand(argv)).toBe(expected);
  });

  it.each([
    {
      name: "detects flag before terminator",
      argv: ["node", "oni", "status", "--json"],
      flag: "--json",
      expected: true,
    },
    {
      name: "ignores flag after terminator",
      argv: ["node", "oni", "--", "--json"],
      flag: "--json",
      expected: false,
    },
  ])("parses boolean flags: $name", ({ argv, flag, expected }) => {
    expect(hasFlag(argv, flag)).toBe(expected);
  });

  it.each([
    {
      name: "value in next token",
      argv: ["node", "oni", "status", "--timeout", "5000"],
      expected: "5000",
    },
    {
      name: "value in equals form",
      argv: ["node", "oni", "status", "--timeout=2500"],
      expected: "2500",
    },
    {
      name: "missing value",
      argv: ["node", "oni", "status", "--timeout"],
      expected: null,
    },
    {
      name: "next token is another flag",
      argv: ["node", "oni", "status", "--timeout", "--json"],
      expected: null,
    },
    {
      name: "flag appears after terminator",
      argv: ["node", "oni", "--", "--timeout=99"],
      expected: undefined,
    },
  ])("extracts flag values: $name", ({ argv, expected }) => {
    expect(getFlagValue(argv, "--timeout")).toBe(expected);
  });

  it("parses verbose flags", () => {
    expect(getVerboseFlag(["node", "oni", "status", "--verbose"])).toBe(true);
    expect(getVerboseFlag(["node", "oni", "status", "--debug"])).toBe(false);
    expect(getVerboseFlag(["node", "oni", "status", "--debug"], { includeDebug: true })).toBe(
      true,
    );
  });

  it.each([
    {
      name: "missing flag",
      argv: ["node", "oni", "status"],
      expected: undefined,
    },
    {
      name: "missing value",
      argv: ["node", "oni", "status", "--timeout"],
      expected: null,
    },
    {
      name: "valid positive integer",
      argv: ["node", "oni", "status", "--timeout", "5000"],
      expected: 5000,
    },
    {
      name: "invalid integer",
      argv: ["node", "oni", "status", "--timeout", "nope"],
      expected: undefined,
    },
  ])("parses positive integer flag values: $name", ({ argv, expected }) => {
    expect(getPositiveIntFlagValue(argv, "--timeout")).toBe(expected);
  });

  it("builds parse argv from raw args", () => {
    const cases = [
      {
        rawArgs: ["node", "oni", "status"],
        expected: ["node", "oni", "status"],
      },
      {
        rawArgs: ["node-22", "oni", "status"],
        expected: ["node-22", "oni", "status"],
      },
      {
        rawArgs: ["node-22.2.0.exe", "oni", "status"],
        expected: ["node-22.2.0.exe", "oni", "status"],
      },
      {
        rawArgs: ["node-22.2", "oni", "status"],
        expected: ["node-22.2", "oni", "status"],
      },
      {
        rawArgs: ["node-22.2.exe", "oni", "status"],
        expected: ["node-22.2.exe", "oni", "status"],
      },
      {
        rawArgs: ["/usr/bin/node-22.2.0", "oni", "status"],
        expected: ["/usr/bin/node-22.2.0", "oni", "status"],
      },
      {
        rawArgs: ["nodejs", "oni", "status"],
        expected: ["nodejs", "oni", "status"],
      },
      {
        rawArgs: ["node-dev", "oni", "status"],
        expected: ["node", "oni", "node-dev", "oni", "status"],
      },
      {
        rawArgs: ["oni", "status"],
        expected: ["node", "oni", "status"],
      },
      {
        rawArgs: ["bun", "src/entry.ts", "status"],
        expected: ["bun", "src/entry.ts", "status"],
      },
    ] as const;

    for (const testCase of cases) {
      const parsed = buildParseArgv({
        programName: "oni",
        rawArgs: [...testCase.rawArgs],
      });
      expect(parsed).toEqual([...testCase.expected]);
    }
  });

  it("builds parse argv from fallback args", () => {
    const fallbackArgv = buildParseArgv({
      programName: "oni",
      fallbackArgv: ["status"],
    });
    expect(fallbackArgv).toEqual(["node", "oni", "status"]);
  });

  it("decides when to migrate state", () => {
    const nonMutatingArgv = [
      ["node", "oni", "status"],
      ["node", "oni", "health"],
      ["node", "oni", "sessions"],
      ["node", "oni", "config", "get", "update"],
      ["node", "oni", "config", "unset", "update"],
      ["node", "oni", "models", "list"],
      ["node", "oni", "models", "status"],
      ["node", "oni", "memory", "status"],
      ["node", "oni", "agent", "--message", "hi"],
    ] as const;
    const mutatingArgv = [
      ["node", "oni", "agents", "list"],
      ["node", "oni", "message", "send"],
    ] as const;

    for (const argv of nonMutatingArgv) {
      expect(shouldMigrateState([...argv])).toBe(false);
    }
    for (const argv of mutatingArgv) {
      expect(shouldMigrateState([...argv])).toBe(true);
    }
  });

  it.each([
    { path: ["status"], expected: false },
    { path: ["config", "get"], expected: false },
    { path: ["models", "status"], expected: false },
    { path: ["agents", "list"], expected: true },
  ])("reuses command path for migrate state decisions: $path", ({ path, expected }) => {
    expect(shouldMigrateStateFromPath(path)).toBe(expected);
  });
});
