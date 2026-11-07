#!/usr/bin/env bash
# Remove the background from a character image, producing a transparent PNG.
#
# Usage: remove-bg.sh <input image> <output.png>
#
# Uses the macOS Vision foreground mask (macOS 14+) when available, compiled
# once into a cache. Falls back to rembg (open source segmentation) elsewhere.
# Both only mask existing pixels; nothing is generated.
set -euo pipefail

if [ $# -ne 2 ]; then
  echo "usage: $0 <input image> <output.png>" >&2
  exit 2
fi
input="$1"
output="$2"
here="$(cd "$(dirname "$0")" && pwd)"

if [ "$(uname)" = "Darwin" ] && command -v swiftc >/dev/null 2>&1; then
  cache="${XDG_CACHE_HOME:-$HOME/.cache}/make-thumbnail"
  bin="$cache/remove-bg"
  src="$here/remove-bg.swift"
  mkdir -p "$cache"
  if [ ! -x "$bin" ] || [ "$src" -nt "$bin" ]; then
    echo "compiling $src" >&2
    swiftc -O -o "$bin" "$src"
  fi
  exec "$bin" "$input" "$output"
fi

if ! command -v rembg >/dev/null 2>&1; then
  echo "rembg is not installed. Install it with:" >&2
  echo "  pipx install 'rembg[cli]'" >&2
  exit 1
fi
rembg i -m isnet-general-use "$input" "$output"
echo "$output"
