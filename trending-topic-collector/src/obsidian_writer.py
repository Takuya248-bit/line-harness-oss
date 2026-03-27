from __future__ import annotations

import re
from pathlib import Path

import yaml

from src.collectors.base import CollectedItem


def _slugify(text: str, max_len: int = 60) -> str:
    slug = re.sub(r'[？?！!。、,./:;\'\"()（）【】\[\]{}]', '', text)
    slug = slug.strip().replace(" ", "-").replace("　", "-")
    slug = re.sub(r'-+', '-', slug).strip('-').lower()
    return slug[:max_len]


def write_topic_note(
    item: CollectedItem,
    score: int,
    output_dir: str | Path,
) -> str:
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    date_str = item.collected_at.strftime("%Y-%m-%d")
    slug = _slugify(item.title)
    filename = f"{date_str}-{slug}.md"
    filepath = output_dir / filename

    counter = 2
    while filepath.exists():
        filepath = output_dir / f"{date_str}-{slug}-{counter}.md"
        counter += 1

    frontmatter = {
        "title": item.title,
        "source": item.source,
        "score": score,
        "category": item.category,
        "collected_at": item.collected_at.isoformat(),
        "url": item.url,
        "engagement": item.engagement,
        "tags": ["trending-topic", item.source]
        + ([item.category] if item.category else []),
    }

    body_section = item.body_snippet if item.body_snippet else "(本文なし)"

    content = "---\n"
    content += yaml.dump(frontmatter, allow_unicode=True, default_flow_style=False, sort_keys=False)
    content += "---\n\n"
    content += f"# {item.title}\n\n"
    content += f"## 元ネタ要約\n\n{body_section}\n\n"
    content += f"## ソース\n\n{item.url}\n"

    filepath.write_text(content, encoding="utf-8")
    return str(filepath)
