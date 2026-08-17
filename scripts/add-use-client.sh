#!/usr/bin/env bash
# Prepend 'use client' to component modules if missing (run once after pull).
set -euo pipefail
for f in src/components/Header.tsx src/components/StatusCards.tsx src/components/ProjectList.tsx src/components/ProjectDrawer.tsx src/store/useProjectStore.ts; do
  if [[ -f "$f" ]] && ! head -1 "$f" | grep -q "use client"; then
    printf "%s\n\n%s\n" "'use client';" "$(cat "$f")" > "$f.tmp"
    mv "$f.tmp" "$f"
    echo "added use client → $f"
  else
    echo "skip $f"
  fi
done
