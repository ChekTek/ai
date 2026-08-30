#!/usr/bin/env bash
# Publish this repo's config from Git Bash (or MSYS2/Cygwin) on Windows.
# Thin wrapper around update-config.sh: without it, `ln -s` on Windows silently
# creates file copies instead of symbolic links, which breaks the additive
# ownership model. This forces native Windows symlinks, verifies they can be
# created, then delegates. Accepts the same flags (--clean, --yes, --help).
#
# Creating symbolic links requires Windows Developer Mode or an elevated
# (Administrator) shell.
set -euo pipefail

case "$(uname -s)" in
  MINGW* | MSYS*)
    export MSYS="${MSYS:+$MSYS }winsymlinks:nativestrict"
    ;;
  CYGWIN*)
    export CYGWIN="${CYGWIN:+$CYGWIN }winsymlinks:nativestrict"
    ;;
  *)
    echo "this wrapper is for bash on Windows; run update-config.sh directly" >&2
    exit 2
    ;;
esac

probe_dir="$(mktemp -d)"
if ! ln -s "$probe_dir" "$probe_dir/link-probe" 2>/dev/null; then
  rm -rf "$probe_dir"
  echo "cannot create Windows symbolic links from this shell" >&2
  echo "enable Developer Mode (Settings > System > For developers) or use an elevated shell, then retry" >&2
  exit 1
fi
rm -rf "$probe_dir"

exec "$(dirname "${BASH_SOURCE[0]}")/update-config.sh" "$@"
