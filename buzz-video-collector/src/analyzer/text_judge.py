from __future__ import annotations
import json
import re
from dataclasses import dataclass
from typing import Optional

TEXT_JUDGE_PROMPT = """あなたはショート動画のネタ評価AIです。
以下のショート動画のキャプションを評価してください。

このネタは「酒と旅ゆく櫻子チャン」（登録者30万人）の語りネタとして使えるかを判定します。
動画の構造: 映像=料理（背景）、音声=語りネタ（本体）。つまりネタの「語り」としての面白さを評価してください。

評価軸（100点満点）:
- comment_trigger (0-30): コメント誘発力。「自分なら」「どう思う？」と言いたくなるか
- emotion (0-25): 感情トリガー。スカッと/共感/驚き/軽い不快のどれかを含むか。特にスカッと系（復讐、ざまぁ、非常識な人を懲らしめる）は高得点
- brevity (0-20): 45秒語り適性。フック→展開→転換→オチが45秒に収まるか
- freshness (0-15): ネタの汎用性。何度でも使えるネタは高得点。古くてもOK
- sakurako_angle (0-10): 海外在住/旅好き/元OL/英語に関連するか

高得点にすべきジャンル（実際のフィードバックに基づく）:
- 2ch/スカッと系: 復讐、ざまぁ、非常識な人を懲らしめる話 → emotion 20-25点
- 日本vsアメリカ/海外文化差: 英語あるある、文化の違い → sakurako_angle 8-10点
- 海外生活あるある: 海外在住者の日常ネタ → sakurako_angle 10点
- 同棲/夫婦/家族ドラマ: 感動やトラブル → emotion 15-20点
- 旅行/観光ネタ → sakurako_angle 7-10点

Tier分類:
- 1: スカッと/復讐/ざまぁ系（最も採用率が高い）
- 2: 海外文化差/英語あるある/日本vs海外
- 3: 日常ドラマ/家族/同棲/旅行エピソード
- 4: その他

除外対象（score=0を返す）:
- コント/お笑い芸人のネタ（芸人がやるタイプのコント）
- アニメ/漫画の語り・考察
- レシピ/料理手順
- Vtuber関連
- ダイエット/筋トレ/美容ハウツー
- 政治/宗教/ビジネスニュース/テック系
- ゲーム実況

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
        lines.append(f"[{i}] {(cap or '')[:500]}")
    return TEXT_JUDGE_PROMPT + "\n".join(lines)
