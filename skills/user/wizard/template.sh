#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${ENV_FILE:-.env}"
STAGE=0
STEP=0
SUMMARY=""
# Counts the stage calls below: lines starting with "stage ". The function
# definition "stage() {" has no space after the name, so it is not counted.
TOTAL=$(grep -c '^stage ' "$0")

stage() {
  if ((STAGE > 0)); then
    read -r -p $'\nPress Enter to continue ' _
  fi
  STAGE=$((STAGE + 1))
  STEP=0
  clear || true
  printf '\033[1m[%d/%d] %s\033[0m\n\n' "$STAGE" "$TOTAL" "$1"
}

step() {
  STEP=$((STEP + 1))
  printf '  %d. %s\n' "$STEP" "$1"
}

open_url() {
  printf '  %s\n\n' "$1"
  if [[ -n "${WSL_DISTRO_NAME:-}" || "$OSTYPE" == msys* || "$OSTYPE" == cygwin* ]]; then
    rundll32.exe url.dll,FileProtocolHandler "$1"
  elif [[ "$OSTYPE" == darwin* ]]; then
    open "$1"
  else
    xdg-open "$1"
  fi >/dev/null 2>&1 || true
}

ask() {
  local input=""
  until [[ -n "$input" ]]; do
    read -r -p "$2: " input
  done
  printf -v "$1" '%s' "$input"
}

ask_secret() {
  local input=""
  until [[ -n "$input" ]]; do
    read -r -s -p "$2 (hidden): " input
    echo
  done
  printf -v "$1" '%s' "$input"
}

confirm() {
  local answer=""
  read -r -p "$1 [y/N] " answer
  [[ "$answer" == [yY]* ]] || exit 1
}

saved() {
  printf '  saved %s\n' "$1"
  SUMMARY+="  $1"$'\n'
}

write_env() {
  local line="" tmp
  tmp="$(mktemp)"
  if [[ -f "$ENV_FILE" ]]; then
    while IFS= read -r line || [[ -n "$line" ]]; do
      [[ "$line" == "$1="* ]] || printf '%s\n' "$line"
    done <"$ENV_FILE" >"$tmp"
  fi
  printf '%s=%s\n' "$1" "$2" >>"$tmp"
  mv "$tmp" "$ENV_FILE"
  saved "$1 in $ENV_FILE"
}

set_secret() {
  printf '%s' "$2" | gh secret set "$1"
  saved "$1 as a GitHub secret"
}

set_var() {
  gh variable set "$1" --body "$2"
  saved "$1 as a GitHub variable"
}

summary() {
  local status=$?
  if ((status == 0)); then
    printf '\nDone.\n'
  else
    printf '\nStopped at stage %d of %d.\n' "$STAGE" "$TOTAL"
  fi
  printf '%s' "$SUMMARY"
}
trap summary EXIT

# ---- STAGES: edit only below this line ----

gh auth status >/dev/null

stage "Create an API key"
open_url "https://example.com/settings/keys"
step "Create a key named 'local-dev'."
step "Copy it; it is shown only once."
ask_secret API_KEY "API key"
write_env EXAMPLE_API_KEY "$API_KEY"
set_secret EXAMPLE_API_KEY "$API_KEY"
