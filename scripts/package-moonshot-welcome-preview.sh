#!/usr/bin/env bash
set -euo pipefail

repo=$(git rev-parse --show-toplevel)
revision=$(git -C "$repo" rev-parse --verify "${1:-HEAD}^{commit}")
media=(
  public/campus/arrival/team-leader-telegram.mp4
  public/campus/arrival/mask-example-silent.mp4
)

for file in "${media[@]}"; do
  if [[ ! -s "$repo/$file" ]]; then
    printf 'Missing Moonshot preview video: %s\n' "$file" >&2
    exit 1
  fi
done

staging=$(mktemp -d "${TMPDIR:-/tmp}/moonshot-welcome-preview.XXXXXXXX")
git -C "$repo" archive "$revision" | tar -x -C "$staging"
for file in "${media[@]}"; do
  install -m 644 "$repo/$file" "$staging/$file"
done
printf '%s\n' "$staging"
