---
name: file-convert
description: Convert between file formats including images (PNG/JPG/WebP/SVG), audio (MP3/WAV/FLAC/M4A), video (MP4/WebM/GIF), documents (PDF/DOCX/MD/HTML), and data (CSV/JSON/XLSX/XML). Uses ffmpeg, ImageMagick, pandoc, and Python.
metadata:
  {
    "oni":
      {
        "emoji": "🔄",
        "always": true,
      },
  }
---

# File Conversion

Convert between file formats: images, audio, video, documents, and data.

## Tool chain

| Category | Tool | Install |
| -------- | ---- | ------- |
| Images | `magick` (ImageMagick) | `brew install imagemagick` |
| Images | `sips` (macOS built-in) | Pre-installed on macOS |
| Audio/Video | `ffmpeg` | `brew install ffmpeg` |
| Documents | `pandoc` | `brew install pandoc` |
| Data | Python stdlib | Pre-installed |

Check availability before using: `which ffmpeg`, `which magick`, `which pandoc`

---

## Image conversions

### Using sips (macOS, no install)

```bash
# PNG to JPEG
sips -s format jpeg input.png --out output.jpg

# Resize image
sips -Z 800 input.png --out resized.png  # max dimension 800px

# Get image info
sips -g all input.png
```

### Using ImageMagick

```bash
# PNG to JPG
magick input.png output.jpg

# JPG to WebP
magick input.jpg output.webp

# Resize
magick input.png -resize 800x600 output.png

# Batch convert
for f in *.png; do magick "$f" "${f%.png}.jpg"; done

# SVG to PNG (with specific size)
magick -density 300 input.svg -resize 1024x output.png

# Create thumbnail
magick input.jpg -thumbnail 200x200^ -gravity center -extent 200x200 thumb.jpg

# Compress JPEG
magick input.jpg -quality 80 compressed.jpg

# Convert to grayscale
magick input.png -colorspace Gray output.png
```

### Using Python (Pillow)

```bash
pip install Pillow
```

```python
python3 -c "
from PIL import Image
img = Image.open('input.png')
img.save('output.jpg', quality=85)
print(f'Converted: {img.size[0]}x{img.size[1]}')
"
```

---

## Audio conversions

### Using ffmpeg

```bash
# MP3 to WAV
ffmpeg -i input.mp3 output.wav

# WAV to MP3 (with bitrate)
ffmpeg -i input.wav -b:a 192k output.mp3

# M4A to MP3
ffmpeg -i input.m4a -codec:a libmp3lame -b:a 192k output.mp3

# FLAC to MP3
ffmpeg -i input.flac -b:a 320k output.mp3

# Extract audio from video
ffmpeg -i video.mp4 -vn -acodec libmp3lame -b:a 192k audio.mp3

# Trim audio (start at 30s, duration 60s)
ffmpeg -i input.mp3 -ss 30 -t 60 -c copy trimmed.mp3

# Merge audio files
ffmpeg -i "concat:file1.mp3|file2.mp3" -c copy merged.mp3

# Change sample rate
ffmpeg -i input.wav -ar 44100 output.wav

# Audio info
ffprobe -v quiet -print_format json -show_format -show_streams input.mp3
```

---

## Video conversions

### Using ffmpeg

```bash
# MP4 to WebM
ffmpeg -i input.mp4 -c:v libvpx-vp9 -crf 30 -b:v 0 output.webm

# Video to GIF (with optimization)
ffmpeg -i input.mp4 -vf "fps=10,scale=480:-1:flags=lanczos" -c:v gif output.gif

# Resize video
ffmpeg -i input.mp4 -vf scale=1280:720 -c:a copy output.mp4

# Compress video
ffmpeg -i input.mp4 -c:v libx264 -crf 23 -preset medium -c:a aac compressed.mp4

# Extract frames
ffmpeg -i input.mp4 -vf "fps=1" frame_%04d.png  # 1 frame per second

# Trim video
ffmpeg -i input.mp4 -ss 00:01:00 -to 00:02:00 -c copy trimmed.mp4

# Video info
ffprobe -v quiet -print_format json -show_format -show_streams input.mp4
```

---

## Document conversions

### Using pandoc

```bash
# Markdown to DOCX
pandoc input.md -o output.docx

# Markdown to PDF (needs LaTeX: brew install --cask mactex-no-gui)
pandoc input.md -o output.pdf

# Markdown to HTML (standalone with CSS)
pandoc input.md -s -o output.html

# DOCX to Markdown
pandoc input.docx -o output.md

# HTML to Markdown
pandoc input.html -o output.md

# DOCX to PDF
pandoc input.docx -o output.pdf

# Multiple files to single document
pandoc chapter1.md chapter2.md chapter3.md -o book.docx

# With table of contents
pandoc input.md --toc -o output.pdf
```

### Without pandoc (Python)

```python
python3 -c "
# Markdown to HTML (basic)
import re
with open('input.md') as f:
    md = f.read()

# Basic conversion
html = md
html = re.sub(r'^### (.+)$', r'<h3>\1</h3>', html, flags=re.M)
html = re.sub(r'^## (.+)$', r'<h2>\1</h2>', html, flags=re.M)
html = re.sub(r'^# (.+)$', r'<h1>\1</h1>', html, flags=re.M)
html = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', html)
html = re.sub(r'\*(.+?)\*', r'<em>\1</em>', html)
html = re.sub(r'\`(.+?)\`', r'<code>\1</code>', html)

# Wrap paragraphs
lines = html.split('\n\n')
html = '\n'.join(f'<p>{l}</p>' if not l.startswith('<h') else l for l in lines)

with open('output.html', 'w') as f:
    f.write(f'<!DOCTYPE html><html><body>{html}</body></html>')
print('Converted to HTML')
"
```

---

## Data format conversions

### CSV to JSON

```python
python3 -c "
import csv, json
with open('input.csv') as f:
    data = list(csv.DictReader(f))
with open('output.json', 'w') as f:
    json.dump(data, f, indent=2)
print(f'Converted {len(data)} rows')
"
```

### JSON to CSV

```python
python3 -c "
import csv, json
with open('input.json') as f:
    data = json.load(f)
if isinstance(data, list) and data:
    with open('output.csv', 'w', newline='') as f:
        w = csv.DictWriter(f, fieldnames=data[0].keys())
        w.writeheader()
        w.writerows(data)
    print(f'Converted {len(data)} records')
"
```

### XML to JSON

```python
python3 -c "
import xml.etree.ElementTree as ET
import json

def xml_to_dict(elem):
    d = {}
    if elem.attrib:
        d['@attributes'] = elem.attrib
    if elem.text and elem.text.strip():
        d['#text'] = elem.text.strip()
    for child in elem:
        child_dict = xml_to_dict(child)
        if child.tag in d:
            if not isinstance(d[child.tag], list):
                d[child.tag] = [d[child.tag]]
            d[child.tag].append(child_dict)
        else:
            d[child.tag] = child_dict
    return d or elem.text

tree = ET.parse('input.xml')
result = {tree.getroot().tag: xml_to_dict(tree.getroot())}
with open('output.json', 'w') as f:
    json.dump(result, f, indent=2)
print('Converted XML to JSON')
"
```

### YAML to JSON

```bash
python3 -c "import yaml, json; print(json.dumps(yaml.safe_load(open('input.yaml')), indent=2))" > output.json
```

---

## Best practices

1. Always check tool availability: `which ffmpeg`, `which pandoc`, `which magick`
2. Back up originals before converting: `cp input.ext input.ext.bak`
3. Verify output after conversion -- check file size isn't zero
4. For batch operations, test on one file first
5. Use lossless formats (PNG, FLAC, WAV) for intermediate steps
6. Specify quality/bitrate explicitly to avoid surprises
