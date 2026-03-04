import type { BubbleStore } from "./store.js";

/**
 * Ambient Node Scanner — scans connected nodes (Mac, etc.) every ~12 hours
 * to capture context: running apps, recent files, clipboard, calendar events.
 * Creates memory bubbles from the collected data.
 */

export type NodeScanResult = {
  nodeId: string;
  displayName: string;
  apps?: string[];
  recentFiles?: string[];
  clipboard?: string;
  gitRepos?: { path: string; branch: string; status: string }[];
  systemInfo?: { battery?: string; disk?: string; uptime?: string };
  calendarEvents?: { title: string; time: string }[];
};

const SCAN_INTERVAL_MS = 12 * 60 * 60 * 1000; // 12 hours

/**
 * Check if a node scan is due.
 */
export function isNodeScanDue(store: BubbleStore): boolean {
  const lastScan = store.getLastNodeScanAt();
  if (!lastScan) return true;
  return (Date.now() - lastScan) >= SCAN_INTERVAL_MS;
}

/**
 * Build exec commands to gather ambient context from a Mac node.
 * Returns an array of { label, command } pairs to run via node exec.
 */
export function buildNodeScanCommands(): { label: string; command: string }[] {
  return [
    {
      label: "running-apps",
      command: `osascript -e 'tell application "System Events" to get name of every process whose background only is false'`,
    },
    {
      label: "recent-files",
      command: `find ~/Desktop ~/Documents ~/Downloads -maxdepth 1 -type f -newer /tmp/.oni-last-scan 2>/dev/null | head -20; touch /tmp/.oni-last-scan`,
    },
    {
      label: "clipboard",
      command: `pbpaste 2>/dev/null | head -c 500`,
    },
    {
      label: "git-repos",
      command: `find ~/Documents/Projects -maxdepth 2 -name .git -type d 2>/dev/null | while read d; do dir=$(dirname "$d"); echo "$dir|$(git -C "$dir" branch --show-current 2>/dev/null)|$(git -C "$dir" status --porcelain 2>/dev/null | wc -l | tr -d ' ')"; done | head -10`,
    },
    {
      label: "battery",
      command: `pmset -g batt 2>/dev/null | head -2`,
    },
    {
      label: "calendar",
      command: `icalBuddy -n -nc -b "" -ea -li 5 eventsToday+2 2>/dev/null | head -20`,
    },
  ];
}

/**
 * Process scan results into memory bubbles.
 */
export function processScanResults(
  store: BubbleStore,
  results: { label: string; output: string }[],
  nodeDisplayName: string,
): number {
  let bubblesCreated = 0;

  for (const { label, output } of results) {
    const trimmed = output.trim();
    if (!trimmed) continue;

    switch (label) {
      case "running-apps": {
        const apps = trimmed.split(",").map((a) => a.trim()).filter(Boolean);
        if (apps.length > 0) {
          store.addBubble({
            content: `Apps running on ${nodeDisplayName}: ${apps.slice(0, 15).join(", ")}`,
            category: "observation",
            source: "node-scan",
            tags: ["apps", "node-scan"],
            importance: 0.3,
          });
          bubblesCreated++;
        }
        break;
      }
      case "recent-files": {
        const files = trimmed.split("\n").filter(Boolean).slice(0, 10);
        if (files.length > 0) {
          store.addBubble({
            content: `Recent files on ${nodeDisplayName}: ${files.map((f) => f.split("/").pop()).join(", ")}`,
            category: "observation",
            source: "node-scan",
            tags: ["files", "node-scan"],
            importance: 0.3,
          });
          bubblesCreated++;
        }
        break;
      }
      case "clipboard": {
        if (trimmed.length > 10) {
          store.addBubble({
            content: `Clipboard on ${nodeDisplayName}: ${trimmed.slice(0, 200)}`,
            category: "observation",
            source: "node-scan",
            tags: ["clipboard", "node-scan"],
            importance: 0.2,
          });
          bubblesCreated++;
        }
        break;
      }
      case "git-repos": {
        const repos = trimmed.split("\n").filter(Boolean);
        for (const repo of repos.slice(0, 5)) {
          const [repoPath, branch, changedFiles] = repo.split("|");
          if (repoPath) {
            const projectName = repoPath.split("/").pop() ?? repoPath;
            const entity = store.addEntity({
              type: "project",
              name: projectName,
              facts: [`Located at ${repoPath}`, `Branch: ${branch ?? "unknown"}`, `${changedFiles ?? 0} uncommitted changes`],
            });
            store.addBubble({
              content: `Git repo: ${projectName} on branch ${branch ?? "?"} with ${changedFiles ?? 0} changes`,
              category: "observation",
              source: "node-scan",
              entityIds: [entity.id],
              tags: ["git", "project", "node-scan"],
              importance: 0.4,
            });
            bubblesCreated++;
          }
        }
        break;
      }
      case "calendar": {
        if (trimmed.length > 5 && !trimmed.includes("command not found")) {
          store.addBubble({
            content: `Upcoming calendar: ${trimmed.slice(0, 300)}`,
            category: "event",
            source: "node-scan",
            tags: ["calendar", "node-scan"],
            importance: 0.6,
          });
          bubblesCreated++;
        }
        break;
      }
    }
  }

  store.recordNodeScan();
  return bubblesCreated;
}
