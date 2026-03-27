from __future__ import annotations

import re
from datetime import datetime

import requests
from bs4 import BeautifulSoup

from src.collectors.base import BaseCollector, CollectedItem

# 2026-03 時点の正しいカテゴリID（chiebukuro.yahoo.co.jp/category から取得）
_CATEGORY_SLUGS = {
    "恋愛相談": "2078675272",
    "生き方と恋愛、人間関係の悩み": "2078297875",
    "海外": "2078297941",
    "職場の悩み": "2078675274",
    "家族関係の悩み": "2078675273",
}

_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept-Language": "ja,en;q=0.9",
}


def _parse_answer_count(text: str) -> int:
    m = re.search(r"(\d+)", text)
    return int(m.group(1)) if m else 0


def _parse_question_list_page(
    html: str,
    min_answers: int = 3,
    category: str = "",
    # min_views kept for API compatibility but ignored (not available in current HTML)
    min_views: int = 0,
) -> list[CollectedItem]:
    soup = BeautifulSoup(html, "lxml")
    items = []

    for item in soup.select("div[class*='ClapLv3List_Chie-List__ListItem']"):
        link = item.select_one("a[class*='ClapLv2ListItem_Chie-ListItem__Anchor']")
        if not link:
            continue
        url = link.get("href", "")
        if not url.startswith("http"):
            url = "https://detail.chiebukuro.yahoo.co.jp" + url

        title_el = item.select_one("[class*='TextBlock__Text']")
        title = title_el.get_text(strip=True) if title_el else link.get_text(strip=True)
        if not title:
            continue

        # 回答数: aria-label="回答数：" の次の InformationText
        answers = 0
        for info_item in item.select("[class*='InformationItem']"):
            icon = info_item.select_one("[aria-label='回答数：']")
            if icon:
                text_el = info_item.select_one("[class*='InformationText']")
                if text_el:
                    answers = _parse_answer_count(text_el.get_text(strip=True))
                break

        if answers >= min_answers:
            items.append(CollectedItem(
                title=title,
                url=url,
                source="chiebukuro",
                category=category,
                engagement={"answers": answers},
            ))

    return items


class ChiebukuroCollector(BaseCollector):
    source_name = "chiebukuro"

    def __init__(self, config: dict):
        self._categories = config.get("categories", [])
        self._min_answers = config.get("min_answers", 3)

    def collect(self) -> list[CollectedItem]:
        all_items: list[CollectedItem] = []

        for cat_name in self._categories:
            cat_id = _CATEGORY_SLUGS.get(cat_name)
            if not cat_id:
                print(f"  [chiebukuro] Unknown category: {cat_name}")
                continue

            url = f"https://chiebukuro.yahoo.co.jp/category/{cat_id}/question/list"
            try:
                resp = requests.get(url, headers=_HEADERS, timeout=15)
                resp.raise_for_status()
                items = _parse_question_list_page(
                    resp.text,
                    min_answers=self._min_answers,
                    category=cat_name,
                )
                all_items.extend(items)
                print(f"  [chiebukuro] {cat_name}: {len(items)}件")
            except Exception as e:
                print(f"  [chiebukuro] {cat_name}: error - {e}")

        return all_items
