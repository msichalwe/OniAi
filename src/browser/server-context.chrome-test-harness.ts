import { vi } from "vitest";
import { installChromeUserDataDirHooks } from "./chrome-user-data-dir.test-harness.js";

const chromeUserDataDir = { dir: "/tmp/oni" };
installChromeUserDataDirHooks(chromeUserDataDir);

vi.mock("./chrome.js", () => ({
  isChromeCdpReady: vi.fn(async () => true),
  isChromeReachable: vi.fn(async () => true),
  launchOniAIChrome: vi.fn(async () => {
    throw new Error("unexpected launch");
  }),
  resolveOniAIUserDataDir: vi.fn(() => chromeUserDataDir.dir),
  stopOniAIChrome: vi.fn(async () => {}),
}));
