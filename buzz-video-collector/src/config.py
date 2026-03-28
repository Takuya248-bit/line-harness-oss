from __future__ import annotations
import os
from pathlib import Path

import yaml

_DEFAULT_CONFIG_PATH = Path(__file__).parent.parent / "config.yaml"


def load_config(path: str | Path | None = None) -> dict:
    p = Path(path) if path else _DEFAULT_CONFIG_PATH
    with open(p, encoding="utf-8") as f:
        cfg = yaml.safe_load(f)

    cfg.setdefault("notification", {}).setdefault("line", {})
    if os.environ.get("LINE_NOTIFY_TOKEN"):
        cfg["notification"]["line"]["token"] = os.environ["LINE_NOTIFY_TOKEN"]

    cfg.setdefault("sources", {}).setdefault("yt_shorts", {})
    if os.environ.get("YOUTUBE_API_KEY"):
        cfg["sources"]["yt_shorts"]["api_key"] = os.environ["YOUTUBE_API_KEY"]

    if os.environ.get("GEMINI_API_KEY"):
        cfg.setdefault("analyzer", {})["api_key"] = os.environ["GEMINI_API_KEY"]

    return cfg
