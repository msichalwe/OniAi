---
name: automation
description: Build automation workflows, shell scripts, scheduled tasks, and system integrations. Covers cron jobs, file watchers, batch processing, notification pipelines, and common DevOps patterns using bash, Python, and Oni's native cron/task/event tools.
metadata:
  {
    "oni":
      {
        "emoji": "⚙️",
        "always": true,
      },
  }
---

# Automation & Scripting

Build automation workflows, scheduled tasks, and system integrations using Oni tools and standard CLI.

## Oni-native automation

### Scheduled tasks (cron tool)

Use Oni's built-in `cron` tool for recurring work:

```
# List existing cron jobs
cron(list)

# Add a daily job
cron(add, {
  name: "daily-backup",
  schedule: "0 2 * * *",
  prompt: "Run backup of workspace files to ~/backups/"
})

# Add hourly health check
cron(add, {
  name: "health-monitor",
  schedule: "0 * * * *",
  prompt: "Check system health and report any issues"
})
```

### Task queue for multi-step work

Use the `task` tool for complex, multi-step automation:

```
task(create, {
  title: "Deploy release v2.0",
  steps: [
    "Run test suite",
    "Build production artifacts",
    "Upload to staging",
    "Verify staging deployment",
    "Promote to production",
    "Verify production",
    "Send deployment notification"
  ]
})
```

### Event-driven automation

Use the `event` tool for reactive workflows:

- File watcher: trigger on file changes
- Webhook: trigger on HTTP events
- Schedule: trigger on time patterns
- Channel event: trigger on messages

---

## Shell scripting patterns

### Safe bash script template

```bash
#!/usr/bin/env bash
set -euo pipefail

# Constants
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly LOG_FILE="${SCRIPT_DIR}/script.log"

# Logging
log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"; }
die() { log "ERROR: $*" >&2; exit 1; }

# Cleanup on exit
cleanup() { log "Cleaning up..."; }
trap cleanup EXIT

# Main
main() {
  log "Starting..."
  # Your logic here
  log "Done."
}

main "$@"
```

### Batch file processing

```bash
#!/usr/bin/env bash
set -euo pipefail

INPUT_DIR="${1:-.}"
OUTPUT_DIR="${2:-./output}"
mkdir -p "$OUTPUT_DIR"

count=0
for file in "$INPUT_DIR"/*.csv; do
  [ -f "$file" ] || continue
  name=$(basename "$file" .csv)
  echo "Processing: $name"
  # Process each file
  cp "$file" "$OUTPUT_DIR/${name}_processed.csv"
  ((count++))
done

echo "Processed $count files"
```

### Parallel processing

```bash
#!/usr/bin/env bash
set -euo pipefail

MAX_JOBS=4
process_file() {
  local file="$1"
  echo "Processing: $file"
  # Heavy work here
  sleep 1
}

export -f process_file

find . -name "*.json" -print0 | xargs -0 -P "$MAX_JOBS" -I{} bash -c 'process_file "$@"' _ {}
```

---

## Python automation patterns

### File watcher (no dependencies)

```python
python3 << 'PYEOF'
import os, time, hashlib

WATCH_DIR = "."
WATCH_EXT = {".py", ".ts", ".md"}
INTERVAL = 2  # seconds

def hash_file(path):
    try:
        return hashlib.md5(open(path, "rb").read()).hexdigest()
    except:
        return None

# Initial snapshot
state = {}
for root, dirs, files in os.walk(WATCH_DIR):
    dirs[:] = [d for d in dirs if not d.startswith(".")]
    for f in files:
        if any(f.endswith(ext) for ext in WATCH_EXT):
            path = os.path.join(root, f)
            state[path] = hash_file(path)

print(f"Watching {len(state)} files...")
while True:
    time.sleep(INTERVAL)
    current = {}
    for root, dirs, files in os.walk(WATCH_DIR):
        dirs[:] = [d for d in dirs if not d.startswith(".")]
        for f in files:
            if any(f.endswith(ext) for ext in WATCH_EXT):
                path = os.path.join(root, f)
                current[path] = hash_file(path)

    for path, h in current.items():
        if path not in state:
            print(f"NEW: {path}")
        elif state[path] != h:
            print(f"CHANGED: {path}")
    for path in state:
        if path not in current:
            print(f"DELETED: {path}")
    state = current
PYEOF
```

### Retry with backoff

```python
python3 -c "
import time, random

def retry(fn, max_attempts=5, base_delay=1):
    for attempt in range(1, max_attempts + 1):
        try:
            return fn()
        except Exception as e:
            if attempt == max_attempts:
                raise
            delay = base_delay * (2 ** (attempt - 1)) + random.uniform(0, 1)
            print(f'Attempt {attempt} failed: {e}. Retrying in {delay:.1f}s...')
            time.sleep(delay)

# Usage:
# result = retry(lambda: requests.get('https://api.example.com/data').json())
"
```

### Simple HTTP server for webhooks

```python
python3 << 'PYEOF'
from http.server import HTTPServer, BaseHTTPRequestHandler
import json

class WebhookHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length)
        try:
            data = json.loads(body)
        except:
            data = body.decode()

        print(f"Webhook received: {self.path}")
        print(json.dumps(data, indent=2) if isinstance(data, dict) else data)

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(b'{"ok": true}')

    def log_message(self, format, *args):
        pass  # Suppress default logging

port = 8888
print(f"Webhook listener on http://localhost:{port}")
HTTPServer(("", port), WebhookHandler).serve_forever()
PYEOF
```

---

## Notification patterns

### macOS notifications

```bash
osascript -e 'display notification "Task complete" with title "Oni" sound name "Glass"'
```

### Send via Oni channel

Use the `message` tool to send notifications through any connected channel:

```
message(send, {
  channel: "telegram",
  text: "Backup completed successfully at $(date)"
})
```

---

## Common automation recipes

### Database backup

```bash
#!/usr/bin/env bash
BACKUP_DIR=~/backups/db
mkdir -p "$BACKUP_DIR"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# PostgreSQL
pg_dump -h localhost -U user dbname | gzip > "$BACKUP_DIR/db_${TIMESTAMP}.sql.gz"

# Cleanup old backups (keep 7 days)
find "$BACKUP_DIR" -name "*.gz" -mtime +7 -delete
echo "Backup saved: db_${TIMESTAMP}.sql.gz"
```

### Log rotation

```bash
#!/usr/bin/env bash
LOG_DIR=/tmp/oni
MAX_AGE_DAYS=7

find "$LOG_DIR" -name "*.log" -mtime +"$MAX_AGE_DAYS" -exec gzip {} \;
find "$LOG_DIR" -name "*.log.gz" -mtime +30 -delete
echo "Rotated logs older than ${MAX_AGE_DAYS} days"
```

### Git automation

```bash
#!/usr/bin/env bash
# Auto-commit and push changes
cd "${1:-.}"
if [ -n "$(git status --porcelain)" ]; then
  git add -A
  git commit -m "auto: $(date '+%Y-%m-%d %H:%M') changes"
  git push
  echo "Pushed changes"
else
  echo "No changes to commit"
fi
```

---

## Best practices

1. Use `set -euo pipefail` in all bash scripts
2. Always add cleanup traps for temporary files
3. Log output with timestamps for debugging
4. Test on small inputs before running on full datasets
5. Add `--dry-run` flags to destructive scripts
6. Use Oni's `task` tool for multi-step workflows that need tracking
7. Use Oni's `cron` tool instead of system crontab for agent-integrated scheduling
8. Store secrets in environment variables, never in scripts
