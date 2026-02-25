import path from "node:path";
import { describe, expect, it } from "vitest";
import { formatCliCommand } from "./command-format.js";
import { applyCliProfileEnv, parseCliProfileArgs } from "./profile.js";

describe("parseCliProfileArgs", () => {
  it("leaves gateway --dev for subcommands", () => {
    const res = parseCliProfileArgs([
      "node",
      "oni",
      "gateway",
      "--dev",
      "--allow-unconfigured",
    ]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBeNull();
    expect(res.argv).toEqual(["node", "oni", "gateway", "--dev", "--allow-unconfigured"]);
  });

  it("still accepts global --dev before subcommand", () => {
    const res = parseCliProfileArgs(["node", "oni", "--dev", "gateway"]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBe("dev");
    expect(res.argv).toEqual(["node", "oni", "gateway"]);
  });

  it("parses --profile value and strips it", () => {
    const res = parseCliProfileArgs(["node", "oni", "--profile", "work", "status"]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBe("work");
    expect(res.argv).toEqual(["node", "oni", "status"]);
  });

  it("rejects missing profile value", () => {
    const res = parseCliProfileArgs(["node", "oni", "--profile"]);
    expect(res.ok).toBe(false);
  });

  it.each([
    ["--dev first", ["node", "oni", "--dev", "--profile", "work", "status"]],
    ["--profile first", ["node", "oni", "--profile", "work", "--dev", "status"]],
  ])("rejects combining --dev with --profile (%s)", (_name, argv) => {
    const res = parseCliProfileArgs(argv);
    expect(res.ok).toBe(false);
  });
});

describe("applyCliProfileEnv", () => {
  it("fills env defaults for dev profile", () => {
    const env: Record<string, string | undefined> = {};
    applyCliProfileEnv({
      profile: "dev",
      env,
      homedir: () => "/home/peter",
    });
    const expectedStateDir = path.join(path.resolve("/home/peter"), ".oni-dev");
    expect(env.ONI_PROFILE).toBe("dev");
    expect(env.ONI_STATE_DIR).toBe(expectedStateDir);
    expect(env.ONI_CONFIG_PATH).toBe(path.join(expectedStateDir, "oni.json"));
    expect(env.ONI_GATEWAY_PORT).toBe("19001");
  });

  it("does not override explicit env values", () => {
    const env: Record<string, string | undefined> = {
      ONI_STATE_DIR: "/custom",
      ONI_GATEWAY_PORT: "19099",
    };
    applyCliProfileEnv({
      profile: "dev",
      env,
      homedir: () => "/home/peter",
    });
    expect(env.ONI_STATE_DIR).toBe("/custom");
    expect(env.ONI_GATEWAY_PORT).toBe("19099");
    expect(env.ONI_CONFIG_PATH).toBe(path.join("/custom", "oni.json"));
  });

  it("uses ONI_HOME when deriving profile state dir", () => {
    const env: Record<string, string | undefined> = {
      ONI_HOME: "/srv/oni-home",
      HOME: "/home/other",
    };
    applyCliProfileEnv({
      profile: "work",
      env,
      homedir: () => "/home/fallback",
    });

    const resolvedHome = path.resolve("/srv/oni-home");
    expect(env.ONI_STATE_DIR).toBe(path.join(resolvedHome, ".oni-work"));
    expect(env.ONI_CONFIG_PATH).toBe(
      path.join(resolvedHome, ".oni-work", "oni.json"),
    );
  });
});

describe("formatCliCommand", () => {
  it.each([
    {
      name: "no profile is set",
      cmd: "oni doctor --fix",
      env: {},
      expected: "oni doctor --fix",
    },
    {
      name: "profile is default",
      cmd: "oni doctor --fix",
      env: { ONI_PROFILE: "default" },
      expected: "oni doctor --fix",
    },
    {
      name: "profile is Default (case-insensitive)",
      cmd: "oni doctor --fix",
      env: { ONI_PROFILE: "Default" },
      expected: "oni doctor --fix",
    },
    {
      name: "profile is invalid",
      cmd: "oni doctor --fix",
      env: { ONI_PROFILE: "bad profile" },
      expected: "oni doctor --fix",
    },
    {
      name: "--profile is already present",
      cmd: "oni --profile work doctor --fix",
      env: { ONI_PROFILE: "work" },
      expected: "oni --profile work doctor --fix",
    },
    {
      name: "--dev is already present",
      cmd: "oni --dev doctor",
      env: { ONI_PROFILE: "dev" },
      expected: "oni --dev doctor",
    },
  ])("returns command unchanged when $name", ({ cmd, env, expected }) => {
    expect(formatCliCommand(cmd, env)).toBe(expected);
  });

  it("inserts --profile flag when profile is set", () => {
    expect(formatCliCommand("oni doctor --fix", { ONI_PROFILE: "work" })).toBe(
      "oni --profile work doctor --fix",
    );
  });

  it("trims whitespace from profile", () => {
    expect(formatCliCommand("oni doctor --fix", { ONI_PROFILE: "  jboni  " })).toBe(
      "oni --profile jboni doctor --fix",
    );
  });

  it("handles command with no args after oni", () => {
    expect(formatCliCommand("oni", { ONI_PROFILE: "test" })).toBe(
      "oni --profile test",
    );
  });

  it("handles pnpm wrapper", () => {
    expect(formatCliCommand("pnpm oni doctor", { ONI_PROFILE: "work" })).toBe(
      "pnpm oni --profile work doctor",
    );
  });
});
