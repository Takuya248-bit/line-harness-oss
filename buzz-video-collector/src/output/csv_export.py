from __future__ import annotations
import csv
from dataclasses import dataclass
from pathlib import Path
from typing import Optional
from src.collectors.base import VideoItem
from src.analyzer.text_judge import TextJudgment
from src.analyzer.visual_judge import VisualJudgment

@dataclass
class ScoredVideo:
    item: VideoItem
    text: TextJudgment
    visual: Optional[VisualJudgment] = None

def export_csv(scored: list[ScoredVideo], path: str | Path) -> None:
    with open(path, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["スコア", "Tier", "コメント誘発", "感情", "語り適性", "鮮度",
                     "櫻子視点", "ソース", "要約", "URL", "いいね", "再生数",
                     "フォーマット", "テロップ量", "雰囲気"])
        for sv in scored:
            vf = sv.visual.format if sv.visual else ""
            vt = sv.visual.telop_amount if sv.visual else ""
            vm = sv.visual.mood if sv.visual else ""
            w.writerow([sv.text.total_score, sv.text.tier, sv.text.comment_trigger,
                        sv.text.emotion, sv.text.brevity, sv.text.freshness,
                        sv.text.sakurako_angle, sv.item.source, sv.text.summary,
                        sv.item.url, sv.item.likes, sv.item.views, vf, vt, vm])
