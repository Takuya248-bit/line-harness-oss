from __future__ import annotations

import os
import re
from typing import Any, List

import httpx

from adapters.base import BaseAdapter
from browser.lightpanda import maybe_fetch_json_via_browser
from db.models import Job


class FiverrAdapter(BaseAdapter):
    platform_key = "fiverr"

    def __init__(self) -> None:
        self._cookie = os.environ.get("FIVERR_COOKIE", "")

    async def fetch_jobs(self, keywords: List[str], **filters) -> List[Job]:
        headers = {"User-Agent": "CrowdsourcingAutopilot/1.0"}
        if self._cookie:
            headers["Cookie"] = self._cookie
        q = keywords[0] if keywords else "translation"
        candidates = [
            f"https://www.fiverr.com/search/gigs?query={q}",
        ]
        async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
            for url in candidates:
                r = await client.get(url, headers=headers)
                if r.status_code >= 400:
                    continue
                gigs = _extract_gig_ids(r.text)
                if gigs:
                    return [
                        Job(
                            platform=self.platform_key,
                            external_id=gid,
                            title=f"Gig {gid}",
                            category="content",
                        )
                        for gid in gigs[:20]
                    ]
        data = await maybe_fetch_json_via_browser(
            f"https://www.fiverr.com/search/gigs?query={q}"
        )
        if isinstance(data, dict):
            return _jobs_from_payload(data, self.platform_key)
        return []

    async def submit_proposal(self, job: Job, text: str) -> bool:
        return False

    async def deliver(self, contract_id: str, content: str) -> bool:
        return False


def _extract_gig_ids(html: str) -> List[str]:
    ids = re.findall(r'/gigs/([a-z0-9_-]+)/', html, flags=re.I)
    seen: set[str] = set()
    out: List[str] = []
    for g in ids:
        if g in seen or g in ("search", "categories"):
            continue
        seen.add(g)
        out.append(g)
    return out


def _jobs_from_payload(data: dict[str, Any], platform: str) -> List[Job]:
    jobs: List[Job] = []
    stack: list[Any] = [data]
    while stack:
        cur = stack.pop()
        if isinstance(cur, dict):
            for v in cur.values():
                stack.append(v)
        elif isinstance(cur, list):
            for v in cur:
                stack.append(v)
                if isinstance(v, dict) and "id" in v and "title" in v:
                    jobs.append(
                        Job(
                            platform=platform,
                            external_id=str(v.get("id")),
                            title=str(v.get("title"))[:500],
                            category="content",
                        )
                    )
    return jobs[:20]
