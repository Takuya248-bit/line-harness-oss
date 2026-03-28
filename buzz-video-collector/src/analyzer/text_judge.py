from __future__ import annotations
import json
import re
from dataclasses import dataclass
from typing import Optional

TEXT_JUDGE_PROMPT = """あなたはショート動画のネタ評価AIです。
以下のショート動画のキャプション（最大5件）を評価してください。

評価軸（100点満点）:
- comment_trigger (0-30): コメント誘発力。「自分なら」と言いたくなるか、意見が二分するか
- emotion (0-25): 感情トリガー。共感/驚き/スカッと/軽い不快のどれかを含むか
- brevity (0-20): 45秒語り適性。フック→展開→転換→オチが45秒に収まるか
- freshness (0-15): ネタの鮮度と汎用性。古くても使えるネタは5点以上
- sakurako_angle (0-10): 海外在住/旅好き/元OLの視点で語れるか

Tier分類:
- 1: 共感/議論ネタ（「どう思う？」系）
- 2: 「知らなかった」系（雑学/文化差）
- 3: エピソード素材（実体験ストーリーの種）
- 4: 時事/トレンド

除外対象（score=0を返す）:
- レシピ/食材/料理手順の説明が主題
- 政治/宗教/ビジネスニュース/テック系

各動画について以下のJSON配列で返してください。JSON以外のテキストは不要です:
[
  {
    "index": 0,
    "tier": 1,
    "summary": "ネタ要約（1行）",
    "comment_trigger": 25,
    "emotion": 20,
    "brevity": 18,
    "freshness": 10,
    "sakurako_angle": 7
  }
]

キャプション一覧:
"""

_SCORE_CAPS = {
    "comment_trigger": 30, "emotion": 25, "brevity": 20,
    "freshness": 15, "sakurako_angle": 10,
}

@dataclass
class TextJudgment:
    tier: int
    summary: str
    comment_trigger: int
    emotion: int
    brevity: int
    freshness: int
    sakurako_angle: int

    @property
    def total_score(self) -> int:
        return min(self.comment_trigger + self.emotion + self.brevity + self.freshness + self.sakurako_angle, 100)

def parse_text_judgment(raw: str) -> Optional[TextJudgment]:
    cleaned = re.sub(r"```json\s*", "", raw)
    cleaned = re.sub(r"```\s*", "", cleaned)
    cleaned = cleaned.strip()
    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError:
        return None
    if isinstance(data, list):
        if not data:
            return None
        data = data[0]
    if not isinstance(data, dict):
        return None
    try:
        return TextJudgment(
            tier=int(data.get("tier", 4)),
            summary=str(data.get("summary", "")),
            comment_trigger=min(int(data.get("comment_trigger", 0)), _SCORE_CAPS["comment_trigger"]),
            emotion=min(int(data.get("emotion", 0)), _SCORE_CAPS["emotion"]),
            brevity=min(int(data.get("brevity", 0)), _SCORE_CAPS["brevity"]),
            freshness=min(int(data.get("freshness", 0)), _SCORE_CAPS["freshness"]),
            sakurako_angle=min(int(data.get("sakurako_angle", 0)), _SCORE_CAPS["sakurako_angle"]),
        )
    except (ValueError, TypeError):
        return None

def parse_text_judgments_batch(raw: str) -> list[Optional[TextJudgment]]:
    cleaned = re.sub(r"```json\s*", "", raw)
    cleaned = re.sub(r"```\s*", "", cleaned)
    cleaned = cleaned.strip()
    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError:
        return []
    if not isinstance(data, list):
        data = [data]
    results = []
    for item in data:
        if not isinstance(item, dict):
            results.append(None)
            continue
        try:
            results.append(TextJudgment(
                tier=int(item.get("tier", 4)),
                summary=str(item.get("summary", "")),
                comment_trigger=min(int(item.get("comment_trigger", 0)), _SCORE_CAPS["comment_trigger"]),
                emotion=min(int(item.get("emotion", 0)), _SCORE_CAPS["emotion"]),
                brevity=min(int(item.get("brevity", 0)), _SCORE_CAPS["brevity"]),
                freshness=min(int(item.get("freshness", 0)), _SCORE_CAPS["freshness"]),
                sakurako_angle=min(int(item.get("sakurako_angle", 0)), _SCORE_CAPS["sakurako_angle"]),
            ))
        except (ValueError, TypeError):
            results.append(None)
    return results

def build_text_prompt(captions: list[str]) -> str:
    lines = []
    for i, cap in enumerate(captions):
        lines.append(f"[{i}] {cap[:500]}")
    return TEXT_JUDGE_PROMPT + "\n".join(lines)
