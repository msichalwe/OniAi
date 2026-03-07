---
name: self-improving
description: Captures learnings, errors, corrections, and feature requests for continuous improvement. Automatically detects triggers, logs structured entries, promotes recurring patterns to permanent memory, and tracks resolution status.
metadata:
  {
    "oni":
      {
        "emoji": "🔄",
        "always": true,
      },
  }
---

# Self-Improvement Skill

Log learnings and errors for continuous improvement. Important learnings get promoted to permanent memory via `memory_bubble`.

## Detection triggers

Automatically log when you notice:

**Corrections** (learning):

- "No, that's not right..."
- "Actually, it should be..."
- "You're wrong about..."
- "That's outdated..."

**Feature requests**:

- "Can you also..."
- "I wish you could..."
- "Is there a way to..."
- "Why can't you..."

**Knowledge gaps** (learning):

- User provides information you didn't know
- Documentation you referenced is outdated
- API behavior differs from your understanding

**Errors**:

- Command returns non-zero exit code
- Exception or stack trace
- Unexpected output or behavior
- Timeout or connection failure

## Logging protocol

When a trigger is detected, use `memory_bubble` to persist it:

### Learning

```
memory_bubble(add_bubble, {
  content: "[LRN] <category>: <one-line summary>\nDetails: <full context>\nSuggested action: <specific fix>",
  category: "fact",
  source: "conversation",
  importance: 7
})
```

### Error

```
memory_bubble(add_bubble, {
  content: "[ERR] <skill_or_command>: <brief description>\nError: <actual error message>\nContext: <what was attempted>\nSuggested fix: <if identifiable>",
  category: "fact",
  source: "conversation",
  importance: 8
})
```

### Feature request

```
memory_bubble(add_bubble, {
  content: "[FEAT] <capability_name>: <what the user wanted>\nContext: <why they needed it>\nComplexity: simple|medium|complex\nSuggested implementation: <how this could be built>",
  category: "fact",
  source: "conversation",
  importance: 6
})
```

## Priority guidelines

| Priority | When to use |
| -------- | ----------- |
| importance: 9-10 | Blocks core functionality, data loss risk, security issue |
| importance: 7-8 | Significant impact, affects common workflows, recurring issue |
| importance: 5-6 | Moderate impact, workaround exists |
| importance: 3-4 | Minor inconvenience, edge case, nice-to-have |

## Recurring pattern detection

Before logging something new:

1. Search first: `memory_bubble(query, { text: "keyword" })`
2. If similar entry exists, update it with additional context or bump importance
3. Consider systemic fix: recurring issues often indicate missing documentation or automation

## Promotion to permanent memory

When a learning is broadly applicable (not a one-off fix), promote it:

### When to promote

- Learning applies across multiple tasks or features
- Knowledge any future session should know
- Prevents recurring mistakes
- Documents user-specific conventions or preferences

### How to promote

1. Distill the learning into a concise preference or fact
2. Use `memory_bubble(set_preference, ...)` for user preferences
3. Use `memory_bubble(add_entity, ...)` for project/tool knowledge with entity facts
4. If the learning is about a person, use entities and relationships

### Examples

**Learning** (verbose):
> Project uses pnpm workspaces. Attempted `npm install` but failed. Must use `pnpm install`.

**Promoted** (via memory_bubble):
```
memory_bubble(set_preference, {
  key: "package_manager",
  value: "pnpm (not npm) - always use pnpm install",
  category: "workflow"
})
```

**Learning** (verbose):
> When modifying API endpoints, must regenerate TypeScript client.

**Promoted** (via memory_bubble):
```
memory_bubble(add_bubble, {
  content: "After API changes: 1) regenerate client 2) check for type errors with tsc --noEmit",
  category: "fact",
  importance: 8
})
```

## Periodic review

At natural breakpoints (end of session, during heartbeat), review recent learnings:

### Quick status check

1. `memory_bubble(query, { text: "[ERR]" })` -- check unresolved errors
2. `memory_bubble(query, { text: "[LRN]" })` -- check recent learnings
3. `memory_bubble(query, { text: "[FEAT]" })` -- check feature requests

### Review actions

- Resolve entries that have been fixed
- Bump importance on recurring issues
- Promote broadly-applicable learnings to permanent memory
- Propose automation for patterns seen 3+ times

## Best practices

1. Log immediately -- context is freshest right after the issue
2. Be specific -- future sessions need to understand quickly
3. Include reproduction steps -- especially for errors
4. Link related context -- makes fixes easier
5. Suggest concrete fixes -- not just "investigate"
6. Promote aggressively -- if in doubt, persist it
7. Review regularly -- stale learnings lose value
