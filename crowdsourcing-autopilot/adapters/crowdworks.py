from __future__ import annotations

import html as html_mod
import json
import os
import re
from typing import List
from urllib.parse import quote_plus

import httpx

from adapters.base import BaseAdapter, CookieExpiredError
from db.models import Job


class CrowdWorksAdapter(BaseAdapter):
    platform_key = "crowdworks"
    BASE = "https://crowdworks.jp"

    def __init__(self) -> None:
        cookie = os.environ.get("CROWDWORKS_SESSION", "")
        self._headers = {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        }
        if cookie:
            self._headers["Cookie"] = cookie

    # 日本語サイトで効くキーワードのみ使う
    _JP_KEYWORDS = ["翻訳", "ローカライゼーション", "ライティング", "SEO", "AI", "データ入力", "校正", "Webサイト制作", "Python", "自動化"]

    async def fetch_jobs(self, keywords: List[str], **filters) -> List[Job]:
        # scan.yamlのキーワードと固定JPキーワードを合算して日本語・技術系のみ抽出
        ja_kw = [k for k in keywords if any(ord(c) > 0x3000 for c in k)]
        search_kws = list(dict.fromkeys(ja_kw + self._JP_KEYWORDS))[:8]

        seen: set = set()
        jobs: List[Job] = []
        async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
            for kw in search_kws:
                q = quote_plus(kw)
                url = f"{self.BASE}/public/jobs/search?keyword={q}&order=new"
                r = await client.get(url, headers=self._headers)
                if r.status_code in (403, 405) or "/login" in str(r.url):
                    raise CookieExpiredError(self.platform_key)
                if r.status_code >= 400:
                    continue
                m = re.search(r'<div[^>]+id="vue-container"[^>]+data="([^"]+)"', r.text)
                if not m:
                    continue
                raw = html_mod.unescape(m.group(1))
                data = json.loads(raw)
                offers = data.get("searchResult", {}).get("job_offers", [])
                for item in offers:
                    jo = item.get("job_offer", {})
                    eid = str(jo.get("id", ""))
                    if not eid or eid in seen:
                        continue
                    seen.add(eid)
                    pay = item.get("payment", {})
                    fp = pay.get("fixed_price_payment") or pay.get("hourly_payment") or {}
                    jobs.append(
                        Job(
                            platform=self.platform_key,
                            external_id=eid,
                            title=(jo.get("title") or "")[:500],
                            description=(jo.get("description_digest") or "")[:1000],
                            budget_min=fp.get("min_budget"),
                            budget_max=fp.get("max_budget"),
                            budget_type="fixed" if "fixed_price_payment" in pay else "hourly",
                            category=jo.get("genre") or "content",
                        )
                    )
                if len(jobs) >= 200:
                    break
        return jobs[:200]

    async def submit_proposal(self, job: Job, text: str) -> bool:
        return False

    async def deliver(self, contract_id: str, content: str) -> bool:
        return False
