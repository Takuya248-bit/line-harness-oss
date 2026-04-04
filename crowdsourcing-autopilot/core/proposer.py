from __future__ import annotations

import asyncio
import json
import os
from pathlib import Path
from typing import List

from groq import Groq

from db.migrate import default_db_path
from db.models import Job
from db.queries import fetch_proposal_templates

MODELS = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"]


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
