from __future__ import annotations

import re
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import List

import httpx

from adapters.base import BaseAdapter
from db.models import Job

API_URL = "https://himalayas.app/jobs/api"

_FULLTIME_SIGNALS = frozenset(["full time", "full-time", "fulltime", "permanent"])
_FULLTIME_TITLE_SIGNALS = ("manager", "director", "head of", "vp ", "cto", "ceo")


class HimalayasAdapter(BaseAdapter):
    """Himalayas public JSON API. No auth required."""

    platform_key = "himalayas"

    async def fetch_jobs(self, keywords: List[str], **filters) -> List[Job]:
        try:
            return await self._fetch_jobs_impl(keywords)
        except Exception:
            return []

    async def _fetch_jobs_impl(self, keywords: List[str]) -> List[Job]:
        headers = {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
        }
        params = {"limit": 100}
        if keywords:
            params["q"] = " ".join(keywords)

        async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
            r = await client.get(API_URL, headers=headers, params=params)
            r.raise_for_status()

        data = r.json()
        kw_lower = [k.lower() for k in keywords]

        jobs: List[Job] = []
        for item in (data.get("jobs") or []):
            if not isinstance(item, dict):
                continue

            title = str(item.get("title") or "")
            desc = str(item.get("description") or item.get("excerpt") or "")
            employment_type = str(item.get("employmentType") or "").lower()

            # フルタイム求人を除外
            if any(sig in employment_type for sig in _FULLTIME_SIGNALS):
                continue
            title_l = title.lower()
            if any(sig in title_l for sig in _FULLTIME_TITLE_SIGNALS):
                continue

            # キーワードフィルタ
            if kw_lower:
                categories = [str(c).lower() for c in (item.get("categories") or [])]
                text = f"{title} {desc} {' '.join(categories)}".lower()
                if not any(kw in text for kw in kw_lower):
                    continue

            # external_id として guid を使う (slugがないため)
            eid = str(item.get("guid") or "")
            if not eid:
                continue

            # companySlug + title からslugを生成してURL用に使う
            company_slug = str(item.get("companySlug") or "")
            title_slug = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")
            url_slug = f"{company_slug}-{title_slug}" if company_slug else title_slug

            posted_at = _parse_pubdate(item.get("pubDate"))
            min_salary = _f(item.get("minSalary"))
            max_salary = _f(item.get("maxSalary"))

            jobs.append(
                Job(
                    platform=self.platform_key,
                    external_id=url_slug or eid,
                    title=title[:500],
                    description=_strip_html(desc)[:1000],
                    budget_min=min_salary,
                    budget_max=max_salary,
                    budget_type="fixed",
                    category=(item.get("categories") or [""])[0] if item.get("categories") else "",
                    posted_at=posted_at,
                )
            )
        return jobs[:50]

    async def submit_proposal(self, job: Job, text: str) -> bool:
        return False

    async def deliver(self, contract_id: str, content: str) -> bool:
        return False


def _parse_pubdate(v) -> datetime | None:
    if not v:
        return None
    try:
        return parsedate_to_datetime(str(v)).astimezone(timezone.utc)
    except Exception:
        pass
    try:
        return datetime.fromisoformat(str(v).replace("Z", "+00:00"))
    except Exception:
        return None


def _strip_html(text: str) -> str:
    return re.sub(r"<[^>]+>", "", text).strip()


def _f(v) -> float | None:
    try:
        if v is None:
            return None
        return float(v)
    except (TypeError, ValueError):
        return None
