from __future__ import annotations

import asyncio
import json
import os
import re
from typing import Any

from groq import Groq

from db.models import Job

MODELS = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"]

SYSTEM = """Score this freelance gig for a Japanese-native full-stack developer in Bali.
Goal: one-off / project-based gigs only. NO full-time jobs, NO interviews, NO hiring process.

Strong skills: translation/localization, RLHF/AI eval, web dev (TypeScript/Python), SEO writing.
Also good: WordPress site building, UI implementation (HTML/CSS/JS).
Weak/impossible: voice acting, video appearance, physical tasks, graphic design from scratch.

STRICT scoring rules:
- Full-time, permanent, or interview-required jobs: score 0-5
- Jobs requiring physical presence or face/voice: score 0-10
- Simple surveys/questionnaires under ¥1000: score 10-20
- Writing tasks with vague scope or very low pay (<¥3000): score 20-40
- Translation/localization one-off tasks: score 55-80 depending on rate
- Technical dev tasks (web, API, automation): score 60-90
- RLHF/AI evaluation tasks: score 70-95
- Perfect fit (Japanese + tech + good rate + clearly project-based): score 85-95

Budget reality check:
- JP platforms: under ¥5,000 for content work = low (score down 20pts), ¥10,000-50,000 = reasonable, ¥50,000+ = good
- EN platforms: under $50 fixed or under $15/h = low, $50-500 = reasonable, $500+ = good

Return ONLY JSON: {"score": <0-100>, "reason": "<15 words max>"}"""


def _client() -> Groq:
    key = os.environ.get("GROQ_API_KEY", "")
    if not key:
        raise RuntimeError("GROQ_API_KEY is not set")
    return Groq(api_key=key)


def _job_payload(job: Job) -> dict[str, Any]:
    return {
        "platform": job.platform,
        "external_id": job.external_id,
        "title": job.title,
        "description": job.description,
        "budget_min": job.budget_min,
        "budget_max": job.budget_max,
        "budget_type": job.budget_type,
        "category": job.category,
    }


def _score_sync(job: Job) -> dict[str, Any]:
    client = _client()
    user = json.dumps(_job_payload(job), ensure_ascii=False)
    for model in MODELS:
        try:
            chat = client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": SYSTEM},
                    {"role": "user", "content": user},
                ],
                temperature=0.2,
            )
            raw = (chat.choices[0].message.content or "").strip()
            m = re.search(r"\{[\s\S]*\}", raw)
            if not m:
                return {"score": 0, "breakdown": {}, "reason": raw[:500]}
            try:
                return json.loads(m.group())
            except json.JSONDecodeError:
                return {"score": 0, "breakdown": {}, "reason": raw[:500]}
        except Exception as exc:
            if "rate_limit" in str(exc) and model != MODELS[-1]:
                continue
            raise


async def score_job(job: Job) -> dict[str, Any]:
    """Call Groq to score a job; returns dict with score, breakdown, reason."""
    return await asyncio.to_thread(_score_sync, job)
