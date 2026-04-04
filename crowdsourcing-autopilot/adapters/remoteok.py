from __future__ import annotations

from datetime import datetime, timezone
from typing import List

import httpx

from adapters.base import BaseAdapter
from db.models import Job

API_URL = "https://remoteok.com/api"

# フルタイム求人を除外するタグ・キーワード
_FULLTIME_TAGS = frozenset(["full-time", "fulltime", "permanent"])


class RemoteOKAdapter(BaseAdapter):
    """RemoteOK public JSON API. No auth required."""

    platform_key = "remoteok"

    async def fetch_jobs(self, keywords: List[str], **filters) -> List[Job]:
        try:
            return await self._fetch_jobs_impl(keywords)
        except Exception:
            return []

    async def _fetch_jobs_impl(self, keywords: List[str]) -> List[Job]:
        headers = {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
        }
        async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
            r = await client.get(API_URL, headers=headers)
            r.raise_for_status()

        data = r.json()
        kw_lower = [k.lower() for k in keywords]

        jobs: List[Job] = []
        for item in data:
            if not isinstance(item, dict) or not item.get("id"):
                continue

            title = str(item.get("position") or "")
            desc = str(item.get("description") or "")
            tags = [str(t).lower() for t in (item.get("tags") or [])]

            # フルタイム求人を除外（tagsのみで判定）
            if _FULLTIME_TAGS.intersection(tags):
                continue

            # キーワードフィルタ（タイトル・説明・タグのいずれかに含まれる）
            if kw_lower:
                text = f"{title} {desc} {' '.join(tags)}".lower()
                if not any(kw in text for kw in kw_lower):
                    continue

            posted_at = _parse_epoch(item.get("epoch"))
            jobs.append(
                Job(
                    platform=self.platform_key,
                    external_id=str(item["id"]),
                    title=title[:500],
                    description=_strip_html(desc)[:1000],
                    budget_min=_f_or_none(item.get("salary_min")),
                    budget_max=_f_or_none(item.get("salary_max")),
                    budget_type="fixed",
                    category=tags[0] if tags else "tech",
                    posted_at=posted_at,
                )
            )
        return jobs[:50]

    async def submit_proposal(self, job: Job, text: str) -> bool:
        return False

    async def deliver(self, contract_id: str, content: str) -> bool:
        return False


def _parse_epoch(v) -> datetime | None:
    try:
        return datetime.fromtimestamp(int(v), tz=timezone.utc)
    except (TypeError, ValueError):
        return None


def _strip_html(text: str) -> str:
    import re
    return re.sub(r"<[^>]+>", "", text).strip()


def _f(v) -> float | None:
    try:
        if v is None:
            return None
        return float(v)
    except (TypeError, ValueError):
        return None


def _f_or_none(v) -> float | None:
    """0や空文字はNoneとして返す（budget不明扱い）。"""
    result = _f(v)
    if result == 0.0:
        return None
    return result
