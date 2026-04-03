from __future__ import annotations

import asyncio
import json
import os
import re
from typing import Any

from groq import Groq

from db.models import Job

MODEL = "llama-3.3-70b-versatile"

SYSTEM = """You score freelancing jobs for a Japanese-native full-stack developer
who specializes in translation, localization, RLHF/AI evaluation, and technical content.

Scoring axes and weights (must sum to 100 points total in breakdown):
- skill_match (30%): fit for Japanese + engineering (translation, loc, RLHF, dev).
- rate_value (25%): budget vs effort (hourly/fixed reasonableness).
- automation (20%): how much deliverable can be assisted by AI safely.
- competition (15%): lower competition / clearer scope scores higher.
- client_trust (10%): signals of serious client / clear requirements.

Respond with ONLY valid JSON:
{"score": <int 0-100>, "breakdown": {"skill_match": <int>, "rate_value": <int>, "automation": <int>, "competition": <int>, "client_trust": <int>}, "reason": "<short>"}

breakdown integers should reflect the weighted contribution (sum ~ score)."""


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
    chat = client.chat.completions.create(
        model=MODEL,
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


async def score_job(job: Job) -> dict[str, Any]:
    """Call Groq to score a job; returns dict with score, breakdown, reason."""
    return await asyncio.to_thread(_score_sync, job)
