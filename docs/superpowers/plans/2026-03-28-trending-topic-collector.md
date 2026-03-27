# バズ語りネタ自動収集パイプライン 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 5ソース（知恵袋/X/YouTube/Reddit/はてな）からバズトピックを毎日自動収集し、Obsidianに蓄積+LINE通知する

**Architecture:** Pythonスクリプト群。各ソースのcollectorが独立モジュール。main.pyが全collector→scorer→obsidian_writer→line_notifierの順に実行。cronで1日2回起動。重複排除はSQLite。

**Tech Stack:** Python 3.9+, requests, beautifulsoup4, feedparser, pyyaml, YouTube Data API v3, LINE Notify API

**Spec:** `docs/superpowers/specs/2026-03-28-trending-topic-collector-design.md`

---

## ファイル構成

```
trending-topic-collector/
├── src/
│   ├── __init__.py
│   ├── collectors/
│   │   ├── __init__.py
│   │   ├── base.py          # CollectedItem dataclass + BaseCollector ABC
│   │   ├── chiebukuro.py    # Yahoo知恵袋
│   │   ├── twitter.py       # X/Twitter
│   │   ├── youtube_shorts.py # YouTube Shorts
│   │   ├── reddit.py        # Reddit + 海外反応RSS
│   │   └── hatena.py        # はてな匿名ダイアリー
│   ├── scorer.py            # スコアリング（バズ度+語りネタ適性）
│   ├── obsidian_writer.py   # Obsidianノート生成
│   ├── line_notifier.py     # LINE Notify送信
│   ├── dedup.py             # SQLite重複排除
│   ├── config.py            # YAML設定読み込み
│   └── main.py              # オーケストレーター
├── tests/
│   ├── __init__.py
│   ├── test_scorer.py
│   ├── test_dedup.py
│   ├── test_obsidian_writer.py
│   ├── test_line_notifier.py
│   └── test_collectors/
│       ├── __init__.py
│       ├── test_chiebukuro.py
│       ├── test_reddit.py
│       ├── test_hatena.py
│       ├── test_youtube_shorts.py
│       └── test_twitter.py
├── config.yaml
├── requirements.txt
└── data/                    # gitignore、ランタイム生成
    └── seen.db
```

---

### Task 1: プロジェクトスキャフォールド + 共通型定義

**Files:**
- Create: `trending-topic-collector/requirements.txt`
- Create: `trending-topic-collector/config.yaml`
- Create: `trending-topic-collector/.gitignore`
- Create: `trending-topic-collector/src/__init__.py`
- Create: `trending-topic-collector/src/collectors/__init__.py`
- Create: `trending-topic-collector/src/collectors/base.py`
- Create: `trending-topic-collector/src/config.py`
- Create: `trending-topic-collector/tests/__init__.py`
- Create: `trending-topic-collector/tests/test_collectors/__init__.py`

- [ ] **Step 1: ディレクトリ作成**

```bash
cd /Users/kimuratakuya/line-harness
mkdir -p trending-topic-collector/{src/collectors,tests/test_collectors,data}
touch trending-topic-collector/src/__init__.py
touch trending-topic-collector/src/collectors/__init__.py
touch trending-topic-collector/tests/__init__.py
touch trending-topic-collector/tests/test_collectors/__init__.py
```

- [ ] **Step 2: requirements.txt 作成**

```
# trending-topic-collector/requirements.txt
requests>=2.31.0
beautifulsoup4>=4.12.0
lxml>=5.0.0
feedparser>=6.0.0
pyyaml>=6.0.0
pytest>=8.0.0
```

- [ ] **Step 3: .gitignore 作成**

```
# trending-topic-collector/.gitignore
data/seen.db
data/seen.db-shm
data/seen.db-wal
__pycache__/
*.pyc
.pytest_cache/
```

- [ ] **Step 4: base.py 作成 — CollectedItem dataclass と BaseCollector ABC**

```python
# trending-topic-collector/src/collectors/base.py
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime


@dataclass
class CollectedItem:
    """各ソースから収集した1件のトピック"""
    title: str
    url: str
    source: str  # chiebukuro, twitter, youtube, reddit, hatena
    body_snippet: str = ""  # 本文冒頭（200文字以内）
    category: str = ""
    collected_at: datetime = field(default_factory=datetime.now)
    engagement: dict = field(default_factory=dict)
    # engagement例: {"views": 85000, "answers": 47}
    # ソースごとに異なるキーを持つ


class BaseCollector(ABC):
    """コレクターの基底クラス"""

    source_name: str = ""

    @abstractmethod
    def collect(self) -> list[CollectedItem]:
        """トピックを収集して返す"""
        ...
```

- [ ] **Step 5: config.py 作成 — YAML設定読み込み**

```python
# trending-topic-collector/src/config.py
from __future__ import annotations

import os
from pathlib import Path

import yaml


_DEFAULT_CONFIG_PATH = Path(__file__).parent.parent / "config.yaml"


def load_config(path: str | Path | None = None) -> dict:
    """config.yamlを読み込んで辞書で返す。環境変数で上書き可能。"""
    p = Path(path) if path else _DEFAULT_CONFIG_PATH
    with open(p, encoding="utf-8") as f:
        cfg = yaml.safe_load(f)

    # 環境変数で上書き
    cfg.setdefault("notification", {}).setdefault("line", {})
    if os.environ.get("LINE_NOTIFY_TOKEN"):
        cfg["notification"]["line"]["token"] = os.environ["LINE_NOTIFY_TOKEN"]

    cfg.setdefault("sources", {}).setdefault("youtube_shorts", {})
    if os.environ.get("YOUTUBE_API_KEY"):
        cfg["sources"]["youtube_shorts"]["api_key"] = os.environ["YOUTUBE_API_KEY"]

    return cfg
```

- [ ] **Step 6: config.yaml 作成**

```yaml
# trending-topic-collector/config.yaml
schedule:
  times: ["09:00", "21:00"]
  timezone: "Asia/Tokyo"

freshness:
  max_age_hours: 48

scoring:
  notify_threshold: 70
  save_threshold: 50

sources:
  chiebukuro:
    enabled: true
    categories:
      - 恋愛相談
      - 生き方と恋愛、人間関係の悩み
      - 海外
      - 職場の悩み
      - 家族関係の悩み
    min_views: 10000
    min_answers: 3

  twitter:
    enabled: false  # API制約のため初期はdisabled
    queries:
      - '"海外あるある" OR "海外生活" OR "国際結婚"'
      - '"共感" OR "わかる" OR "それな"'
      - '"どう思う" OR "これってあり" OR "モヤモヤ"'
    min_faves: 5000
    min_replies: 100

  youtube_shorts:
    enabled: true
    channels:
      # 語り系/あるある系の競合チャンネル（YouTube channel ID）
      # 初回セットアップ時にチャンネルを追加
      []
    min_views: 100000
    max_duration_sec: 60
    # api_key: 環境変数 YOUTUBE_API_KEY で指定

  reddit:
    enabled: true
    subreddits:
      - japan
      - japanlife
      - AskReddit
      - tifu
      - AmItheAsshole
    rss_feeds:
      - https://pandora11.com/feed
    min_upvotes: 500

  hatena:
    enabled: true
    min_bookmarks: 100

notification:
  line:
    enabled: true
    # token: 環境変数 LINE_NOTIFY_TOKEN で指定

obsidian:
  vault_path: "~/Documents/Obsidian Vault"
  output_dir: "knowledge/trending-topics"
```

- [ ] **Step 7: 依存パッケージインストール**

```bash
cd /Users/kimuratakuya/line-harness/trending-topic-collector
pip3 install -r requirements.txt
```

- [ ] **Step 8: コミット**

```bash
cd /Users/kimuratakuya/line-harness
git add trending-topic-collector/
git commit -m "feat: scaffold trending-topic-collector project with base types and config"
```

---

### Task 2: 重複排除（dedup.py）

**Files:**
- Create: `trending-topic-collector/src/dedup.py`
- Create: `trending-topic-collector/tests/test_dedup.py`

- [ ] **Step 1: テスト作成**

```python
# trending-topic-collector/tests/test_dedup.py
import os
import tempfile

import pytest

from src.dedup import DedupDB


@pytest.fixture
def db():
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    d = DedupDB(path)
    yield d
    d.close()
    os.unlink(path)


def test_first_url_is_not_seen(db):
    assert not db.is_seen("https://example.com/1")


def test_mark_seen_then_is_seen(db):
    db.mark_seen("https://example.com/1", "test title", "reddit")
    assert db.is_seen("https://example.com/1")


def test_different_url_not_seen(db):
    db.mark_seen("https://example.com/1", "test title", "reddit")
    assert not db.is_seen("https://example.com/2")


def test_cleanup_removes_old_entries(db):
    import time
    from datetime import datetime, timedelta

    db.mark_seen("https://example.com/old", "old", "reddit")
    # 手動でtimestampを古くする
    old_ts = (datetime.now() - timedelta(days=31)).isoformat()
    db._conn.execute(
        "UPDATE seen SET first_seen_at = ? WHERE url = ?",
        (old_ts, "https://example.com/old"),
    )
    db._conn.commit()
    db.mark_seen("https://example.com/new", "new", "reddit")

    db.cleanup(max_age_days=30)
    assert not db.is_seen("https://example.com/old")
    assert db.is_seen("https://example.com/new")
```

- [ ] **Step 2: テスト実行 — 失敗確認**

```bash
cd /Users/kimuratakuya/line-harness/trending-topic-collector
python3 -m pytest tests/test_dedup.py -v
```

Expected: `ModuleNotFoundError: No module named 'src.dedup'`

- [ ] **Step 3: dedup.py 実装**

```python
# trending-topic-collector/src/dedup.py
from __future__ import annotations

import sqlite3
from datetime import datetime, timedelta
from pathlib import Path


class DedupDB:
    """URL単位の重複排除。SQLiteで管理。"""

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
        """古いエントリを削除。削除件数を返す。"""
        cutoff = (datetime.now() - timedelta(days=max_age_days)).isoformat()
        cur = self._conn.execute(
            "DELETE FROM seen WHERE first_seen_at < ?", (cutoff,)
        )
        self._conn.commit()
        return cur.rowcount

    def close(self) -> None:
        self._conn.close()
```

- [ ] **Step 4: テスト実行 — 全パス確認**

```bash
cd /Users/kimuratakuya/line-harness/trending-topic-collector
python3 -m pytest tests/test_dedup.py -v
```

Expected: 4 passed

- [ ] **Step 5: コミット**

```bash
cd /Users/kimuratakuya/line-harness
git add trending-topic-collector/src/dedup.py trending-topic-collector/tests/test_dedup.py
git commit -m "feat: add dedup module with SQLite-based URL deduplication"
```

---

### Task 3: スコアリング（scorer.py）

**Files:**
- Create: `trending-topic-collector/src/scorer.py`
- Create: `trending-topic-collector/tests/test_scorer.py`

- [ ] **Step 1: テスト作成**

```python
# trending-topic-collector/tests/test_scorer.py
from src.collectors.base import CollectedItem
from src.scorer import score_item


def test_high_engagement_chiebukuro():
    item = CollectedItem(
        title="彼氏が海外赴任 ついていくべき？",
        url="https://example.com",
        source="chiebukuro",
        body_snippet="付き合って3年の彼氏が...",
        engagement={"views": 100000, "answers": 47},
    )
    s = score_item(item)
    assert s >= 70  # 高バズ度 + 恋愛 + 問いかけ


def test_low_engagement_reddit():
    item = CollectedItem(
        title="Random post about nothing",
        url="https://example.com",
        source="reddit",
        body_snippet="Just a random thought.",
        engagement={"upvotes": 500},
    )
    s = score_item(item)
    assert s < 50  # 低バズ度 + キーワードなし


def test_medium_hatena_with_emotion():
    item = CollectedItem(
        title="職場で言われた衝撃の一言にモヤモヤが止まらない",
        url="https://example.com",
        source="hatena",
        body_snippet="上司に呼ばれて...",
        engagement={"bookmarks": 500},
    )
    s = score_item(item)
    assert 50 <= s <= 85  # 中バズ度 + 感情 + 人間関係


def test_buzz_score_linear_interpolation():
    """バズ度スコアが線形補間されることを確認"""
    item_low = CollectedItem(
        title="test", url="https://a.com", source="chiebukuro",
        engagement={"views": 10000},
    )
    item_mid = CollectedItem(
        title="test", url="https://b.com", source="chiebukuro",
        engagement={"views": 50000},
    )
    item_high = CollectedItem(
        title="test", url="https://c.com", source="chiebukuro",
        engagement={"views": 100000},
    )
    s_low = score_item(item_low)
    s_mid = score_item(item_mid)
    s_high = score_item(item_high)
    assert s_low < s_mid < s_high


def test_question_format_bonus():
    """問いかけ形式でスコア加算"""
    item_plain = CollectedItem(
        title="海外生活の話", url="https://a.com", source="chiebukuro",
        engagement={"views": 30000, "answers": 10},
    )
    item_question = CollectedItem(
        title="海外生活ってどう思う？", url="https://b.com", source="chiebukuro",
        engagement={"views": 30000, "answers": 10},
    )
    assert score_item(item_question) > score_item(item_plain)
```

- [ ] **Step 2: テスト実行 — 失敗確認**

```bash
cd /Users/kimuratakuya/line-harness/trending-topic-collector
python3 -m pytest tests/test_scorer.py -v
```

Expected: `ModuleNotFoundError: No module named 'src.scorer'`

- [ ] **Step 3: scorer.py 実装**

```python
# trending-topic-collector/src/scorer.py
"""
スコアリング: バズ度（60点） + 語りネタ適性（40点） = 100点満点
"""
from __future__ import annotations

import re

from src.collectors.base import CollectedItem

# --- バズ度の正規化テーブル ---
# (ソース名, engagementキー, 20点の値, 40点の値, 60点の値)
_BUZZ_SCALES: dict[str, tuple[str, float, float, float]] = {
    "chiebukuro": ("views", 10_000, 50_000, 100_000),
    "twitter": ("faves", 5_000, 20_000, 50_000),
    "youtube": ("views", 100_000, 500_000, 1_000_000),
    "reddit": ("upvotes", 500, 2_000, 5_000),
    "hatena": ("bookmarks", 100, 500, 1_000),
}

# --- 語りネタ適性のキーワード ---
_EMOTION_WORDS = re.compile(
    r"怒り|悲し|驚き|感動|モヤモヤ|衝撃|ショック|泣い|泣け|許せ|信じられ|ヤバい|ヤバ|つらい|辛い|最悪|最高|号泣|激怒|困惑"
)
_QUESTION_PATTERNS = re.compile(
    r"どう思[うい]|ってあり|なんだけど|どうすれば|どうしたら|ですか[？?]|でしょうか|してる[？?]|だと思う[？?]|知りたい"
)
_RELATIONSHIP_WORDS = re.compile(
    r"恋愛|彼氏|彼女|夫|妻|旦那|嫁|義母|義父|上司|部下|同僚|職場|友人|友達|家族|親|子供|国際|外国人|海外"
)
_CONTROVERSY_WORDS = re.compile(
    r"賛否|炎上|批判|擁護|反論|議論|意見が割れ|どっちが正しい|おかしい|非常識|常識"
)


def _buzz_score(item: CollectedItem) -> float:
    """バズ度を0-60で返す"""
    scale = _BUZZ_SCALES.get(item.source)
    if not scale:
        return 0.0

    key, low, mid, high = scale
    value = item.engagement.get(key, 0)
    if not value:
        return 0.0

    if value <= low:
        return (value / low) * 20
    elif value <= mid:
        return 20 + ((value - low) / (mid - low)) * 20
    elif value <= high:
        return 40 + ((value - mid) / (high - mid)) * 20
    else:
        return 60.0


def _topic_score(item: CollectedItem) -> float:
    """語りネタ適性を0-40で返す"""
    text = f"{item.title} {item.body_snippet}"
    score = 0.0

    if _EMOTION_WORDS.search(text):
        score += 10
    if _QUESTION_PATTERNS.search(text):
        score += 10
    if _RELATIONSHIP_WORDS.search(text):
        score += 10
    if _CONTROVERSY_WORDS.search(text):
        score += 10

    return score


def score_item(item: CollectedItem) -> int:
    """100点満点のスコアを返す"""
    buzz = _buzz_score(item)
    topic = _topic_score(item)
    return int(min(buzz + topic, 100))
```

- [ ] **Step 4: テスト実行 — 全パス確認**

```bash
cd /Users/kimuratakuya/line-harness/trending-topic-collector
python3 -m pytest tests/test_scorer.py -v
```

Expected: 5 passed

- [ ] **Step 5: コミット**

```bash
cd /Users/kimuratakuya/line-harness
git add trending-topic-collector/src/scorer.py trending-topic-collector/tests/test_scorer.py
git commit -m "feat: add scorer module with buzz + topic relevance scoring"
```

---

### Task 4: Obsidian Writer（obsidian_writer.py）

**Files:**
- Create: `trending-topic-collector/src/obsidian_writer.py`
- Create: `trending-topic-collector/tests/test_obsidian_writer.py`

- [ ] **Step 1: テスト作成**

```python
# trending-topic-collector/tests/test_obsidian_writer.py
import os
import tempfile
from datetime import datetime

from src.collectors.base import CollectedItem
from src.obsidian_writer import write_topic_note, _slugify


def test_slugify():
    assert _slugify("彼氏が海外赴任 ついていくべき？") == "彼氏が海外赴任-ついていくべき"
    assert _slugify("What do you think?") == "what-do-you-think"


def test_write_creates_file():
    with tempfile.TemporaryDirectory() as tmpdir:
        item = CollectedItem(
            title="テストトピック",
            url="https://example.com/topic1",
            source="chiebukuro",
            body_snippet="これはテスト本文です。",
            category="恋愛相談",
            collected_at=datetime(2026, 3, 28, 9, 0, 0),
            engagement={"views": 50000, "answers": 20},
        )
        path = write_topic_note(item, score=75, output_dir=tmpdir)

        assert os.path.exists(path)
        content = open(path, encoding="utf-8").read()
        assert "title:" in content
        assert "score: 75" in content
        assert "https://example.com/topic1" in content
        assert "テストトピック" in content
        assert "trending-topic" in content


def test_write_no_duplicate_filename():
    """同名ファイルが既存でも上書きせずサフィックスを付ける"""
    with tempfile.TemporaryDirectory() as tmpdir:
        item = CollectedItem(
            title="同じタイトル", url="https://a.com", source="reddit",
            collected_at=datetime(2026, 3, 28, 9, 0, 0),
            engagement={"upvotes": 1000},
        )
        p1 = write_topic_note(item, score=60, output_dir=tmpdir)
        item2 = CollectedItem(
            title="同じタイトル", url="https://b.com", source="reddit",
            collected_at=datetime(2026, 3, 28, 9, 0, 0),
            engagement={"upvotes": 2000},
        )
        p2 = write_topic_note(item2, score=65, output_dir=tmpdir)
        assert p1 != p2
        assert os.path.exists(p1)
        assert os.path.exists(p2)
```

- [ ] **Step 2: テスト実行 — 失敗確認**

```bash
cd /Users/kimuratakuya/line-harness/trending-topic-collector
python3 -m pytest tests/test_obsidian_writer.py -v
```

Expected: FAIL

- [ ] **Step 3: obsidian_writer.py 実装**

```python
# trending-topic-collector/src/obsidian_writer.py
from __future__ import annotations

import re
import unicodedata
from pathlib import Path

import yaml

from src.collectors.base import CollectedItem


def _slugify(text: str, max_len: int = 60) -> str:
    """タイトルをファイル名安全なslugに変換"""
    # 記号除去（日本語は残す）
    slug = re.sub(r'[？?！!。、,./:;\'\"()（）【】\[\]{}]', '', text)
    slug = slug.strip().replace(" ", "-").replace("　", "-")
    slug = re.sub(r'-+', '-', slug).strip('-').lower()
    return slug[:max_len]


def write_topic_note(
    item: CollectedItem,
    score: int,
    output_dir: str | Path,
) -> str:
    """Obsidianノートを書き出してファイルパスを返す"""
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    date_str = item.collected_at.strftime("%Y-%m-%d")
    slug = _slugify(item.title)
    filename = f"{date_str}-{slug}.md"
    filepath = output_dir / filename

    # 重複回避
    counter = 2
    while filepath.exists():
        filepath = output_dir / f"{date_str}-{slug}-{counter}.md"
        counter += 1

    # frontmatter
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
```

- [ ] **Step 4: テスト実行 — 全パス確認**

```bash
cd /Users/kimuratakuya/line-harness/trending-topic-collector
python3 -m pytest tests/test_obsidian_writer.py -v
```

Expected: 3 passed

- [ ] **Step 5: コミット**

```bash
cd /Users/kimuratakuya/line-harness
git add trending-topic-collector/src/obsidian_writer.py trending-topic-collector/tests/test_obsidian_writer.py
git commit -m "feat: add obsidian writer for trending topic notes"
```

---

### Task 5: LINE通知（line_notifier.py）

**Files:**
- Create: `trending-topic-collector/src/line_notifier.py`
- Create: `trending-topic-collector/tests/test_line_notifier.py`

- [ ] **Step 1: テスト作成**

```python
# trending-topic-collector/tests/test_line_notifier.py
from datetime import datetime
from unittest.mock import patch, MagicMock

from src.collectors.base import CollectedItem
from src.line_notifier import format_notification, send_notification


def _make_item(title, source, url, score, engagement):
    return (
        CollectedItem(
            title=title, url=url, source=source,
            engagement=engagement,
            collected_at=datetime(2026, 3, 28),
        ),
        score,
    )


def test_format_notification_single():
    items = [_make_item("テストトピック", "chiebukuro", "https://example.com", 75, {"views": 50000, "answers": 20})]
    text = format_notification(items)
    assert "バズネタ速報" in text
    assert "1件" in text
    assert "75点" in text
    assert "テストトピック" in text
    assert "https://example.com" in text


def test_format_notification_multiple():
    items = [
        _make_item("トピックA", "chiebukuro", "https://a.com", 82, {"views": 100000}),
        _make_item("トピックB", "reddit", "https://b.com", 71, {"upvotes": 3200}),
    ]
    text = format_notification(items)
    assert "2件" in text
    assert "82点" in text
    assert "71点" in text


def test_format_notification_empty():
    text = format_notification([])
    assert text is None


def test_send_notification_calls_api():
    with patch("src.line_notifier.requests.post") as mock_post:
        mock_post.return_value = MagicMock(status_code=200)
        items = [_make_item("テスト", "reddit", "https://x.com", 70, {"upvotes": 1000})]
        result = send_notification(items, token="test-token")
        assert result is True
        mock_post.assert_called_once()
        call_args = mock_post.call_args
        assert "Authorization" in call_args[1]["headers"]
```

- [ ] **Step 2: テスト実行 — 失敗確認**

```bash
cd /Users/kimuratakuya/line-harness/trending-topic-collector
python3 -m pytest tests/test_line_notifier.py -v
```

Expected: FAIL

- [ ] **Step 3: line_notifier.py 実装**

```python
# trending-topic-collector/src/line_notifier.py
from __future__ import annotations

from typing import Optional

import requests

from src.collectors.base import CollectedItem

_LINE_NOTIFY_URL = "https://notify-api.line.me/api/notify"

# engagementキーの表示名
_ENGAGEMENT_LABELS = {
    "views": "閲覧",
    "answers": "回答",
    "faves": "いいね",
    "retweets": "RT",
    "replies": "リプ",
    "upvotes": "upvote",
    "comments": "コメント",
    "bookmarks": "ブクマ",
}

_SOURCE_LABELS = {
    "chiebukuro": "知恵袋",
    "twitter": "X",
    "youtube": "YouTube",
    "reddit": "Reddit",
    "hatena": "はてな匿名",
}


def _format_engagement(engagement: dict) -> str:
    parts = []
    for key, val in engagement.items():
        label = _ENGAGEMENT_LABELS.get(key, key)
        if isinstance(val, (int, float)):
            if val >= 10000:
                parts.append(f"{val/10000:.1f}万{label}")
            else:
                parts.append(f"{val:,}{label}")
    return " ".join(parts)


def format_notification(scored_items: list[tuple[CollectedItem, int]]) -> Optional[str]:
    """LINE通知用のテキストを生成。アイテムがなければNone。"""
    if not scored_items:
        return None

    # スコア降順
    sorted_items = sorted(scored_items, key=lambda x: x[1], reverse=True)

    lines = [f"\n[バズネタ速報 {len(sorted_items)}件]\n"]
    for item, score in sorted_items:
        source_label = _SOURCE_LABELS.get(item.source, item.source)
        eng_str = _format_engagement(item.engagement)
        cat_str = f" | {item.category}" if item.category else ""
        lines.append(f"{score}点 {item.title}")
        lines.append(f"{source_label} {eng_str}{cat_str}")
        lines.append(f"{item.url}")
        lines.append("")

    return "\n".join(lines)


def send_notification(
    scored_items: list[tuple[CollectedItem, int]],
    token: str,
) -> bool:
    """LINE Notifyで通知を送信。成功ならTrue。"""
    text = format_notification(scored_items)
    if text is None:
        return False

    # LINE Notifyは1000文字制限。超える場合は分割
    chunks = []
    if len(text) <= 1000:
        chunks = [text]
    else:
        # アイテム単位で分割
        header = f"\n[バズネタ速報 {len(scored_items)}件]\n\n"
        current = header
        sorted_items = sorted(scored_items, key=lambda x: x[1], reverse=True)
        for item, score in sorted_items:
            source_label = _SOURCE_LABELS.get(item.source, item.source)
            eng_str = _format_engagement(item.engagement)
            cat_str = f" | {item.category}" if item.category else ""
            entry = f"{score}点 {item.title}\n{source_label} {eng_str}{cat_str}\n{item.url}\n\n"
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

- [ ] **Step 4: テスト実行 — 全パス確認**

```bash
cd /Users/kimuratakuya/line-harness/trending-topic-collector
python3 -m pytest tests/test_line_notifier.py -v
```

Expected: 4 passed

- [ ] **Step 5: コミット**

```bash
cd /Users/kimuratakuya/line-harness
git add trending-topic-collector/src/line_notifier.py trending-topic-collector/tests/test_line_notifier.py
git commit -m "feat: add LINE Notify module for trending topic alerts"
```

---

### Task 6: Yahoo知恵袋コレクター

**Files:**
- Create: `trending-topic-collector/src/collectors/chiebukuro.py`
- Create: `trending-topic-collector/tests/test_collectors/test_chiebukuro.py`

- [ ] **Step 1: テスト作成（HTMLパースのユニットテスト）**

```python
# trending-topic-collector/tests/test_collectors/test_chiebukuro.py
from datetime import datetime

from src.collectors.chiebukuro import ChiebukuroCollector, _parse_question_list_page


SAMPLE_HTML = """
<html><body>
<div class="Chie-Qa__QaListItem">
  <a class="Chie-Qa__QaListItem__Title" href="https://detail.chiebukuro.yahoo.co.jp/qa/question_detail/q12345">
    彼氏が海外赴任になったけどついていくべき？
  </a>
  <span class="Chie-Qa__QaListItem__ViewCount">85,000閲覧</span>
  <span class="Chie-Qa__QaListItem__AnswerCount">47回答</span>
</div>
<div class="Chie-Qa__QaListItem">
  <a class="Chie-Qa__QaListItem__Title" href="https://detail.chiebukuro.yahoo.co.jp/qa/question_detail/q67890">
    低閲覧の質問
  </a>
  <span class="Chie-Qa__QaListItem__ViewCount">500閲覧</span>
  <span class="Chie-Qa__QaListItem__AnswerCount">2回答</span>
</div>
</body></html>
"""


def test_parse_extracts_items():
    items = _parse_question_list_page(SAMPLE_HTML, min_views=10000, min_answers=3)
    assert len(items) == 1
    assert items[0].title == "彼氏が海外赴任になったけどついていくべき？"
    assert items[0].source == "chiebukuro"
    assert items[0].engagement["views"] == 85000
    assert items[0].engagement["answers"] == 47
    assert "q12345" in items[0].url


def test_parse_filters_low_engagement():
    items = _parse_question_list_page(SAMPLE_HTML, min_views=100000, min_answers=3)
    assert len(items) == 0


def test_collector_has_correct_source_name():
    c = ChiebukuroCollector(config={
        "enabled": True,
        "categories": ["恋愛相談"],
        "min_views": 10000,
        "min_answers": 3,
    })
    assert c.source_name == "chiebukuro"
```

- [ ] **Step 2: テスト実行 — 失敗確認**

```bash
cd /Users/kimuratakuya/line-harness/trending-topic-collector
python3 -m pytest tests/test_collectors/test_chiebukuro.py -v
```

Expected: FAIL

- [ ] **Step 3: chiebukuro.py 実装**

Yahoo知恵袋のカテゴリページ（閲覧数順）のHTMLをパースして質問を取得。実際のHTML構造はスクレイピング時に調整が必要（セレクタはサイト構造の変化で変わる可能性あり）。

```python
# trending-topic-collector/src/collectors/chiebukuro.py
from __future__ import annotations

import re
from datetime import datetime

import requests
from bs4 import BeautifulSoup

from src.collectors.base import BaseCollector, CollectedItem

# カテゴリ名 → Yahoo知恵袋のカテゴリURL slug
_CATEGORY_SLUGS = {
    "恋愛相談": "2078297246",
    "生き方と恋愛、人間関係の悩み": "2078297245",
    "海外": "2079526476",
    "職場の悩み": "2078297248",
    "家族関係の悩み": "2078297247",
}

_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept-Language": "ja,en;q=0.9",
}


def _parse_view_count(text: str) -> int:
    """'85,000閲覧' → 85000"""
    text = text.replace(",", "").replace("閲覧", "").strip()
    m = re.search(r"(\d+)", text)
    return int(m.group(1)) if m else 0


def _parse_answer_count(text: str) -> int:
    """'47回答' → 47"""
    m = re.search(r"(\d+)", text)
    return int(m.group(1)) if m else 0


def _parse_question_list_page(
    html: str,
    min_views: int = 10000,
    min_answers: int = 3,
    category: str = "",
) -> list[CollectedItem]:
    """知恵袋の質問一覧HTMLをパースしてCollectedItemリストを返す"""
    soup = BeautifulSoup(html, "lxml")
    items = []

    for qa in soup.select("[class*='QaListItem'], .ClapLv2QaList__item, li[data-qa-id]"):
        # タイトルとURL
        link = qa.select_one("a[href*='question_detail']")
        if not link:
            continue
        title = link.get_text(strip=True)
        url = link.get("href", "")
        if not url.startswith("http"):
            url = "https://detail.chiebukuro.yahoo.co.jp" + url

        # 閲覧数
        view_el = qa.select_one("[class*='ViewCount'], [class*='view']")
        views = _parse_view_count(view_el.get_text()) if view_el else 0

        # 回答数
        ans_el = qa.select_one("[class*='AnswerCount'], [class*='answer']")
        answers = _parse_answer_count(ans_el.get_text()) if ans_el else 0

        if views >= min_views and answers >= min_answers:
            items.append(CollectedItem(
                title=title,
                url=url,
                source="chiebukuro",
                category=category,
                engagement={"views": views, "answers": answers},
            ))

    return items


class ChiebukuroCollector(BaseCollector):
    source_name = "chiebukuro"

    def __init__(self, config: dict):
        self._categories = config.get("categories", [])
        self._min_views = config.get("min_views", 10000)
        self._min_answers = config.get("min_answers", 3)

    def collect(self) -> list[CollectedItem]:
        all_items: list[CollectedItem] = []

        for cat_name in self._categories:
            cat_id = _CATEGORY_SLUGS.get(cat_name)
            if not cat_id:
                print(f"  [chiebukuro] Unknown category: {cat_name}")
                continue

            url = f"https://chiebukuro.yahoo.co.jp/category/{cat_id}/question/list?sort=view&flg=2"
            try:
                resp = requests.get(url, headers=_HEADERS, timeout=15)
                resp.raise_for_status()
                items = _parse_question_list_page(
                    resp.text,
                    min_views=self._min_views,
                    min_answers=self._min_answers,
                    category=cat_name,
                )
                all_items.extend(items)
                print(f"  [chiebukuro] {cat_name}: {len(items)}件")
            except Exception as e:
                print(f"  [chiebukuro] {cat_name}: error - {e}")

        return all_items
```

- [ ] **Step 4: テスト実行 — 全パス確認**

```bash
cd /Users/kimuratakuya/line-harness/trending-topic-collector
python3 -m pytest tests/test_collectors/test_chiebukuro.py -v
```

Expected: 3 passed

- [ ] **Step 5: コミット**

```bash
cd /Users/kimuratakuya/line-harness
git add trending-topic-collector/src/collectors/chiebukuro.py trending-topic-collector/tests/test_collectors/test_chiebukuro.py
git commit -m "feat: add Yahoo Chiebukuro collector with HTML parsing"
```

---

### Task 7: Redditコレクター

**Files:**
- Create: `trending-topic-collector/src/collectors/reddit.py`
- Create: `trending-topic-collector/tests/test_collectors/test_reddit.py`

- [ ] **Step 1: テスト作成**

```python
# trending-topic-collector/tests/test_collectors/test_reddit.py
from datetime import datetime, timedelta
from unittest.mock import patch, MagicMock

from src.collectors.reddit import RedditCollector, _parse_reddit_json


SAMPLE_REDDIT_JSON = {
    "data": {
        "children": [
            {
                "data": {
                    "title": "Why do Japanese people always bow?",
                    "selftext": "I noticed this cultural thing...",
                    "url": "https://www.reddit.com/r/japan/comments/abc123/",
                    "permalink": "/r/japan/comments/abc123/why_do_japanese_people_always_bow/",
                    "ups": 3200,
                    "num_comments": 450,
                    "created_utc": (datetime.now() - timedelta(hours=12)).timestamp(),
                    "subreddit": "japan",
                }
            },
            {
                "data": {
                    "title": "Low upvote post",
                    "selftext": "Not interesting",
                    "url": "https://www.reddit.com/r/japan/comments/xyz/",
                    "permalink": "/r/japan/comments/xyz/low/",
                    "ups": 50,
                    "num_comments": 3,
                    "created_utc": (datetime.now() - timedelta(hours=6)).timestamp(),
                    "subreddit": "japan",
                }
            },
        ]
    }
}


def test_parse_filters_by_upvotes():
    items = _parse_reddit_json(SAMPLE_REDDIT_JSON, min_upvotes=500, max_age_hours=48)
    assert len(items) == 1
    assert items[0].title == "Why do Japanese people always bow?"
    assert items[0].engagement["upvotes"] == 3200


def test_parse_skips_old_posts():
    old_data = {
        "data": {
            "children": [{
                "data": {
                    "title": "Old post",
                    "selftext": "",
                    "url": "https://www.reddit.com/r/japan/old/",
                    "permalink": "/r/japan/old/",
                    "ups": 5000,
                    "num_comments": 100,
                    "created_utc": (datetime.now() - timedelta(hours=72)).timestamp(),
                    "subreddit": "japan",
                }
            }]
        }
    }
    items = _parse_reddit_json(old_data, min_upvotes=500, max_age_hours=48)
    assert len(items) == 0


def test_collector_source_name():
    c = RedditCollector(config={"enabled": True, "subreddits": ["japan"], "min_upvotes": 500})
    assert c.source_name == "reddit"
```

- [ ] **Step 2: テスト実行 — 失敗確認**

```bash
cd /Users/kimuratakuya/line-harness/trending-topic-collector
python3 -m pytest tests/test_collectors/test_reddit.py -v
```

Expected: FAIL

- [ ] **Step 3: reddit.py 実装**

```python
# trending-topic-collector/src/collectors/reddit.py
from __future__ import annotations

from datetime import datetime, timedelta

import feedparser
import requests

from src.collectors.base import BaseCollector, CollectedItem

_HEADERS = {
    "User-Agent": "trending-topic-collector/1.0 (research bot)",
}


def _parse_reddit_json(
    data: dict,
    min_upvotes: int = 500,
    max_age_hours: int = 48,
) -> list[CollectedItem]:
    """Reddit JSON APIのレスポンスをパース"""
    items = []
    cutoff = datetime.now().timestamp() - (max_age_hours * 3600)

    for child in data.get("data", {}).get("children", []):
        post = child.get("data", {})
        ups = post.get("ups", 0)
        created = post.get("created_utc", 0)

        if ups < min_upvotes or created < cutoff:
            continue

        title = post.get("title", "")
        selftext = post.get("selftext", "")[:200]
        permalink = post.get("permalink", "")
        url = f"https://www.reddit.com{permalink}" if permalink else post.get("url", "")
        subreddit = post.get("subreddit", "")

        items.append(CollectedItem(
            title=title,
            url=url,
            source="reddit",
            body_snippet=selftext,
            category=f"r/{subreddit}",
            engagement={"upvotes": ups, "comments": post.get("num_comments", 0)},
        ))

    return items


class RedditCollector(BaseCollector):
    source_name = "reddit"

    def __init__(self, config: dict):
        self._subreddits = config.get("subreddits", [])
        self._rss_feeds = config.get("rss_feeds", [])
        self._min_upvotes = config.get("min_upvotes", 500)

    def collect(self) -> list[CollectedItem]:
        all_items: list[CollectedItem] = []

        # Reddit JSON API
        for sub in self._subreddits:
            url = f"https://www.reddit.com/r/{sub}/hot.json?limit=25"
            try:
                resp = requests.get(url, headers=_HEADERS, timeout=15)
                resp.raise_for_status()
                items = _parse_reddit_json(resp.json(), min_upvotes=self._min_upvotes)
                all_items.extend(items)
                print(f"  [reddit] r/{sub}: {len(items)}件")
            except Exception as e:
                print(f"  [reddit] r/{sub}: error - {e}")

        # RSS feeds (海外反応まとめ等)
        for feed_url in self._rss_feeds:
            try:
                feed = feedparser.parse(feed_url)
                for entry in feed.entries[:20]:
                    title = entry.get("title", "")
                    link = entry.get("link", "")
                    summary = entry.get("summary", "")[:200]
                    all_items.append(CollectedItem(
                        title=title,
                        url=link,
                        source="reddit",
                        body_snippet=summary,
                        category="海外反応",
                        engagement={"upvotes": 0},  # RSSではスコア不明
                    ))
                print(f"  [reddit] RSS {feed_url[:40]}: {len(feed.entries[:20])}件")
            except Exception as e:
                print(f"  [reddit] RSS error: {e}")

        return all_items
```

- [ ] **Step 4: テスト実行 — 全パス確認**

```bash
cd /Users/kimuratakuya/line-harness/trending-topic-collector
python3 -m pytest tests/test_collectors/test_reddit.py -v
```

Expected: 3 passed

- [ ] **Step 5: コミット**

```bash
cd /Users/kimuratakuya/line-harness
git add trending-topic-collector/src/collectors/reddit.py trending-topic-collector/tests/test_collectors/test_reddit.py
git commit -m "feat: add Reddit collector with JSON API and RSS support"
```

---

### Task 8: はてな匿名ダイアリーコレクター

**Files:**
- Create: `trending-topic-collector/src/collectors/hatena.py`
- Create: `trending-topic-collector/tests/test_collectors/test_hatena.py`

- [ ] **Step 1: テスト作成**

```python
# trending-topic-collector/tests/test_collectors/test_hatena.py
from src.collectors.hatena import HatenaCollector, _parse_hotentry_rss


SAMPLE_RSS = """<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
         xmlns="http://purl.org/rss/1.0/"
         xmlns:hatena="http://www.hatena.ne.jp/info/xmlns#">
  <item rdf:about="https://anond.hatelabo.jp/20260328123456">
    <title>職場で言われた衝撃の一言にモヤモヤが止まらない</title>
    <link>https://anond.hatelabo.jp/20260328123456</link>
    <description>上司に呼ばれて突然言われたのが...</description>
    <hatena:bookmarkcount>680</hatena:bookmarkcount>
  </item>
  <item rdf:about="https://anond.hatelabo.jp/20260328111111">
    <title>低ブクマの記事</title>
    <link>https://anond.hatelabo.jp/20260328111111</link>
    <description>あまり注目されない</description>
    <hatena:bookmarkcount>30</hatena:bookmarkcount>
  </item>
</rdf:RDF>
"""


def test_parse_filters_by_bookmarks():
    items = _parse_hotentry_rss(SAMPLE_RSS, min_bookmarks=100)
    assert len(items) == 1
    assert items[0].title == "職場で言われた衝撃の一言にモヤモヤが止まらない"
    assert items[0].engagement["bookmarks"] == 680
    assert items[0].source == "hatena"


def test_parse_no_results_high_threshold():
    items = _parse_hotentry_rss(SAMPLE_RSS, min_bookmarks=1000)
    assert len(items) == 0


def test_collector_source_name():
    c = HatenaCollector(config={"enabled": True, "min_bookmarks": 100})
    assert c.source_name == "hatena"
```

- [ ] **Step 2: テスト実行 — 失敗確認**

```bash
cd /Users/kimuratakuya/line-harness/trending-topic-collector
python3 -m pytest tests/test_collectors/test_hatena.py -v
```

Expected: FAIL

- [ ] **Step 3: hatena.py 実装**

```python
# trending-topic-collector/src/collectors/hatena.py
from __future__ import annotations

import re

import feedparser
import requests

from src.collectors.base import BaseCollector, CollectedItem

# はてなブックマーク - 匿名ダイアリーの人気エントリーRSS
_ANOND_HOTENTRY_RSS = "https://b.hatena.ne.jp/entrylist/anond.hatelabo.jp?mode=rss&sort=hot"


def _parse_hotentry_rss(rss_text: str, min_bookmarks: int = 100) -> list[CollectedItem]:
    """はてブ人気エントリーRSSをパース"""
    feed = feedparser.parse(rss_text)
    items = []

    for entry in feed.entries:
        title = entry.get("title", "")
        link = entry.get("link", "")
        summary = entry.get("summary", entry.get("description", ""))[:200]

        # ブックマーク数の取得
        bookmarks = 0
        # hatena:bookmarkcount
        bk = entry.get("hatena_bookmarkcount", "0")
        try:
            bookmarks = int(bk)
        except (ValueError, TypeError):
            pass

        if bookmarks < min_bookmarks:
            continue

        items.append(CollectedItem(
            title=title,
            url=link,
            source="hatena",
            body_snippet=summary,
            category="匿名ダイアリー",
            engagement={"bookmarks": bookmarks},
        ))

    return items


class HatenaCollector(BaseCollector):
    source_name = "hatena"

    def __init__(self, config: dict):
        self._min_bookmarks = config.get("min_bookmarks", 100)

    def collect(self) -> list[CollectedItem]:
        try:
            resp = requests.get(_ANOND_HOTENTRY_RSS, timeout=15)
            resp.raise_for_status()
            items = _parse_hotentry_rss(resp.text, min_bookmarks=self._min_bookmarks)
            print(f"  [hatena] 匿名ダイアリー: {len(items)}件")
            return items
        except Exception as e:
            print(f"  [hatena] error: {e}")
            return []
```

- [ ] **Step 4: テスト実行 — 全パス確認**

```bash
cd /Users/kimuratakuya/line-harness/trending-topic-collector
python3 -m pytest tests/test_collectors/test_hatena.py -v
```

Expected: 3 passed

- [ ] **Step 5: コミット**

```bash
cd /Users/kimuratakuya/line-harness
git add trending-topic-collector/src/collectors/hatena.py trending-topic-collector/tests/test_collectors/test_hatena.py
git commit -m "feat: add Hatena anonymous diary collector via bookmark RSS"
```

---

### Task 9: YouTube Shortsコレクター

**Files:**
- Create: `trending-topic-collector/src/collectors/youtube_shorts.py`
- Create: `trending-topic-collector/tests/test_collectors/test_youtube_shorts.py`

- [ ] **Step 1: テスト作成**

```python
# trending-topic-collector/tests/test_collectors/test_youtube_shorts.py
from datetime import datetime, timedelta, timezone

from src.collectors.youtube_shorts import YoutubeShortsCollector, _parse_search_response


SAMPLE_RESPONSE = {
    "items": [
        {
            "id": {"videoId": "abc123"},
            "snippet": {
                "title": "海外で恥かいたあるある #shorts",
                "channelTitle": "語りチャンネル",
                "publishedAt": (datetime.now(timezone.utc) - timedelta(hours=12)).strftime("%Y-%m-%dT%H:%M:%SZ"),
                "description": "海外生活で恥ずかしかった...",
            },
        },
        {
            "id": {"videoId": "xyz789"},
            "snippet": {
                "title": "古い動画",
                "channelTitle": "誰か",
                "publishedAt": "2025-01-01T00:00:00Z",
                "description": "古いよ",
            },
        },
    ]
}

SAMPLE_STATS = {
    "items": [
        {
            "id": "abc123",
            "statistics": {"viewCount": "500000", "likeCount": "30000", "commentCount": "1200"},
            "contentDetails": {"duration": "PT45S"},
        },
        {
            "id": "xyz789",
            "statistics": {"viewCount": "200000", "likeCount": "5000", "commentCount": "100"},
            "contentDetails": {"duration": "PT30S"},
        },
    ]
}


def test_parse_filters_by_age_and_views():
    items = _parse_search_response(
        SAMPLE_RESPONSE, SAMPLE_STATS,
        min_views=100000, max_duration_sec=60, max_age_hours=48,
    )
    assert len(items) == 1
    assert items[0].title == "海外で恥かいたあるある #shorts"
    assert items[0].engagement["views"] == 500000


def test_collector_source_name():
    c = YoutubeShortsCollector(config={
        "enabled": True, "channels": [], "min_views": 100000,
        "max_duration_sec": 60,
    })
    assert c.source_name == "youtube"
```

- [ ] **Step 2: テスト実行 — 失敗確認**

```bash
cd /Users/kimuratakuya/line-harness/trending-topic-collector
python3 -m pytest tests/test_collectors/test_youtube_shorts.py -v
```

Expected: FAIL

- [ ] **Step 3: youtube_shorts.py 実装**

```python
# trending-topic-collector/src/collectors/youtube_shorts.py
from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone

import requests

from src.collectors.base import BaseCollector, CollectedItem

_SEARCH_URL = "https://www.googleapis.com/youtube/v3/search"
_VIDEOS_URL = "https://www.googleapis.com/youtube/v3/videos"


def _parse_duration_seconds(iso_duration: str) -> int:
    """PT1M30S → 90, PT45S → 45"""
    m = re.match(r"PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", iso_duration)
    if not m:
        return 0
    hours = int(m.group(1) or 0)
    minutes = int(m.group(2) or 0)
    seconds = int(m.group(3) or 0)
    return hours * 3600 + minutes * 60 + seconds


def _parse_search_response(
    search_data: dict,
    stats_data: dict,
    min_views: int = 100000,
    max_duration_sec: int = 60,
    max_age_hours: int = 48,
) -> list[CollectedItem]:
    """YouTube Search API + Videos APIの結果をパース"""
    cutoff = datetime.now(timezone.utc) - timedelta(hours=max_age_hours)

    # stats_dataをIDでルックアップ
    stats_map = {}
    for item in stats_data.get("items", []):
        stats_map[item["id"]] = item

    items = []
    for item in search_data.get("items", []):
        video_id = item.get("id", {}).get("videoId", "")
        snippet = item.get("snippet", {})
        title = snippet.get("title", "")
        channel = snippet.get("channelTitle", "")
        published = snippet.get("publishedAt", "")
        description = snippet.get("description", "")[:200]

        # 日付フィルタ
        try:
            pub_dt = datetime.strptime(published, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
            if pub_dt < cutoff:
                continue
        except ValueError:
            continue

        # Stats
        stat = stats_map.get(video_id, {})
        statistics = stat.get("statistics", {})
        views = int(statistics.get("viewCount", 0))
        likes = int(statistics.get("likeCount", 0))
        comments = int(statistics.get("commentCount", 0))

        # Duration
        duration = _parse_duration_seconds(
            stat.get("contentDetails", {}).get("duration", "PT0S")
        )
        if duration > max_duration_sec:
            continue

        if views < min_views:
            continue

        items.append(CollectedItem(
            title=title,
            url=f"https://www.youtube.com/shorts/{video_id}",
            source="youtube",
            body_snippet=description,
            category=channel,
            engagement={"views": views, "likes": likes, "comments": comments},
        ))

    return items


class YoutubeShortsCollector(BaseCollector):
    source_name = "youtube"

    def __init__(self, config: dict):
        self._channels = config.get("channels", [])
        self._min_views = config.get("min_views", 100000)
        self._max_duration = config.get("max_duration_sec", 60)
        self._api_key = config.get("api_key", "")

    def collect(self) -> list[CollectedItem]:
        if not self._api_key:
            print("  [youtube] YOUTUBE_API_KEY not set, skipping")
            return []

        all_items: list[CollectedItem] = []

        for channel_id in self._channels:
            try:
                # チャンネルの最新動画を検索
                search_resp = requests.get(_SEARCH_URL, params={
                    "key": self._api_key,
                    "channelId": channel_id,
                    "part": "snippet",
                    "type": "video",
                    "order": "date",
                    "maxResults": 10,
                    "publishedAfter": (datetime.now(timezone.utc) - timedelta(hours=48)).strftime("%Y-%m-%dT%H:%M:%SZ"),
                }, timeout=15)
                search_resp.raise_for_status()
                search_data = search_resp.json()

                # 動画IDを抽出してstats取得
                video_ids = [
                    item["id"]["videoId"]
                    for item in search_data.get("items", [])
                    if "videoId" in item.get("id", {})
                ]
                if not video_ids:
                    continue

                stats_resp = requests.get(_VIDEOS_URL, params={
                    "key": self._api_key,
                    "id": ",".join(video_ids),
                    "part": "statistics,contentDetails",
                }, timeout=15)
                stats_resp.raise_for_status()

                items = _parse_search_response(
                    search_data, stats_resp.json(),
                    min_views=self._min_views,
                    max_duration_sec=self._max_duration,
                )
                all_items.extend(items)
                print(f"  [youtube] {channel_id}: {len(items)}件")
            except Exception as e:
                print(f"  [youtube] {channel_id}: error - {e}")

        return all_items
```

- [ ] **Step 4: テスト実行 — 全パス確認**

```bash
cd /Users/kimuratakuya/line-harness/trending-topic-collector
python3 -m pytest tests/test_collectors/test_youtube_shorts.py -v
```

Expected: 2 passed

- [ ] **Step 5: コミット**

```bash
cd /Users/kimuratakuya/line-harness
git add trending-topic-collector/src/collectors/youtube_shorts.py trending-topic-collector/tests/test_collectors/test_youtube_shorts.py
git commit -m "feat: add YouTube Shorts collector via Data API v3"
```

---

### Task 10: X/Twitterコレクター

X APIの無料プランはツイート取得が月1,500件と制限が厳しい。初期実装はWebスクレイピング（requests+BeautifulSoup）で、API制約が緩和されたらAPI版に差し替え可能な設計。config.yamlでは`enabled: false`がデフォルト。

**Files:**
- Create: `trending-topic-collector/src/collectors/twitter.py`
- Create: `trending-topic-collector/tests/test_collectors/test_twitter.py`

- [ ] **Step 1: テスト作成**

```python
# trending-topic-collector/tests/test_collectors/test_twitter.py
from src.collectors.twitter import TwitterCollector, _parse_search_results


SAMPLE_RESULTS = [
    {
        "text": "海外生活あるある：スーパーで「すみません」って言いそうになる",
        "url": "https://x.com/user1/status/123",
        "faves": 15000,
        "retweets": 3000,
        "replies": 500,
    },
    {
        "text": "今日の天気",
        "url": "https://x.com/user2/status/456",
        "faves": 100,
        "retweets": 5,
        "replies": 2,
    },
]


def test_parse_filters_by_faves():
    items = _parse_search_results(SAMPLE_RESULTS, min_faves=5000)
    assert len(items) == 1
    assert items[0].engagement["faves"] == 15000
    assert "海外生活あるある" in items[0].title


def test_collector_source_name():
    c = TwitterCollector(config={"enabled": False, "queries": [], "min_faves": 5000})
    assert c.source_name == "twitter"


def test_collector_disabled_returns_empty():
    c = TwitterCollector(config={"enabled": False, "queries": ["test"], "min_faves": 5000})
    items = c.collect()
    assert items == []
```

- [ ] **Step 2: テスト実行 — 失敗確認**

```bash
cd /Users/kimuratakuya/line-harness/trending-topic-collector
python3 -m pytest tests/test_collectors/test_twitter.py -v
```

Expected: FAIL

- [ ] **Step 3: twitter.py 実装（スタブ+パーサー）**

```python
# trending-topic-collector/src/collectors/twitter.py
"""
X/Twitter コレクター

現状: API無料プランの制約（月1,500ツイート）のため、enabled=false がデフォルト。
将来的にAPI or スクレイピング実装を追加する。

パーサーは実装済みなので、外部ツール（yt-dlp等）でデータ取得→
_parse_search_results() に渡す運用も可能。
"""
from __future__ import annotations

from src.collectors.base import BaseCollector, CollectedItem


def _parse_search_results(
    results: list[dict],
    min_faves: int = 5000,
) -> list[CollectedItem]:
    """検索結果の辞書リストをCollectedItemに変換"""
    items = []

    for r in results:
        faves = r.get("faves", 0)
        if faves < min_faves:
            continue

        text = r.get("text", "")
        # タイトルはツイート冒頭60文字
        title = text[:60] + ("..." if len(text) > 60 else "")

        items.append(CollectedItem(
            title=title,
            url=r.get("url", ""),
            source="twitter",
            body_snippet=text[:200],
            engagement={
                "faves": faves,
                "retweets": r.get("retweets", 0),
                "replies": r.get("replies", 0),
            },
        ))

    return items


class TwitterCollector(BaseCollector):
    source_name = "twitter"

    def __init__(self, config: dict):
        self._enabled = config.get("enabled", False)
        self._queries = config.get("queries", [])
        self._min_faves = config.get("min_faves", 5000)

    def collect(self) -> list[CollectedItem]:
        if not self._enabled:
            print("  [twitter] disabled in config, skipping")
            return []

        # TODO: API or スクレイピング実装
        # 現在はスタブ。手動データ投入 or 外部連携で使用可能
        print("  [twitter] no collection method configured yet")
        return []
```

- [ ] **Step 4: テスト実行 — 全パス確認**

```bash
cd /Users/kimuratakuya/line-harness/trending-topic-collector
python3 -m pytest tests/test_collectors/test_twitter.py -v
```

Expected: 3 passed

- [ ] **Step 5: コミット**

```bash
cd /Users/kimuratakuya/line-harness
git add trending-topic-collector/src/collectors/twitter.py trending-topic-collector/tests/test_collectors/test_twitter.py
git commit -m "feat: add Twitter collector stub with parser ready for API integration"
```

---

### Task 11: メインオーケストレーター（main.py）

**Files:**
- Create: `trending-topic-collector/src/main.py`

- [ ] **Step 1: main.py 実装**

```python
# trending-topic-collector/src/main.py
"""
バズ語りネタ自動収集パイプライン

Usage:
    python3 -m src.main                  # 全ソース収集
    python3 -m src.main --dry-run        # 収集+スコアリングのみ（保存・通知なし）
    python3 -m src.main --source reddit  # 特定ソースのみ
"""
from __future__ import annotations

import argparse
import sys
from datetime import datetime
from pathlib import Path

from src.config import load_config
from src.collectors.base import CollectedItem
from src.collectors.chiebukuro import ChiebukuroCollector
from src.collectors.reddit import RedditCollector
from src.collectors.hatena import HatenaCollector
from src.collectors.youtube_shorts import YoutubeShortsCollector
from src.collectors.twitter import TwitterCollector
from src.scorer import score_item
from src.dedup import DedupDB
from src.obsidian_writer import write_topic_note
from src.line_notifier import send_notification


def run(config_path: str | None = None, dry_run: bool = False, source_filter: str | None = None):
    cfg = load_config(config_path)
    sources_cfg = cfg.get("sources", {})
    scoring_cfg = cfg.get("scoring", {})
    obsidian_cfg = cfg.get("obsidian", {})
    notify_cfg = cfg.get("notification", {}).get("line", {})

    save_threshold = scoring_cfg.get("save_threshold", 50)
    notify_threshold = scoring_cfg.get("notify_threshold", 70)

    vault_path = Path(obsidian_cfg.get("vault_path", "~/Documents/Obsidian Vault")).expanduser()
    output_dir = vault_path / obsidian_cfg.get("output_dir", "knowledge/trending-topics")

    # DB
    db_path = Path(__file__).parent.parent / "data" / "seen.db"
    db_path.parent.mkdir(parents=True, exist_ok=True)
    db = DedupDB(db_path)

    print(f"=== バズネタ収集 {datetime.now().strftime('%Y-%m-%d %H:%M')} ===\n")

    # コレクター初期化
    collectors = []
    if not source_filter or source_filter == "chiebukuro":
        if sources_cfg.get("chiebukuro", {}).get("enabled", True):
            collectors.append(ChiebukuroCollector(sources_cfg["chiebukuro"]))
    if not source_filter or source_filter == "reddit":
        if sources_cfg.get("reddit", {}).get("enabled", True):
            collectors.append(RedditCollector(sources_cfg["reddit"]))
    if not source_filter or source_filter == "hatena":
        if sources_cfg.get("hatena", {}).get("enabled", True):
            collectors.append(HatenaCollector(sources_cfg["hatena"]))
    if not source_filter or source_filter == "youtube":
        if sources_cfg.get("youtube_shorts", {}).get("enabled", True):
            collectors.append(YoutubeShortsCollector(sources_cfg["youtube_shorts"]))
    if not source_filter or source_filter == "twitter":
        if sources_cfg.get("twitter", {}).get("enabled", False):
            collectors.append(TwitterCollector(sources_cfg["twitter"]))

    # 収集
    all_items: list[CollectedItem] = []
    for collector in collectors:
        print(f"[{collector.source_name}]")
        try:
            items = collector.collect()
            all_items.extend(items)
        except Exception as e:
            print(f"  error: {e}")
        print()

    print(f"収集合計: {len(all_items)}件\n")

    # 重複排除
    new_items = []
    for item in all_items:
        if not db.is_seen(item.url):
            new_items.append(item)
    print(f"新規: {len(new_items)}件 (既知: {len(all_items) - len(new_items)}件)\n")

    # スコアリング
    scored: list[tuple[CollectedItem, int]] = []
    for item in new_items:
        s = score_item(item)
        scored.append((item, s))

    scored.sort(key=lambda x: x[1], reverse=True)

    # 結果表示
    to_save = [(item, s) for item, s in scored if s >= save_threshold]
    to_notify = [(item, s) for item, s in scored if s >= notify_threshold]

    print(f"=== スコアリング結果 ===")
    print(f"保存対象(>={save_threshold}): {len(to_save)}件")
    print(f"通知対象(>={notify_threshold}): {len(to_notify)}件\n")

    for item, s in scored[:20]:
        flag = "***" if s >= notify_threshold else "  *" if s >= save_threshold else "   "
        print(f"  {flag} {s:3d}点 [{item.source:10}] {item.title[:50]}")

    if dry_run:
        print("\n[dry-run] 保存・通知はスキップ")
        db.close()
        return

    # Obsidian保存
    saved_count = 0
    for item, s in to_save:
        try:
            write_topic_note(item, score=s, output_dir=output_dir)
            db.mark_seen(item.url, item.title, item.source)
            saved_count += 1
        except Exception as e:
            print(f"  save error: {e}")

    print(f"\nObsidian保存: {saved_count}件 → {output_dir}")

    # LINE通知
    if to_notify and notify_cfg.get("enabled") and notify_cfg.get("token"):
        ok = send_notification(to_notify, token=notify_cfg["token"])
        print(f"LINE通知: {'送信成功' if ok else '送信失敗'} ({len(to_notify)}件)")
    elif to_notify:
        print(f"LINE通知: token未設定のためスキップ ({len(to_notify)}件)")

    # 古いエントリのクリーンアップ
    cleaned = db.cleanup(max_age_days=30)
    if cleaned:
        print(f"DB cleanup: {cleaned}件削除")

    db.close()
    print("\n=== 完了 ===")


def main():
    parser = argparse.ArgumentParser(description="バズ語りネタ自動収集")
    parser.add_argument("--dry-run", action="store_true", help="収集+スコアのみ、保存・通知しない")
    parser.add_argument("--source", type=str, help="特定ソースのみ実行 (chiebukuro/reddit/hatena/youtube/twitter)")
    parser.add_argument("--config", type=str, help="config.yamlのパス")
    args = parser.parse_args()

    run(config_path=args.config, dry_run=args.dry_run, source_filter=args.source)


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: --dry-run で動作確認**

```bash
cd /Users/kimuratakuya/line-harness/trending-topic-collector
python3 -m src.main --dry-run
```

Expected: 各コレクターが実行され、スコアリング結果が表示される。保存・通知はスキップ。エラーが出ても致命的でなければOK（サイト構造の違い等は後で調整）。

- [ ] **Step 3: コミット**

```bash
cd /Users/kimuratakuya/line-harness
git add trending-topic-collector/src/main.py
git commit -m "feat: add main orchestrator for trending topic collection pipeline"
```

---

### Task 12: 全テスト実行 + 動作確認 + cron設定

**Files:**
- 既存ファイルのみ

- [ ] **Step 1: 全テスト実行**

```bash
cd /Users/kimuratakuya/line-harness/trending-topic-collector
python3 -m pytest tests/ -v
```

Expected: 全テストパス

- [ ] **Step 2: --dry-runで実際のデータ収集テスト**

```bash
cd /Users/kimuratakuya/line-harness/trending-topic-collector
python3 -m src.main --dry-run --source reddit
python3 -m src.main --dry-run --source hatena
python3 -m src.main --dry-run --source chiebukuro
```

各ソースのパーサーが実際のHTMLに対応しているか確認。セレクタが合わない場合は調整。

- [ ] **Step 3: 実データで1回収集（Obsidian保存まで）**

```bash
cd /Users/kimuratakuya/line-harness/trending-topic-collector
python3 -m src.main
```

Expected: ~/Documents/Obsidian Vault/knowledge/trending-topics/ にノートが作成される。

- [ ] **Step 4: QMDインデックス更新**

```bash
qmd embed
```

- [ ] **Step 5: cron設定（1日2回）**

```bash
# crontabに追加
(crontab -l 2>/dev/null; echo "0 9,21 * * * cd /Users/kimuratakuya/line-harness/trending-topic-collector && /usr/bin/python3 -m src.main >> /tmp/trending-collector.log 2>&1") | crontab -
```

- [ ] **Step 6: cron確認**

```bash
crontab -l
```

Expected: `0 9,21 * * * cd /Users/kimuratakuya/line-harness/trending-topic-collector && /usr/bin/python3 -m src.main >> /tmp/trending-collector.log 2>&1`

- [ ] **Step 7: コミット**

```bash
cd /Users/kimuratakuya/line-harness
git add trending-topic-collector/
git commit -m "feat: complete trending topic collector pipeline with all sources and cron"
```

---

## 実装順の依存関係

```
Task 1 (スキャフォールド) → 全タスクの前提
Task 2 (dedup) → Task 11 (main)
Task 3 (scorer) → Task 11 (main)
Task 4 (obsidian_writer) → Task 11 (main)
Task 5 (line_notifier) → Task 11 (main)
Task 6-10 (各collector) → Task 11 (main)、互いに独立
Task 11 (main) → Task 12 (統合テスト+cron)
```

Task 6-10は互いに独立。並行実行可能。
