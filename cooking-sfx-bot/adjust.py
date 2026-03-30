from __future__ import annotations

import json
import os

import anthropic

ADJUST_PROMPT = """あなたはSEタイムライン編集アシスタントです。
ユーザーの指示をタイムライン操作に変換してください。

現在のタイムライン:
{timeline_json}

利用可能なSEカテゴリとファイル:
{sfx_list}

ユーザーの指示: {instruction}

以下のJSON形式で操作を返してください（他のテキストなし）:
{{
  "operations": [
    {{"action": "delete", "timestamp": 5.0}},
    {{"action": "add", "timestamp": 25.0, "sfx_category": "misc", "sfx_name": "punipuni.wav", "volume_db": 0}},
    {{"action": "volume", "timestamp": 2.0, "volume_db": 5}},
    {{"action": "move", "from_timestamp": 3.0, "to_timestamp": 3.5}}
  ]
}}

注意:
- timestampは最も近いエントリにマッチさせる（±1秒以内）
- 操作がない場合は空配列を返す
"""

def list_sfx_files(sfx_dir: str) -> str:
    lines = []
    for cat in sorted(os.listdir(sfx_dir)):
        cat_path = os.path.join(sfx_dir, cat)
        if not os.path.isdir(cat_path):
            continue
        files = [f for f in os.listdir(cat_path) if f.endswith(".wav")]
        if files:
            lines.append(f"{cat}: {', '.join(sorted(files))}")
    return "\n".join(lines)

def parse_adjustment(instruction: str, timeline: list[dict], sfx_dir: str) -> list[dict]:
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    client = anthropic.Anthropic(api_key=api_key)
    display_timeline = []
    for entry in timeline:
        display_timeline.append({
            "timestamp": entry["timestamp"],
            "sfx": os.path.basename(entry["sfx"]),
            "volume_db": entry["volume_db"],
        })
    prompt = ADJUST_PROMPT.format(
        timeline_json=json.dumps(display_timeline, ensure_ascii=False, indent=2),
        sfx_list=list_sfx_files(sfx_dir),
        instruction=instruction,
    )
    response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}],
    )
    text = response.content[0].text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1].rsplit("```", 1)[0]
    result = json.loads(text)
    return result.get("operations", [])

def apply_operations(timeline: list[dict], operations: list[dict], sfx_dir: str) -> list[dict]:
    timeline = [e.copy() for e in timeline]
    for op in operations:
        action = op["action"]
        if action == "delete":
            ts = op["timestamp"]
            timeline = [e for e in timeline if abs(e["timestamp"] - ts) > 1.0]
        elif action == "add":
            sfx_path = os.path.join(sfx_dir, op["sfx_category"], op["sfx_name"])
            if os.path.exists(sfx_path):
                timeline.append({"timestamp": op["timestamp"], "sfx": sfx_path, "volume_db": op.get("volume_db", 0)})
        elif action == "volume":
            ts = op["timestamp"]
            for e in timeline:
                if abs(e["timestamp"] - ts) <= 1.0:
                    e["volume_db"] = op["volume_db"]
        elif action == "move":
            for e in timeline:
                if abs(e["timestamp"] - op["from_timestamp"]) <= 1.0:
                    e["timestamp"] = op["to_timestamp"]
                    break
    timeline.sort(key=lambda x: x["timestamp"])
    return timeline
