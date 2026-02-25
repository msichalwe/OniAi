import { describe, expect, it } from "vitest";
import { resolveIrcInboundTarget } from "./monitor.js";

describe("irc monitor inbound target", () => {
  it("keeps channel target for group messages", () => {
    expect(
      resolveIrcInboundTarget({
        target: "#oni",
        senderNick: "alice",
      }),
    ).toEqual({
      isGroup: true,
      target: "#oni",
      rawTarget: "#oni",
    });
  });

  it("maps DM target to sender nick and preserves raw target", () => {
    expect(
      resolveIrcInboundTarget({
        target: "oni-bot",
        senderNick: "alice",
      }),
    ).toEqual({
      isGroup: false,
      target: "alice",
      rawTarget: "oni-bot",
    });
  });

  it("falls back to raw target when sender nick is empty", () => {
    expect(
      resolveIrcInboundTarget({
        target: "oni-bot",
        senderNick: " ",
      }),
    ).toEqual({
      isGroup: false,
      target: "oni-bot",
      rawTarget: "oni-bot",
    });
  });
});
