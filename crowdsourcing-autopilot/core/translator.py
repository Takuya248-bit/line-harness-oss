from __future__ import annotations

import asyncio
import os
from typing import Any

from groq import Groq

from db.models import Job

MODELS = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"]

_JA_PLATFORMS = {"crowdworks", "lancers", "coconala"}

SYSTEM = (
    "You are a concise Japanese translator. "
    "Translate the given freelance job title and description to Japanese. "
    "Return ONLY JSON: {\"title\": \"<translated title>\", \"description\": \"<translated description (200 chars max)>\"} "
    "Keep technical terms (Python, API, etc.) in English. No extra commentary."
)


def _client() -> Groq:
    key = os.environ.get("GROQ_API_KEY", "")
    if not key:
        raise RuntimeError("GROQ_API_KEY is not set")
    return Groq(api_key=key)


def _translate_sync(title: str, description: str) -> dict[str, str]:
    client = _client()
    user = f"title: {title}\ndescription: {description[:600]}"
    for model in MODELS:
        try:
            chat = client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": SYSTEM},
                    {"role": "user", "content": user},
                ],
                temperature=0.1,
            )
            import json, re
            raw = (chat.choices[0].message.content or "").strip()
            m = re.search(r"\{[\s\S]*\}", raw)
            if m:
                return json.loads(m.group())
        except Exception as exc:
            if "rate_limit" in str(exc) and model != MODELS[-1]:
                continue
    return {}


async def translate_job(job: Job) -> Job:
    """英語プラットフォームの案件を日本語に翻訳してJobを返す（元オブジェクトは変更しない）"""
    if job.platform in _JA_PLATFORMS:
        return job
    try:
        result: dict[str, Any] = await asyncio.to_thread(
            _translate_sync, job.title or "", job.description or ""
        )
    except Exception:
        return job
    if not result:
        return job

    import dataclasses
    translated = dataclasses.replace(
        job,
        title=result.get("title") or job.title,
        description=result.get("description") or job.description,
    )
    return translated
