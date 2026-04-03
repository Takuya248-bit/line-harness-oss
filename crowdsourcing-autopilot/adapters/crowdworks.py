from __future__ import annotations

import os
import re
from typing import List
from urllib.parse import quote_plus

import httpx
from bs4 import BeautifulSoup

from adapters.base import BaseAdapter
from db.models import Job


class CrowdWorksAdapter(BaseAdapter):
    platform_key = "crowdworks"
    BASE = "https://crowdworks.jp"

    def __init__(self) -> None:
        cookie = os.environ.get("CROWDWORKS_SESSION", "")
        self._headers = {
            "User-Agent": "CrowdsourcingAutopilot/1.0",
            "Accept": "text/html,application/xhtml+xml",
        }
        if cookie:
            self._headers["Cookie"] = cookie

    async def fetch_jobs(self, keywords: List[str], **filters) -> List[Job]:
        q = quote_plus(keywords[0] if keywords else "翻訳")
        url = f"{self.BASE}/public/jobs/search?keyword={q}"
        async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
            r = await client.get(url, headers=self._headers)
            if r.status_code >= 400:
                return []
        soup = BeautifulSoup(r.text, "html.parser")
        jobs: List[Job] = []
        for link in soup.select('a[href*="/public/jobs/"]'):
            href = link.get("href") or ""
            m = re.search(r"/public/jobs/(\d+)", href)
            if not m:
                continue
            title = (link.get_text() or "").strip()
            if not title:
                continue
            jobs.append(
                Job(
                    platform=self.platform_key,
                    external_id=m.group(1),
                    title=title[:500],
                    description=None,
                    category="content",
                )
            )
        seen = set()
        out: List[Job] = []
        for j in jobs:
            k = j.external_id
            if k in seen:
                continue
            seen.add(k)
            out.append(j)
        return out[:30]

    async def submit_proposal(self, job: Job, text: str) -> bool:
        return False

    async def deliver(self, contract_id: str, content: str) -> bool:
        return False
