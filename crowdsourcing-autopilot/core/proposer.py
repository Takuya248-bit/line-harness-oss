from __future__ import annotations

import asyncio
import json
import os
from pathlib import Path
from typing import List

import yaml
from groq import Groq

from db.migrate import default_db_path
from db.models import Job
from db.queries import fetch_proposal_templates

MODELS = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"]

_PROFILE_PATH = Path(__file__).resolve().parent.parent / "config" / "profile.yaml"

# カテゴリキーワードマッピング（案件カテゴリ→profile.yaml achievement category）
_CATEGORY_MAP = {
    "translation": ["translation", "localization", "翻訳", "ローカライゼーション"],
    "ai_eval": ["rlhf", "ai evaluation", "ai eval", "annotation", "data labeling"],
    "web_dev": ["wordpress", "wpml", "web", "woocommerce", "サイト制作"],
    "automation": ["scraping", "automation", "python", "スクレイピング", "自動化"],
}


def _load_profile() -> dict:
    if _PROFILE_PATH.exists():
        return yaml.safe_load(_PROFILE_PATH.read_text(encoding="utf-8")) or {}
    return {}


def _relevant_achievements(profile: dict, job: Job) -> list:
    """案件のカテゴリ・タイトル・説明に関連する実績を最大2件返す"""
    achievements = profile.get("achievements") or []
    if not achievements:
        return []

    text = f"{job.title or ''} {job.description or ''} {job.category or ''}".lower()

    scored = []
    for ach in achievements:
        score = 0
        ach_cat = ach.get("category", "")
        keywords = _CATEGORY_MAP.get(ach_cat, [])
        for kw in keywords:
            if kw.lower() in text:
                score += 2
        if ach.get("platform") == job.platform:
            score += 1
        scored.append((score, ach))

    scored.sort(key=lambda x: x[0], reverse=True)
    return [a for _, a in scored[:2] if scored[0][0] > 0] or [achievements[0]]


def _build_profile_context(profile: dict, job: Job) -> str:
    bio = profile.get("bio") or {}
    skills = profile.get("skills") or []
    achievements = _relevant_achievements(profile, job)

    lines = []
    if bio.get("tagline"):
        lines.append(f"Freelancer tagline: {bio['tagline']}")

    # 関連スキルのみ抽出
    job_text = f"{job.title or ''} {job.description or ''}".lower()
    relevant_skills = [s for s in skills if any(
        kw in job_text for kw in s.get("name", "").lower().split("・") + s.get("detail", "").lower().split()[:5]
    )][:3]
    if relevant_skills:
        lines.append("Relevant skills:")
        for s in relevant_skills:
            lines.append(f"  - {s['name']}: {s['detail']}")

    if achievements:
        lines.append("Past achievements to reference (use these to sound credible, do NOT copy verbatim):")
        for a in achievements:
            lines.append(f"  - {a['title']}: {a['description']} → {a.get('result', '')}")

    return "\n".join(lines)


def _client() -> Groq:
    key = os.environ.get("GROQ_API_KEY", "")
    if not key:
        raise RuntimeError("GROQ_API_KEY is not set")
    return Groq(api_key=key)


def _language_hint(platform: str) -> str:
    if platform in ("crowdworks", "lancers", "coconala"):
        return "Write the proposal in natural Japanese."
    return "Write the proposal in professional English."


async def generate_proposal(job: Job, db_path: Path | None = None) -> str:
    path = db_path or default_db_path()
    templates = await fetch_proposal_templates(
        path, job.platform, job.category, limit=5
    )
    few_shot_lines: List[str] = []
    for text, accepted in templates:
        tag = "accepted" if accepted else "example"
        few_shot_lines.append(f"[{tag}]\n{text}\n")
    few_shot = "\n".join(few_shot_lines) if few_shot_lines else "(no examples yet)"

    profile = _load_profile()
    profile_context = _build_profile_context(profile, job)

    system = f"""You are a freelancer writing a proposal MESSAGE to send to a client.
You are NOT describing the job — you are selling yourself as the right person for it.

About you (the freelancer):
- Japanese native, living in Bali
- Full-stack developer: Python, TypeScript, WordPress, automation, scraping
- Strong in: translation/localization (JP↔EN), RLHF/AI evaluation, SEO writing, web dev
- Proven track record of delivering project-based work remotely

Rules (STRICT):
- NEVER restate, summarize, or paraphrase the job description. The client already knows what they posted.
- Do NOT open with "〜のお仕事を拝見しました" or "I came across your posting" — jump straight to value
- START by stating a concrete thing you have done that is directly relevant (e.g. "WPMLで10サイト以上の多言語化を担当しました")
- Mention 1-2 specific tools or techniques relevant to THIS job
- Keep it conversational and confident — not formal, not sycophantic
- End with ONE sharp question that only someone who actually read the job would ask
- Total length: 100-150 words max. Shorter is better.

{_language_hint(job.platform)}

--- Your profile & achievements ---
{profile_context}
---

Use the few-shot examples only as style reference, do not copy verbatim."""

    user = json.dumps(
        {
            "job": {
                "platform": job.platform,
                "title": job.title,
                "description": job.description,
                "budget": {
                    "min": job.budget_min,
                    "max": job.budget_max,
                    "type": job.budget_type,
                },
                "category": job.category,
            },
            "few_shot_examples": few_shot,
        },
        ensure_ascii=False,
    )

    def _run() -> str:
        client = _client()
        for model in MODELS:
            try:
                chat = client.chat.completions.create(
                    model=model,
                    messages=[
                        {"role": "system", "content": system},
                        {"role": "user", "content": user},
                    ],
                    temperature=0.8,
                )
                return (chat.choices[0].message.content or "").strip()
            except Exception as exc:
                if "rate_limit" in str(exc) and model != MODELS[-1]:
                    continue
                raise

    return await asyncio.to_thread(_run)
