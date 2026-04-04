#!/usr/bin/env python3
"""
~/配下のプロジェクトを自動スキャンしてprofile.yamlの実績を更新する。
python scripts/sync_achievements.py で手動実行、またはcronで定期実行。
"""
from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path

import yaml

PROFILE_PATH = Path(__file__).resolve().parent.parent / "config" / "profile.yaml"
HOME = Path.home()

# スキャン対象外ディレクトリ
SKIP_DIRS = {".venv", "node_modules", ".git", "__pycache__", ".claude", "pm-hub"}

# カテゴリ判定ルール（技術キーワード→category）
_CATEGORY_RULES = [
    (["cloudflare", "workers", "hono", "d1", "next.js", "react"], "web_dev"),
    (["wordpress", "wpml", "woocommerce"], "web_dev"),
    (["playwright", "puppeteer", "scraping", "httpx", "beautifulsoup", "automation", "cron"], "automation"),
    (["openai", "groq", "llm", "rlhf", "annotation", "ai eval"], "ai_eval"),
    (["translation", "localization", "翻訳"], "translation"),
    (["ffmpeg", "audio", "video", "sfx"], "automation"),
    (["twitter", "instagram", "threads", "discord", "line", "sns"], "automation"),
]


def _detect_category(tech_text: str) -> str:
    text = tech_text.lower()
    for keywords, cat in _CATEGORY_RULES:
        if any(kw in text for kw in keywords):
            return cat
    return "other"


def _read_file_safe(path: Path, max_bytes: int = 4000) -> str:
    try:
        return path.read_text(encoding="utf-8", errors="ignore")[:max_bytes]
    except Exception:
        return ""


def _get_git_log(project_dir: Path) -> str:
    try:
        result = subprocess.run(
            ["git", "log", "--oneline", "-10"],
            cwd=project_dir, capture_output=True, text=True, timeout=5
        )
        return result.stdout
    except Exception:
        return ""


def _extract_project_info(project_dir: Path) -> dict | None:
    name = project_dir.name

    # README / CLAUDE.md / package.json から情報収集
    readme = _read_file_safe(project_dir / "README.md")
    claude_md = _read_file_safe(project_dir / "CLAUDE.md")
    pkg_json_text = _read_file_safe(project_dir / "package.json")
    pyproject = _read_file_safe(project_dir / "pyproject.toml")

    combined = f"{readme}\n{claude_md}\n{pkg_json_text}\n{pyproject}"
    if not combined.strip():
        return None

    # package.jsonからdescriptionとdependencies取得
    tech_stack = []
    try:
        pkg = json.loads(pkg_json_text)
        desc = pkg.get("description", "")
        deps = list((pkg.get("dependencies") or {}).keys()) + list((pkg.get("devDependencies") or {}).keys())
        tech_stack.extend(deps[:10])
    except Exception:
        desc = ""

    # CLAUDE.mdから技術スタックを抽出
    tech_match = re.search(r"技術スタック[^\n]*\n(.*?)(?:\n\n|\Z)", claude_md, re.DOTALL)
    if tech_match:
        tech_stack.append(tech_match.group(1))

    # Python系の場合requirements.txtを確認
    req = _read_file_safe(project_dir / "requirements.txt")
    if req:
        tech_stack.extend(req.split("\n")[:10])

    tech_text = " ".join(tech_stack) + " " + combined[:500]
    category = _detect_category(tech_text)

    # 説明文を生成（README冒頭か CLAUDE.md冒頭）
    description = desc or (readme[:200].split("\n")[1] if readme else "") or claude_md[:150]
    description = re.sub(r"[#*\[\]`]+", "", description).strip()[:200]
    # pm-hubのステータスjsonなどノイズを除去
    if "PM Hub連携" in description or "status.json" in description or not description:
        return None

    return {
        "title": name,
        "description": description,
        "tech": tech_text[:300],
        "category": category,
    }


def _load_profile() -> dict:
    if PROFILE_PATH.exists():
        return yaml.safe_load(PROFILE_PATH.read_text(encoding="utf-8")) or {}
    return {}


def _save_profile(profile: dict) -> None:
    PROFILE_PATH.write_text(
        yaml.dump(profile, allow_unicode=True, sort_keys=False, default_flow_style=False),
        encoding="utf-8"
    )


def sync_achievements() -> list[str]:
    profile = _load_profile()
    existing_titles = {a.get("title", "") for a in (profile.get("achievements") or [])}
    added = []

    for d in sorted(HOME.iterdir()):
        if not d.is_dir():
            continue
        if d.name.startswith(".") or d.name in SKIP_DIRS:
            continue
        if not (d / ".git").exists():
            continue

        info = _extract_project_info(d)
        if not info:
            continue

        # すでに同名タイトルがあればスキップ
        if info["title"] in existing_titles:
            continue

        achievement = {
            "title": info["title"],
            "platform": "crowdworks",
            "category": info["category"],
            "description": info["description"],
            "result": "開発済み・稼働中",
            "budget": "自社開発",
        }
        achievements = profile.get("achievements") or []
        achievements.insert(0, achievement)
        profile["achievements"] = achievements
        existing_titles.add(info["title"])
        added.append(info["title"])

    if added:
        _save_profile(profile)

    return added


if __name__ == "__main__":
    added = sync_achievements()
    if added:
        print(f"実績を追加しました ({len(added)}件):")
        for t in added:
            print(f"  - {t}")
    else:
        print("新規プロジェクトなし。profile.yamlは最新です。")
