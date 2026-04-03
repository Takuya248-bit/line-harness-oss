from __future__ import annotations

import os
import re
from typing import List

import httpx

from adapters.base import BaseAdapter
from browser.lightpanda import maybe_fetch_json_via_browser
from db.models import Job


class CoconalaAdapter(BaseAdapter):
    platform_key = "coconala"
    BASE = "https://coconala.com"

    def __init__(self) -> None:
        self._cookie = os.environ.get("COCONALA_COOKIE", "")

    async def fetch_jobs(self, keywords: List[str], **filters) -> List[Job]:
        headers = {"User-Agent": "CrowdsourcingAutopilot/1.0"}
        if self._cookie:
            headers["Cookie"] = self._cookie
        q = keywords[0] if keywords else "翻訳"
        url = f"{self.BASE}/requests?keyword={q}"
        async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
            r = await client.get(url, headers=headers)
            if r.status_code < 400:
                ids = re.findall(r"/requests/(\d+)", r.text)
                if ids:
                    return [
                        Job(
                            platform=self.platform_key,
                            external_id=i,
                            title=f"Request {i}",
                            category="content",
                        )
                        for i in dict.fromkeys(ids).keys()
                    ][:20]
        data = await maybe_fetch_json_via_browser(url)
        if isinstance(data, dict):
            return _parse_dict_jobs(data, self.platform_key)
        return []

    async def submit_proposal(self, job: Job, text: str) -> bool:
        return False

    async def deliver(self, contract_id: str, content: str) -> bool:
        return False


def _parse_dict_jobs(data: dict, platform: str) -> List[Job]:
    jobs: List[Job] = []
    for v in data.values():
        if isinstance(v, list):
            for item in v:
                if isinstance(item, dict) and item.get("id"):
                    jobs.append(
                        Job(
                            platform=platform,
                            external_id=str(item["id"]),
                            title=str(item.get("title") or item.get("name") or "")[
                                :500
                            ],
                            category="content",
                        )
                    )
    return jobs[:20]
