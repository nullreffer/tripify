#!/usr/bin/env bash
# One-time developer setup: install the custom git hooks from .githooks/
# Run this once after cloning: bash scripts/setup-hooks.sh

set -euo pipefail

REPO_ROOT="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
git -C "$REPO_ROOT" config core.hooksPath .githooks
echo "✓ Git hooks installed from .githooks/"
echo "  post-merge: auto-increments patch/minor/major version based on merge size"
