# State Management — App State, Controllers & Data Flow

## Architecture Overview

The original UI used **Lit Web Components** with a single root `<oni-app>` element that owned all state. State flowed top-down via properties; mutations triggered re-renders.

```
┌────────────────────────────────────────────────┐
│                   <oni-app>                      │
│              (owns all state)                    │
│                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │
│  │ Gateway   │  │ Settings │  │ View State   │  │
│  │ Client    │  │ (local)  │  │ (per-tab)    │  │
│  └─────┬─────┘  └──────────┘  └──────────────┘  │
│        │                                         │
│  ┌─────┴───────────────────────────────────┐    │
│  │           Controllers                    │    │
│  │  (pure functions: state → side effects)  │    │
│  └──────────────────────────────────────────┘    │
│        │                                         │
│  ┌─────┴───────────────────────────────────┐    │
│  │           Views (render functions)       │    │
│  │  (state → HTML template literals)        │    │
│  └──────────────────────────────────────────┘    │
└──────────────────────────────────────────────────┘
```

## App View State (Complete Shape)

This is the full state object that drives the entire UI:

```typescript
type AppViewState = {
  // Connection
  settings: UiSettings;
  password: string;
  connected: boolean;
  hello: GatewayHelloOk | null;
  lastError: string | null;
  lastErrorCode: string | null;
  
  // Navigation
  tab: Tab;
  onboarding: boolean;
  basePath: string;
  
  // Theme
  theme: ThemeMode;
  themeResolved: "light" | "dark";
  
  // Assistant Identity
  assistantName: string;
  assistantAvatar: string | null;
  assistantAgentId: string | null;
  
  // Chat
  sessionKey: string;
  chatLoading: boolean;
  chatSending: boolean;
  chatMessage: string;
  chatAttachments: ChatAttachment[];
  chatMessages: unknown[];
  chatToolMessages: unknown[];
  chatStream: string | null;              // Active streaming text
  chatStreamStartedAt: number | null;
  chatRunId: string | null;               // Active run ID
  compactionStatus: CompactionStatus | null;
  fallbackStatus: FallbackStatus | null;
  chatAvatarUrl: string | null;
  chatThinkingLevel: string | null;
  chatQueue: ChatQueueItem[];             // Queued messages
  chatManualRefreshInFlight: boolean;
  chatNewMessagesBelow: boolean;
  
  // Sidebar
  sidebarOpen: boolean;
  sidebarContent: string | null;
  sidebarError: string | null;
  splitRatio: number;
  
  // Nodes
  nodesLoading: boolean;
  nodes: Array<Record<string, unknown>>;
  
  // Devices (Pairing)
  devicesLoading: boolean;
  devicesError: string | null;
  devicesList: DevicePairingList | null;
  
  // Exec Approvals
  execApprovalsLoading: boolean;
  execApprovalsSaving: boolean;
  execApprovalsDirty: boolean;
  execApprovalsSnapshot: ExecApprovalsSnapshot | null;
  execApprovalsForm: ExecApprovalsFile | null;
  execApprovalsSelectedAgent: string | null;
  execApprovalsTarget: "gateway" | "node";
  execApprovalsTargetNodeId: string | null;
  execApprovalQueue: ExecApprovalRequest[];
  execApprovalBusy: boolean;
  execApprovalError: string | null;
  
  // Channels
  channelsLoading: boolean;
  channelsError: string | null;
  channelsStatus: ChannelsStatusSnapshot | null;
  
  // Sessions
  sessionsLoading: boolean;
  sessionsError: string | null;
  sessionsResult: SessionsListResult | null;
  
  // Config
  configLoading: boolean;
  configSaving: boolean;
  configError: string | null;
  configSnapshot: ConfigSnapshot | null;
  configForm: Record<string, unknown>;
  configDirty: boolean;
  configUiHints: ConfigUiHints | null;
  configSearchQuery: string;
  
  // Agents
  agentsLoading: boolean;
  agentsError: string | null;
  agentsList: AgentsListResult | null;
  
  // Tools Catalog
  toolsCatalogLoading: boolean;
  toolsCatalogError: string | null;
  toolsCatalogResult: ToolsCatalogResult | null;
  
  // Skills
  skillsLoading: boolean;
  skillsError: string | null;
  skillsReport: SkillStatusReport | null;
  
  // Cron
  cronLoading: boolean;
  cronStatus: CronStatus | null;
  cronJobs: CronJob[];
  cronForm: CronFormState | null;
  cronFormErrors: CronFieldErrors;
  cronRuns: CronRunLogEntry[];
  
  // Usage
  usageSessions: SessionsUsageResult | null;
  usageCost: CostUsageSummary | null;
  usageTimeSeries: SessionUsageTimeSeries | null;
  
  // Presence
  presenceEntries: PresenceEntry[];
  presenceError: string | null;
  presenceStatus: StatusSummary | null;
  
  // Health
  debugHealth: HealthSnapshot | null;
  
  // Logs
  logsLoading: boolean;
  logEntries: LogEntry[];
  logAutoScroll: boolean;
  
  // Events
  eventLog: EventLogEntry[];
  
  // Updates
  updateAvailable: UpdateAvailable | null;
  
  // Scroll helpers
  scrollToBottom: (opts?: { smooth?: boolean }) => void;
};
```

## Controllers (Data Fetching Layer)

Controllers are **pure async functions** that take the app state as a mutable reference, make Gateway RPC calls, and update state properties directly.

### Pattern

```typescript
// controllers/chat.ts
export async function loadChatHistory(state: ChatState) {
  if (!state.client || !state.connected) return;
  
  state.chatLoading = true;
  state.lastError = null;
  try {
    const res = await state.client.request("chat.history", {
      sessionKey: state.sessionKey,
      limit: 200,
    });
    state.chatMessages = res.messages ?? [];
    state.chatThinkingLevel = res.thinkingLevel ?? null;
  } catch (err) {
    state.lastError = String(err);
  } finally {
    state.chatLoading = false;
  }
}
```

### Controller Index

| Controller | File | Responsibilities |
|-----------|------|-----------------|
| **chat** | `controllers/chat.ts` | Load history, send messages, handle chat events |
| **agents** | `controllers/agents.ts` | List agents, load tool catalog |
| **agent-files** | `controllers/agent-files.ts` | Read/write agent workspace files |
| **agent-identity** | `controllers/agent-identity.ts` | Load agent name/avatar/emoji |
| **channels** | `controllers/channels.ts` | Channel status, WhatsApp flows |
| **config** | `controllers/config.ts` | Config get/set/apply/patch, schema loading |
| **cron** | `controllers/cron.ts` | Cron CRUD, run history, form validation |
| **devices** | `controllers/devices.ts` | Device pairing list, approve/reject |
| **exec-approval** | `controllers/exec-approval.ts` | Pending exec approval handling |
| **exec-approvals** | `controllers/exec-approvals.ts` | Exec approvals settings editor |
| **logs** | `controllers/logs.ts` | Log query, level filtering |
| **nodes** | `controllers/nodes.ts` | Node status loading |
| **presence** | `controllers/presence.ts` | Presence/device list |
| **sessions** | `controllers/sessions.ts` | Session list, preview, management |
| **skills** | `controllers/skills.ts` | Skill status report |
| **usage** | `controllers/usage.ts` | Usage/cost/timeseries data |

## Data Flow

```
User Action (click/type/navigate)
  │
  ▼
App Event Handler (in app.ts)
  │
  ▼
Controller Function (async, mutates state)
  │
  ├── Gateway RPC call (request/response)
  │
  ▼
State Updated (properties changed)
  │
  ▼
Lit Re-render (requestUpdate → render → DOM)
```

### Event-Driven Updates

```
Gateway Event (server-push)
  │
  ▼
Event Handler (in app-gateway.ts)
  │
  ▼
State Updated + View Refreshed
```

## Recommendations for Custom UI

### React / Next.js

```typescript
// Use React Query or SWR for data fetching
const { data: chatHistory } = useQuery(['chat', sessionKey], () =>
  gateway.request('chat.history', { sessionKey, limit: 200 })
);

// Use context for gateway client
const GatewayContext = createContext<GatewayClient | null>(null);

// Use reducers for complex state
const [chatState, dispatch] = useReducer(chatReducer, initialChatState);
```

### Vue

```typescript
// Use Pinia stores
const chatStore = defineStore('chat', () => {
  const messages = ref([]);
  const loading = ref(false);
  
  async function loadHistory(sessionKey: string) {
    loading.value = true;
    const res = await gateway.request('chat.history', { sessionKey });
    messages.value = res.messages;
    loading.value = false;
  }
  
  return { messages, loading, loadHistory };
});
```

### Svelte

```typescript
// Use writable stores
const chatMessages = writable([]);
const chatLoading = writable(false);

export async function loadHistory(sessionKey: string) {
  chatLoading.set(true);
  const res = await gateway.request('chat.history', { sessionKey });
  chatMessages.set(res.messages);
  chatLoading.set(false);
}
```

The key is: the Gateway is framework-agnostic. Any frontend that can open a WebSocket and send/receive JSON frames can be an OniAI UI.
