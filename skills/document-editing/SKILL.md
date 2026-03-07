---
name: document-editing
description: Edit and create DOCX, Excel (XLSX/XLS), CSV, JSON, XML, HTML, and Markdown documents. Covers reading, writing, converting, and transforming office documents using CLI tools (python-docx, openpyxl, pandoc, csvkit, jq, xmlstarlet).
metadata:
  {
    "oni":
      {
        "emoji": "📝",
        "always": true,
      },
  }
---

# Document Editing

Create, read, edit, and convert office documents: DOCX, Excel (XLSX), CSV, JSON, XML, HTML, Markdown, and plain text.

## Strategy

For document editing, prefer lightweight inline Python scripts via `exec` over installing heavy CLI tools. Python 3 (available on most systems) with its standard library handles CSV, JSON, and XML natively. For DOCX and XLSX, use `python-docx` and `openpyxl` (install via pip/uv if needed).

## Tool chain

| Format | Read | Write/Edit | Convert | Tool |
| ------ | ---- | ---------- | ------- | ---- |
| DOCX | Yes | Yes | Yes | `python-docx` (pip) |
| XLSX/XLS | Yes | Yes | Yes | `openpyxl` (pip) |
| CSV | Yes | Yes | Yes | Python `csv` (stdlib) or `csvkit` |
| JSON | Yes | Yes | Yes | Python `json` (stdlib) or `jq` |
| XML | Yes | Yes | Yes | Python `xml.etree` (stdlib) or `xmlstarlet` |
| HTML | Yes | Yes | Yes | Python `html.parser` (stdlib) |
| Markdown | Yes | Yes | Yes | Direct text manipulation |
| PDF | Read | Edit | Yes | `nano-pdf` skill or `pdftotext` |
| Plain text | Yes | Yes | N/A | Direct file I/O |

## DOCX editing

### Install (one-time)

```bash
pip install python-docx
# or: uv pip install python-docx
```

### Read a DOCX

```python
python3 -c "
from docx import Document
doc = Document('input.docx')
for i, para in enumerate(doc.paragraphs):
    print(f'{i}: [{para.style.name}] {para.text}')
"
```

### Create a DOCX

```python
python3 -c "
from docx import Document
from docx.shared import Pt, Inches
from docx.enum.text import WD_ALIGN_PARAGRAPH

doc = Document()

# Title
title = doc.add_heading('Document Title', level=0)

# Paragraph with formatting
p = doc.add_paragraph()
run = p.add_run('Bold text')
run.bold = True
p.add_run(' and normal text.')

# Table
table = doc.add_table(rows=3, cols=3)
table.style = 'Table Grid'
for i, row in enumerate(table.rows):
    for j, cell in enumerate(row.cells):
        cell.text = f'Row {i+1}, Col {j+1}'

# Image (if available)
# doc.add_picture('image.png', width=Inches(4))

doc.save('output.docx')
print('Created output.docx')
"
```

### Edit a DOCX (find and replace)

```python
python3 -c "
from docx import Document
import sys

doc = Document('input.docx')
old_text = 'OLD_TEXT'
new_text = 'NEW_TEXT'
count = 0

for para in doc.paragraphs:
    if old_text in para.text:
        for run in para.runs:
            if old_text in run.text:
                run.text = run.text.replace(old_text, new_text)
                count += 1

for table in doc.tables:
    for row in table.rows:
        for cell in row.cells:
            for para in cell.paragraphs:
                for run in para.runs:
                    if old_text in run.text:
                        run.text = run.text.replace(old_text, new_text)
                        count += 1

doc.save('output.docx')
print(f'Replaced {count} occurrences. Saved to output.docx')
"
```

### Add content to existing DOCX

```python
python3 -c "
from docx import Document

doc = Document('existing.docx')
doc.add_heading('New Section', level=1)
doc.add_paragraph('New content goes here.')
doc.save('existing.docx')
print('Updated existing.docx')
"
```

---

## Excel (XLSX) editing

### Install (one-time)

```bash
pip install openpyxl
# or: uv pip install openpyxl
```

### Read an Excel file

```python
python3 -c "
from openpyxl import load_workbook

wb = load_workbook('input.xlsx')
for sheet_name in wb.sheetnames:
    ws = wb[sheet_name]
    print(f'=== Sheet: {sheet_name} ({ws.max_row} rows x {ws.max_column} cols) ===')
    for row in ws.iter_rows(min_row=1, max_row=min(ws.max_row, 20), values_only=False):
        print([cell.value for cell in row])
"
```

### Create an Excel file

```python
python3 -c "
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side

wb = Workbook()
ws = wb.active
ws.title = 'Report'

# Header row with styling
headers = ['Name', 'Department', 'Salary', 'Start Date']
header_font = Font(bold=True, size=12)
header_fill = PatternFill(start_color='4472C4', end_color='4472C4', fill_type='solid')
header_font_white = Font(bold=True, size=12, color='FFFFFF')

for col, header in enumerate(headers, 1):
    cell = ws.cell(row=1, column=col, value=header)
    cell.font = header_font_white
    cell.fill = header_fill
    cell.alignment = Alignment(horizontal='center')

# Data rows
data = [
    ['Alice', 'Engineering', 95000, '2023-01-15'],
    ['Bob', 'Marketing', 72000, '2022-06-01'],
    ['Charlie', 'Engineering', 88000, '2023-03-20'],
]
for row_idx, row_data in enumerate(data, 2):
    for col_idx, value in enumerate(row_data, 1):
        ws.cell(row=row_idx, column=col_idx, value=value)

# Auto-fit column widths (approximate)
for col in ws.columns:
    max_length = max(len(str(cell.value or '')) for cell in col)
    ws.column_dimensions[col[0].column_letter].width = max_length + 4

# Add a formula
ws.cell(row=len(data)+2, column=3, value='=AVERAGE(C2:C4)')
ws.cell(row=len(data)+2, column=2, value='Average Salary:')

wb.save('output.xlsx')
print('Created output.xlsx')
"
```

### Edit Excel cells

```python
python3 -c "
from openpyxl import load_workbook

wb = load_workbook('input.xlsx')
ws = wb.active

# Edit specific cell
ws['B2'] = 'New Value'

# Edit by row/col
ws.cell(row=3, column=4, value='Updated')

# Add new row
ws.append(['New', 'Row', 'Data', 'Here'])

wb.save('output.xlsx')
print('Updated output.xlsx')
"
```

### Excel formulas and charts

```python
python3 -c "
from openpyxl import Workbook
from openpyxl.chart import BarChart, Reference

wb = Workbook()
ws = wb.active
ws.title = 'Sales'

# Data
ws.append(['Month', 'Revenue'])
for month, rev in [('Jan', 10000), ('Feb', 12000), ('Mar', 15000), ('Apr', 11000)]:
    ws.append([month, rev])

# SUM formula
ws.cell(row=6, column=1, value='Total')
ws.cell(row=6, column=2, value='=SUM(B2:B5)')

# Chart
chart = BarChart()
chart.title = 'Monthly Revenue'
chart.y_axis.title = 'Revenue'
data = Reference(ws, min_col=2, min_row=1, max_row=5)
cats = Reference(ws, min_col=1, min_row=2, max_row=5)
chart.add_data(data, titles_from_data=True)
chart.set_categories(cats)
ws.add_chart(chart, 'D2')

wb.save('sales_report.xlsx')
print('Created sales_report.xlsx with chart')
"
```

---

## CSV editing

CSV is handled natively by Python -- no installs needed.

### Read CSV

```python
python3 -c "
import csv
with open('data.csv') as f:
    reader = csv.DictReader(f)
    for i, row in enumerate(reader):
        if i < 10:  # first 10 rows
            print(dict(row))
    print(f'Total rows: {i+1}')
"
```

### Create CSV

```python
python3 -c "
import csv
with open('output.csv', 'w', newline='') as f:
    writer = csv.writer(f)
    writer.writerow(['Name', 'Age', 'City'])
    writer.writerow(['Alice', 30, 'NYC'])
    writer.writerow(['Bob', 25, 'LA'])
print('Created output.csv')
"
```

### Filter/transform CSV

```python
python3 -c "
import csv
with open('input.csv') as fin, open('filtered.csv', 'w', newline='') as fout:
    reader = csv.DictReader(fin)
    writer = csv.DictWriter(fout, fieldnames=reader.fieldnames)
    writer.writeheader()
    for row in reader:
        if int(row.get('age', 0)) > 25:  # example filter
            writer.writerow(row)
print('Filtered CSV saved to filtered.csv')
"
```

### CSV to Excel conversion

```python
python3 -c "
import csv
from openpyxl import Workbook

wb = Workbook()
ws = wb.active
with open('input.csv') as f:
    for row in csv.reader(f):
        ws.append(row)
wb.save('output.xlsx')
print('Converted CSV to Excel')
"
```

---

## JSON editing

JSON is handled natively by Python. For shell one-liners, `jq` is also excellent.

### Read/pretty-print JSON

```bash
python3 -c "import json; print(json.dumps(json.load(open('data.json')), indent=2))"
# or with jq:
jq '.' data.json
```

### Edit JSON

```python
python3 -c "
import json
with open('data.json') as f:
    data = json.load(f)
data['key'] = 'new_value'
data.setdefault('new_section', {})['nested'] = True
with open('data.json', 'w') as f:
    json.dump(data, f, indent=2)
print('Updated data.json')
"
```

### JSON to CSV

```python
python3 -c "
import json, csv
with open('data.json') as f:
    data = json.load(f)
if isinstance(data, list) and data:
    keys = list(data[0].keys())
    with open('output.csv', 'w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=keys)
        writer.writeheader()
        writer.writerows(data)
    print(f'Converted {len(data)} records to CSV')
"
```

---

## XML editing

XML is handled by Python's `xml.etree.ElementTree` (stdlib).

### Read XML

```python
python3 -c "
import xml.etree.ElementTree as ET
tree = ET.parse('data.xml')
root = tree.getroot()
print(f'Root: {root.tag}')
for child in root:
    print(f'  {child.tag}: {child.text} {child.attrib}')
"
```

### Edit XML

```python
python3 -c "
import xml.etree.ElementTree as ET
tree = ET.parse('data.xml')
root = tree.getroot()

# Find and edit
for elem in root.iter('target_tag'):
    elem.text = 'new value'
    elem.set('attribute', 'new_attr_value')

# Add new element
new = ET.SubElement(root, 'new_element')
new.text = 'content'

tree.write('output.xml', encoding='unicode', xml_declaration=True)
print('Updated XML')
"
```

---

## Format conversions

### Pandoc (universal converter)

If `pandoc` is available, it handles many conversions:

```bash
# Markdown to DOCX
pandoc input.md -o output.docx

# DOCX to Markdown
pandoc input.docx -o output.md

# HTML to DOCX
pandoc input.html -o output.docx

# Markdown to HTML
pandoc input.md -o output.html

# Markdown to PDF (requires LaTeX)
pandoc input.md -o output.pdf
```

### Without pandoc

Use Python scripts above to read one format and write another. Common patterns:

- CSV to XLSX: read with `csv`, write with `openpyxl`
- XLSX to CSV: read with `openpyxl`, write with `csv`
- JSON to XLSX: read with `json`, write with `openpyxl`
- DOCX to plain text: read with `python-docx`, extract paragraph texts

---

## Best practices

1. Always back up original files before editing: `cp file.docx file.docx.bak`
2. Verify output after editing -- open or re-read the file to confirm changes
3. For large Excel files (>10k rows), use `read_only=True` mode in openpyxl
4. When editing DOCX, preserve formatting by editing run text, not paragraph text
5. For CSV with special characters, always specify encoding: `encoding='utf-8'`
6. Check if tools are installed before using them: `which pandoc`, `python3 -c "import openpyxl"`
7. Install missing packages with: `pip install python-docx openpyxl` or `uv pip install python-docx openpyxl`
