from __future__ import annotations
import json
import re
from dataclasses import dataclass
from typing import Optional

VALID_FORMATS = {"テロップ主体", "手元料理", "顔出しトーク", "風景Vlog", "その他"}
VALID_TELOP = {"多い", "普通", "少ない"}
VALID_MOODS = {"おしゃれ", "カジュアル", "情報系", "エンタメ"}

VISUAL_JUDGE_PROMPT = """このショート動画のスクリーンショットを見て、動画のフォーマットを分類してください。

JSON形式で返してください。JSON以外のテキストは不要です:
{
  "format": "テロップ主体" | "手元料理" | "顔出しトーク" | "風景Vlog" | "その他",
  "telop_amount": "多い" | "普通" | "少ない",
  "mood": "おしゃれ" | "カジュアル" | "情報系" | "エンタメ"
}
"""


@dataclass
class VisualJudgment:
    format: str
    telop_amount: str
    mood: str


def parse_visual_judgment(raw: str) -> Optional[VisualJudgment]:
    cleaned = re.sub(r"```json\s*", "", raw)
    cleaned = re.sub(r"```\s*", "", cleaned)
    cleaned = cleaned.strip()
    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError:
        return None
    if not isinstance(data, dict):
        return None
    fmt = str(data.get("format", "その他"))
    if fmt not in VALID_FORMATS:
        fmt = "その他"
    telop = str(data.get("telop_amount", "普通"))
    if telop not in VALID_TELOP:
        telop = "普通"
    mood = str(data.get("mood", "カジュアル"))
    if mood not in VALID_MOODS:
        mood = "カジュアル"
    return VisualJudgment(format=fmt, telop_amount=telop, mood=mood)
