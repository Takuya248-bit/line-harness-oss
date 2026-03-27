from __future__ import annotations

import re
from datetime import datetime

import requests
from bs4 import BeautifulSoup

from src.collectors.base import BaseCollector, CollectedItem

_CATEGORY_SLUGS = {
    "恋愛相談": "2078297246",
    "生き方と恋愛、人間関係の悩み": "2078297245",
    "海外": "2079526476",
    "職場の悩み": "2078297248",
    "家族関係の悩み": "2078297247",
}

_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept-Language": "ja,en;q=0.9",
}


def _parse_view_count(text: str) -> int:
    text = text.replace(",", "").replace("閲覧", "").strip()
    m = re.search(r"(\d+)", text)
    return int(m.group(1)) if m else 0


def _parse_answer_count(text: str) -> int:
    m = re.search(r"(\d+)", text)
    return int(m.group(1)) if m else 0


def _parse_question_list_page(
    html: str,
    min_views: int = 10000,
    min_answers: int = 3,
    category: str = "",
) -> list[CollectedItem]:
    soup = BeautifulSoup(html, "lxml")
    items = []

    for qa in soup.select("[class*='QaListItem'], .ClapLv2QaList__item, li[data-qa-id]"):
        link = qa.select_one("a[href*='question_detail']")
        if not link:
            continue
        title = link.get_text(strip=True)
        url = link.get("href", "")
        if not url.startswith("http"):
            url = "https://detail.chiebukuro.yahoo.co.jp" + url

        view_el = qa.select_one("[class*='ViewCount'], [class*='view']")
        views = _parse_view_count(view_el.get_text()) if view_el else 0

        ans_el = qa.select_one("[class*='AnswerCount'], [class*='answer']")
        answers = _parse_answer_count(ans_el.get_text()) if ans_el else 0

        if views >= min_views and answers >= min_answers:
            items.append(CollectedItem(
                title=title,
                url=url,
                source="chiebukuro",
                category=category,
                engagement={"views": views, "answers": answers},
            ))

    return items


class ChiebukuroCollector(BaseCollector):
    source_name = "chiebukuro"

    def __init__(self, config: dict):
        self._categories = config.get("categories", [])
        self._min_views = config.get("min_views", 10000)
        self._min_answers = config.get("min_answers", 3)

    def collect(self) -> list[CollectedItem]:
        all_items: list[CollectedItem] = []

        for cat_name in self._categories:
            cat_id = _CATEGORY_SLUGS.get(cat_name)
            if not cat_id:
                print(f"  [chiebukuro] Unknown category: {cat_name}")
                continue

            url = f"https://chiebukuro.yahoo.co.jp/category/{cat_id}/question/list?sort=view&flg=2"
            try:
                resp = requests.get(url, headers=_HEADERS, timeout=15)
                resp.raise_for_status()
                items = _parse_question_list_page(
                    resp.text,
                    min_views=self._min_views,
                    min_answers=self._min_answers,
                    category=cat_name,
                )
                all_items.extend(items)
                print(f"  [chiebukuro] {cat_name}: {len(items)}件")
            except Exception as e:
                print(f"  [chiebukuro] {cat_name}: error - {e}")

        return all_items
