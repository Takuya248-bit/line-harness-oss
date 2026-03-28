# buzz-video-collector 実装プラン

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ショート動画PF（IG Reels / YT Shorts）からバズ動画を自動収集し、Gemini Flashでネタ分類+スクショフォーマット分析を行い、Obsidian+LINE通知で櫻子に届ける

**Architecture:** Python CLIパイプライン。collectors（IG/YT）→ analyzer（Gemini Flash テキスト+画像判定）→ output（Obsidian/LINE/CSV）の3層。dedup DBで重複排除。trending-topic-collectorのdedup/config/output層を流用しつつ、collector層とanalyzer層を新規実装。

**Tech Stack:** Python 3.11+, playwright, yt-dlp, google-generativeai, pyyaml, requests

---

## ファイル構成

```
buzz-video-collector/
├── src/
│   ├── __init__.py
│   ├── __main__.py              ← python3 -m src で実行
│   ├── collectors/
│   │   ├── __init__.py
│   │   ├── base.py              ← VideoItem dataclass + BaseCollector ABC
│   │   ├── ig_reels.py          ← Playwright + yt-dlp 5並列
│   │   └── yt_shorts.py         ← YouTube Data API v3
│   ├── analyzer/
│   │   ├── __init__.py
│   │   ├── gemini.py            ← Gemini Flash API client（テキスト+画像バッチ）
│   │   ├── text_judge.py        ← テキスト判定プロンプト+パース
│   │   └── visual_judge.py      ← スクショ判定プロンプト+パース
│   ├── output/
│   │   ├── __init__.py
│   │   ├── obsidian.py          ← Obsidian Vault書き出し
│   │   ├── line_notify.py       ← LINE通知
│   │   └── csv_export.py        ← CSV出力
│   ├── dedup.py                 ← URL重複排除（SQLite）
│   ├── config.py                ← config.yaml読み込み
│   └── main.py                  ← CLIオーケストレーター
├── tests/
│   ├── __init__.py
│   ├── test_base.py
│   ├── test_text_judge.py
│   ├── test_visual_judge.py
│   ├── test_dedup.py
│   ├── test_obsidian.py
│   ├── test_csv_export.py
│   └── test_main.py
├── config.yaml
├── requirements.txt
├── data/                        ← 自動生成（seen.db）
└── screenshots/                 ← 自動生成（IG Reelsスクショ）
```

---

### Task 1: プロジェクト骨格 + base.py + dedup.py

**Files:**
- Create: `buzz-video-collector/requirements.txt`
- Create: `buzz-video-collector/src/__init__.py`
- Create: `buzz-video-collector/src/__main__.py`
- Create: `buzz-video-collector/src/collectors/__init__.py`
- Create: `buzz-video-collector/src/collectors/base.py`
- Create: `buzz-video-collector/src/analyzer/__init__.py`
- Create: `buzz-video-collector/src/output/__init__.py`
- Create: `buzz-video-collector/src/dedup.py`
- Create: `buzz-video-collector/src/config.py`
- Create: `buzz-video-collector/config.yaml`
- Create: `buzz-video-collector/tests/__init__.py`
- Create: `buzz-video-collector/tests/test_base.py`
- Create: `buzz-video-collector/tests/test_dedup.py`

- [ ] **Step 1: プロジェクトディレクトリとrequirements.txt作成**

```
buzz-video-collector/
├── src/
│   ├── __init__.py
│   ├── __main__.py
│   ├── collectors/
│   │   └── __init__.py
│   ├── analyzer/
│   │   └── __init__.py
│   └── output/
│       └── __init__.py
└── tests/
    └── __init__.py
```

```txt
# requirements.txt
playwright>=1.40
yt-dlp>=2024.1
google-generativeai>=0.8
google-api-python-client>=2.100
pyyaml>=6.0
requests>=2.31
pytest>=8.0
```

```python
# src/__main__.py
from src.main import main
main()
```

- [ ] **Step 2: テスト作成 — base.py の VideoItem**

```python
# tests/test_base.py
from datetime import datetime
from src.collectors.base import VideoItem


def test_video_item_defaults():
    item = VideoItem(
        url="https://instagram.com/reel/abc123",
        source="ig_reels",
        caption="テスト動画",
    )
    assert item.url == "https://instagram.com/reel/abc123"
    assert item.source == "ig_reels"
    assert item.caption == "テスト動画"
    assert item.likes == 0
    assert item.views == 0
    assert item.comments == 0
    assert item.screenshot_path == ""
    assert item.posted_at is None
    assert isinstance(item.collected_at, datetime)


def test_video_item_with_all_fields():
    now = datetime(2026, 3, 28, 12, 0)
    item = VideoItem(
        url="https://youtube.com/shorts/xyz",
        source="yt_shorts",
        caption="YT動画",
        likes=50000,
        views=1000000,
        comments=300,
        screenshot_path="/tmp/ss.png",
        posted_at=now,
        collected_at=now,
    )
    assert item.likes == 50000
    assert item.views == 1000000
    assert item.posted_at == now
```

- [ ] **Step 3: テスト実行 — 失敗を確認**

Run: `cd buzz-video-collector && python3 -m pytest tests/test_base.py -v`
Expected: FAIL（VideoItemが未定義）

- [ ] **Step 4: base.py実装**

```python
# src/collectors/base.py
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional


@dataclass
class VideoItem:
    """収集した1本のショート動画"""
    url: str
    source: str  # ig_reels, yt_shorts
    caption: str = ""
    likes: int = 0
    views: int = 0
    comments: int = 0
    screenshot_path: str = ""
    posted_at: Optional[datetime] = None
    collected_at: datetime = field(default_factory=datetime.now)


class BaseCollector(ABC):
    source_name: str = ""

    @abstractmethod
    def collect(self) -> list[VideoItem]:
        ...
```

- [ ] **Step 5: テスト実行 — パス確認**

Run: `cd buzz-video-collector && python3 -m pytest tests/test_base.py -v`
Expected: 2 passed

- [ ] **Step 6: テスト作成 — dedup.py**

```python
# tests/test_dedup.py
import tempfile
from pathlib import Path
from src.dedup import DedupDB


def test_dedup_new_url():
    with tempfile.TemporaryDirectory() as d:
        db = DedupDB(Path(d) / "test.db")
        assert db.is_seen("https://example.com/1") is False
        db.mark_seen("https://example.com/1", "title1", "ig_reels")
        assert db.is_seen("https://example.com/1") is True
        assert db.is_seen("https://example.com/2") is False
        db.close()


def test_dedup_cleanup():
    with tempfile.TemporaryDirectory() as d:
        db = DedupDB(Path(d) / "test.db")
        db.mark_seen("https://example.com/old", "old", "ig_reels")
        cleaned = db.cleanup(max_age_days=0)
        assert cleaned == 1
        assert db.is_seen("https://example.com/old") is False
        db.close()
```

- [ ] **Step 7: dedup.py実装**

trending-topic-collectorのdedup.pyをコピーして配置:

```python
# src/dedup.py
from __future__ import annotations

import sqlite3
from datetime import datetime, timedelta
from pathlib import Path


class DedupDB:
    def __init__(self, db_path: str | Path = "data/seen.db"):
        self._conn = sqlite3.connect(str(db_path))
        self._conn.execute("""
            CREATE TABLE IF NOT EXISTS seen (
                url TEXT PRIMARY KEY,
                title TEXT,
                source TEXT,
                first_seen_at TEXT
            )
        """)
        self._conn.commit()

    def is_seen(self, url: str) -> bool:
        row = self._conn.execute(
            "SELECT 1 FROM seen WHERE url = ?", (url,)
        ).fetchone()
        return row is not None

    def mark_seen(self, url: str, title: str, source: str) -> None:
        self._conn.execute(
            "INSERT OR IGNORE INTO seen (url, title, source, first_seen_at) VALUES (?, ?, ?, ?)",
            (url, title, source, datetime.now().isoformat()),
        )
        self._conn.commit()

    def cleanup(self, max_age_days: int = 30) -> int:
        cutoff = (datetime.now() - timedelta(days=max_age_days)).isoformat()
        cur = self._conn.execute(
            "DELETE FROM seen WHERE first_seen_at < ?", (cutoff,)
        )
        self._conn.commit()
        return cur.rowcount

    def close(self) -> None:
        self._conn.close()
```

- [ ] **Step 8: テスト実行 — パス確認**

Run: `cd buzz-video-collector && python3 -m pytest tests/test_dedup.py -v`
Expected: 2 passed

- [ ] **Step 9: config.py + config.yaml作成**

```python
# src/config.py
from __future__ import annotations

import os
from pathlib import Path

import yaml

_DEFAULT_CONFIG_PATH = Path(__file__).parent.parent / "config.yaml"


def load_config(path: str | Path | None = None) -> dict:
    p = Path(path) if path else _DEFAULT_CONFIG_PATH
    with open(p, encoding="utf-8") as f:
        cfg = yaml.safe_load(f)

    cfg.setdefault("notification", {}).setdefault("line", {})
    if os.environ.get("LINE_NOTIFY_TOKEN"):
        cfg["notification"]["line"]["token"] = os.environ["LINE_NOTIFY_TOKEN"]

    cfg.setdefault("sources", {}).setdefault("yt_shorts", {})
    if os.environ.get("YOUTUBE_API_KEY"):
        cfg["sources"]["yt_shorts"]["api_key"] = os.environ["YOUTUBE_API_KEY"]

    if os.environ.get("GEMINI_API_KEY"):
        cfg.setdefault("analyzer", {})["api_key"] = os.environ["GEMINI_API_KEY"]

    return cfg
```

```yaml
# config.yaml
schedule:
  times: ["09:00"]
  timezone: "Asia/Makassar"  # バリ時間 (WITA, UTC+8)

scoring:
  save_threshold: 50
  notify_threshold: 70

sources:
  ig_reels:
    enabled: true
    accounts:
      - "buzzrecipe"
      - "and_and_and_and"
      - "orecipe_"
    hashtags:
      - "ショート動画"
      - "バズレシピ"
      - "shorts"
    max_items: 100
    yt_dlp_parallel: 5

  yt_shorts:
    enabled: true
    channels: []
    keywords:
      - "語り系ショート"
      - "あるある ショート"
      - "海外 文化 違い"
    max_results: 50

analyzer:
  model: "gemini-2.5-flash-preview-05-20"
  batch_size: 5

notification:
  line:
    enabled: true

obsidian:
  vault_path: "~/Documents/Obsidian Vault"
  output_dir: "knowledge/buzz-videos"
```

- [ ] **Step 10: コミット**

```bash
cd buzz-video-collector
git add -A
git commit -m "feat(buzz-video-collector): project skeleton with base, dedup, config"
```

---

### Task 2: Gemini Flash テキスト判定（text_judge.py）

**Files:**
- Create: `buzz-video-collector/src/analyzer/gemini.py`
- Create: `buzz-video-collector/src/analyzer/text_judge.py`
- Create: `buzz-video-collector/tests/test_text_judge.py`

- [ ] **Step 1: テスト作成 — text_judge のパース関数**

```python
# tests/test_text_judge.py
import json
from src.analyzer.text_judge import parse_text_judgment, TextJudgment


def test_parse_valid_json():
    raw = json.dumps({
        "tier": 1,
        "summary": "彼氏が友人と旅行に行っていた件",
        "comment_trigger": 25,
        "emotion": 20,
        "brevity": 18,
        "freshness": 10,
        "sakurako_angle": 7,
    })
    result = parse_text_judgment(raw)
    assert isinstance(result, TextJudgment)
    assert result.tier == 1
    assert result.total_score == 80
    assert result.summary == "彼氏が友人と旅行に行っていた件"


def test_parse_clamped_scores():
    """各軸の上限を超えたらclampされる"""
    raw = json.dumps({
        "tier": 2,
        "summary": "test",
        "comment_trigger": 50,
        "emotion": 40,
        "brevity": 30,
        "freshness": 20,
        "sakurako_angle": 15,
    })
    result = parse_text_judgment(raw)
    assert result.comment_trigger == 30
    assert result.emotion == 25
    assert result.brevity == 20
    assert result.freshness == 15
    assert result.sakurako_angle == 10
    assert result.total_score == 100


def test_parse_invalid_json_returns_none():
    result = parse_text_judgment("not json at all")
    assert result is None


def test_parse_json_in_markdown_fence():
    raw = '```json\n{"tier":3,"summary":"test","comment_trigger":10,"emotion":10,"brevity":10,"freshness":10,"sakurako_angle":5}\n```'
    result = parse_text_judgment(raw)
    assert result is not None
    assert result.tier == 3
```

- [ ] **Step 2: テスト実行 — 失敗確認**

Run: `cd buzz-video-collector && python3 -m pytest tests/test_text_judge.py -v`
Expected: FAIL

- [ ] **Step 3: text_judge.py実装**

```python
# src/analyzer/text_judge.py
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
    "comment_trigger": 30,
    "emotion": 25,
    "brevity": 20,
    "freshness": 15,
    "sakurako_angle": 10,
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
        return min(
            self.comment_trigger + self.emotion + self.brevity
            + self.freshness + self.sakurako_angle,
            100,
        )


def parse_text_judgment(raw: str) -> Optional[TextJudgment]:
    """Geminiの応答文字列からTextJudgmentをパースする。"""
    # マークダウンコードフェンスを除去
    cleaned = re.sub(r"```json\s*", "", raw)
    cleaned = re.sub(r"```\s*", "", cleaned)
    cleaned = cleaned.strip()

    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError:
        return None

    # 配列の場合は最初の要素を取る
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
    """バッチ応答（JSON配列）をパースして複数のTextJudgmentを返す。"""
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
    """キャプションリストからプロンプトを構築する。"""
    lines = []
    for i, cap in enumerate(captions):
        lines.append(f"[{i}] {cap[:500]}")
    return TEXT_JUDGE_PROMPT + "\n".join(lines)
```

- [ ] **Step 4: テスト実行 — パス確認**

Run: `cd buzz-video-collector && python3 -m pytest tests/test_text_judge.py -v`
Expected: 4 passed

- [ ] **Step 5: gemini.py実装（APIクライアント）**

```python
# src/analyzer/gemini.py
from __future__ import annotations

import base64
import time
from pathlib import Path
from typing import Optional

import google.generativeai as genai

from src.analyzer.text_judge import (
    TextJudgment,
    build_text_prompt,
    parse_text_judgments_batch,
)
from src.analyzer.visual_judge import (
    VisualJudgment,
    VISUAL_JUDGE_PROMPT,
    parse_visual_judgment,
)


class GeminiAnalyzer:
    def __init__(self, api_key: str, model: str = "gemini-2.5-flash-preview-05-20"):
        genai.configure(api_key=api_key)
        self._model = genai.GenerativeModel(model)

    def judge_texts(self, captions: list[str]) -> list[Optional[TextJudgment]]:
        """キャプション最大5件をバッチ判定する。"""
        if not captions:
            return []
        prompt = build_text_prompt(captions)
        try:
            resp = self._model.generate_content(prompt)
            return parse_text_judgments_batch(resp.text)
        except Exception as e:
            print(f"  Gemini text error: {e}")
            return [None] * len(captions)

    def judge_visual(self, screenshot_path: str) -> Optional[VisualJudgment]:
        """スクショ1枚からフォーマットを判定する。"""
        path = Path(screenshot_path)
        if not path.exists():
            return None
        try:
            img_bytes = path.read_bytes()
            img_part = {
                "mime_type": "image/png",
                "data": img_bytes,
            }
            resp = self._model.generate_content([VISUAL_JUDGE_PROMPT, img_part])
            return parse_visual_judgment(resp.text)
        except Exception as e:
            print(f"  Gemini visual error: {e}")
            return None

    def judge_texts_with_retry(self, captions: list[str], max_retries: int = 3) -> list[Optional[TextJudgment]]:
        """リトライ付きテキスト判定。"""
        for attempt in range(max_retries):
            results = self.judge_texts(captions)
            if results and any(r is not None for r in results):
                return results
            wait = [10, 30, 60][min(attempt, 2)]
            print(f"  Gemini retry in {wait}s (attempt {attempt + 1})")
            time.sleep(wait)
        return [None] * len(captions)
```

- [ ] **Step 6: コミット**

```bash
git add -A
git commit -m "feat(buzz-video-collector): text_judge + gemini analyzer"
```

---

### Task 3: Gemini Flash スクショ判定（visual_judge.py）

**Files:**
- Create: `buzz-video-collector/src/analyzer/visual_judge.py`
- Create: `buzz-video-collector/tests/test_visual_judge.py`

- [ ] **Step 1: テスト作成**

```python
# tests/test_visual_judge.py
import json
from src.analyzer.visual_judge import parse_visual_judgment, VisualJudgment


def test_parse_valid():
    raw = json.dumps({
        "format": "テロップ主体",
        "telop_amount": "多い",
        "mood": "エンタメ",
    })
    result = parse_visual_judgment(raw)
    assert isinstance(result, VisualJudgment)
    assert result.format == "テロップ主体"
    assert result.telop_amount == "多い"
    assert result.mood == "エンタメ"


def test_parse_invalid_returns_none():
    assert parse_visual_judgment("broken") is None


def test_parse_unknown_format_falls_back():
    raw = json.dumps({
        "format": "アニメーション",
        "telop_amount": "普通",
        "mood": "おしゃれ",
    })
    result = parse_visual_judgment(raw)
    assert result is not None
    assert result.format == "その他"


def test_parse_from_markdown_fence():
    raw = '```json\n{"format":"顔出しトーク","telop_amount":"少ない","mood":"カジュアル"}\n```'
    result = parse_visual_judgment(raw)
    assert result is not None
    assert result.format == "顔出しトーク"
```

- [ ] **Step 2: テスト実行 — 失敗確認**

Run: `cd buzz-video-collector && python3 -m pytest tests/test_visual_judge.py -v`
Expected: FAIL

- [ ] **Step 3: visual_judge.py実装**

```python
# src/analyzer/visual_judge.py
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
```

- [ ] **Step 4: テスト実行 — パス確認**

Run: `cd buzz-video-collector && python3 -m pytest tests/test_visual_judge.py -v`
Expected: 4 passed

- [ ] **Step 5: コミット**

```bash
git add -A
git commit -m "feat(buzz-video-collector): visual_judge for screenshot format analysis"
```

---

### Task 4: 出力層（Obsidian + LINE通知 + CSV）

**Files:**
- Create: `buzz-video-collector/src/output/obsidian.py`
- Create: `buzz-video-collector/src/output/line_notify.py`
- Create: `buzz-video-collector/src/output/csv_export.py`
- Create: `buzz-video-collector/tests/test_obsidian.py`
- Create: `buzz-video-collector/tests/test_csv_export.py`

- [ ] **Step 1: テスト作成 — obsidian.py**

```python
# tests/test_obsidian.py
import tempfile
from datetime import datetime
from pathlib import Path

from src.collectors.base import VideoItem
from src.analyzer.text_judge import TextJudgment
from src.analyzer.visual_judge import VisualJudgment
from src.output.obsidian import write_video_note


def test_write_note_creates_file():
    item = VideoItem(
        url="https://instagram.com/reel/abc",
        source="ig_reels",
        caption="テスト動画キャプション",
        likes=50000,
        views=1000000,
        collected_at=datetime(2026, 3, 28),
    )
    text_j = TextJudgment(
        tier=1, summary="テスト要約",
        comment_trigger=20, emotion=15, brevity=18,
        freshness=10, sakurako_angle=7,
    )
    visual_j = VisualJudgment(
        format="テロップ主体", telop_amount="多い", mood="エンタメ",
    )
    with tempfile.TemporaryDirectory() as d:
        path = write_video_note(item, text_j, visual_j, output_dir=d)
        assert Path(path).exists()
        content = Path(path).read_text()
        assert "テスト要約" in content
        assert "テロップ主体" in content
        assert "ig_reels" in content
        assert "tier: 1" in content


def test_write_note_without_visual():
    item = VideoItem(url="https://example.com", source="yt_shorts", caption="test")
    text_j = TextJudgment(
        tier=2, summary="YTテスト",
        comment_trigger=10, emotion=10, brevity=10,
        freshness=10, sakurako_angle=5,
    )
    with tempfile.TemporaryDirectory() as d:
        path = write_video_note(item, text_j, visual_judgment=None, output_dir=d)
        assert Path(path).exists()
```

- [ ] **Step 2: テスト実行 — 失敗確認**

Run: `cd buzz-video-collector && python3 -m pytest tests/test_obsidian.py -v`
Expected: FAIL

- [ ] **Step 3: obsidian.py実装**

```python
# src/output/obsidian.py
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


def write_video_note(
    item: VideoItem,
    text_judgment: TextJudgment,
    visual_judgment: Optional[VisualJudgment],
    output_dir: str | Path,
) -> str:
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
        "source": item.source,
        "url": item.url,
        "tier": text_judgment.tier,
        "score": text_judgment.total_score,
        "scores": {
            "comment_trigger": text_judgment.comment_trigger,
            "emotion": text_judgment.emotion,
            "brevity": text_judgment.brevity,
            "freshness": text_judgment.freshness,
            "sakurako_angle": text_judgment.sakurako_angle,
        },
        "likes": item.likes,
        "views": item.views,
        "comments": item.comments,
        "collected_at": item.collected_at.isoformat(),
        "tags": ["buzz-video", item.source, f"tier{text_judgment.tier}"],
    }

    if visual_judgment:
        frontmatter["visual"] = {
            "format": visual_judgment.format,
            "telop_amount": visual_judgment.telop_amount,
            "mood": visual_judgment.mood,
        }

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
```

- [ ] **Step 4: テスト実行 — パス確認**

Run: `cd buzz-video-collector && python3 -m pytest tests/test_obsidian.py -v`
Expected: 2 passed

- [ ] **Step 5: テスト作成 — csv_export.py**

```python
# tests/test_csv_export.py
import csv
import tempfile
from datetime import datetime
from pathlib import Path

from src.collectors.base import VideoItem
from src.analyzer.text_judge import TextJudgment
from src.analyzer.visual_judge import VisualJudgment
from src.output.csv_export import export_csv, ScoredVideo


def test_csv_export():
    item = VideoItem(
        url="https://example.com/1",
        source="ig_reels",
        caption="テスト",
        likes=10000,
        views=500000,
        collected_at=datetime(2026, 3, 28),
    )
    tj = TextJudgment(tier=1, summary="要約", comment_trigger=20,
                      emotion=15, brevity=18, freshness=10, sakurako_angle=7)
    vj = VisualJudgment(format="テロップ主体", telop_amount="多い", mood="エンタメ")
    scored = [ScoredVideo(item=item, text=tj, visual=vj)]

    with tempfile.TemporaryDirectory() as d:
        out = Path(d) / "test.csv"
        export_csv(scored, str(out))
        assert out.exists()
        with open(out, encoding="utf-8-sig") as f:
            rows = list(csv.reader(f))
        assert len(rows) == 2  # header + 1 row
        assert rows[0][0] == "スコア"
        assert rows[1][0] == "70"  # total_score
```

- [ ] **Step 6: csv_export.py + line_notify.py実装**

```python
# src/output/csv_export.py
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
        w.writerow([
            "スコア", "Tier", "コメント誘発", "感情", "語り適性", "鮮度",
            "櫻子視点", "ソース", "要約", "URL", "いいね", "再生数",
            "フォーマット", "テロップ量", "雰囲気",
        ])
        for sv in scored:
            vf = sv.visual.format if sv.visual else ""
            vt = sv.visual.telop_amount if sv.visual else ""
            vm = sv.visual.mood if sv.visual else ""
            w.writerow([
                sv.text.total_score, sv.text.tier,
                sv.text.comment_trigger, sv.text.emotion,
                sv.text.brevity, sv.text.freshness, sv.text.sakurako_angle,
                sv.item.source, sv.text.summary, sv.item.url,
                sv.item.likes, sv.item.views,
                vf, vt, vm,
            ])
```

```python
# src/output/line_notify.py
from __future__ import annotations

from typing import Optional

import requests

from src.output.csv_export import ScoredVideo

_LINE_NOTIFY_URL = "https://notify-api.line.me/api/notify"

_SOURCE_LABELS = {
    "ig_reels": "IG",
    "yt_shorts": "YT",
}


def _format_counts(item) -> str:
    parts = []
    if item.views:
        v = f"{item.views/10000:.1f}万" if item.views >= 10000 else f"{item.views:,}"
        parts.append(f"{v}再生")
    if item.likes:
        v = f"{item.likes/10000:.1f}万" if item.likes >= 10000 else f"{item.likes:,}"
        parts.append(f"{v}いいね")
    return " ".join(parts)


def format_notification(scored: list[ScoredVideo]) -> Optional[str]:
    if not scored:
        return None
    sorted_sv = sorted(scored, key=lambda sv: sv.text.total_score, reverse=True)
    lines = [f"\n[バズ動画ネタ速報 {len(sorted_sv)}件]\n"]
    for sv in sorted_sv:
        src = _SOURCE_LABELS.get(sv.item.source, sv.item.source)
        counts = _format_counts(sv.item)
        fmt = f" [{sv.visual.format}]" if sv.visual else ""
        lines.append(f"{sv.text.total_score}点 {sv.text.summary}")
        lines.append(f"{src} {counts}{fmt}")
        lines.append(f"{sv.item.url}")
        lines.append("")
    return "\n".join(lines)


def send_notification(scored: list[ScoredVideo], token: str) -> bool:
    text = format_notification(scored)
    if text is None:
        return False

    # LINE Notifyの1000文字制限対応
    chunks = []
    if len(text) <= 1000:
        chunks = [text]
    else:
        current = f"\n[バズ動画ネタ速報 {len(scored)}件]\n\n"
        sorted_sv = sorted(scored, key=lambda sv: sv.text.total_score, reverse=True)
        for sv in sorted_sv:
            src = _SOURCE_LABELS.get(sv.item.source, sv.item.source)
            counts = _format_counts(sv.item)
            fmt = f" [{sv.visual.format}]" if sv.visual else ""
            entry = f"{sv.text.total_score}点 {sv.text.summary}\n{src} {counts}{fmt}\n{sv.item.url}\n\n"
            if len(current) + len(entry) > 950:
                chunks.append(current)
                current = entry
            else:
                current += entry
        if current.strip():
            chunks.append(current)

    for chunk in chunks:
        resp = requests.post(
            _LINE_NOTIFY_URL,
            headers={"Authorization": f"Bearer {token}"},
            data={"message": chunk},
        )
        if resp.status_code != 200:
            print(f"LINE Notify error: {resp.status_code} {resp.text}")
            return False
    return True
```

- [ ] **Step 7: テスト実行 — パス確認**

Run: `cd buzz-video-collector && python3 -m pytest tests/test_obsidian.py tests/test_csv_export.py -v`
Expected: 3 passed

- [ ] **Step 8: コミット**

```bash
git add -A
git commit -m "feat(buzz-video-collector): obsidian, line_notify, csv output"
```

---

### Task 5: IG Reels コレクター（ig_reels.py）

**Files:**
- Create: `buzz-video-collector/src/collectors/ig_reels.py`

- [ ] **Step 1: ig_reels.py実装**

ig-reels-researchのv4方式（ハッシュタグ/アカウント巡回 → /p/ URL収集 → yt-dlp並列メタデータ取得）を統合。テストはPlaywright/yt-dlp依存のため手動E2E。

```python
# src/collectors/ig_reels.py
from __future__ import annotations

import json
import re
import subprocess
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from pathlib import Path
from typing import Optional

from src.collectors.base import BaseCollector, VideoItem

PROFILE_DIR = str(Path(__file__).parent.parent.parent / ".pw-profile")
SCREENSHOT_DIR = Path(__file__).parent.parent.parent / "screenshots"


def _yt_dlp_meta(url: str) -> Optional[dict]:
    """yt-dlpで1件のメタデータを取得する。"""
    try:
        result = subprocess.run(
            ["yt-dlp", "--dump-json", "--no-download", url],
            capture_output=True, text=True, timeout=30,
        )
        if result.returncode != 0:
            return None
        return json.loads(result.stdout)
    except Exception:
        return None


def _meta_to_video_item(meta: dict, screenshot_path: str = "") -> VideoItem:
    posted = None
    if meta.get("upload_date"):
        try:
            posted = datetime.strptime(meta["upload_date"], "%Y%m%d")
        except ValueError:
            pass

    return VideoItem(
        url=meta.get("webpage_url", meta.get("original_url", "")),
        source="ig_reels",
        caption=meta.get("description", ""),
        likes=meta.get("like_count", 0) or 0,
        views=meta.get("view_count", 0) or 0,
        comments=meta.get("comment_count", 0) or 0,
        screenshot_path=screenshot_path,
        posted_at=posted,
    )


class IGReelsCollector(BaseCollector):
    source_name = "ig_reels"

    def __init__(self, config: dict):
        self._accounts = config.get("accounts", [])
        self._hashtags = config.get("hashtags", [])
        self._max_items = config.get("max_items", 100)
        self._parallel = config.get("yt_dlp_parallel", 5)

    def collect(self) -> list[VideoItem]:
        """Playwright でURL収集 → yt-dlp並列でメタデータ取得。"""
        from playwright.sync_api import sync_playwright

        urls = set()

        with sync_playwright() as p:
            print("  ブラウザ起動...")
            ctx = p.chromium.launch_persistent_context(
                user_data_dir=PROFILE_DIR,
                headless=False,
                channel="chrome",
                viewport={"width": 430, "height": 932},
                locale="ja-JP",
            )
            page = ctx.pages[0] if ctx.pages else ctx.new_page()

            # アカウント巡回
            for account in self._accounts:
                print(f"  account: @{account}")
                try:
                    page.goto(f"https://www.instagram.com/{account}/reels/",
                              wait_until="domcontentloaded", timeout=15000)
                    time.sleep(3)
                    # リール一覧からリンクを収集
                    links = page.eval_on_selector_all(
                        'a[href*="/reel/"], a[href*="/p/"]',
                        "els => els.map(e => e.href)"
                    )
                    for link in links:
                        # /p/ 形式に正規化（yt-dlpが対応）
                        match = re.search(r'/(?:reel|p)/([A-Za-z0-9_-]+)', link)
                        if match:
                            urls.add(f"https://www.instagram.com/p/{match.group(1)}/")
                    print(f"    {len(links)}件のリンク取得")
                except Exception as e:
                    print(f"    error: {e}")

                if len(urls) >= self._max_items:
                    break

            # ハッシュタグ巡回
            for tag in self._hashtags:
                if len(urls) >= self._max_items:
                    break
                print(f"  hashtag: #{tag}")
                try:
                    page.goto(f"https://www.instagram.com/explore/tags/{tag}/",
                              wait_until="domcontentloaded", timeout=15000)
                    time.sleep(3)
                    links = page.eval_on_selector_all(
                        'a[href*="/reel/"], a[href*="/p/"]',
                        "els => els.map(e => e.href)"
                    )
                    for link in links:
                        match = re.search(r'/(?:reel|p)/([A-Za-z0-9_-]+)', link)
                        if match:
                            urls.add(f"https://www.instagram.com/p/{match.group(1)}/")
                    print(f"    {len(links)}件のリンク取得")
                except Exception as e:
                    print(f"    error: {e}")

            ctx.close()

        url_list = list(urls)[:self._max_items]
        print(f"  URL収集完了: {len(url_list)}件")
        print(f"  yt-dlp {self._parallel}並列でメタ取得中...")

        # yt-dlp並列実行
        items = []
        SCREENSHOT_DIR.mkdir(parents=True, exist_ok=True)

        with ThreadPoolExecutor(max_workers=self._parallel) as executor:
            futures = {executor.submit(_yt_dlp_meta, url): url for url in url_list}
            done = 0
            for future in as_completed(futures):
                done += 1
                url = futures[future]
                meta = future.result()
                if meta:
                    item = _meta_to_video_item(meta)
                    items.append(item)
                if done % 10 == 0:
                    print(f"    {done}/{len(url_list)} 完了")

        print(f"  メタ取得完了: {len(items)}/{len(url_list)}件成功")
        return items


class IGReelsScreenshotter:
    """収集済みURLのスクショを撮る（Gemini visual判定用）。"""

    def capture(self, urls: list[str], output_dir: str | Path = SCREENSHOT_DIR) -> dict[str, str]:
        """URLリスト → {url: screenshot_path} を返す。"""
        from playwright.sync_api import sync_playwright

        output_dir = Path(output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)
        result = {}

        with sync_playwright() as p:
            ctx = p.chromium.launch_persistent_context(
                user_data_dir=PROFILE_DIR,
                headless=False,
                channel="chrome",
                viewport={"width": 430, "height": 932},
                locale="ja-JP",
            )
            page = ctx.pages[0] if ctx.pages else ctx.new_page()

            for i, url in enumerate(urls):
                try:
                    reel_url = url.replace("/p/", "/reel/")
                    page.goto(reel_url, wait_until="domcontentloaded", timeout=15000)
                    time.sleep(3)
                    ss_path = output_dir / f"reel_{i:04d}.png"
                    page.screenshot(path=str(ss_path))
                    result[url] = str(ss_path)
                except Exception:
                    pass

            ctx.close()

        return result
```

- [ ] **Step 2: 構文チェック**

Run: `cd buzz-video-collector && python3 -c "import src.collectors.ig_reels; print('OK')"`
Expected: OK

- [ ] **Step 3: コミット**

```bash
git add -A
git commit -m "feat(buzz-video-collector): IG Reels collector with Playwright + yt-dlp parallel"
```

---

### Task 6: YT Shorts コレクター（yt_shorts.py）

**Files:**
- Create: `buzz-video-collector/src/collectors/yt_shorts.py`

- [ ] **Step 1: yt_shorts.py実装**

```python
# src/collectors/yt_shorts.py
from __future__ import annotations

import os
from datetime import datetime
from typing import Optional

from src.collectors.base import BaseCollector, VideoItem


class YTShortsCollector(BaseCollector):
    source_name = "yt_shorts"

    def __init__(self, config: dict):
        self._api_key = config.get("api_key") or os.environ.get("YOUTUBE_API_KEY", "")
        self._channels = config.get("channels", [])
        self._keywords = config.get("keywords", [])
        self._max_results = config.get("max_results", 50)

    def collect(self) -> list[VideoItem]:
        if not self._api_key:
            print("  YOUTUBE_API_KEY未設定、スキップ")
            return []

        from googleapiclient.discovery import build
        yt = build("youtube", "v3", developerKey=self._api_key)

        video_ids = []

        # キーワード検索
        for kw in self._keywords:
            print(f"  search: {kw}")
            try:
                resp = yt.search().list(
                    q=kw,
                    type="video",
                    videoDuration="short",
                    order="viewCount",
                    maxResults=min(self._max_results, 50),
                    part="id",
                    relevanceLanguage="ja",
                    regionCode="JP",
                ).execute()
                for item in resp.get("items", []):
                    vid = item["id"].get("videoId")
                    if vid:
                        video_ids.append(vid)
            except Exception as e:
                print(f"    error: {e}")

        # チャンネル検索
        for ch_id in self._channels:
            print(f"  channel: {ch_id}")
            try:
                resp = yt.search().list(
                    channelId=ch_id,
                    type="video",
                    videoDuration="short",
                    order="viewCount",
                    maxResults=min(self._max_results, 50),
                    part="id",
                ).execute()
                for item in resp.get("items", []):
                    vid = item["id"].get("videoId")
                    if vid:
                        video_ids.append(vid)
            except Exception as e:
                print(f"    error: {e}")

        # 重複除去
        video_ids = list(dict.fromkeys(video_ids))
        print(f"  動画ID: {len(video_ids)}件")

        if not video_ids:
            return []

        # 動画詳細取得（50件ずつバッチ）
        items = []
        for i in range(0, len(video_ids), 50):
            batch = video_ids[i:i+50]
            try:
                resp = yt.videos().list(
                    id=",".join(batch),
                    part="snippet,statistics,contentDetails",
                ).execute()
                for v in resp.get("items", []):
                    item = self._to_video_item(v)
                    if item:
                        items.append(item)
            except Exception as e:
                print(f"    detail error: {e}")

        print(f"  取得完了: {len(items)}件")
        return items

    def _to_video_item(self, v: dict) -> Optional[VideoItem]:
        snippet = v.get("snippet", {})
        stats = v.get("statistics", {})
        vid = v.get("id", "")

        # Shorts判定（60秒以下）
        duration = v.get("contentDetails", {}).get("duration", "")
        # PT1M以下をShortsとする
        if "H" in duration:
            return None
        import re
        m = re.search(r"PT(?:(\d+)M)?(?:(\d+)S)?", duration)
        if m:
            minutes = int(m.group(1) or 0)
            seconds = int(m.group(2) or 0)
            if minutes > 1:
                return None
        else:
            return None

        posted = None
        pub = snippet.get("publishedAt", "")
        if pub:
            try:
                posted = datetime.fromisoformat(pub.replace("Z", "+00:00"))
            except ValueError:
                pass

        return VideoItem(
            url=f"https://youtube.com/shorts/{vid}",
            source="yt_shorts",
            caption=snippet.get("title", ""),
            likes=int(stats.get("likeCount", 0)),
            views=int(stats.get("viewCount", 0)),
            comments=int(stats.get("commentCount", 0)),
            screenshot_path="",  # YTはサムネイルURLで代用可能
            posted_at=posted,
        )
```

- [ ] **Step 2: 構文チェック**

Run: `cd buzz-video-collector && python3 -c "import src.collectors.yt_shorts; print('OK')"`
Expected: OK

- [ ] **Step 3: コミット**

```bash
git add -A
git commit -m "feat(buzz-video-collector): YT Shorts collector with YouTube Data API"
```

---

### Task 7: main.py オーケストレーター

**Files:**
- Create: `buzz-video-collector/src/main.py`

- [ ] **Step 1: main.py実装**

```python
# src/main.py
"""
バズ動画ネタ自動収集パイプライン

Usage:
    python3 -m src                          # 全ソース収集
    python3 -m src --dry-run                # 収集+判定のみ（保存・通知なし）
    python3 -m src --source ig_reels        # IGリールのみ
    python3 -m src --csv results.csv        # CSV出力
    python3 -m src --no-visual              # スクショ判定スキップ
"""
from __future__ import annotations

import argparse
from datetime import datetime
from pathlib import Path

from src.config import load_config
from src.collectors.base import VideoItem
from src.collectors.ig_reels import IGReelsCollector, IGReelsScreenshotter
from src.collectors.yt_shorts import YTShortsCollector
from src.analyzer.gemini import GeminiAnalyzer
from src.dedup import DedupDB
from src.output.obsidian import write_video_note
from src.output.line_notify import send_notification
from src.output.csv_export import export_csv, ScoredVideo


def run(
    config_path: str | None = None,
    dry_run: bool = False,
    source_filter: str | None = None,
    csv_path: str | None = None,
    no_visual: bool = False,
):
    cfg = load_config(config_path)
    sources_cfg = cfg.get("sources", {})
    scoring_cfg = cfg.get("scoring", {})
    obsidian_cfg = cfg.get("obsidian", {})
    notify_cfg = cfg.get("notification", {}).get("line", {})
    analyzer_cfg = cfg.get("analyzer", {})

    save_threshold = scoring_cfg.get("save_threshold", 50)
    notify_threshold = scoring_cfg.get("notify_threshold", 70)

    vault_path = Path(obsidian_cfg.get("vault_path", "~/Documents/Obsidian Vault")).expanduser()
    output_dir = vault_path / obsidian_cfg.get("output_dir", "knowledge/buzz-videos")

    db_path = Path(__file__).parent.parent / "data" / "seen.db"
    db_path.parent.mkdir(parents=True, exist_ok=True)
    db = DedupDB(db_path)

    print(f"=== バズ動画ネタ収集 {datetime.now().strftime('%Y-%m-%d %H:%M')} ===\n")

    # --- 収集 ---
    all_items: list[VideoItem] = []

    if (not source_filter or source_filter == "ig_reels") and sources_cfg.get("ig_reels", {}).get("enabled", True):
        print("[IG Reels]")
        try:
            collector = IGReelsCollector(sources_cfg["ig_reels"])
            all_items.extend(collector.collect())
        except Exception as e:
            print(f"  error: {e}")
        print()

    if (not source_filter or source_filter == "yt_shorts") and sources_cfg.get("yt_shorts", {}).get("enabled", True):
        print("[YT Shorts]")
        try:
            collector = YTShortsCollector(sources_cfg["yt_shorts"])
            all_items.extend(collector.collect())
        except Exception as e:
            print(f"  error: {e}")
        print()

    print(f"収集合計: {len(all_items)}件\n")

    # --- 重複排除 ---
    new_items = [item for item in all_items if not db.is_seen(item.url)]
    print(f"新規: {len(new_items)}件 (既知: {len(all_items) - len(new_items)}件)\n")

    if not new_items:
        print("新規ネタなし。終了。")
        db.close()
        return

    # --- Gemini テキスト判定 ---
    api_key = analyzer_cfg.get("api_key", "")
    if not api_key:
        print("GEMINI_API_KEY未設定。スコアリングをスキップ。")
        db.close()
        return

    model = analyzer_cfg.get("model", "gemini-2.5-flash-preview-05-20")
    batch_size = analyzer_cfg.get("batch_size", 5)
    analyzer = GeminiAnalyzer(api_key=api_key, model=model)

    print("=== Gemini テキスト判定 ===")
    text_judgments = []
    for i in range(0, len(new_items), batch_size):
        batch = new_items[i:i + batch_size]
        captions = [item.caption for item in batch]
        results = analyzer.judge_texts_with_retry(captions)
        text_judgments.extend(results)
        print(f"  {min(i + batch_size, len(new_items))}/{len(new_items)} 判定完了")

    # --- スクショ判定（オプション） ---
    visual_judgments = {}
    ig_items = [item for item in new_items if item.source == "ig_reels"]
    if not no_visual and ig_items:
        print("\n=== スクショ撮影+フォーマット判定 ===")
        screenshotter = IGReelsScreenshotter()
        ig_urls = [item.url for item in ig_items]
        ss_map = screenshotter.capture(ig_urls)

        for url, ss_path in ss_map.items():
            vj = analyzer.judge_visual(ss_path)
            if vj:
                visual_judgments[url] = vj
        print(f"  {len(visual_judgments)}/{len(ig_items)}件のフォーマット判定完了")

    # --- スコアリング結果の集計 ---
    scored: list[ScoredVideo] = []
    for item, tj in zip(new_items, text_judgments):
        if tj is None:
            continue
        vj = visual_judgments.get(item.url)
        scored.append(ScoredVideo(item=item, text=tj, visual=vj))

    scored.sort(key=lambda sv: sv.text.total_score, reverse=True)

    to_save = [sv for sv in scored if sv.text.total_score >= save_threshold]
    to_notify = [sv for sv in scored if sv.text.total_score >= notify_threshold]

    print(f"\n=== スコアリング結果 ===")
    print(f"判定成功: {len(scored)}件")
    print(f"保存対象(>={save_threshold}): {len(to_save)}件")
    print(f"通知対象(>={notify_threshold}): {len(to_notify)}件\n")

    for sv in scored[:20]:
        flag = "***" if sv.text.total_score >= notify_threshold else "  *" if sv.text.total_score >= save_threshold else "   "
        fmt = f" [{sv.visual.format}]" if sv.visual else ""
        print(f"  {flag} {sv.text.total_score:3d}点 [{sv.item.source:10}] [tier{sv.text.tier}]{fmt} {sv.text.summary[:40]}")

    # --- CSV出力 ---
    if csv_path:
        export_csv(scored, csv_path)
        print(f"\nCSV出力: {len(scored)}件 → {csv_path}")

    if dry_run:
        print("\n[dry-run] 保存・通知はスキップ")
        db.close()
        return

    # --- Obsidian保存 ---
    saved_count = 0
    month_dir = output_dir / datetime.now().strftime("%Y-%m")
    for sv in to_save:
        try:
            write_video_note(sv.item, sv.text, sv.visual, output_dir=month_dir)
            db.mark_seen(sv.item.url, sv.text.summary, sv.item.source)
            saved_count += 1
        except Exception as e:
            print(f"  save error: {e}")

    print(f"\nObsidian保存: {saved_count}件 → {month_dir}")

    # --- LINE通知 ---
    if to_notify and notify_cfg.get("enabled") and notify_cfg.get("token"):
        ok = send_notification(to_notify, token=notify_cfg["token"])
        print(f"LINE通知: {'送信成功' if ok else '送信失敗'} ({len(to_notify)}件)")
    elif to_notify:
        print(f"LINE通知: token未設定のためスキップ ({len(to_notify)}件)")

    # --- クリーンアップ ---
    cleaned = db.cleanup(max_age_days=60)
    if cleaned:
        print(f"DB cleanup: {cleaned}件削除")

    db.close()
    print("\n=== 完了 ===")


def main():
    parser = argparse.ArgumentParser(description="バズ動画ネタ自動収集")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--source", type=str, help="ig_reels or yt_shorts")
    parser.add_argument("--config", type=str)
    parser.add_argument("--csv", type=str)
    parser.add_argument("--no-visual", action="store_true", help="スクショ判定をスキップ")
    args = parser.parse_args()

    run(
        config_path=args.config,
        dry_run=args.dry_run,
        source_filter=args.source,
        csv_path=args.csv,
        no_visual=args.no_visual,
    )
```

- [ ] **Step 2: 構文チェック**

Run: `cd buzz-video-collector && python3 -c "import src.main; print('OK')"`
Expected: OK

- [ ] **Step 3: コミット**

```bash
git add -A
git commit -m "feat(buzz-video-collector): main orchestrator with full pipeline"
```

---

### Task 8: trending-topic-collector cron停止 + 統合テスト

**Files:**
- Modify: `trending-topic-collector/` (cron停止)

- [ ] **Step 1: trending-topic-collectorのcron停止**

```bash
# run.shのcrontab登録を確認
crontab -l | grep trending
# 該当行をコメントアウトまたは削除
```

- [ ] **Step 2: buzz-video-collectorの全テスト実行**

Run: `cd buzz-video-collector && python3 -m pytest tests/ -v`
Expected: 全テストPASS（test_base 2, test_dedup 2, test_text_judge 4, test_visual_judge 4, test_obsidian 2, test_csv_export 1 = 15 tests）

- [ ] **Step 3: dry-runで構文レベルの動作確認**

Run: `cd buzz-video-collector && python3 -m src --dry-run --no-visual 2>&1 | head -20`
Expected: "=== バズ動画ネタ収集 ..." が表示される（GEMINI_API_KEY未設定でスキップされるのはOK）

- [ ] **Step 4: 最終コミット + push**

```bash
git add -A
git commit -m "feat(buzz-video-collector): complete pipeline, stop trending-topic-collector cron"
git push
```

---

## タスク依存関係

```
Task 1 (骨格+base+dedup)
  └→ Task 2 (text_judge) + Task 3 (visual_judge) ← 並列可
       └→ Task 4 (出力層)
            └→ Task 5 (IG collector) + Task 6 (YT collector) ← 並列可
                 └→ Task 7 (main.py)
                      └→ Task 8 (cron停止+統合テスト)
```

## 実行後の動作確認チェックリスト

- [ ] `GEMINI_API_KEY` を環境変数にセット
- [ ] `python3 -m src --dry-run --source yt_shorts --csv test.csv` でYT Shortsの収集+判定を確認
- [ ] `python3 -m src --dry-run --source ig_reels --no-visual` でIG Reelsの収集を確認
- [ ] `python3 -m src --dry-run` でフルパイプライン確認
- [ ] Obsidian Vaultに `knowledge/buzz-videos/2026-03/` にノートが生成されることを確認
