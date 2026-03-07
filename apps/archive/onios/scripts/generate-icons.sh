#!/bin/bash
# Generate app icons from the SVG favicon
# Requires: sips (macOS built-in), iconutil (macOS built-in)

set -e
cd "$(dirname "$0")/.."

ICON_DIR="build/icons"
mkdir -p "$ICON_DIR"

# First create a 1024x1024 PNG from the SVG using sips or a simple approach
# Since sips can't handle SVG directly, we'll use a Python one-liner or just
# create a simple PNG programmatically

echo "Creating icon PNG..."

# Use Python to render SVG to PNG (most macOS have Python3)
python3 -c "
import subprocess, os, tempfile

# Create a simple 1024x1024 PNG icon using macOS screencapture or sips
# Since we can't easily render SVG, create a solid icon programmatically

# Method: Use the built-in macOS 'qlmanage' to render SVG
svg_path = 'public/favicon.svg'
out_path = 'build/icons/icon-1024.png'

# Try qlmanage first (macOS Quick Look)
try:
    subprocess.run(['qlmanage', '-t', '-s', '1024', '-o', 'build/icons/', svg_path],
                   capture_output=True, timeout=10)
    # qlmanage outputs as favicon.svg.png
    ql_out = 'build/icons/favicon.svg.png'
    if os.path.exists(ql_out):
        os.rename(ql_out, out_path)
        print(f'Created {out_path} via qlmanage')
    else:
        raise Exception('qlmanage output not found')
except Exception as e:
    print(f'qlmanage failed: {e}, trying rsvg-convert...')
    try:
        subprocess.run(['rsvg-convert', '-w', '1024', '-h', '1024', svg_path, '-o', out_path],
                       check=True, capture_output=True)
        print(f'Created {out_path} via rsvg-convert')
    except Exception:
        print('Warning: Could not render SVG to PNG. Using placeholder.')
        # Create a minimal valid PNG (1x1 transparent)
        import struct, zlib
        def create_png(w, h, color):
            def chunk(ctype, data):
                c = ctype + data
                return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)
            raw = b''
            for y in range(h):
                raw += b'\x00' + bytes(color) * w
            return (b'\x89PNG\r\n\x1a\n' +
                    chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0)) +
                    chunk(b'IDAT', zlib.compress(raw)) +
                    chunk(b'IEND', b''))
        with open(out_path, 'wb') as f:
            f.write(create_png(256, 256, [26, 26, 46, 255]))
        print(f'Created placeholder {out_path}')
" 2>&1

ICON_1024="$ICON_DIR/icon-1024.png"

if [ ! -f "$ICON_1024" ]; then
    echo "Error: Could not generate icon PNG"
    exit 1
fi

echo "Creating macOS .icns..."

# Create iconset directory
ICONSET="$ICON_DIR/OniOS.iconset"
rm -rf "$ICONSET"
mkdir -p "$ICONSET"

# Generate all required sizes using sips
for size in 16 32 64 128 256 512; do
    sips -z $size $size "$ICON_1024" --out "$ICONSET/icon_${size}x${size}.png" > /dev/null 2>&1
    double=$((size * 2))
    sips -z $double $double "$ICON_1024" --out "$ICONSET/icon_${size}x${size}@2x.png" > /dev/null 2>&1
done

# Create .icns
iconutil -c icns "$ICONSET" -o "$ICON_DIR/icon.icns" 2>/dev/null && echo "Created icon.icns" || echo "iconutil failed (non-macOS?)"

# Create ico for Windows (just copy the 256px PNG as a placeholder)
cp "$ICONSET/icon_256x256.png" "$ICON_DIR/icon.png"
echo "Created icon.png (256x256)"

echo "Done! Icons in $ICON_DIR/"
ls -la "$ICON_DIR/"
