import { describe, expect, it } from "vitest";
import { shouldIncludeSkill } from "./config.js";
import type { SkillEntry } from "./types.js";

function makeSkillEntry(overrides: Partial<SkillEntry> & { always?: boolean; requires?: { bins?: string[] } } = {}): SkillEntry {
  const { always, requires, ...rest } = overrides;
  return {
    skill: {
      name: overrides.skill?.name ?? "test-skill",
      source: overrides.skill?.source ?? "oni-bundled",
      dir: "/tmp/skills/test-skill",
      path: "/tmp/skills/test-skill/SKILL.md",
      content: "# Test",
    },
    metadata: {
      always,
      requires,
    },
    ...rest,
  } as SkillEntry;
}

describe("shouldIncludeSkill", () => {
  it("includes a basic bundled skill with no restrictions", () => {
    const entry = makeSkillEntry();
    expect(shouldIncludeSkill({ entry })).toBe(true);
  });

  it("excludes a skill when enabled is false", () => {
    const entry = makeSkillEntry();
    const config = { skills: { entries: { "test-skill": { enabled: false } } } } as any;
    expect(shouldIncludeSkill({ entry, config })).toBe(false);
  });

  it("always-on skill cannot be disabled via enabled: false", () => {
    const entry = makeSkillEntry({ always: true });
    const config = { skills: { entries: { "test-skill": { enabled: false } } } } as any;
    expect(shouldIncludeSkill({ entry, config })).toBe(true);
  });

  it("always-on skill bypasses binary requirements", () => {
    const entry = makeSkillEntry({ always: true, requires: { bins: ["nonexistent-binary-xyz"] } });
    expect(shouldIncludeSkill({ entry })).toBe(true);
  });

  it("non-always skill with missing binary is excluded", () => {
    const entry = makeSkillEntry({ requires: { bins: ["nonexistent-binary-xyz"] } });
    expect(shouldIncludeSkill({ entry })).toBe(false);
  });
});
