from __future__ import annotations

import os
import re
from typing import List
from urllib.parse import quote_plus

import httpx
from bs4 import BeautifulSoup

from adapters.base import BaseAdapter
from db.models import Job


class LancersAdapter(BaseAdapter):
    platform_key = "lancers"
    BASE = "https://www.lancers.jp"

    def __init__(self) -> None:
        cookie = os.environ.get("LANCERS_SESSION", "")
        self._headers = {"User-Agent": "CrowdsourcingAutopilot/1.0"}
        if cookie:
            self._headers["Cookie"] = cookie

    async def fetch_jobs(self, keywords: List[str], **filters) -> List[Job]:
        q = quote_plus(keywords[0] if keywords else "ローカライゼーション")
        url = f"{self.BASE}/work/search?open=1&keyword={q}"
        async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
            r = await client.get(url, headers=self._headers)
            if r.status_code >= 400:
                return []
        soup = BeautifulSoup(r.text, "html.parser")
        jobs: List[Job] = []
        for a in soup.select('a[href*="/work/detail/"]'):
            href = a.get("href") or ""
            m = re.search(r"/work/detail/(\d+)", href)
            if not m:
                continue
            title = (a.get_text() or "").strip()
            if not title:
                continue
            jobs.append(
                Job(
                    platform=self.platform_key,
                    external_id=m.group(1),
                    title=title[:500],
                    category="tech",
                )
            )
        seen = set()
        out: List[Job] = []
        for j in jobs:
            if j.external_id in seen:
                continue
            seen.add(j.external_id)
            out.append(j)
        return out[:30]

    async def submit_proposal(self, job: Job, text: str) -> bool:
        return False

    async def deliver(self, contract_id: str, content: str) -> bool:
        return False
