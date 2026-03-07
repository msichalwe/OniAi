---
name: data-analysis
description: Analyze datasets, compute statistics, generate reports, and visualize data using Python (pandas, matplotlib) or lightweight stdlib alternatives. Covers CSV/JSON/Excel ingestion, aggregation, filtering, pivoting, and chart generation.
metadata:
  {
    "oni":
      {
        "emoji": "📊",
        "always": true,
      },
  }
---

# Data Analysis

Analyze datasets, compute statistics, generate reports, and visualize data.

## Strategy

For quick stats on small data, use Python stdlib (`csv`, `statistics`, `collections`). For larger or complex analysis, use `pandas` + `matplotlib`. Always check what's available before installing.

## Tool chain

| Tool | Purpose | Install |
| ---- | ------- | ------- |
| Python `csv` | Read/write CSV | stdlib |
| Python `statistics` | Mean, median, stdev | stdlib |
| Python `collections` | Counter, groupby | stdlib |
| `pandas` | DataFrames, aggregation, pivots | `pip install pandas` |
| `matplotlib` | Charts and plots | `pip install matplotlib` |
| `openpyxl` | Excel read/write | `pip install openpyxl` |

## Quick analysis (no dependencies)

### Summary stats from CSV

```python
python3 -c "
import csv, statistics
from collections import Counter

with open('data.csv') as f:
    reader = csv.DictReader(f)
    rows = list(reader)

print(f'Rows: {len(rows)}')
print(f'Columns: {list(rows[0].keys()) if rows else \"(empty)\"}')

# Numeric column stats
col = 'amount'  # change to your column
values = [float(r[col]) for r in rows if r.get(col, '').strip()]
if values:
    print(f'\n{col}:')
    print(f'  Count: {len(values)}')
    print(f'  Min: {min(values)}')
    print(f'  Max: {max(values)}')
    print(f'  Mean: {statistics.mean(values):.2f}')
    print(f'  Median: {statistics.median(values):.2f}')
    if len(values) > 1:
        print(f'  Stdev: {statistics.stdev(values):.2f}')

# Categorical column distribution
cat_col = 'category'  # change to your column
counts = Counter(r.get(cat_col, '') for r in rows)
print(f'\n{cat_col} distribution:')
for val, cnt in counts.most_common(10):
    print(f'  {val}: {cnt}')
"
```

### Group-by aggregation (no pandas)

```python
python3 -c "
import csv
from collections import defaultdict

with open('data.csv') as f:
    rows = list(csv.DictReader(f))

groups = defaultdict(list)
for r in rows:
    groups[r['category']].append(float(r['amount']))

print('Category | Count | Sum | Avg')
print('-' * 40)
for key in sorted(groups):
    vals = groups[key]
    print(f'{key:15s} | {len(vals):5d} | {sum(vals):10.2f} | {sum(vals)/len(vals):8.2f}')
"
```

---

## Pandas analysis

### Install

```bash
pip install pandas openpyxl matplotlib
```

### Load and explore

```python
python3 -c "
import pandas as pd

df = pd.read_csv('data.csv')  # or pd.read_excel('data.xlsx')
print(df.shape)
print(df.dtypes)
print(df.describe())
print(df.head(10))
print(f'\nNull counts:\n{df.isnull().sum()}')
"
```

### Filter and aggregate

```python
python3 -c "
import pandas as pd

df = pd.read_csv('data.csv')

# Filter
filtered = df[df['amount'] > 1000]
print(f'Rows with amount > 1000: {len(filtered)}')

# Group and aggregate
summary = df.groupby('category').agg(
    count=('amount', 'count'),
    total=('amount', 'sum'),
    average=('amount', 'mean'),
    median=('amount', 'median'),
).round(2).sort_values('total', ascending=False)
print(summary)
"
```

### Pivot table

```python
python3 -c "
import pandas as pd

df = pd.read_csv('data.csv')
pivot = pd.pivot_table(
    df,
    values='amount',
    index='category',
    columns='month',
    aggfunc='sum',
    fill_value=0,
)
print(pivot)
"
```

### Time series analysis

```python
python3 -c "
import pandas as pd

df = pd.read_csv('data.csv', parse_dates=['date'])
df = df.set_index('date').sort_index()

# Resample to monthly
monthly = df['amount'].resample('ME').agg(['sum', 'mean', 'count'])
print(monthly)

# Rolling average
df['rolling_7d'] = df['amount'].rolling(7).mean()
print(df[['amount', 'rolling_7d']].tail(20))
"
```

---

## Chart generation

### Bar chart

```python
python3 << 'EOF'
import pandas as pd
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

df = pd.read_csv('data.csv')
summary = df.groupby('category')['amount'].sum().sort_values(ascending=False)

fig, ax = plt.subplots(figsize=(10, 6))
summary.plot(kind='bar', ax=ax, color='#4472C4')
ax.set_title('Total by Category')
ax.set_ylabel('Amount')
plt.xticks(rotation=45, ha='right')
plt.tight_layout()
plt.savefig('chart.png', dpi=150)
print('Saved chart.png')
EOF
```

### Line chart (time series)

```python
python3 << 'EOF'
import pandas as pd
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

df = pd.read_csv('data.csv', parse_dates=['date'])
df = df.set_index('date').sort_index()
monthly = df['amount'].resample('ME').sum()

fig, ax = plt.subplots(figsize=(12, 6))
monthly.plot(ax=ax, marker='o', color='#4472C4')
ax.set_title('Monthly Trend')
ax.set_ylabel('Amount')
ax.grid(True, alpha=0.3)
plt.tight_layout()
plt.savefig('trend.png', dpi=150)
print('Saved trend.png')
EOF
```

### Pie chart

```python
python3 << 'EOF'
import pandas as pd
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

df = pd.read_csv('data.csv')
dist = df['category'].value_counts().head(8)

fig, ax = plt.subplots(figsize=(8, 8))
dist.plot(kind='pie', ax=ax, autopct='%1.1f%%')
ax.set_ylabel('')
ax.set_title('Distribution by Category')
plt.tight_layout()
plt.savefig('distribution.png', dpi=150)
print('Saved distribution.png')
EOF
```

---

## Export results

### To Excel with formatting

```python
python3 -c "
import pandas as pd

df = pd.read_csv('data.csv')
summary = df.groupby('category').agg(count=('amount', 'count'), total=('amount', 'sum')).round(2)

with pd.ExcelWriter('report.xlsx', engine='openpyxl') as writer:
    df.to_excel(writer, sheet_name='Raw Data', index=False)
    summary.to_excel(writer, sheet_name='Summary')
print('Saved report.xlsx')
"
```

### To Markdown table

```python
python3 -c "
import pandas as pd

df = pd.read_csv('data.csv')
summary = df.groupby('category')['amount'].agg(['count', 'sum', 'mean']).round(2)
print(summary.to_markdown())
"
```

---

## Best practices

1. Always explore data first (shape, dtypes, nulls, head) before analysis
2. Handle missing values explicitly -- don't let NaN propagate silently
3. For large files (>100MB), use `chunksize` parameter in `pd.read_csv`
4. Save intermediate results to avoid re-computation
5. Use `Agg` backend for matplotlib when generating images headlessly
6. Round numeric output to sensible precision
7. When sending charts to chat, save as PNG and reference the file path
