---
name: web-scraping
description: Extract structured data from websites, APIs, and web pages. Covers fetching HTML, parsing with CSS selectors, handling pagination, extracting tables, downloading files, and working with REST APIs. Uses curl, Python, and jq.
metadata:
  {
    "oni":
      {
        "emoji": "🕷️",
        "always": true,
      },
  }
---

# Web Scraping

Extract structured data from websites, APIs, and web pages using standard CLI tools.

## Tool chain

| Tool | Purpose | Install |
| ---- | ------- | ------- |
| `curl` | Fetch pages, call APIs | Pre-installed |
| Python `urllib`/`html.parser` | Parse HTML (stdlib) | Pre-installed |
| `jq` | Parse JSON responses | `brew install jq` |
| `beautifulsoup4` | Advanced HTML parsing | `pip install beautifulsoup4` |
| `requests` | HTTP client | `pip install requests` |

## Quick recipes

### Fetch a web page

```bash
curl -sL "https://example.com" -o page.html
# With headers (useful for APIs):
curl -sL -H "Accept: application/json" "https://api.example.com/data"
```

### Extract text from HTML (no dependencies)

```python
python3 -c "
from html.parser import HTMLParser
from urllib.request import urlopen

class TextExtractor(HTMLParser):
    def __init__(self):
        super().__init__()
        self.text = []
        self.skip = False
    def handle_starttag(self, tag, attrs):
        if tag in ('script', 'style', 'nav', 'footer', 'header'):
            self.skip = True
    def handle_endtag(self, tag):
        if tag in ('script', 'style', 'nav', 'footer', 'header'):
            self.skip = False
    def handle_data(self, data):
        if not self.skip:
            text = data.strip()
            if text:
                self.text.append(text)

html = urlopen('https://example.com').read().decode()
parser = TextExtractor()
parser.feed(html)
print('\n'.join(parser.text))
"
```

### Extract all links from a page

```python
python3 -c "
from html.parser import HTMLParser
from urllib.request import urlopen
from urllib.parse import urljoin

class LinkExtractor(HTMLParser):
    def __init__(self, base):
        super().__init__()
        self.base = base
        self.links = []
    def handle_starttag(self, tag, attrs):
        if tag == 'a':
            for name, value in attrs:
                if name == 'href' and value:
                    self.links.append(urljoin(self.base, value))

url = 'https://example.com'
html = urlopen(url).read().decode()
parser = LinkExtractor(url)
parser.feed(html)
for link in parser.links:
    print(link)
"
```

### Extract HTML tables to CSV

```python
python3 -c "
from html.parser import HTMLParser
from urllib.request import urlopen
import csv, sys

class TableExtractor(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tables = []
        self.current_table = None
        self.current_row = None
        self.current_cell = ''
        self.in_cell = False
    def handle_starttag(self, tag, attrs):
        if tag == 'table':
            self.current_table = []
        elif tag in ('td', 'th') and self.current_table is not None:
            self.in_cell = True
            self.current_cell = ''
        elif tag == 'tr' and self.current_table is not None:
            self.current_row = []
    def handle_endtag(self, tag):
        if tag in ('td', 'th') and self.in_cell:
            self.in_cell = False
            if self.current_row is not None:
                self.current_row.append(self.current_cell.strip())
        elif tag == 'tr' and self.current_row is not None:
            if self.current_table is not None:
                self.current_table.append(self.current_row)
            self.current_row = None
        elif tag == 'table' and self.current_table is not None:
            self.tables.append(self.current_table)
            self.current_table = None
    def handle_data(self, data):
        if self.in_cell:
            self.current_cell += data

html = urlopen('URL_HERE').read().decode()
parser = TableExtractor()
parser.feed(html)
for i, table in enumerate(parser.tables):
    writer = csv.writer(sys.stdout)
    print(f'--- Table {i+1} ---')
    for row in table:
        writer.writerow(row)
"
```

### Download files

```bash
# Single file
curl -sLO "https://example.com/file.pdf"

# With custom name
curl -sL "https://example.com/file.pdf" -o custom_name.pdf

# Multiple files
for url in url1 url2 url3; do
  curl -sLO "$url"
done
```

---

## Working with REST APIs

### GET with JSON parsing

```bash
curl -s "https://api.example.com/data" | jq '.results[] | {name: .name, id: .id}'
```

### POST with JSON body

```bash
curl -s -X POST "https://api.example.com/data" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{"query": "search term"}'
```

### Paginated API

```python
python3 -c "
import json
from urllib.request import urlopen, Request

results = []
page = 1
while True:
    url = f'https://api.example.com/data?page={page}&per_page=100'
    req = Request(url, headers={'Accept': 'application/json'})
    data = json.loads(urlopen(req).read())
    if not data.get('results'):
        break
    results.extend(data['results'])
    page += 1
    if page > 50:  # safety limit
        break
print(f'Fetched {len(results)} total results')
print(json.dumps(results[:5], indent=2))
"
```

---

## Advanced scraping (with beautifulsoup4)

### Install

```bash
pip install beautifulsoup4 requests
```

### CSS selector extraction

```python
python3 -c "
import requests
from bs4 import BeautifulSoup

resp = requests.get('https://example.com')
soup = BeautifulSoup(resp.text, 'html.parser')

# Extract by CSS selector
for item in soup.select('.article-title'):
    print(item.get_text(strip=True))

# Extract specific attributes
for img in soup.select('img[src]'):
    print(img['src'])
"
```

---

## Best practices

1. Always respect `robots.txt` -- check before scraping
2. Add delays between requests: `time.sleep(1)` to avoid rate limiting
3. Set a reasonable User-Agent header
4. Cache responses locally to avoid re-fetching
5. Handle errors gracefully -- websites change structure
6. For JavaScript-heavy sites, consider using the `browser` tool instead
7. Check if an API exists before scraping HTML -- APIs are more reliable
8. Save raw HTML before parsing, so you can re-parse without re-fetching
