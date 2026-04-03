#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# 環境変数ロード
source ~/.secrets/ai.env
source ~/.secrets/social.env

# venv activate
source "$PROJECT_DIR/.venv/bin/activate"

# scan実行
cd "$PROJECT_DIR"
python main.py scan
