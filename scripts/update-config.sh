#!/usr/bin/env bash
# Symlink this repo's rules and skills into the user-level ~/.claude folder.
# Additive: existing non-link files/dirs are left untouched; our own links are
# refreshed. Safe to re-run anytime (e.g. after `git pull`).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$REPO_ROOT/.claude"
DEST="$HOME/.claude"

link_kind() {
  kind="$1"
  mkdir -p "$DEST/$kind"
  for item in "$SRC/$kind"/*; do
    [ -e "$item" ] || continue # skip if the glob matched nothing
    name="$(basename "$item")"
    target="$DEST/$kind/$name"
    if [ -L "$target" ]; then
      ln -sfn "$item" "$target"
      echo "updated: $kind/$name"
    elif [ -e "$target" ]; then
      echo "skip existing: $kind/$name"
    else
      ln -s "$item" "$target"
      echo "linked: $kind/$name"
    fi
  done
}

link_kind rules
link_kind skills
