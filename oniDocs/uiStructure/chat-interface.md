# Chat Interface — Message Handling, Streaming & Tool Display

## Overview

The chat interface is the primary user-facing view. It handles:
- Sending user messages (text + attachments)
- Receiving assistant responses (streamed or complete)
- Displaying tool call results (exec, browser, files, etc.)
- Managing chat state (loading, sending, streaming, queue)

## Sending a Message

### Basic Text Message

```typescript
await gateway.request("chat.send", {
  sessionKey: "agent:main:main",
  message: "Hello, what can you do?",
  idempotencyKey: crypto.randomUUID(),
});
```

### Message with Attachments

```typescript
// Convert file to base64
const reader = new FileReader();
reader.onload = async () => {
  const base64 = reader.result.split(",")[1];
  await gateway.request("chat.send", {
    sessionKey: currentSessionKey,
    message: "What's in this image?",
    attachments: [{ content: base64, mimeType: "image/png" }],
    idempotencyKey: crypto.randomUUID(),
  });
};
reader.readAsDataURL(file);
```

### Thinking Level Override

```typescript
await gateway.request("chat.send", {
  sessionKey: currentSessionKey,
  message: "Solve this complex problem...",
  thinkingLevel: "high", // "default" | "low" | "high" | "none"
  idempotencyKey: crypto.randomUUID(),
});
```

## Receiving Messages — Streaming

After `chat.send`, the Gateway streams back via `chat` events:

```
chat.send ──> chat event (state: "delta") ──> ... ──> chat event (state: "final")
```

### Chat Event Handling

```typescript
function handleChatEvent(payload: ChatEventPayload) {
  const { runId, sessionKey, state, message, errorMessage } = payload;
  
  switch (state) {
    case "delta":
      // Streaming text chunk — append to current stream buffer
      if (message) {
        appendToStream(extractText(message));
      }
      break;
      
    case "final":
      // Complete message — replace stream with final content
      clearStream();
      if (message) {
        appendMessage(message);
      }
      break;
      
    case "aborted":
      // Run was aborted — show partial content if available
      clearStream();
      if (message) {
        appendMessage(message); // may contain partial assistant response
      }
      break;
      
    case "error":
      // Run errored — show error
      clearStream();
      showError(errorMessage ?? "Unknown error");
      break;
  }
}
```

### Text Extraction from Messages

Messages have complex content structures. Extract readable text:

```typescript
function extractText(message: unknown): string {
  if (!message || typeof message !== "object") return "";
  const msg = message as Record<string, unknown>;
  
  // String content
  if (typeof msg.content === "string") return msg.content;
  
  // Array content (OpenAI format)
  if (Array.isArray(msg.content)) {
    return msg.content
      .filter((block: any) => block.type === "text")
      .map((block: any) => block.text)
      .join("");
  }
  
  // Text field (alternative format)
  if (typeof msg.text === "string") return msg.text;
  
  return "";
}
```

## Agent Events — Tool Calls & Lifecycle

Alongside `chat` events, `agent` events report tool execution:

```typescript
function handleAgentEvent(payload: AgentEventPayload) {
  switch (payload.type) {
    case "tool_call.start":
      // Tool invocation started
      // payload: { runId, sessionKey, toolName, toolInput, toolCallId }
      addToolStreamEntry({
        id: payload.toolCallId,
        name: payload.toolName,
        input: payload.toolInput,
        status: "running",
      });
      break;
      
    case "tool_call.result":
      // Tool returned result
      // payload: { runId, sessionKey, toolCallId, result, isError? }
      updateToolStreamEntry(payload.toolCallId, {
        result: payload.result,
        status: payload.isError ? "error" : "done",
      });
      break;
      
    case "thinking.start":
      // Model entered thinking mode
      showThinkingIndicator();
      break;
      
    case "thinking.end":
      // Model finished thinking
      hideThinkingIndicator();
      break;
      
    case "compaction":
      // Context was compacted (long conversation trim)
      showCompactionNotice();
      break;
      
    case "fallback":
      // Model fell back to alternate provider
      showFallbackNotice(payload.from, payload.to);
      break;
  }
}
```

## Tool Display

Tools have display categories for rich rendering:

| Category | Tools | Display |
|----------|-------|---------|
| `code` | exec, bash, process | Terminal-style with output |
| `file` | read, write, edit, apply_patch | File viewer with diffs |
| `web` | web_search, web_fetch, browser | URL + content preview |
| `message` | message | Channel + recipient |
| `system` | cron, gateway, nodes | Status cards |
| `info` | image, sessions_*, agents_list | Compact info display |

### Tool Display Configuration

The original UI used a `tool-display.json` mapping:

```json
{
  "exec": { "category": "code", "icon": "terminal", "label": "Command" },
  "read": { "category": "file", "icon": "file", "label": "Read File" },
  "write": { "category": "file", "icon": "filePlus", "label": "Write File" },
  "edit": { "category": "file", "icon": "fileEdit", "label": "Edit File" },
  "browser": { "category": "web", "icon": "globe", "label": "Browser" },
  "web_search": { "category": "web", "icon": "search", "label": "Web Search" },
  "message": { "category": "message", "icon": "send", "label": "Send Message" }
}
```

## Chat History Loading

```typescript
async function loadChatHistory(sessionKey: string) {
  const res = await gateway.request("chat.history", {
    sessionKey,
    limit: 200,
  });
  // res.messages — array of user/assistant/tool messages
  // res.thinkingLevel — current thinking level setting
  return res;
}
```

## Aborting a Run

```typescript
async function abortChat(sessionKey: string, runId: string) {
  await gateway.request("chat.abort", { sessionKey, runId });
}
```

## Message Queue (Multi-Message Handling)

When the user sends messages while the agent is still processing:

1. **First message** — sent immediately via `chat.send`
2. **Subsequent messages** — queued locally
3. **On `final` event** — flush queue (coalesce messages into single followup)

The Gateway's queue mode controls this behavior:
- `collect` (default) — coalesce queued messages
- `followup` — queue for next turn
- `steer` — inject into current run

## Session Key Format

```
agent:<agentId>:<mainKey>              — Direct chat (e.g., "agent:main:main")
agent:<agentId>:<channel>:group:<id>   — Group chat
agent:<agentId>:<channel>:channel:<id> — Channel chat
cron:<jobId>                           — Cron session
```

## Markdown Rendering

Assistant messages should be rendered as Markdown:
- Code blocks with syntax highlighting
- Inline code
- Links (external links should open in new tab)
- Lists, tables, headings
- Sanitize HTML (DOMPurify recommended)

The original UI used the `marked` library with DOMPurify for sanitization.
