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

    system = f"""You write winning proposals for freelance platforms.
Structure (150-200 words total):
1) One sentence showing you understood the client's problem.
2) Concrete solution / process and outcomes.
3) Differentiation: Japanese native + developer background.
4) Close with one specific question.

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
                    temperature=0.5,
                )
                return (chat.choices[0].message.content or "").strip()
            except Exception as exc:
                if "rate_limit" in str(exc) and model != MODELS[-1]:
                    continue
                raise

    return await asyncio.to_thread(_run)
