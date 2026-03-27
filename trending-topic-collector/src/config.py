from __future__ import annotations

import os
from pathlib import Path

import yaml


_DEFAULT_CONFIG_PATH = Path(__file__).parent.parent / "config.yaml"


def load_config(path: str | Path | None = None) -> dict:
    """config.yamlを読み込んで辞書で返す。環境変数で上書き可能。"""
    p = Path(path) if path else _DEFAULT_CONFIG_PATH
    with open(p, encoding="utf-8") as f:
        cfg = yaml.safe_load(f)

    cfg.setdefault("notification", {}).setdefault("line", {})
    if os.environ.get("LINE_NOTIFY_TOKEN"):
        cfg["notification"]["line"]["token"] = os.environ["LINE_NOTIFY_TOKEN"]

    cfg.setdefault("sources", {}).setdefault("youtube_shorts", {})
    if os.environ.get("YOUTUBE_API_KEY"):
        cfg["sources"]["youtube_shorts"]["api_key"] = os.environ["YOUTUBE_API_KEY"]

    return cfg
