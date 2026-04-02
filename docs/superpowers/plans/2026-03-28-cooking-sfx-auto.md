# cooking-sfx-auto Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 料理ショート動画を入力すると、シーン検出してイベント別効果音を配置したwavトラックを出力するCLIツールを構築する。

**Architecture:** フレーム抽出(ffmpeg) → シーン分類(Gemini 2.0 Flash) → SE選択(ルールベース) → wav合成(ffmpeg)の4段パイプライン。各スクリプトはCLI単体でも動作し、run_pipeline.pyで一括実行できる。

**Tech Stack:** Python 3.10+, ffmpeg, google-generativeai, Pillow

---

## File Structure

| File | Responsibility |
|------|---------------|
| `cooking-sfx-auto/config.json` | SE音量・フレーム間隔・API設定 |
| `cooking-sfx-auto/requirements.txt` | Python依存関係 |
| `cooking-sfx-auto/scripts/extract_frames.py` | 動画からフレーム抽出(ffmpeg) |
| `cooking-sfx-auto/scripts/classify_scenes.py` | Gemini FlashでフレームをイベントJSON化 |
| `cooking-sfx-auto/scripts/select_sfx.py` | イベントJSON → SE選択(重複回避) |
| `cooking-sfx-auto/scripts/render_sfx_track.py` | SE配置 → wavトラック合成(ffmpeg) |
| `cooking-sfx-auto/scripts/run_pipeline.py` | 全工程を1コマンドで実行 |
| `cooking-sfx-auto/tests/test_extract_frames.py` | フレーム抽出のテスト |
| `cooking-sfx-auto/tests/test_classify_scenes.py` | シーン分類のテスト(APIモック) |
| `cooking-sfx-auto/tests/test_select_sfx.py` | SE選択ロジックのテスト |
| `cooking-sfx-auto/tests/test_render_sfx_track.py` | wav合成のテスト |
| `cooking-sfx-auto/tests/test_run_pipeline.py` | E2Eテスト |
| `cooking-sfx-auto/assets/sfx/` | イベント別SEフォルダ(13カテゴリ) |

---

### Task 1: プロジェクト初期化 + config.json

**Files:**
- Create: `cooking-sfx-auto/config.json`
- Create: `cooking-sfx-auto/requirements.txt`
- Create: `cooking-sfx-auto/assets/sfx/` (13フォルダ)

- [ ] **Step 1: ディレクトリ構成を作成**

```bash
cd /Users/kimuratakuya
mkdir -p cooking-sfx-auto/{scripts,tests,out,tmp}
mkdir -p cooking-sfx-auto/assets/sfx/{cutting,frying,pouring,mixing,plating,intro,ending,closeup_food,ingredients_show,text_emphasis,reaction_surprise,reaction_fail,reaction_happy}
```

- [ ] **Step 2: config.jsonを作成**

```json
{
  "frame_interval_sec": 2,
  "frame_width_px": 256,
  "gemini_model": "gemini-2.0-flash",
  "confidence_threshold": 0.7,
  "duplicate_lookback": 2,
  "volume_db": {
    "default": -6,
    "cutting": -4,
    "frying": -4,
    "text_emphasis": -3,
    "reaction_surprise": -3,
    "closeup_food": -2,
    "intro": -8,
    "ending": -8
  },
  "output_format": "wav",
  "output_sample_rate": 44100
}
```

- [ ] **Step 3: requirements.txtを作成**

```
google-generativeai>=0.8.0
Pillow>=10.0.0
```

- [ ] **Step 4: テスト用ダミーSEファイルを生成**

テスト用に0.3秒の無音wavを各カテゴリに1-3個ずつ生成する。本番SEは後でユーザーが手動配置。

```bash
cd /Users/kimuratakuya/cooking-sfx-auto
for cat in cutting frying pouring mixing plating intro ending closeup_food ingredients_show text_emphasis reaction_surprise reaction_fail reaction_happy; do
  for i in 1 2 3; do
    ffmpeg -y -f lavfi -i "anullsrc=r=44100:cl=mono" -t 0.3 -q:a 9 "assets/sfx/${cat}/${cat}_0${i}.mp3" 2>/dev/null
  done
done
```

- [ ] **Step 5: pip installで依存関係インストール**

```bash
cd /Users/kimuratakuya/cooking-sfx-auto
pip install -r requirements.txt
```

- [ ] **Step 6: gitリポジトリ初期化 + 初回コミット**

```bash
cd /Users/kimuratakuya/cooking-sfx-auto
git init
echo -e "tmp/\nout/\n__pycache__/\n*.pyc\n.env" > .gitignore
git add .
git commit -m "feat: initialize cooking-sfx-auto project structure"
```

---

### Task 2: extract_frames.py — フレーム抽出

**Files:**
- Create: `cooking-sfx-auto/scripts/extract_frames.py`
- Create: `cooking-sfx-auto/tests/test_extract_frames.py`

- [ ] **Step 1: テストを書く**

`cooking-sfx-auto/tests/test_extract_frames.py`:

```python
"""Tests for extract_frames module."""
import json
import os
import subprocess
import tempfile

import pytest


@pytest.fixture
def sample_video(tmp_path):
    """Generate a 6-second test video with ffmpeg."""
    video_path = tmp_path / "sample.mp4"
    subprocess.run(
        [
            "ffmpeg", "-y",
            "-f", "lavfi", "-i", "color=c=red:size=320x240:d=6",
            "-pix_fmt", "yuv420p",
            str(video_path),
        ],
        capture_output=True,
        check=True,
    )
    return str(video_path)


def test_extract_frames_creates_jpg_files(sample_video, tmp_path):
    from scripts.extract_frames import extract_frames

    out_dir = str(tmp_path / "frames")
    result = extract_frames(sample_video, out_dir, interval_sec=2, width_px=256)

    # 6-second video at 2-sec intervals => frames at t=0,2,4 => 3 frames
    assert len(result) == 3
    for path in result:
        assert os.path.exists(path)
        assert path.endswith(".jpg")


def test_extract_frames_returns_sorted_paths(sample_video, tmp_path):
    from scripts.extract_frames import extract_frames

    out_dir = str(tmp_path / "frames")
    result = extract_frames(sample_video, out_dir, interval_sec=2, width_px=256)

    assert result == sorted(result)


def test_extract_frames_metadata_json(sample_video, tmp_path):
    from scripts.extract_frames import extract_frames

    out_dir = str(tmp_path / "frames")
    extract_frames(sample_video, out_dir, interval_sec=2, width_px=256)

    meta_path = os.path.join(out_dir, "metadata.json")
    assert os.path.exists(meta_path)
    with open(meta_path) as f:
        meta = json.load(f)
    assert meta["duration_sec"] >= 5.0
    assert meta["frame_interval_sec"] == 2
    assert len(meta["frames"]) == 3
    assert meta["frames"][0]["timestamp_sec"] == 0.0
    assert meta["frames"][1]["timestamp_sec"] == 2.0
```

- [ ] **Step 2: テストが失敗することを確認**

```bash
cd /Users/kimuratakuya/cooking-sfx-auto
python -m pytest tests/test_extract_frames.py -v
```

Expected: FAIL — `ModuleNotFoundError: No module named 'scripts.extract_frames'`

- [ ] **Step 3: 実装を書く**

`cooking-sfx-auto/scripts/extract_frames.py`:

```python
"""Extract frames from a video at fixed intervals using ffmpeg."""
import json
import os
import subprocess
import sys


def _get_duration(video_path: str) -> float:
    """Get video duration in seconds via ffprobe."""
    result = subprocess.run(
        [
            "ffprobe", "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            video_path,
        ],
        capture_output=True,
        text=True,
        check=True,
    )
    return float(result.stdout.strip())


def extract_frames(
    video_path: str,
    out_dir: str,
    interval_sec: int = 2,
    width_px: int = 256,
) -> list[str]:
    """Extract frames from video at given interval.

    Returns sorted list of output jpg paths.
    Also writes metadata.json with timing info.
    """
    os.makedirs(out_dir, exist_ok=True)

    duration = _get_duration(video_path)

    # ffmpeg: extract one frame every interval_sec, scale width, keep aspect ratio
    subprocess.run(
        [
            "ffmpeg", "-y",
            "-i", video_path,
            "-vf", f"fps=1/{interval_sec},scale={width_px}:-1",
            "-q:v", "2",
            os.path.join(out_dir, "frame_%04d.jpg"),
        ],
        capture_output=True,
        check=True,
    )

    # Collect output paths (ffmpeg names start at 0001)
    paths = sorted(
        os.path.join(out_dir, f)
        for f in os.listdir(out_dir)
        if f.startswith("frame_") and f.endswith(".jpg")
    )

    # Write metadata
    frames_meta = []
    for i, path in enumerate(paths):
        frames_meta.append({
            "index": i,
            "timestamp_sec": float(i * interval_sec),
            "path": path,
        })

    metadata = {
        "video_path": video_path,
        "duration_sec": duration,
        "frame_interval_sec": interval_sec,
        "width_px": width_px,
        "frames": frames_meta,
    }
    meta_path = os.path.join(out_dir, "metadata.json")
    with open(meta_path, "w") as f:
        json.dump(metadata, f, indent=2, ensure_ascii=False)

    return paths


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python extract_frames.py <video_path> [out_dir] [interval_sec] [width_px]")
        sys.exit(1)

    video = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) > 2 else os.path.join("tmp", os.path.splitext(os.path.basename(video))[0])
    interval = int(sys.argv[3]) if len(sys.argv) > 3 else 2
    width = int(sys.argv[4]) if len(sys.argv) > 4 else 256

    result_paths = extract_frames(video, out, interval, width)
    print(f"Extracted {len(result_paths)} frames to {out}")
```

- [ ] **Step 4: テストが通ることを確認**

```bash
cd /Users/kimuratakuya/cooking-sfx-auto
python -m pytest tests/test_extract_frames.py -v
```

Expected: 3 passed

- [ ] **Step 5: コミット**

```bash
cd /Users/kimuratakuya/cooking-sfx-auto
git add scripts/extract_frames.py tests/test_extract_frames.py
git commit -m "feat: add extract_frames — ffmpeg frame extraction with metadata"
```

---

### Task 3: classify_scenes.py — Gemini Flashでシーン分類

**Files:**
- Create: `cooking-sfx-auto/scripts/classify_scenes.py`
- Create: `cooking-sfx-auto/tests/test_classify_scenes.py`

- [ ] **Step 1: テストを書く（APIモック）**

`cooking-sfx-auto/tests/test_classify_scenes.py`:

```python
"""Tests for classify_scenes module — Gemini API is mocked."""
import json
import os
from unittest.mock import MagicMock, patch

import pytest


VALID_EVENTS = {
    "intro", "ingredients_show", "cutting", "mixing", "pouring",
    "frying", "plating", "closeup_food", "text_emphasis",
    "reaction_surprise", "reaction_fail", "reaction_happy", "ending",
}

MOCK_API_RESPONSE = json.dumps([
    {"start": 0.0, "end": 2.0, "event": "intro", "confidence": 0.95},
    {"start": 2.0, "end": 6.0, "event": "cutting", "confidence": 0.90},
    {"start": 6.0, "end": 10.0, "event": "frying", "confidence": 0.85},
])


@pytest.fixture
def mock_frames(tmp_path):
    """Create dummy frame jpgs."""
    frames = []
    for i in range(5):
        p = tmp_path / f"frame_{i:04d}.jpg"
        # 1x1 white pixel JPEG
        from PIL import Image
        img = Image.new("RGB", (256, 144), color="white")
        img.save(str(p), "JPEG")
        frames.append(str(p))
    return frames


@pytest.fixture
def mock_metadata(tmp_path, mock_frames):
    meta = {
        "video_path": "/tmp/sample.mp4",
        "duration_sec": 10.0,
        "frame_interval_sec": 2,
        "width_px": 256,
        "frames": [
            {"index": i, "timestamp_sec": float(i * 2), "path": f}
            for i, f in enumerate(mock_frames)
        ],
    }
    meta_path = tmp_path / "metadata.json"
    with open(meta_path, "w") as f:
        json.dump(meta, f)
    return str(meta_path)


def test_classify_scenes_returns_valid_events(mock_metadata, mock_frames):
    from scripts.classify_scenes import classify_scenes

    with patch("scripts.classify_scenes._call_gemini") as mock_gemini:
        mock_gemini.return_value = json.loads(MOCK_API_RESPONSE)
        events = classify_scenes(mock_metadata, model="gemini-2.0-flash")

    assert len(events) == 3
    for ev in events:
        assert ev["event"] in VALID_EVENTS
        assert "start" in ev
        assert "end" in ev
        assert 0.0 <= ev["confidence"] <= 1.0


def test_classify_scenes_rejects_invalid_event(mock_metadata, mock_frames):
    from scripts.classify_scenes import classify_scenes, _sanitize_events

    raw = [
        {"start": 0.0, "end": 2.0, "event": "dancing", "confidence": 0.9},
        {"start": 2.0, "end": 4.0, "event": "cutting", "confidence": 0.8},
    ]
    sanitized = _sanitize_events(raw)
    assert len(sanitized) == 1
    assert sanitized[0]["event"] == "cutting"


def test_classify_scenes_merges_consecutive_same_events(mock_metadata, mock_frames):
    from scripts.classify_scenes import _merge_consecutive

    raw = [
        {"start": 0.0, "end": 2.0, "event": "cutting", "confidence": 0.9},
        {"start": 2.0, "end": 4.0, "event": "cutting", "confidence": 0.85},
        {"start": 4.0, "end": 6.0, "event": "frying", "confidence": 0.8},
    ]
    merged = _merge_consecutive(raw)
    assert len(merged) == 2
    assert merged[0]["start"] == 0.0
    assert merged[0]["end"] == 4.0
    assert merged[0]["event"] == "cutting"
```

- [ ] **Step 2: テストが失敗することを確認**

```bash
cd /Users/kimuratakuya/cooking-sfx-auto
python -m pytest tests/test_classify_scenes.py -v
```

Expected: FAIL — `ModuleNotFoundError`

- [ ] **Step 3: 実装を書く**

`cooking-sfx-auto/scripts/classify_scenes.py`:

```python
"""Classify video frames into cooking events using Gemini Flash."""
import base64
import json
import os
import sys

import google.generativeai as genai
from PIL import Image


VALID_EVENTS = {
    "intro", "ingredients_show", "cutting", "mixing", "pouring",
    "frying", "plating", "closeup_food", "text_emphasis",
    "reaction_surprise", "reaction_fail", "reaction_happy", "ending",
}

PROMPT = """あなたは料理ショート動画の編集アシスタントです。
以下のフレーム画像は料理動画から{interval}秒間隔で抽出したものです。
各フレームの時間帯を以下のイベントカテゴリに分類してください。

カテゴリ:
- intro: 冒頭の挨拶・導入シーン
- ingredients_show: 材料を並べて見せるシーン
- cutting: 包丁で食材を切っているシーン
- mixing: ボウルなどで混ぜているシーン
- pouring: 液体を注いでいるシーン
- frying: フライパンや鍋で加熱しているシーン
- plating: 皿に盛り付けているシーン
- closeup_food: 完成した料理のアップ
- text_emphasis: テロップや文字が強調されているシーン
- reaction_surprise: 驚いた表情やリアクション
- reaction_fail: 失敗や残念なリアクション
- reaction_happy: 嬉しい・満足なリアクション
- ending: 動画の締めくくり

連続する同じイベントはまとめて1つの区間にしてください。
confidence（0.0-1.0）も付けてください。

JSON配列で返してください:
[{{"start": 秒, "end": 秒, "event": "カテゴリ名", "confidence": 数値}}]

フレーム一覧（{interval}秒間隔、0秒開始）:"""


def _call_gemini(frames_paths: list[str], interval_sec: int, model: str) -> list[dict]:
    """Send frames to Gemini and parse JSON response."""
    genai.configure(api_key=os.environ["GEMINI_API_KEY"])
    gmodel = genai.GenerativeModel(model)

    content_parts = [PROMPT.format(interval=interval_sec)]
    for i, fpath in enumerate(frames_paths):
        timestamp = i * interval_sec
        content_parts.append(f"\nフレーム {i+1} (t={timestamp}s):")
        img = Image.open(fpath)
        content_parts.append(img)

    response = gmodel.generate_content(content_parts)
    text = response.text.strip()

    # Extract JSON from possible markdown code block
    if "```" in text:
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]
        text = text.strip()

    return json.loads(text)


def _sanitize_events(events: list[dict]) -> list[dict]:
    """Remove events with invalid event names."""
    return [ev for ev in events if ev.get("event") in VALID_EVENTS]


def _merge_consecutive(events: list[dict]) -> list[dict]:
    """Merge consecutive events with the same type."""
    if not events:
        return []

    merged = [events[0].copy()]
    for ev in events[1:]:
        if ev["event"] == merged[-1]["event"]:
            merged[-1]["end"] = ev["end"]
            # Average confidence
            merged[-1]["confidence"] = round(
                (merged[-1]["confidence"] + ev["confidence"]) / 2, 2
            )
        else:
            merged.append(ev.copy())
    return merged


def classify_scenes(
    metadata_path: str,
    model: str = "gemini-2.0-flash",
) -> list[dict]:
    """Classify frames into cooking events.

    Args:
        metadata_path: Path to metadata.json from extract_frames.
        model: Gemini model name.

    Returns:
        List of event dicts with start, end, event, confidence.
    """
    with open(metadata_path) as f:
        meta = json.load(f)

    frame_paths = [fr["path"] for fr in meta["frames"]]
    interval = meta["frame_interval_sec"]

    raw_events = _call_gemini(frame_paths, interval, model)
    sanitized = _sanitize_events(raw_events)
    merged = _merge_consecutive(sanitized)

    return merged


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python classify_scenes.py <metadata.json|video_path> [model]")
        sys.exit(1)

    input_path = sys.argv[1]
    model_name = sys.argv[2] if len(sys.argv) > 2 else "gemini-2.0-flash"

    # If a video is passed, run extract_frames first
    if input_path.endswith((".mp4", ".mov", ".avi", ".mkv")):
        from scripts.extract_frames import extract_frames
        video_name = os.path.splitext(os.path.basename(input_path))[0]
        frame_dir = os.path.join("tmp", video_name)
        extract_frames(input_path, frame_dir)
        input_path = os.path.join(frame_dir, "metadata.json")

    events = classify_scenes(input_path, model=model_name)

    out_path = input_path.replace("metadata.json", "events.json")
    with open(out_path, "w") as f:
        json.dump(events, f, indent=2, ensure_ascii=False)
    print(f"Classified {len(events)} events → {out_path}")
```

- [ ] **Step 4: テストが通ることを確認**

```bash
cd /Users/kimuratakuya/cooking-sfx-auto
python -m pytest tests/test_classify_scenes.py -v
```

Expected: 3 passed

- [ ] **Step 5: コミット**

```bash
cd /Users/kimuratakuya/cooking-sfx-auto
git add scripts/classify_scenes.py tests/test_classify_scenes.py
git commit -m "feat: add classify_scenes — Gemini Flash scene classification"
```

---

### Task 4: select_sfx.py — SE選択ロジック

**Files:**
- Create: `cooking-sfx-auto/scripts/select_sfx.py`
- Create: `cooking-sfx-auto/tests/test_select_sfx.py`

- [ ] **Step 1: テストを書く**

`cooking-sfx-auto/tests/test_select_sfx.py`:

```python
"""Tests for select_sfx module."""
import json
import os

import pytest


@pytest.fixture
def sfx_dir(tmp_path):
    """Create a mock sfx directory with test files."""
    for cat in ["cutting", "frying", "intro"]:
        cat_dir = tmp_path / cat
        cat_dir.mkdir()
        for i in range(3):
            (cat_dir / f"{cat}_{i+1:02d}.mp3").write_bytes(b"\x00" * 100)
    return str(tmp_path)


@pytest.fixture
def sample_events():
    return [
        {"start": 0.0, "end": 2.0, "event": "intro", "confidence": 0.95},
        {"start": 2.0, "end": 6.0, "event": "cutting", "confidence": 0.90},
        {"start": 6.0, "end": 8.0, "event": "cutting", "confidence": 0.80},
        {"start": 8.0, "end": 12.0, "event": "frying", "confidence": 0.85},
    ]


@pytest.fixture
def config():
    return {
        "confidence_threshold": 0.7,
        "duplicate_lookback": 2,
        "volume_db": {
            "default": -6,
            "cutting": -4,
            "frying": -4,
            "intro": -8,
        },
    }


def test_select_sfx_returns_one_per_event(sfx_dir, sample_events, config):
    from scripts.select_sfx import select_sfx

    selections = select_sfx(sample_events, sfx_dir, config)
    assert len(selections) == 4
    for sel in selections:
        assert "sfx_path" in sel
        assert "volume_db" in sel
        assert "start" in sel


def test_select_sfx_skips_low_confidence(sfx_dir, config):
    from scripts.select_sfx import select_sfx

    events = [
        {"start": 0.0, "end": 2.0, "event": "cutting", "confidence": 0.5},
        {"start": 2.0, "end": 4.0, "event": "frying", "confidence": 0.9},
    ]
    selections = select_sfx(events, sfx_dir, config)
    assert len(selections) == 1
    assert selections[0]["event"] == "frying"


def test_select_sfx_skips_missing_folder(sfx_dir, config):
    from scripts.select_sfx import select_sfx

    events = [
        {"start": 0.0, "end": 2.0, "event": "plating", "confidence": 0.9},
    ]
    # plating folder doesn't exist in sfx_dir fixture
    selections = select_sfx(events, sfx_dir, config)
    assert len(selections) == 0


def test_select_sfx_avoids_duplicates(sfx_dir, config):
    from scripts.select_sfx import select_sfx

    # 3 consecutive cutting events with lookback=2
    events = [
        {"start": 0.0, "end": 2.0, "event": "cutting", "confidence": 0.9},
        {"start": 2.0, "end": 4.0, "event": "cutting", "confidence": 0.9},
        {"start": 4.0, "end": 6.0, "event": "cutting", "confidence": 0.9},
    ]
    selections = select_sfx(events, sfx_dir, config)
    paths = [s["sfx_path"] for s in selections]
    # With lookback=2, no two adjacent should be the same
    for i in range(1, len(paths)):
        assert paths[i] != paths[i - 1], f"Duplicate at index {i}"


def test_select_sfx_applies_correct_volume(sfx_dir, sample_events, config):
    from scripts.select_sfx import select_sfx

    selections = select_sfx(sample_events, sfx_dir, config)
    intro_sel = [s for s in selections if s["event"] == "intro"][0]
    cutting_sel = [s for s in selections if s["event"] == "cutting"][0]
    assert intro_sel["volume_db"] == -8
    assert cutting_sel["volume_db"] == -4
```

- [ ] **Step 2: テストが失敗することを確認**

```bash
cd /Users/kimuratakuya/cooking-sfx-auto
python -m pytest tests/test_select_sfx.py -v
```

Expected: FAIL — `ModuleNotFoundError`

- [ ] **Step 3: 実装を書く**

`cooking-sfx-auto/scripts/select_sfx.py`:

```python
"""Select SFX files for each detected event, avoiding duplicates."""
import json
import os
import random
import sys


def _list_sfx(sfx_dir: str, event: str) -> list[str]:
    """List all audio files in the event's sfx folder."""
    event_dir = os.path.join(sfx_dir, event)
    if not os.path.isdir(event_dir):
        return []
    return sorted(
        os.path.join(event_dir, f)
        for f in os.listdir(event_dir)
        if f.endswith((".mp3", ".wav", ".ogg"))
    )


def _get_volume(config: dict, event: str) -> int:
    """Get volume_db for an event from config."""
    volumes = config.get("volume_db", {})
    return volumes.get(event, volumes.get("default", -6))


def select_sfx(
    events: list[dict],
    sfx_dir: str,
    config: dict,
) -> list[dict]:
    """Select an SFX file for each event.

    Args:
        events: List of event dicts from classify_scenes.
        sfx_dir: Path to assets/sfx/ directory.
        config: Config dict with confidence_threshold, duplicate_lookback, volume_db.

    Returns:
        List of dicts: {start, end, event, confidence, sfx_path, volume_db}
    """
    threshold = config.get("confidence_threshold", 0.7)
    lookback = config.get("duplicate_lookback", 2)

    recent_files: list[str] = []
    selections: list[dict] = []

    for ev in events:
        if ev["confidence"] < threshold:
            continue

        candidates = _list_sfx(sfx_dir, ev["event"])
        if not candidates:
            continue

        # Filter out recently used files
        available = [c for c in candidates if c not in recent_files]
        if not available:
            # All candidates used recently — reset and pick from all
            available = candidates

        chosen = random.choice(available)

        recent_files.append(chosen)
        if len(recent_files) > lookback:
            recent_files.pop(0)

        selections.append({
            "start": ev["start"],
            "end": ev["end"],
            "event": ev["event"],
            "confidence": ev["confidence"],
            "sfx_path": chosen,
            "volume_db": _get_volume(config, ev["event"]),
        })

    return selections


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python select_sfx.py <events.json> [sfx_dir] [config.json]")
        sys.exit(1)

    events_path = sys.argv[1]
    sfx_base = sys.argv[2] if len(sys.argv) > 2 else os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets", "sfx"
    )
    config_path = sys.argv[3] if len(sys.argv) > 3 else os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "config.json"
    )

    with open(events_path) as f:
        events_data = json.load(f)
    with open(config_path) as f:
        cfg = json.load(f)

    result = select_sfx(events_data, sfx_base, cfg)

    out_path = events_path.replace("events.json", "sfx_timeline.json")
    with open(out_path, "w") as f:
        json.dump(result, f, indent=2, ensure_ascii=False)
    print(f"Selected {len(result)} SFX → {out_path}")
```

- [ ] **Step 4: テストが通ることを確認**

```bash
cd /Users/kimuratakuya/cooking-sfx-auto
python -m pytest tests/test_select_sfx.py -v
```

Expected: 5 passed

- [ ] **Step 5: コミット**

```bash
cd /Users/kimuratakuya/cooking-sfx-auto
git add scripts/select_sfx.py tests/test_select_sfx.py
git commit -m "feat: add select_sfx — rule-based SE selection with duplicate avoidance"
```

---

### Task 5: render_sfx_track.py — wav合成

**Files:**
- Create: `cooking-sfx-auto/scripts/render_sfx_track.py`
- Create: `cooking-sfx-auto/tests/test_render_sfx_track.py`

- [ ] **Step 1: テストを書く**

`cooking-sfx-auto/tests/test_render_sfx_track.py`:

```python
"""Tests for render_sfx_track module."""
import json
import os
import subprocess

import pytest


@pytest.fixture
def dummy_sfx(tmp_path):
    """Create a short real audio file for testing."""
    sfx_path = tmp_path / "test_sfx.mp3"
    subprocess.run(
        [
            "ffmpeg", "-y",
            "-f", "lavfi", "-i", "sine=frequency=440:duration=0.3",
            "-q:a", "9",
            str(sfx_path),
        ],
        capture_output=True,
        check=True,
    )
    return str(sfx_path)


@pytest.fixture
def sample_timeline(dummy_sfx):
    return [
        {"start": 1.0, "end": 3.0, "event": "cutting", "confidence": 0.9,
         "sfx_path": dummy_sfx, "volume_db": -4},
        {"start": 5.0, "end": 8.0, "event": "frying", "confidence": 0.85,
         "sfx_path": dummy_sfx, "volume_db": -6},
    ]


def test_render_creates_wav(sample_timeline, tmp_path):
    from scripts.render_sfx_track import render_sfx_track

    out_path = str(tmp_path / "output.wav")
    render_sfx_track(sample_timeline, duration_sec=10.0, out_path=out_path)

    assert os.path.exists(out_path)
    assert os.path.getsize(out_path) > 0


def test_render_wav_has_correct_duration(sample_timeline, tmp_path):
    from scripts.render_sfx_track import render_sfx_track

    out_path = str(tmp_path / "output.wav")
    render_sfx_track(sample_timeline, duration_sec=10.0, out_path=out_path)

    # Check duration with ffprobe
    result = subprocess.run(
        [
            "ffprobe", "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            out_path,
        ],
        capture_output=True,
        text=True,
        check=True,
    )
    duration = float(result.stdout.strip())
    assert 9.5 <= duration <= 10.5


def test_render_empty_timeline(tmp_path):
    from scripts.render_sfx_track import render_sfx_track

    out_path = str(tmp_path / "output.wav")
    render_sfx_track([], duration_sec=5.0, out_path=out_path)

    # Should produce a silent wav
    assert os.path.exists(out_path)
```

- [ ] **Step 2: テストが失敗することを確認**

```bash
cd /Users/kimuratakuya/cooking-sfx-auto
python -m pytest tests/test_render_sfx_track.py -v
```

Expected: FAIL — `ModuleNotFoundError`

- [ ] **Step 3: 実装を書く**

`cooking-sfx-auto/scripts/render_sfx_track.py`:

```python
"""Render an SFX-only WAV track from a timeline of selected sound effects."""
import json
import os
import subprocess
import sys
import tempfile


def render_sfx_track(
    timeline: list[dict],
    duration_sec: float,
    out_path: str,
    sample_rate: int = 44100,
) -> str:
    """Render SFX timeline to a single WAV file.

    Each entry in timeline has: start, sfx_path, volume_db.
    Produces a WAV with silence + SFX overlaid at correct timestamps.

    Args:
        timeline: List of {start, sfx_path, volume_db, ...} dicts.
        duration_sec: Total duration of output WAV (match video length).
        out_path: Output WAV file path.
        sample_rate: Output sample rate.

    Returns:
        Path to the output WAV file.
    """
    os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)

    if not timeline:
        # Produce silent WAV
        subprocess.run(
            [
                "ffmpeg", "-y",
                "-f", "lavfi", "-i",
                f"anullsrc=r={sample_rate}:cl=stereo",
                "-t", str(duration_sec),
                "-c:a", "pcm_s16le",
                out_path,
            ],
            capture_output=True,
            check=True,
        )
        return out_path

    # Build ffmpeg filter_complex:
    # Input 0: silence base track
    # Input 1..N: each SFX file
    inputs = [
        "-f", "lavfi", "-i",
        f"anullsrc=r={sample_rate}:cl=stereo",
        "-t", str(duration_sec),
    ]

    filter_parts = []
    for i, entry in enumerate(timeline):
        inputs.extend(["-i", entry["sfx_path"]])
        idx = i + 1  # input index (0 is silence)
        vol = entry.get("volume_db", -6)
        delay_ms = int(entry["start"] * 1000)
        # Apply volume adjustment and delay
        filter_parts.append(
            f"[{idx}:a]volume={vol}dB,adelay={delay_ms}|{delay_ms},"
            f"apad=whole_dur={duration_sec}[s{i}]"
        )

    # Mix all SFX streams with the base silence
    mix_inputs = "[0:a]" + "".join(f"[s{i}]" for i in range(len(timeline)))
    n_inputs = len(timeline) + 1
    filter_parts.append(
        f"{mix_inputs}amix=inputs={n_inputs}:duration=first:normalize=0[out]"
    )

    filter_complex = ";".join(filter_parts)

    cmd = [
        "ffmpeg", "-y",
        *inputs,
        "-filter_complex", filter_complex,
        "-map", "[out]",
        "-c:a", "pcm_s16le",
        "-ar", str(sample_rate),
        out_path,
    ]

    subprocess.run(cmd, capture_output=True, check=True)
    return out_path


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python render_sfx_track.py <sfx_timeline.json> <video_path> [out_path]")
        sys.exit(1)

    timeline_path = sys.argv[1]
    video_path = sys.argv[2]

    with open(timeline_path) as f:
        tl = json.load(f)

    # Get video duration
    result = subprocess.run(
        [
            "ffprobe", "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            video_path,
        ],
        capture_output=True,
        text=True,
        check=True,
    )
    dur = float(result.stdout.strip())

    video_name = os.path.splitext(os.path.basename(video_path))[0]
    out = sys.argv[3] if len(sys.argv) > 3 else os.path.join("out", f"{video_name}_sfx.wav")

    render_sfx_track(tl, dur, out)
    print(f"Rendered SFX track → {out}")
```

- [ ] **Step 4: テストが通ることを確認**

```bash
cd /Users/kimuratakuya/cooking-sfx-auto
python -m pytest tests/test_render_sfx_track.py -v
```

Expected: 3 passed

- [ ] **Step 5: コミット**

```bash
cd /Users/kimuratakuya/cooking-sfx-auto
git add scripts/render_sfx_track.py tests/test_render_sfx_track.py
git commit -m "feat: add render_sfx_track — ffmpeg WAV synthesis from SFX timeline"
```

---

### Task 6: run_pipeline.py — 全工程パイプライン

**Files:**
- Create: `cooking-sfx-auto/scripts/run_pipeline.py`
- Create: `cooking-sfx-auto/tests/test_run_pipeline.py`

- [ ] **Step 1: テストを書く**

`cooking-sfx-auto/tests/test_run_pipeline.py`:

```python
"""Tests for run_pipeline — end-to-end integration."""
import json
import os
import subprocess
from unittest.mock import patch

import pytest


MOCK_EVENTS = [
    {"start": 0.0, "end": 2.0, "event": "intro", "confidence": 0.95},
    {"start": 2.0, "end": 4.0, "event": "cutting", "confidence": 0.90},
    {"start": 4.0, "end": 6.0, "event": "frying", "confidence": 0.85},
]


@pytest.fixture
def sample_video(tmp_path):
    """Generate a 6-second test video."""
    video_path = tmp_path / "test_cooking.mp4"
    subprocess.run(
        [
            "ffmpeg", "-y",
            "-f", "lavfi", "-i", "color=c=blue:size=320x240:d=6",
            "-pix_fmt", "yuv420p",
            str(video_path),
        ],
        capture_output=True,
        check=True,
    )
    return str(video_path)


@pytest.fixture
def sfx_dir(tmp_path):
    """Create sfx folders with dummy audio."""
    sfx_base = tmp_path / "sfx"
    for cat in ["cutting", "frying", "intro"]:
        cat_dir = sfx_base / cat
        cat_dir.mkdir(parents=True)
        for i in range(2):
            sfx_path = cat_dir / f"{cat}_{i+1:02d}.mp3"
            subprocess.run(
                [
                    "ffmpeg", "-y",
                    "-f", "lavfi", "-i", "sine=frequency=440:duration=0.3",
                    "-q:a", "9",
                    str(sfx_path),
                ],
                capture_output=True,
                check=True,
            )
    return str(sfx_base)


def test_run_pipeline_produces_wav_and_json(sample_video, sfx_dir, tmp_path):
    from scripts.run_pipeline import run_pipeline

    out_dir = str(tmp_path / "output")
    config = {
        "frame_interval_sec": 2,
        "frame_width_px": 256,
        "gemini_model": "gemini-2.0-flash",
        "confidence_threshold": 0.7,
        "duplicate_lookback": 2,
        "volume_db": {"default": -6},
        "output_format": "wav",
        "output_sample_rate": 44100,
    }

    with patch("scripts.classify_scenes._call_gemini") as mock_gemini:
        mock_gemini.return_value = MOCK_EVENTS
        result = run_pipeline(sample_video, sfx_dir, config, out_dir)

    assert os.path.exists(result["sfx_wav"])
    assert os.path.exists(result["events_json"])
    assert result["sfx_wav"].endswith(".wav")
    assert result["num_events"] == 3
```

- [ ] **Step 2: テストが失敗することを確認**

```bash
cd /Users/kimuratakuya/cooking-sfx-auto
python -m pytest tests/test_run_pipeline.py -v
```

Expected: FAIL — `ModuleNotFoundError`

- [ ] **Step 3: 実装を書く**

`cooking-sfx-auto/scripts/run_pipeline.py`:

```python
"""Run the full cooking SFX pipeline: extract → classify → select → render."""
import json
import os
import sys

from scripts.extract_frames import extract_frames
from scripts.classify_scenes import classify_scenes
from scripts.select_sfx import select_sfx
from scripts.render_sfx_track import render_sfx_track


def _get_duration(video_path: str) -> float:
    import subprocess
    result = subprocess.run(
        [
            "ffprobe", "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            video_path,
        ],
        capture_output=True,
        text=True,
        check=True,
    )
    return float(result.stdout.strip())


def run_pipeline(
    video_path: str,
    sfx_dir: str,
    config: dict,
    out_dir: str = "out",
) -> dict:
    """Run full pipeline and return result info.

    Returns:
        Dict with sfx_wav, events_json, num_events paths.
    """
    video_name = os.path.splitext(os.path.basename(video_path))[0]
    tmp_dir = os.path.join("tmp", video_name)
    os.makedirs(out_dir, exist_ok=True)

    # Step 1: Extract frames
    print(f"[1/4] Extracting frames...")
    extract_frames(
        video_path,
        tmp_dir,
        interval_sec=config.get("frame_interval_sec", 2),
        width_px=config.get("frame_width_px", 256),
    )
    metadata_path = os.path.join(tmp_dir, "metadata.json")

    # Step 2: Classify scenes
    print(f"[2/4] Classifying scenes with Gemini Flash...")
    events = classify_scenes(metadata_path, model=config.get("gemini_model", "gemini-2.0-flash"))

    events_path = os.path.join(out_dir, f"{video_name}_events.json")
    with open(events_path, "w") as f:
        json.dump(events, f, indent=2, ensure_ascii=False)

    # Step 3: Select SFX
    print(f"[3/4] Selecting SFX for {len(events)} events...")
    timeline = select_sfx(events, sfx_dir, config)

    # Step 4: Render WAV
    print(f"[4/4] Rendering SFX track...")
    duration = _get_duration(video_path)
    wav_path = os.path.join(out_dir, f"{video_name}_sfx.wav")
    render_sfx_track(
        timeline,
        duration_sec=duration,
        out_path=wav_path,
        sample_rate=config.get("output_sample_rate", 44100),
    )

    print(f"Done! {len(timeline)} SFX placed.")
    print(f"  WAV:    {wav_path}")
    print(f"  Events: {events_path}")

    return {
        "sfx_wav": wav_path,
        "events_json": events_path,
        "num_events": len(events),
        "num_sfx": len(timeline),
    }


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python run_pipeline.py <video_path> [config.json]")
        sys.exit(1)

    video = sys.argv[1]
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

    config_path = sys.argv[2] if len(sys.argv) > 2 else os.path.join(base_dir, "config.json")
    with open(config_path) as f:
        cfg = json.load(f)

    sfx_base = os.path.join(base_dir, "assets", "sfx")
    out = os.path.join(base_dir, "out")

    run_pipeline(video, sfx_base, cfg, out)
```

- [ ] **Step 4: テストが通ることを確認**

```bash
cd /Users/kimuratakuya/cooking-sfx-auto
python -m pytest tests/test_run_pipeline.py -v
```

Expected: 1 passed

- [ ] **Step 5: コミット**

```bash
cd /Users/kimuratakuya/cooking-sfx-auto
git add scripts/run_pipeline.py tests/test_run_pipeline.py
git commit -m "feat: add run_pipeline — full cooking SFX pipeline orchestrator"
```

---

### Task 7: E2Eスモークテスト + SE素材の初期セットアップガイド

**Files:**
- Create: `cooking-sfx-auto/tests/test_e2e_smoke.py`

- [ ] **Step 1: E2Eスモークテストを書く**

`cooking-sfx-auto/tests/test_e2e_smoke.py`:

```python
"""E2E smoke test — runs full pipeline with mock Gemini on a synthetic video."""
import json
import os
import subprocess
from unittest.mock import patch

import pytest


MOCK_EVENTS = [
    {"start": 0.0, "end": 2.0, "event": "intro", "confidence": 0.95},
    {"start": 2.0, "end": 4.0, "event": "cutting", "confidence": 0.90},
    {"start": 4.0, "end": 6.0, "event": "frying", "confidence": 0.85},
    {"start": 6.0, "end": 8.0, "event": "closeup_food", "confidence": 0.92},
    {"start": 8.0, "end": 10.0, "event": "ending", "confidence": 0.88},
]


@pytest.fixture
def full_setup(tmp_path):
    """Set up a complete test environment."""
    # 1. Generate 10-sec test video
    video_path = tmp_path / "cooking_test.mp4"
    subprocess.run(
        [
            "ffmpeg", "-y",
            "-f", "lavfi", "-i", "color=c=green:size=320x240:d=10",
            "-pix_fmt", "yuv420p",
            str(video_path),
        ],
        capture_output=True,
        check=True,
    )

    # 2. Create SFX folders with dummy audio
    sfx_dir = tmp_path / "sfx"
    for cat in ["intro", "cutting", "frying", "closeup_food", "ending"]:
        cat_dir = sfx_dir / cat
        cat_dir.mkdir(parents=True)
        for i in range(3):
            sfx_path = cat_dir / f"{cat}_{i+1:02d}.mp3"
            freq = 440 + (i * 100)
            subprocess.run(
                [
                    "ffmpeg", "-y",
                    "-f", "lavfi", "-i", f"sine=frequency={freq}:duration=0.3",
                    "-q:a", "9",
                    str(sfx_path),
                ],
                capture_output=True,
                check=True,
            )

    # 3. Config
    config = {
        "frame_interval_sec": 2,
        "frame_width_px": 256,
        "gemini_model": "gemini-2.0-flash",
        "confidence_threshold": 0.7,
        "duplicate_lookback": 2,
        "volume_db": {
            "default": -6,
            "cutting": -4,
            "frying": -4,
            "closeup_food": -2,
            "intro": -8,
            "ending": -8,
        },
        "output_format": "wav",
        "output_sample_rate": 44100,
    }

    out_dir = tmp_path / "out"

    return {
        "video": str(video_path),
        "sfx_dir": str(sfx_dir),
        "config": config,
        "out_dir": str(out_dir),
    }


def test_e2e_pipeline(full_setup):
    from scripts.run_pipeline import run_pipeline

    with patch("scripts.classify_scenes._call_gemini") as mock_gemini:
        mock_gemini.return_value = MOCK_EVENTS
        result = run_pipeline(
            full_setup["video"],
            full_setup["sfx_dir"],
            full_setup["config"],
            full_setup["out_dir"],
        )

    # WAV exists and has correct duration
    assert os.path.exists(result["sfx_wav"])
    probe = subprocess.run(
        [
            "ffprobe", "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            result["sfx_wav"],
        ],
        capture_output=True,
        text=True,
        check=True,
    )
    wav_duration = float(probe.stdout.strip())
    assert 9.5 <= wav_duration <= 10.5

    # Events JSON exists and has 5 events
    assert os.path.exists(result["events_json"])
    with open(result["events_json"]) as f:
        events = json.load(f)
    assert len(events) == 5

    # All 5 events got SFX (all have SFX folders)
    assert result["num_sfx"] == 5
```

- [ ] **Step 2: テストが通ることを確認**

```bash
cd /Users/kimuratakuya/cooking-sfx-auto
python -m pytest tests/test_e2e_smoke.py -v
```

Expected: 1 passed

- [ ] **Step 3: 全テストを一括実行**

```bash
cd /Users/kimuratakuya/cooking-sfx-auto
python -m pytest tests/ -v
```

Expected: 全テストPASS

- [ ] **Step 4: コミット**

```bash
cd /Users/kimuratakuya/cooking-sfx-auto
git add tests/test_e2e_smoke.py
git commit -m "test: add E2E smoke test for full pipeline"
```

---

### Task 8: 実動画でのテスト実行

**Files:** なし（手動テスト）

- [ ] **Step 1: GEMINI_API_KEYの確認**

```bash
echo $GEMINI_API_KEY | head -c 10
```

未設定の場合、ユーザーにAPIキーの設定を依頼する。

- [ ] **Step 2: 実際の料理動画で実行**

```bash
cd /Users/kimuratakuya/cooking-sfx-auto
GEMINI_API_KEY=xxx python scripts/run_pipeline.py /path/to/real_cooking_video.mp4
```

- [ ] **Step 3: 出力確認**

- `out/*_events.json` を開いてイベント分類が妥当か目視確認
- `out/*_sfx.wav` をCapCutで動画に重ねてタイミングを確認
- 問題があればconfig.jsonの閾値やフレーム間隔を調整

- [ ] **Step 4: 最終コミット**

```bash
cd /Users/kimuratakuya/cooking-sfx-auto
git add -A
git commit -m "chore: finalize v1 — ready for real-world testing"
```
