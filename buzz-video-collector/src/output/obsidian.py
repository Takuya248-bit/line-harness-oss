from __future__ import annotations
import re
from pathlib import Path
from typing import Optional
import yaml
from src.collectors.base import VideoItem
from src.analyzer.text_judge import TextJudgment
from src.analyzer.visual_judge import VisualJudgment

def _slugify(text: str, max_len: int = 60) -> str:
    slug = re.sub(r'[？?！!。、,./:;\'\"()（）【】\[\]{}]', '', text)
    slug = slug.strip().replace(" ", "-").replace("　", "-")
    slug = re.sub(r'-+', '-', slug).strip('-').lower()
    return slug[:max_len]

def write_video_note(item: VideoItem, text_judgment: TextJudgment,
                     visual_judgment: Optional[VisualJudgment], output_dir: str | Path) -> str:
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    date_str = item.collected_at.strftime("%Y-%m-%d")
    slug = _slugify(text_judgment.summary or item.caption[:40])
    filename = f"{date_str}-{slug}.md"
    filepath = output_dir / filename
    counter = 2
    while filepath.exists():
        filepath = output_dir / f"{date_str}-{slug}-{counter}.md"
        counter += 1
    frontmatter = {
        "title": text_judgment.summary or item.caption[:80],
        "source": item.source, "url": item.url, "tier": text_judgment.tier,
        "score": text_judgment.total_score,
        "scores": {"comment_trigger": text_judgment.comment_trigger, "emotion": text_judgment.emotion,
                   "brevity": text_judgment.brevity, "freshness": text_judgment.freshness,
                   "sakurako_angle": text_judgment.sakurako_angle},
        "likes": item.likes, "views": item.views, "comments": item.comments,
        "collected_at": item.collected_at.isoformat(),
        "tags": ["buzz-video", item.source, f"tier{text_judgment.tier}"],
    }
    if visual_judgment:
        frontmatter["visual"] = {"format": visual_judgment.format,
                                  "telop_amount": visual_judgment.telop_amount, "mood": visual_judgment.mood}
    if item.posted_at:
        frontmatter["posted_at"] = item.posted_at.isoformat()
    content = "---\n"
    content += yaml.dump(frontmatter, allow_unicode=True, default_flow_style=False, sort_keys=False)
    content += "---\n\n"
    content += f"# {text_judgment.summary or item.caption[:80]}\n\n"
    content += f"## キャプション\n\n{item.caption}\n\n"
    content += f"## ソース\n\n{item.url}\n"
    filepath.write_text(content, encoding="utf-8")
    return str(filepath)
