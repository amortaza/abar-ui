#!/usr/bin/env bash
# gc.sh <commit-message> — stage all changes and commit them.
set -euo pipefail

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 <commit-message>" >&2
  exit 1
fi

git add .
git commit -m "$*"
