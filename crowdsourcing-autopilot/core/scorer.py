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

Strong skills: translation/localization (JP↔EN), RLHF/AI eval, web dev (TypeScript/Python), SEO writing, automation/scraping, WordPress.
Also good: content writing, proofreading, subtitle/transcription, data labeling.
Weak/impossible: voice acting, video appearance, physical tasks, graphic design from scratch.

STRICT scoring rules:
- Full-time, permanent, salary, or interview-required jobs: score 0-5
- Jobs requiring physical presence or face/voice: score 0-10
- Simple surveys/questionnaires: score 10-20
- Writing/content tasks with NO budget info on EN platforms: score 45-55 (budget negotiable — do NOT penalize)
- Writing/content tasks with very low pay on JP platforms (<¥3000): score 20-40
- Translation/localization one-off tasks: score 60-80
- Technical dev tasks (web, API, automation, scraping): score 60-85
- RLHF/AI evaluation tasks: score 70-90
- QA / localization testing tasks: score 60-80
- Perfect fit (skill match + project-based + reasonable pay): score 80-95

Budget reality check:
- JP platforms: under ¥5,000 = low (score down 15pts), ¥10,000-50,000 = reasonable, ¥50,000+ = good
- EN platforms: budget unknown = neutral (do NOT penalize), under $30 = low, $50-500 = good, $500+ = great
- Reddit/RemoteOK/Remotive: budget is often omitted — treat as negotiable, not low

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
