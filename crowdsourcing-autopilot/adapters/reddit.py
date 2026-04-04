from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import List

import httpx

from adapters.base import BaseAdapter
from db.models import Job

# 案件が流れるサブレディット
_SUBREDDITS = [
    "forhire",
    "slavelabour",
    "HireaWriter",
    "WorkOnline",
    "Jobs4Bitcoins",
]

# [HIRING]タグのある投稿のみ対象（[FOR HIRE]は自分が売る側）
_HIRING_PATTERN = re.compile(r"^\[hiring\]", re.IGNORECASE)

API_BASE = "https://www.reddit.com/r/{sub}/new.json"


class RedditAdapter(BaseAdapter):
    """Reddit公開JSON API（認証不要）から案件を取得する。"""

    platform_key = "reddit"

    async def fetch_jobs(self, keywords: List[str], **filters) -> List[Job]:
        try:
            return await self._fetch_jobs_impl(keywords)
        except Exception:
            return []

    async def _fetch_jobs_impl(self, keywords: List[str]) -> List[Job]:
        headers = {
            "User-Agent": "crowdsourcing-autopilot/1.0 (job scanner)"
        }
        kw_lower = [k.lower() for k in keywords]

        jobs: List[Job] = []
        seen: set = set()

        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
            for sub in _SUBREDDITS:
                url = API_BASE.format(sub=sub)
                try:
                    r = await client.get(url, headers=headers, params={"limit": 100})
                    if r.status_code == 429:
                        break  # rate limit
                    r.raise_for_status()
                except Exception:
                    continue

                data = r.json()
                posts = (data.get("data") or {}).get("children") or []

                for post in posts:
                    item = post.get("data") or {}
                    title = str(item.get("title") or "")
                    desc = str(item.get("selftext") or "")
                    post_id = str(item.get("id") or "")

                    if not post_id or post_id in seen:
                        continue

                    # [HIRING]タグのある投稿のみ
                    if not _HIRING_PATTERN.match(title):
                        continue

                    seen.add(post_id)

                    # キーワードフィルタ
                    if kw_lower:
                        text = f"{title} {desc}".lower()
                        if not any(kw in text for kw in kw_lower):
                            continue

                    posted_at = _parse_epoch(item.get("created_utc"))
                    permalink = str(item.get("permalink") or "")

                    jobs.append(Job(
                        platform=self.platform_key,
                        external_id=post_id,
                        title=title[:500],
                        description=_clean(desc)[:1000],
                        budget_min=None,
                        budget_max=_extract_budget(title + " " + desc),
                        budget_type="fixed",
                        category=sub,
                        posted_at=posted_at,
                    ))

        return jobs[:100]

    async def submit_proposal(self, job: Job, text: str) -> bool:
        return False  # Redditへの返信は手動

    async def deliver(self, contract_id: str, content: str) -> bool:
        return False


def _parse_epoch(v) -> datetime | None:
    try:
        return datetime.fromtimestamp(float(v), tz=timezone.utc)
    except (TypeError, ValueError):
        return None


def _extract_budget(text: str) -> float | None:
    """$50, $100/hr などを抽出して数値化する。"""
    m = re.search(r"\$\s*(\d[\d,]*)", text)
    if m:
        try:
            return float(m.group(1).replace(",", ""))
        except ValueError:
            pass
    return None


def _clean(text: str) -> str:
    text = re.sub(r"http\S+", "", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()
