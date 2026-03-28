from __future__ import annotations

import re
from datetime import datetime, timezone

from src.collectors.base import CollectedItem

# ---------------------------------------------------------------------------
# 除外フィルタ
# ---------------------------------------------------------------------------
_EXCLUDE_PATTERNS = re.compile(
    r"レシピ|食材|料理法|作り方|100均|百均|ダイソー|セリア|コンビニ新商品|コンビニスイーツ"
    r"|政治|選挙|宗教|信仰|テック|AI最新|ビジネスニュース|株価|為替|仮想通貨"
)

# ---------------------------------------------------------------------------
# Tier 分類キーワード
# ---------------------------------------------------------------------------
_TIER1_WORDS = re.compile(
    r"どう思[うい]|心狭い|ドン引き|非常識|モヤモヤ|許せ[るない]|ってあり|賛否|炎上|意見が割れ"
)
_TIER2_WORDS = re.compile(
    r"知らなかった|日本だけ|海外では|実は|マナー違反|常識|文化の違い|外国人が驚|意外"
)
_TIER3_WORDS = re.compile(
    r"実体験|信じられ|修羅場|結末|その後|告白|暴露|懺悔|やらかし|未だに笑える"
)

# ---------------------------------------------------------------------------
# スコアリング用パターン
# ---------------------------------------------------------------------------

# 軸1: コメント誘発力 (30点)
_COMMENT_TRIGGER = re.compile(
    r"どう思[うい]|ってあり|どっちが|自分なら|心狭い|許せ[るない]|あなたなら|おかしい[？?]"
    r"|非常識|賛否|意見が割れ|どうすれば|モヤモヤ|これって普通"
)
_CONTROVERSY = re.compile(
    r"炎上|批判|擁護|反論|議論|二分|賛成.*反対|反対.*賛成|割れ"
)

# 軸2: 感情トリガー (25点)
_EMOTION_EMPATHY = re.compile(
    r"わかる|共感|それな|あるある|わかりみ|めっちゃわかる|同じ経験"
)
_EMOTION_SURPRISE = re.compile(
    r"驚き|衝撃|ショック|信じられ|ヤバい|ヤバ|マジ[？?!！]|え[？?!！]|知らなかった"
)
_EMOTION_CATHARSIS = re.compile(
    r"スカッと|ざまぁ|因果応報|天罰|やり返|仕返し|スッキリ|爽快"
)
_EMOTION_DISCOMFORT = re.compile(
    r"モヤモヤ|イラッ|ムカつ|許せ|最悪|怒り|激怒|ドン引き|気持ち悪"
)

# 軸3: 45秒語り適性 (20点) — 長すぎ/複雑すぎを検出
_COMPLEX_INDICATORS = re.compile(
    r"経緯を説明すると|長文|前提として|まず背景|登場人物が多|複雑な事情"
)

# 軸5: 櫻子視点 (10点)
_SAKURAKO_ANGLE = re.compile(
    r"海外|外国|留学|旅行|バリ|アジア|OL|会社員|社畜|通勤|飲み会|合コン"
    r"|英語|語学|国際|異文化|ワーホリ|駐在"
)


def classify_tier(item: CollectedItem) -> str:
    """Tier 1-4 を判定して返す。該当なしは 'tier4'。"""
    text = f"{item.title} {item.body_snippet}"
    if _TIER1_WORDS.search(text):
        return "tier1"
    if _TIER2_WORDS.search(text):
        return "tier2"
    if _TIER3_WORDS.search(text):
        return "tier3"
    return "tier4"


def is_excluded(item: CollectedItem) -> bool:
    """除外対象なら True を返す。"""
    text = f"{item.title} {item.body_snippet}"
    return bool(_EXCLUDE_PATTERNS.search(text))


def _score_comment_trigger(text: str, item: CollectedItem) -> float:
    """軸1: コメント誘発力 (max 30)"""
    score = 0.0
    if _COMMENT_TRIGGER.search(text):
        score += 15
    if _CONTROVERSY.search(text):
        score += 10
    # 回答/コメント数が多い = 実際に議論を呼んでいる
    answers = item.engagement.get("answers", 0) or item.engagement.get("comments", 0) or item.engagement.get("replies", 0)
    if answers >= 100:
        score += 5
    elif answers >= 50:
        score += 3
    return min(score, 30.0)


def _score_emotion(text: str) -> float:
    """軸2: 感情トリガー (max 25)"""
    score = 0.0
    if _EMOTION_EMPATHY.search(text):
        score += 8
    if _EMOTION_SURPRISE.search(text):
        score += 8
    if _EMOTION_CATHARSIS.search(text):
        score += 6
    if _EMOTION_DISCOMFORT.search(text):
        score += 8
    return min(score, 25.0)


def _score_brevity(text: str) -> float:
    """軸3: 45秒で語れるか (max 20)
    短くまとまっている = 高得点。複雑すぎる = 減点。
    """
    score = 16.0  # ベースライン（普通）
    # タイトル+スニペットが短い → コンパクトにまとまっている
    if len(text) < 100:
        score = 20.0
    elif len(text) < 200:
        score = 18.0
    elif len(text) > 500:
        score = 10.0
    # 複雑すぎるインジケータ
    if _COMPLEX_INDICATORS.search(text):
        score = max(score - 8, 0)
    return min(score, 20.0)


def _score_freshness(item: CollectedItem) -> float:
    """軸4: 鮮度 (max 15)
    3日以内の超短期ネタは除外（撮影→投稿のタイムラグ）。
    3日〜2週間が最適。2週間超は減点。
    """
    now = datetime.now(timezone.utc)
    collected = item.collected_at
    if collected.tzinfo is None:
        collected = collected.replace(tzinfo=timezone.utc)
    age_hours = (now - collected).total_seconds() / 3600

    if age_hours < 72:
        # 3日以内 = 賞味期限が短すぎる
        return 5.0
    elif age_hours < 168:
        # 3日〜1週間 = ベスト
        return 15.0
    elif age_hours < 336:
        # 1〜2週間
        return 10.0
    else:
        # 2週間超
        return 5.0


def _score_sakurako_angle(text: str) -> float:
    """軸5: 櫻子の視点で語れるか (max 10)"""
    score = 0.0
    if _SAKURAKO_ANGLE.search(text):
        score += 7
    # 基本どんな話題でも多少は語れるのでベース3点
    score += 3
    return min(score, 10.0)


def score_item(item: CollectedItem) -> int:
    """5軸スコアリング（100点満点）。除外対象は0点。"""
    if is_excluded(item):
        return 0

    text = f"{item.title} {item.body_snippet}"

    total = (
        _score_comment_trigger(text, item)
        + _score_emotion(text)
        + _score_brevity(text)
        + _score_freshness(item)
        + _score_sakurako_angle(text)
    )
    return int(min(total, 100))


def score_item_detail(item: CollectedItem) -> dict:
    """スコア詳細を辞書で返す（デバッグ/CSV出力用）。"""
    if is_excluded(item):
        return {
            "total": 0,
            "excluded": True,
            "tier": classify_tier(item),
            "comment_trigger": 0,
            "emotion": 0,
            "brevity": 0,
            "freshness": 0,
            "sakurako_angle": 0,
        }

    text = f"{item.title} {item.body_snippet}"
    ct = _score_comment_trigger(text, item)
    em = _score_emotion(text)
    br = _score_brevity(text)
    fr = _score_freshness(item)
    sa = _score_sakurako_angle(text)

    return {
        "total": int(min(ct + em + br + fr + sa, 100)),
        "excluded": False,
        "tier": classify_tier(item),
        "comment_trigger": int(ct),
        "emotion": int(em),
        "brevity": int(br),
        "freshness": int(fr),
        "sakurako_angle": int(sa),
    }
