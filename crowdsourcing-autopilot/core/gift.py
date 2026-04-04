from __future__ import annotations

import asyncio
import json
import os
import re
from typing import Any

import httpx
from groq import Groq

from db.models import Job

MODELS = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"]

_JA_PLATFORMS = {"crowdworks", "lancers", "coconala"}

# 案件カテゴリ判定キーワード
_CATEGORY_SIGNALS = {
    "translation": ["翻訳", "translation", "localization", "ローカライゼーション", "字幕", "subtitle"],
    "seo_writing": ["seo", "記事", "ライティング", "writing", "copywriting", "ブログ", "コンテンツ"],
    "automation": ["スクレイピング", "自動化", "scraping", "automation", "python", "bot", "api"],
    "ai_eval": ["rlhf", "ai evaluation", "annotation", "data labeling", "評価", "ラベリング"],
    "web_dev": ["wordpress", "web", "サイト制作", "lp制作", "webデザイン", "アプリ"],
}

SYSTEM_GIFT = """You are a freelancer creating a FREE VALUE SAMPLE to attach to a proposal.
The goal: show the client you already started working on their problem before being hired.
This dramatically increases response rates.

Generate the gift content in the SAME LANGUAGE as the job posting.
Be specific, concrete, and useful — not generic.
Return ONLY the gift content (no meta-commentary, no "here is your gift").
Max 400 words."""


def _detect_category(job: Job) -> str:
    text = f"{job.title or ''} {job.description or ''}".lower()
    for cat, signals in _CATEGORY_SIGNALS.items():
        if any(s in text for s in signals):
            return cat
    return "general"


def _gift_prompt(job: Job, category: str) -> str:
    lang = "Japanese" if job.platform in _JA_PLATFORMS else "English"
    title = job.title or ""
    desc = (job.description or "")[:600]

    prompts = {
        "translation": f"""Job: {title}
Description: {desc}

Create a FREE SAMPLE TRANSLATION of the first paragraph or key sentence from the job description.
Show your translation style, accuracy, and natural fluency.
Format:
【原文】
(original text)
【翻訳サンプル】
(your translation)
【一言コメント】
(brief note on your translation approach)
Language: {lang}""",

        "seo_writing": f"""Job: {title}
Description: {desc}

Create a FREE CONTENT SAMPLE including:
1. 3 title candidates (SEO-optimized)
2. Article outline (H2/H3 structure)
3. Opening paragraph sample (150 words)
Language: {lang}""",

        "automation": f"""Job: {title}
Description: {desc}

Create a FREE TECHNICAL ANALYSIS including:
1. Recommended approach & tech stack
2. Estimated implementation steps (numbered)
3. Potential challenges & solutions
4. Rough time estimate
Language: {lang}""",

        "ai_eval": f"""Job: {title}
Description: {desc}

Create a FREE EVALUATION CRITERIA SAMPLE including:
1. Proposed evaluation rubric (5 criteria with scoring)
2. Example evaluation of a sample response
3. Edge case handling suggestions
Language: {lang}""",

        "web_dev": f"""Job: {title}
Description: {desc}

Create a FREE PROPOSAL SKETCH including:
1. Recommended tech stack with reasoning
2. Page/feature breakdown
3. Implementation timeline estimate
4. 2-3 questions to clarify requirements
Language: {lang}""",

        "general": f"""Job: {title}
Description: {desc}

Create a FREE VALUE SAMPLE that directly addresses the client's need.
Show expertise, give something immediately useful.
Language: {lang}""",
    }
    return prompts.get(category, prompts["general"])


def _groq_client() -> Groq:
    key = os.environ.get("GROQ_API_KEY", "")
    if not key:
        raise RuntimeError("GROQ_API_KEY is not set")
    return Groq(api_key=key)


def _generate_gift_sync(job: Job, category: str) -> str:
    client = _groq_client()
    prompt = _gift_prompt(job, category)
    for model in MODELS:
        try:
            chat = client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": SYSTEM_GIFT},
                    {"role": "user", "content": prompt},
                ],
                temperature=0.7,
            )
            return (chat.choices[0].message.content or "").strip()
        except Exception as exc:
            if "rate_limit" in str(exc) and model != MODELS[-1]:
                continue
            raise
    return ""


async def _publish_gist(filename: str, content: str, description: str) -> str:
    """GitHub Gistに公開してURLを返す。"""
    token = os.environ.get("GITHUB_TOKEN", "")
    if not token:
        return ""
    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.post(
            "https://api.github.com/gists",
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/vnd.github+json",
            },
            json={
                "description": description,
                "public": False,
                "files": {filename: {"content": content}},
            },
        )
        if r.status_code == 201:
            return str(r.json().get("html_url", ""))
    return ""


async def generate_gift(job: Job) -> dict[str, Any]:
    """
    手土産コンテンツを生成してGistに公開する。
    戻り値: {"content": str, "url": str, "category": str}
    """
    category = _detect_category(job)
    try:
        content = await asyncio.to_thread(_generate_gift_sync, job, category)
    except Exception:
        return {"content": "", "url": "", "category": category}

    if not content:
        return {"content": "", "url": "", "category": category}

    # Gistファイル名
    safe_title = re.sub(r"[^\w\s-]", "", (job.title or "gift"))[:40].strip().replace(" ", "_")
    filename = f"gift_{safe_title}.md"
    description = f"[{job.platform}] {job.title or 'Job Gift'}".strip()[:100]

    # Markdownヘッダーを追加
    md_content = f"# {job.title}\n\n> 提案時の参考資料 / Sample work for proposal\n\n---\n\n{content}"

    url = await _publish_gist(filename, md_content, description)
    return {"content": content, "url": url, "category": category}
