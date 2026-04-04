from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from datetime import datetime
from email.utils import parsedate_to_datetime
from typing import List
from urllib.parse import urlencode

import httpx

from adapters.base import BaseAdapter
from db.models import Job

RSS_URL = "https://www.upwork.com/ab/feed/jobs/rss"


class UpworkAdapter(BaseAdapter):
    """Upwork RSS feed adapter. No auth required."""

    platform_key = "upwork"

    async def fetch_jobs(self, keywords: List[str], **filters) -> List[Job]:
        try:
            return await self._fetch_jobs_impl(keywords)
        except Exception:
            return []

    async def _fetch_jobs_impl(self, keywords: List[str]) -> List[Job]:
        params = {"q": " ".join(keywords[:5]), "sort": "recency"}
        url = f"{RSS_URL}?{urlencode(params)}"
        headers = {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
        }
        async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
            r = await client.get(url, headers=headers)
            r.raise_for_status()

        root = ET.fromstring(r.text)
        ns = {"dc": "http://purl.org/dc/elements/1.1/"}
        channel = root.find("channel")
        if channel is None:
            return []

        jobs: List[Job] = []
        for item in channel.findall("item"):
            guid = (item.findtext("guid") or "").strip()
            ext = _extract_id(guid)
            if not ext:
                continue

            title = (item.findtext("title") or "").strip()
            desc_raw = (item.findtext("description") or "").strip()
            description = _strip_html(desc_raw)[:1000]
            posted_at = _parse_date(item.findtext("pubDate"))
            budget_min, budget_max, budget_type = _parse_budget(description)
            category = _parse_category(item, ns)

            jobs.append(
                Job(
                    platform=self.platform_key,
                    external_id=ext,
                    title=title[:500],
                    description=description,
                    budget_min=budget_min,
                    budget_max=budget_max,
                    budget_type=budget_type,
                    category=category,
                    posted_at=posted_at,
                )
            )
        return jobs[:50]

    async def submit_proposal(self, job: Job, text: str) -> bool:
        return False

    async def deliver(self, contract_id: str, content: str) -> bool:
        return False


def _extract_id(guid: str) -> str:
    # guid例: https://www.upwork.com/jobs/~01abc123...
    m = re.search(r"~([0-9a-f]+)", guid)
    if m:
        return m.group(1)
    # fallback: URL末尾の数字
    m2 = re.search(r"/(\d+)/?$", guid)
    return m2.group(1) if m2 else ""


def _strip_html(text: str) -> str:
    return re.sub(r"<[^>]+>", "", text).strip()


def _parse_date(raw: str | None) -> datetime | None:
    if not raw:
        return None
    try:
        return parsedate_to_datetime(raw)
    except Exception:
        return None


def _parse_budget(desc: str) -> tuple[float | None, float | None, str | None]:
    # "Budget: $500" or "Hourly Range: $20.00-$40.00"
    m = re.search(r"Hourly Range[:\s]+\$([0-9,]+(?:\.[0-9]+)?)[–\-]\$([0-9,]+(?:\.[0-9]+)?)", desc)
    if m:
        return _f(m.group(1)), _f(m.group(2)), "hourly"
    m2 = re.search(r"Budget[:\s]+\$([0-9,]+(?:\.[0-9]+)?)", desc)
    if m2:
        v = _f(m2.group(1))
        return v, v, "fixed"
    return None, None, None


def _parse_category(item: ET.Element, ns: dict) -> str:
    cat = item.findtext("category")
    if cat:
        return cat.strip()
    dc_subject = item.find("dc:subject", ns)
    if dc_subject is not None and dc_subject.text:
        return dc_subject.text.strip()
    return "tech"


def _f(v: str) -> float | None:
    try:
        return float(v.replace(",", ""))
    except (ValueError, AttributeError):
        return None
