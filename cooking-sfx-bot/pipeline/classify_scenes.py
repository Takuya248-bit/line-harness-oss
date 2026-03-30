from __future__ import annotations

import base64
import json
import os

import anthropic

PROMPT = """あなたは料理ショート動画の効果音エディターです。
以下のフレーム画像は料理動画から抽出したものです。

各シーンを以下のカテゴリに分類してください:
- cutting: 包丁・ハサミで切る
- mixing: 泡立て器・スプーンで混ぜる
- pouring: 液体を注ぐ・粉を入れる
- intro: 食材の提示・冒頭
- plating: 盛り付け
- closeup_food: 完成品のアップ
- transition: 物が横から入る・シーン転換
- text_emphasis: テロップ強調
- reaction: リアクション

ルール:
- 連続する同じカテゴリは1区間にまとめる
- 動作の開始タイミングを正確に指定する
- confidenceを付ける（0.0-1.0）

フレームは{fps}fpsで抽出しています（1フレーム={interval}秒）。

JSON配列のみ返してください（他のテキストなし）:
[{{"start": 秒, "end": 秒, "event": "カテゴリ", "confidence": 数値}}]"""


def classify_scenes(frame_paths: list[str], fps: int = 4) -> list[dict]:
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    client = anthropic.Anthropic(api_key=api_key)

    interval = 1.0 / fps
    prompt = PROMPT.format(fps=fps, interval=interval)

    # フレームを間引き（最大20枚）
    step = max(1, len(frame_paths) // 20)
    selected = frame_paths[::step]

    # Claude API用にbase64画像を準備
    content = []
    content.append({"type": "text", "text": prompt})

    for path in selected:
        with open(path, "rb") as f:
            data = base64.standard_b64encode(f.read()).decode("utf-8")
        content.append({
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": "image/jpeg",
                "data": data,
            },
        })

    response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=2048,
        messages=[{"role": "user", "content": content}],
    )

    text = response.content[0].text.strip()

    # JSON部分を抽出
    if text.startswith("```"):
        text = text.split("\n", 1)[1].rsplit("```", 1)[0]

    return json.loads(text)
