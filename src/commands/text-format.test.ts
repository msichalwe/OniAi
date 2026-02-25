import { describe, expect, it } from "vitest";
import { shortenText } from "./text-format.js";

describe("shortenText", () => {
  it("returns original text when it fits", () => {
    expect(shortenText("oni", 16)).toBe("oni");
  });

  it("truncates and appends ellipsis when over limit", () => {
    expect(shortenText("oni-status-output", 10)).toBe("oni-…");
  });

  it("counts multi-byte characters correctly", () => {
    expect(shortenText("hello🙂world", 7)).toBe("hello🙂…");
  });
});
