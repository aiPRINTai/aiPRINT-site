#!/usr/bin/env bash
# One-shot installer: points git at the in-repo .githooks directory.
# Run once after cloning the repo:  ./scripts/install-hooks.sh
# Safe to run multiple times.
set -euo pipefail

cd "$(dirname "$0")/.."
git config core.hooksPath .githooks
echo "✓ Git hooks path set to .githooks"
echo "  The pre-commit scanner will now block env files and obvious secret patterns."
echo "  Bypass (in emergencies only): git commit --no-verify"
