from __future__ import annotations

import os
import re
from typing import List

import httpx
from bs4 import BeautifulSoup

from adapters.base import BaseAdapter, CookieExpiredError
from browser.lightpanda import maybe_fetch_json_via_browser
from db.models import Job


class CoconalaAdapter(BaseAdapter):
    platform_key = "coconala"
    BASE = "https://coconala.com"

    def __init__(self) -> None:
        self._cookie = os.environ.get("COCONALA_COOKIE", "")

    async def fetch_jobs(self, keywords: List[str], **filters) -> List[Job]:
        cookie = os.environ.get("COCONALA_COOKIE", "")
        headers = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"}
        if cookie:
            headers["Cookie"] = cookie
        priority = ["翻訳", "ローカライゼーション", "ライティング", "SEO"]
        q_kw = next((k for k in priority if k in keywords), None)
        if not q_kw:
            q_kw = next((k for k in keywords if any(ord(c) > 0x3000 for c in k)), keywords[0] if keywords else "翻訳")
        q = q_kw
        url = f"{self.BASE}/requests?keyword={q}"
        async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
            r = await client.get(url, headers=headers)
        if r.status_code in (403, 405) or "/login" in str(r.url):
            raise CookieExpiredError(self.platform_key)
        if r.status_code < 400:
            soup = BeautifulSoup(r.text, "html.parser")
            cards = soup.find_all("div", class_="c-searchItem")
            if cards:
                return _parse_cards(cards, self.platform_key)[:20]
        data = await maybe_fetch_json_via_browser(url)
        if isinstance(data, dict):
            return _parse_dict_jobs(data, self.platform_key)
        return []

    async def submit_proposal(self, job: Job, text: str) -> bool:
        return False

    async def deliver(self, contract_id: str, content: str) -> bool:
        return False


def _parse_cards(cards, platform: str) -> List[Job]:
    jobs: List[Job] = []
    seen: set = set()
    for card in cards:
        a = card.find("a", href=re.compile(r"/requests/\d+"))
        if not a:
            continue
        m = re.search(r"/requests/(\d+)", a.get("href", ""))
        if not m:
            continue
        rid = m.group(1)
        if rid in seen:
            continue
        seen.add(rid)
        # 募集終了フィルタ
        card_text = card.get_text()
        if "募集終了" in card_text or "受付終了" in card_text:
            continue
        title_el = card.find("div", class_="c-itemInfo_title")
        title = title_el.get_text(strip=True) if title_el else f"Request {rid}"
        desc_el = card.find("div", class_="c-itemInfo_description")
        desc = desc_el.get_text(strip=True) if desc_el else ""
        budget_el = card.find("div", class_="d-requestBudget")
        budget_txt = budget_el.get_text(strip=True) if budget_el else ""
        budget_txt = budget_txt.replace("万", "0000").replace("千", "000")
        nums = [int(n.replace(",", "")) for n in re.findall(r"[\d,]+", budget_txt) if n.replace(",", "").isdigit()]
        budget_min = nums[0] if nums else None
        budget_max = nums[-1] if len(nums) > 1 else budget_min
        jobs.append(Job(
            platform=platform,
            external_id=rid,
            title=title[:500],
            description=desc[:1000],
            budget_min=budget_min,
            budget_max=budget_max,
            category="content",
        ))
    return jobs


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
