from __future__ import annotations

import os
import re
from typing import List
from urllib.parse import quote_plus

import httpx
from bs4 import BeautifulSoup

from adapters.base import BaseAdapter, CookieExpiredError
from db.models import Job


class LancersAdapter(BaseAdapter):
    platform_key = "lancers"
    BASE = "https://www.lancers.jp"

    def __init__(self) -> None:
        cookie = os.environ.get("LANCERS_SESSION", "")
        self._headers = {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml",
            "Accept-Language": "ja,en-US;q=0.9",
        }
        if cookie:
            self._headers["Cookie"] = cookie

    async def fetch_jobs(self, keywords: List[str], **filters) -> List[Job]:
        cookie = os.environ.get("LANCERS_SESSION", "")
        if not cookie:
            return []
        self._headers["Cookie"] = cookie
        # 翻訳・ローカライゼーション系キーワードを優先（なければ最初の日本語キーワード）
        priority = ["翻訳", "ローカライゼーション", "ライティング", "SEO"]
        q_kw = next((k for k in priority if k in keywords), None)
        if not q_kw:
            q_kw = next((k for k in keywords if any(ord(c) > 0x3000 for c in k)), keywords[0] if keywords else "翻訳")
        url = f"{self.BASE}/work/search?open=1&keyword={quote_plus(q_kw)}&order=new"
        async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
            r = await client.get(url, headers=self._headers)
        # cookie切れ検知: ログインページへのリダイレクト or 403/405
        if r.status_code in (403, 405) or "/user/login" in str(r.url):
            raise CookieExpiredError(self.platform_key)
        if r.status_code >= 400:
            return []

        soup = BeautifulSoup(r.text, "html.parser")
        jobs: List[Job] = []
        seen: set = set()

        for card in soup.select("div.p-search-job-media"):
            a = card.select_one("a.p-search-job-media__title")
            if not a:
                continue
            href = a.get("href", "")
            m = re.search(r"/work/detail/(\d+)", href)
            if not m:
                continue
            eid = m.group(1)
            if eid in seen:
                continue
            seen.add(eid)

            title = a.get_text(strip=True)

            # 予算: span.p-search-job-media__number が min/max の順
            nums = [
                int(n.get_text(strip=True).replace(",", ""))
                for n in card.select("span.p-search-job-media__number")
                if n.get_text(strip=True).replace(",", "").isdigit()
            ]
            budget_min = nums[0] if nums else None
            budget_max = nums[1] if len(nums) > 1 else budget_min

            # 予算タイプ: 最後のc-media__job-unit に「時間」があれば hourly
            units = [u.get_text(strip=True) for u in card.select("span.c-media__job-unit")]
            budget_type = "hourly" if any("時間" in u for u in units) else "fixed"

            # 説明
            desc_el = card.select_one("div.c-media__description")
            desc = desc_el.get_text(strip=True)[:1000] if desc_el else ""

            jobs.append(Job(
                platform=self.platform_key,
                external_id=eid,
                title=title[:500],
                description=desc,
                budget_min=budget_min,
                budget_max=budget_max,
                budget_type=budget_type,
                category="content",
            ))

        return jobs[:30]

    async def submit_proposal(self, job: Job, text: str) -> bool:
        return False

    async def deliver(self, contract_id: str, content: str) -> bool:
        return False
