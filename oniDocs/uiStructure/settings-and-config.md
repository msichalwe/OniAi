# Settings, Configuration & Themes

## UI Settings (Client-Side)

UI settings are persisted in `localStorage` under the key `oni-control-ui-settings`.

### Settings Shape

```typescript
type UiSettings = {
  theme: "light" | "dark" | "system";    // Color theme
  navCollapsed: boolean;                   // Sidebar collapsed state
  chatFontSize: number;                    // Chat text size (px)
  showToolMessages: boolean;               // Show tool call details in chat
  showTimestamps: boolean;                 // Show message timestamps
  autoScroll: boolean;                     // Auto-scroll to bottom on new messages
  logLevelFilters: Record<LogLevel, boolean>; // Log view level filters
  sessionKey: string;                      // Last active session key
  lastTab: string;                         // Last active tab
};
```

### Default Settings

```typescript
const defaults: UiSettings = {
  theme: "system",
  navCollapsed: false,
  chatFontSize: 14,
  showToolMessages: true,
  showTimestamps: false,
  autoScroll: true,
  logLevelFilters: { debug: false, info: true, warn: true, error: true },
  sessionKey: "",
  lastTab: "chat",
};
```

### Loading & Saving

```typescript
function loadSettings(): UiSettings {
  try {
    const raw = localStorage.getItem("oni-control-ui-settings");
    return raw ? { ...defaults, ...JSON.parse(raw) } : defaults;
  } catch {
    return defaults;
  }
}

function saveSettings(settings: UiSettings) {
  localStorage.setItem("oni-control-ui-settings", JSON.stringify(settings));
}
```

---

## Gateway Configuration (Server-Side)

The config view reads/writes the Gateway's `oni.json` configuration file.

### Reading Config

```typescript
const config = await gateway.request("config.get");
// config: full oni.json contents as parsed JSON
```

### Reading Schema

```typescript
const schema = await gateway.request("config.schema");
// schema: JSON Schema (draft 2020-12) describing all valid config keys
```

### Writing Config

Two approaches:

**Full replace (config.apply):**
```typescript
await gateway.request("config.apply", {
  config: { /* entire config object */ },
});
// Gateway validates, writes, and restarts
```

**Partial merge (config.patch):**
```typescript
await gateway.request("config.patch", {
  patch: {
    "gateway.port": 19100,
    "tools.profile": "coding",
  },
});
// Gateway merges, validates, writes, and restarts
```

### Config Form Generation

The original UI auto-generated a form from the JSON Schema:

1. Parse `config.schema` response
2. Walk schema properties recursively
3. Generate form fields based on type (string → text input, boolean → toggle, enum → select, etc.)
4. Track dirty state (changed fields vs. loaded values)
5. Validate on change using schema constraints
6. Support nested objects with collapsible sections
7. Search across all config key paths

### Config UI Hints

Some config keys have special UI rendering hints:

```typescript
type ConfigUiHints = {
  [key: string]: {
    label?: string;       // Human-readable label
    description?: string; // Help text
    sensitive?: boolean;  // Mask the value (passwords, tokens)
    multiline?: boolean;  // Use textarea instead of input
    enum?: string[];      // Suggest values
    deprecated?: boolean; // Show deprecation warning
  };
};
```

---

## Theme System

### Theme Modes

```typescript
type ThemeMode = "light" | "dark" | "system";
type ResolvedTheme = "light" | "dark";
```

### Resolution

```typescript
function resolveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return mode;
}
```

### Application

Apply theme by setting a CSS class or data attribute on the root element:

```typescript
document.documentElement.setAttribute("data-theme", resolvedTheme);
```

### OniAI Brand Palette

The TUI/CLI palette (also usable in web UI):

```json
{
  "accent": "#6C5CE7",
  "accentBright": "#A29BFE",
  "accentDim": "#4834D4",
  "info": "#74B9FF",
  "success": "#00B894",
  "warn": "#FDCB6E",
  "error": "#D63031",
  "muted": "#636E72"
}
```

### CSS Custom Properties Pattern

```css
:root {
  --oni-accent: #6C5CE7;
  --oni-accent-bright: #A29BFE;
  --oni-accent-dim: #4834D4;
  --oni-info: #74B9FF;
  --oni-success: #00B894;
  --oni-warn: #FDCB6E;
  --oni-error: #D63031;
  --oni-muted: #636E72;
}

[data-theme="dark"] {
  --oni-bg: #1a1a2e;
  --oni-surface: #16213e;
  --oni-text: #eee;
  --oni-border: #2a2a4a;
}

[data-theme="light"] {
  --oni-bg: #f8f9fa;
  --oni-surface: #ffffff;
  --oni-text: #2d3436;
  --oni-border: #dfe6e9;
}
```
