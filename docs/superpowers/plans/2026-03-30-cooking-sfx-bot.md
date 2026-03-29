# cooking-sfx-bot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** LINEで料理動画を送るとSE自動挿入した動画が返り、対話的に調整できるBot

**Architecture:** FastAPI on Fly.io (Docker + ffmpeg)。LINE Webhook受信 → フレーム抽出 → シーン検出 → Gemini Flash分類 → SE選択・合成 → リプライ。セッションJSONでタイムライン保持し調整リクエストに対応。

**Tech Stack:** Python 3.11, FastAPI, ffmpeg, Gemini 2.0 Flash, line-bot-sdk v3, Pillow, NumPy, Fly.io

---

## File Structure

```
cooking-sfx-bot/
├── Dockerfile
├── fly.toml
├── requirements.txt
├── app.py                      # FastAPI + LINE Webhook + ルーティング
├── pipeline/
│   ├── __init__.py
│   ├── extract_frames.py       # ffmpeg フレーム抽出
│   ├── detect_scenes.py        # フレーム差分シーン検出
│   ├── classify_scenes.py      # Gemini Flash シーン分類
│   ├── select_sfx.py           # SE選択（ルールベース）
│   ├── render_sfx.py           # ffmpeg SE合成
│   └── run_pipeline.py         # パイプライン全体オーケストレーション
├── session.py                  # セッション管理（タイムライン保持）
├── sfx_manager.py              # SE素材管理（追加・一覧・削除）
├── adjust.py                   # 調整指示の解釈（Gemini Flash）
├── assets/sfx/                 # SE素材（Fly.io persistent volume にマウント）
│   ├── cutting/
│   ├── mixing/
│   ├── pouring/
│   ├── intro/
│   ├── reaction_happy/
│   ├── reaction_surprise/
│   ├── text_emphasis/
│   ├── transition/
│   └── misc/
└── tests/
    ├── test_detect_scenes.py
    ├── test_select_sfx.py
    ├── test_session.py
    └── test_adjust.py
```

---

### Task 1: プロジェクト初期化

**Files:**
- Create: `cooking-sfx-bot/requirements.txt`
- Create: `cooking-sfx-bot/pipeline/__init__.py`

- [ ] **Step 1: ディレクトリ作成**

```bash
mkdir -p cooking-sfx-bot/pipeline cooking-sfx-bot/tests cooking-sfx-bot/assets/sfx
```

- [ ] **Step 2: requirements.txt 作成**

```
fastapi==0.115.0
uvicorn[standard]==0.30.0
line-bot-sdk==3.11.0
google-generativeai==0.8.0
Pillow==10.4.0
numpy==1.26.4
python-multipart==0.0.9
httpx==0.27.0
```

- [ ] **Step 3: pipeline/__init__.py 作成**

```python
# cooking-sfx-bot pipeline
```

- [ ] **Step 4: 既存SE素材をコピー**

```bash
cp -r cooking-sfx-auto/assets/sfx/* cooking-sfx-bot/assets/sfx/
# ohayo.wav, pon.wav は既に削除済み
```

- [ ] **Step 5: Commit**

```bash
git add cooking-sfx-bot/
git commit -m "feat(cooking-sfx-bot): init project structure and SE assets"
```

---

### Task 2: フレーム抽出 (extract_frames.py)

**Files:**
- Create: `cooking-sfx-bot/pipeline/extract_frames.py`
- Create: `cooking-sfx-bot/tests/test_extract_frames.py`

- [ ] **Step 1: テスト作成**

```python
# tests/test_extract_frames.py
import os
import tempfile
from pipeline.extract_frames import extract_frames

def test_extract_frames_returns_list_of_paths():
    """ダミーでなく実際のffmpegを使うので統合テスト"""
    # 1秒の無音動画を生成
    with tempfile.TemporaryDirectory() as tmpdir:
        dummy_video = os.path.join(tmpdir, "test.mp4")
        os.system(
            f'ffmpeg -y -f lavfi -i color=black:s=64x64:d=2 '
            f'-f lavfi -i anullsrc=r=44100 -t 2 -shortest '
            f'{dummy_video} 2>/dev/null'
        )
        frames = extract_frames(dummy_video, tmpdir, fps=2)
        assert len(frames) >= 3  # 2秒 * 2fps = 4フレーム前後
        for f in frames:
            assert os.path.exists(f)
            assert f.endswith(".jpg")
```

- [ ] **Step 2: テスト実行して失敗確認**

```bash
cd cooking-sfx-bot && python -m pytest tests/test_extract_frames.py -v
```
Expected: FAIL (ModuleNotFoundError)

- [ ] **Step 3: 実装**

```python
# pipeline/extract_frames.py
import subprocess
import os
import glob


def extract_frames(
    video_path: str,
    output_dir: str,
    fps: int = 4,
    width: int = 128,
) -> list[str]:
    """動画からフレームを抽出する。

    Args:
        video_path: 入力動画パス
        output_dir: フレーム出力ディレクトリ
        fps: 抽出FPS（デフォルト4）
        width: フレーム幅（デフォルト128px）

    Returns:
        抽出されたフレームのパスリスト（時系列順）
    """
    os.makedirs(output_dir, exist_ok=True)
    pattern = os.path.join(output_dir, "frame_%04d.jpg")

    subprocess.run(
        [
            "ffmpeg", "-y",
            "-i", video_path,
            "-vf", f"fps={fps},scale={width}:-1",
            "-q:v", "5",
            pattern,
        ],
        capture_output=True,
        check=True,
    )

    frames = sorted(glob.glob(os.path.join(output_dir, "frame_*.jpg")))
    return frames
```

- [ ] **Step 4: テスト実行してPASS確認**

```bash
cd cooking-sfx-bot && python -m pytest tests/test_extract_frames.py -v
```

- [ ] **Step 5: Commit**

```bash
git add cooking-sfx-bot/pipeline/extract_frames.py cooking-sfx-bot/tests/test_extract_frames.py
git commit -m "feat(cooking-sfx-bot): add frame extraction module"
```

---

### Task 3: シーン検出 (detect_scenes.py)

**Files:**
- Create: `cooking-sfx-bot/pipeline/detect_scenes.py`
- Create: `cooking-sfx-bot/tests/test_detect_scenes.py`

- [ ] **Step 1: テスト作成**

```python
# tests/test_detect_scenes.py
import numpy as np
import os
import tempfile
from PIL import Image
from pipeline.detect_scenes import detect_scene_changes


def _make_frame(color: tuple[int, int, int], path: str):
    img = Image.new("RGB", (64, 64), color)
    img.save(path)


def test_detects_scene_change():
    with tempfile.TemporaryDirectory() as tmpdir:
        # 白→白→黒→黒 の4フレーム（3番目で大きな変化）
        _make_frame((255, 255, 255), os.path.join(tmpdir, "frame_0001.jpg"))
        _make_frame((250, 250, 250), os.path.join(tmpdir, "frame_0002.jpg"))
        _make_frame((0, 0, 0), os.path.join(tmpdir, "frame_0003.jpg"))
        _make_frame((5, 5, 5), os.path.join(tmpdir, "frame_0004.jpg"))

        frames = sorted(
            [os.path.join(tmpdir, f) for f in os.listdir(tmpdir)]
        )
        changes = detect_scene_changes(frames, fps=4, threshold=15)

        # frame_0003 (0.5s) で大きな変化を検出するはず
        assert len(changes) >= 1
        timestamps = [c["timestamp"] for c in changes]
        assert any(0.4 <= t <= 0.6 for t in timestamps)


def test_no_change_returns_empty():
    with tempfile.TemporaryDirectory() as tmpdir:
        for i in range(1, 5):
            _make_frame((128, 128, 128), os.path.join(tmpdir, f"frame_{i:04d}.jpg"))

        frames = sorted(
            [os.path.join(tmpdir, f) for f in os.listdir(tmpdir)]
        )
        changes = detect_scene_changes(frames, fps=4, threshold=15)
        assert len(changes) == 0
```

- [ ] **Step 2: テスト実行して失敗確認**

```bash
cd cooking-sfx-bot && python -m pytest tests/test_detect_scenes.py -v
```

- [ ] **Step 3: 実装**

```python
# pipeline/detect_scenes.py
import numpy as np
from PIL import Image


def detect_scene_changes(
    frame_paths: list[str],
    fps: int = 4,
    threshold: float = 25.0,
) -> list[dict]:
    """フレーム間の画素差分でシーン切り替えを検出する。

    Args:
        frame_paths: フレーム画像パスのリスト（時系列順）
        fps: フレーム抽出時のFPS
        threshold: シーン変化と判定する差分閾値

    Returns:
        [{"timestamp": float, "diff": float}, ...]
    """
    interval = 1.0 / fps
    changes = []
    prev_img = None

    for i, path in enumerate(frame_paths):
        img = np.array(Image.open(path).convert("L"), dtype=np.float32)
        if prev_img is not None:
            diff = float(np.mean(np.abs(img - prev_img)))
            if diff > threshold:
                changes.append({
                    "timestamp": round(i * interval, 2),
                    "diff": round(diff, 1),
                })
        prev_img = img

    return changes
```

- [ ] **Step 4: テスト実行してPASS確認**

```bash
cd cooking-sfx-bot && python -m pytest tests/test_detect_scenes.py -v
```

- [ ] **Step 5: Commit**

```bash
git add cooking-sfx-bot/pipeline/detect_scenes.py cooking-sfx-bot/tests/test_detect_scenes.py
git commit -m "feat(cooking-sfx-bot): add scene change detection"
```

---

### Task 4: シーン分類 (classify_scenes.py)

**Files:**
- Create: `cooking-sfx-bot/pipeline/classify_scenes.py`

- [ ] **Step 1: 実装**

```python
# pipeline/classify_scenes.py
import base64
import json
import os

import google.generativeai as genai

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

JSON配列で返してください（他のテキストなし）:
[{{"start": 秒, "end": 秒, "event": "カテゴリ", "confidence": 数値}}]"""


def classify_scenes(
    frame_paths: list[str],
    fps: int = 4,
) -> list[dict]:
    """Gemini Flashでフレーム群からシーンを分類する。

    環境変数 GEMINI_API_KEY が必要。
    """
    genai.configure(api_key=os.environ["GEMINI_API_KEY"])
    model = genai.GenerativeModel("gemini-2.0-flash")

    interval = 1.0 / fps
    prompt = PROMPT.format(fps=fps, interval=interval)

    # フレームを画像パーツとして送信（最大30枚に間引き）
    step = max(1, len(frame_paths) // 30)
    selected = frame_paths[::step]

    parts = [prompt]
    for path in selected:
        with open(path, "rb") as f:
            data = f.read()
        parts.append({
            "mime_type": "image/jpeg",
            "data": data,
        })

    response = model.generate_content(parts)
    text = response.text.strip()

    # JSON部分を抽出（```json ... ``` で囲まれている場合に対応）
    if text.startswith("```"):
        text = text.split("\n", 1)[1].rsplit("```", 1)[0]

    return json.loads(text)
```

- [ ] **Step 2: Commit**

```bash
git add cooking-sfx-bot/pipeline/classify_scenes.py
git commit -m "feat(cooking-sfx-bot): add Gemini Flash scene classification"
```

---

### Task 5: SE選択 (select_sfx.py)

**Files:**
- Create: `cooking-sfx-bot/pipeline/select_sfx.py`
- Create: `cooking-sfx-bot/tests/test_select_sfx.py`

- [ ] **Step 1: テスト作成**

```python
# tests/test_select_sfx.py
import os
import tempfile
from pipeline.select_sfx import select_sfx, EVENT_TO_CATEGORY

def _setup_sfx(tmpdir: str):
    """テスト用SE素材を作成"""
    for cat in ["cutting", "mixing", "pouring", "misc", "intro", "reaction_happy"]:
        cat_dir = os.path.join(tmpdir, cat)
        os.makedirs(cat_dir, exist_ok=True)
        for i in range(2):
            open(os.path.join(cat_dir, f"test_{i}.wav"), "w").close()
    return tmpdir


def test_basic_selection():
    with tempfile.TemporaryDirectory() as tmpdir:
        sfx_dir = _setup_sfx(tmpdir)
        events = [
            {"start": 0.0, "end": 2.0, "event": "intro", "confidence": 0.9},
            {"start": 2.0, "end": 5.0, "event": "cutting", "confidence": 0.95},
            {"start": 5.0, "end": 10.0, "event": "pouring", "confidence": 0.8},
        ]
        timeline = select_sfx(events, sfx_dir)
        assert len(timeline) >= 3  # 各イベントに最低1つ
        assert timeline[0]["timestamp"] == 0.0  # 冒頭


def test_skips_low_confidence():
    with tempfile.TemporaryDirectory() as tmpdir:
        sfx_dir = _setup_sfx(tmpdir)
        events = [
            {"start": 0.0, "end": 2.0, "event": "intro", "confidence": 0.9},
            {"start": 2.0, "end": 5.0, "event": "cutting", "confidence": 0.3},
        ]
        timeline = select_sfx(events, sfx_dir)
        # 冒頭のintroはあるが、低confidenceのcuttingはスキップ
        cutting_entries = [t for t in timeline if "cutting" in t.get("sfx", "")]
        assert len(cutting_entries) == 0


def test_minimum_interval():
    with tempfile.TemporaryDirectory() as tmpdir:
        sfx_dir = _setup_sfx(tmpdir)
        events = [
            {"start": 0.0, "end": 0.5, "event": "intro", "confidence": 0.9},
            {"start": 0.5, "end": 1.0, "event": "cutting", "confidence": 0.9},
            {"start": 1.0, "end": 1.5, "event": "pouring", "confidence": 0.9},
        ]
        timeline = select_sfx(events, sfx_dir)
        # SE間隔が1.0秒未満にならないことを確認
        for i in range(1, len(timeline)):
            gap = timeline[i]["timestamp"] - timeline[i - 1]["timestamp"]
            assert gap >= 1.0, f"Gap {gap} < 1.0 at index {i}"
```

- [ ] **Step 2: テスト実行して失敗確認**

```bash
cd cooking-sfx-bot && python -m pytest tests/test_select_sfx.py -v
```

- [ ] **Step 3: 実装**

```python
# pipeline/select_sfx.py
import os
import random

EVENT_TO_CATEGORY = {
    "cutting": "cutting",
    "mixing": "mixing",
    "pouring": "pouring",
    "intro": "intro",
    "plating": "intro",
    "closeup_food": "intro",
    "transition": "transition",
    "text_emphasis": "text_emphasis",
    "reaction": "reaction_happy",
}

# イベントごとのデフォルト音量(dB)
EVENT_VOLUME = {
    "cutting": 2,
    "mixing": -4,
    "pouring": 0,
    "intro": 0,
    "plating": 0,
    "closeup_food": 2,
    "transition": 2,
    "text_emphasis": 0,
    "reaction": 0,
}

MIN_INTERVAL = 1.0
CONFIDENCE_THRESHOLD = 0.6


def _list_sfx(sfx_dir: str, category: str) -> list[str]:
    cat_dir = os.path.join(sfx_dir, category)
    if not os.path.isdir(cat_dir):
        return []
    return [
        os.path.join(cat_dir, f)
        for f in os.listdir(cat_dir)
        if f.endswith(".wav")
    ]


def _pick_sfx(
    sfx_dir: str,
    category: str,
    recent: list[str],
) -> str | None:
    candidates = _list_sfx(sfx_dir, category)
    if not candidates:
        return None
    # 直前2つと同じファイルを回避
    filtered = [c for c in candidates if c not in recent[-2:]]
    if not filtered:
        filtered = candidates
    return random.choice(filtered)


def select_sfx(
    events: list[dict],
    sfx_dir: str,
) -> list[dict]:
    """シーン分類結果からSEタイムラインを生成する。

    Args:
        events: classify_scenesの出力
        sfx_dir: SE素材ルートディレクトリ

    Returns:
        [{"timestamp": float, "sfx": str, "volume_db": int}, ...]
    """
    timeline = []
    recent_sfx: list[str] = []

    for event in events:
        if event["confidence"] < CONFIDENCE_THRESHOLD:
            continue

        category = EVENT_TO_CATEGORY.get(event["event"])
        if not category:
            continue

        start = event["start"]
        end = event["end"]
        duration = end - start
        vol = EVENT_VOLUME.get(event["event"], 0)

        # 間隔チェック
        if timeline and (start - timeline[-1]["timestamp"]) < MIN_INTERVAL:
            continue

        sfx = _pick_sfx(sfx_dir, category, recent_sfx)
        if not sfx:
            # フォールバック: misc
            sfx = _pick_sfx(sfx_dir, "misc", recent_sfx)
        if not sfx:
            continue

        timeline.append({
            "timestamp": start,
            "sfx": sfx,
            "volume_db": vol,
        })
        recent_sfx.append(sfx)

        # 長いシーン（5秒以上）→ リピート
        if duration >= 5.0:
            repeat_interval = 2.5
            t = start + repeat_interval
            while t < end - 1.0:
                if timeline and (t - timeline[-1]["timestamp"]) >= MIN_INTERVAL:
                    sfx2 = _pick_sfx(sfx_dir, category, recent_sfx)
                    if sfx2:
                        timeline.append({
                            "timestamp": round(t, 2),
                            "sfx": sfx2,
                            "volume_db": vol - 1,
                        })
                        recent_sfx.append(sfx2)
                t += repeat_interval

    # 最後に「うまい」を追加
    umai = _list_sfx(sfx_dir, "reaction_happy")
    umai_files = [f for f in umai if "umai" in os.path.basename(f)]
    if umai_files and events:
        last_end = max(e["end"] for e in events)
        timeline.append({
            "timestamp": round(last_end - 0.5, 2),
            "sfx": umai_files[0],
            "volume_db": 3,
        })

    timeline.sort(key=lambda x: x["timestamp"])
    return timeline
```

- [ ] **Step 4: テスト実行してPASS確認**

```bash
cd cooking-sfx-bot && python -m pytest tests/test_select_sfx.py -v
```

- [ ] **Step 5: Commit**

```bash
git add cooking-sfx-bot/pipeline/select_sfx.py cooking-sfx-bot/tests/test_select_sfx.py
git commit -m "feat(cooking-sfx-bot): add SE selection with rules"
```

---

### Task 6: SE合成 (render_sfx.py)

**Files:**
- Create: `cooking-sfx-bot/pipeline/render_sfx.py`

- [ ] **Step 1: 実装**

```python
# pipeline/render_sfx.py
import subprocess
import os


def render_sfx_track(
    timeline: list[dict],
    video_duration: float,
    output_wav: str,
) -> str:
    """タイムラインからSEトラック(wav)を生成する。

    チェーン方式amix（normalize=0）で音量を維持。
    """
    silence = output_wav + ".silence.wav"
    subprocess.run([
        "ffmpeg", "-y",
        "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono",
        "-t", str(video_duration),
        "-acodec", "pcm_s16le",
        silence,
    ], capture_output=True, check=True)

    inputs = ["-i", silence]
    filter_lines = []
    valid = []

    for i, entry in enumerate(timeline):
        sfx_path = entry["sfx"]
        if not os.path.exists(sfx_path):
            continue
        idx = len(inputs) // 2
        inputs.extend(["-i", sfx_path])
        valid.append((idx, entry["timestamp"], entry["volume_db"], i))

    if not valid:
        os.rename(silence, output_wav)
        return output_wav

    for idx, ts, vol, i in valid:
        delay_ms = int(ts * 1000)
        filter_lines.append(
            f"[{idx}:a]volume={vol}dB,"
            f"adelay={delay_ms}|{delay_ms},"
            f"apad=whole_dur={video_duration}[se{i}]"
        )

    prev = "[0:a]"
    for j, (_, _, _, i) in enumerate(valid):
        out = f"[mix{j}]" if j < len(valid) - 1 else "[out]"
        filter_lines.append(
            f"{prev}[se{i}]amix=inputs=2:duration=first:normalize=0{out}"
        )
        prev = f"[mix{j}]"

    subprocess.run([
        "ffmpeg", "-y",
        *inputs,
        "-filter_complex", ";".join(filter_lines),
        "-map", "[out]",
        "-acodec", "pcm_s16le",
        "-ar", "44100",
        output_wav,
    ], capture_output=True, check=True)

    os.remove(silence)
    return output_wav


def merge_video_sfx(
    video_path: str,
    sfx_wav: str,
    output_mp4: str,
    sfx_volume_db: int = 12,
) -> str:
    """元動画とSEトラックを合成する。"""
    subprocess.run([
        "ffmpeg", "-y",
        "-i", video_path,
        "-i", sfx_wav,
        "-filter_complex",
        f"[1:a]volume={sfx_volume_db}dB[se];"
        f"[0:a][se]amix=inputs=2:duration=first:normalize=0[aout]",
        "-map", "0:v",
        "-map", "[aout]",
        "-c:v", "copy",
        "-c:a", "aac",
        "-b:a", "192k",
        output_mp4,
    ], capture_output=True, check=True)

    return output_mp4
```

- [ ] **Step 2: Commit**

```bash
git add cooking-sfx-bot/pipeline/render_sfx.py
git commit -m "feat(cooking-sfx-bot): add SE track rendering"
```

---

### Task 7: パイプラインオーケストレーション (run_pipeline.py)

**Files:**
- Create: `cooking-sfx-bot/pipeline/run_pipeline.py`

- [ ] **Step 1: 実装**

```python
# pipeline/run_pipeline.py
import os
import tempfile
import subprocess
import json

from .extract_frames import extract_frames
from .detect_scenes import detect_scene_changes
from .classify_scenes import classify_scenes
from .select_sfx import select_sfx
from .render_sfx import render_sfx_track, merge_video_sfx


def get_video_duration(video_path: str) -> float:
    result = subprocess.run(
        ["ffprobe", "-v", "quiet", "-print_format", "json",
         "-show_format", video_path],
        capture_output=True, text=True,
    )
    data = json.loads(result.stdout)
    return float(data["format"]["duration"])


def run_pipeline(
    video_path: str,
    sfx_dir: str,
    output_dir: str,
) -> dict:
    """動画→SE付き動画を生成する全パイプライン。

    Returns:
        {
            "output_video": str,  # SE付き動画パス
            "sfx_track": str,     # SEトラックwavパス
            "timeline": list,     # SEタイムライン
            "events": list,       # シーン分類結果
        }
    """
    os.makedirs(output_dir, exist_ok=True)
    duration = get_video_duration(video_path)

    with tempfile.TemporaryDirectory() as tmpdir:
        # 1. フレーム抽出
        frames_dir = os.path.join(tmpdir, "frames")
        frames = extract_frames(video_path, frames_dir, fps=4, width=128)

        # 2. シーン切り替え検出
        scene_changes = detect_scene_changes(frames, fps=4, threshold=25)

        # 3. Gemini Flashでシーン分類
        events = classify_scenes(frames, fps=4)

        # 4. SE選択
        timeline = select_sfx(events, sfx_dir)

    # 5. SEトラック生成
    sfx_wav = os.path.join(output_dir, "sfx_track.wav")
    render_sfx_track(timeline, duration, sfx_wav)

    # 6. 動画合成
    output_video = os.path.join(output_dir, "output.mp4")
    merge_video_sfx(video_path, sfx_wav, output_video)

    return {
        "output_video": output_video,
        "sfx_track": sfx_wav,
        "timeline": timeline,
        "events": events,
        "duration": duration,
    }


def rerender(
    video_path: str,
    timeline: list[dict],
    duration: float,
    output_dir: str,
) -> dict:
    """タイムライン変更後の再合成（Gemini不要）。"""
    sfx_wav = os.path.join(output_dir, "sfx_track.wav")
    render_sfx_track(timeline, duration, sfx_wav)

    output_video = os.path.join(output_dir, "output.mp4")
    merge_video_sfx(video_path, sfx_wav, output_video)

    return {
        "output_video": output_video,
        "sfx_track": sfx_wav,
        "timeline": timeline,
    }
```

- [ ] **Step 2: Commit**

```bash
git add cooking-sfx-bot/pipeline/run_pipeline.py
git commit -m "feat(cooking-sfx-bot): add pipeline orchestration"
```

---

### Task 8: セッション管理 (session.py)

**Files:**
- Create: `cooking-sfx-bot/session.py`
- Create: `cooking-sfx-bot/tests/test_session.py`

- [ ] **Step 1: テスト作成**

```python
# tests/test_session.py
import tempfile
import time
from session import SessionManager


def test_save_and_load():
    with tempfile.TemporaryDirectory() as tmpdir:
        mgr = SessionManager(tmpdir)
        data = {
            "video_path": "/tmp/test.mp4",
            "timeline": [{"timestamp": 0.0, "sfx": "click.wav", "volume_db": 0}],
            "duration": 30.0,
        }
        mgr.save("user123", data)
        loaded = mgr.load("user123")
        assert loaded is not None
        assert loaded["video_path"] == "/tmp/test.mp4"
        assert len(loaded["timeline"]) == 1


def test_load_nonexistent_returns_none():
    with tempfile.TemporaryDirectory() as tmpdir:
        mgr = SessionManager(tmpdir)
        assert mgr.load("nobody") is None


def test_new_session_replaces_old():
    with tempfile.TemporaryDirectory() as tmpdir:
        mgr = SessionManager(tmpdir)
        mgr.save("user123", {"timeline": [{"timestamp": 1.0}], "duration": 10.0})
        mgr.save("user123", {"timeline": [{"timestamp": 2.0}], "duration": 20.0})
        loaded = mgr.load("user123")
        assert loaded["timeline"][0]["timestamp"] == 2.0
```

- [ ] **Step 2: テスト実行して失敗確認**

```bash
cd cooking-sfx-bot && python -m pytest tests/test_session.py -v
```

- [ ] **Step 3: 実装**

```python
# session.py
import json
import os
import glob
import time


class SessionManager:
    def __init__(self, sessions_dir: str, ttl_seconds: int = 3600):
        self.sessions_dir = sessions_dir
        self.ttl = ttl_seconds
        os.makedirs(sessions_dir, exist_ok=True)

    def _path(self, user_id: str) -> str:
        return os.path.join(self.sessions_dir, f"{user_id}.json")

    def save(self, user_id: str, data: dict) -> None:
        data["_updated_at"] = time.time()
        with open(self._path(user_id), "w") as f:
            json.dump(data, f, ensure_ascii=False)

    def load(self, user_id: str) -> dict | None:
        path = self._path(user_id)
        if not os.path.exists(path):
            return None
        with open(path) as f:
            data = json.load(f)
        # TTLチェック
        if time.time() - data.get("_updated_at", 0) > self.ttl:
            os.remove(path)
            return None
        return data

    def delete(self, user_id: str) -> None:
        path = self._path(user_id)
        if os.path.exists(path):
            os.remove(path)

    def cleanup_expired(self) -> int:
        removed = 0
        for path in glob.glob(os.path.join(self.sessions_dir, "*.json")):
            try:
                with open(path) as f:
                    data = json.load(f)
                if time.time() - data.get("_updated_at", 0) > self.ttl:
                    os.remove(path)
                    removed += 1
            except (json.JSONDecodeError, KeyError):
                os.remove(path)
                removed += 1
        return removed
```

- [ ] **Step 4: テスト実行してPASS確認**

```bash
cd cooking-sfx-bot && python -m pytest tests/test_session.py -v
```

- [ ] **Step 5: Commit**

```bash
git add cooking-sfx-bot/session.py cooking-sfx-bot/tests/test_session.py
git commit -m "feat(cooking-sfx-bot): add session management"
```

---

### Task 9: 調整指示の解釈 (adjust.py)

**Files:**
- Create: `cooking-sfx-bot/adjust.py`

- [ ] **Step 1: 実装**

```python
# adjust.py
import json
import os
import google.generativeai as genai

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


def parse_adjustment(
    instruction: str,
    timeline: list[dict],
    sfx_dir: str,
) -> list[dict]:
    """ユーザーの調整指示をGemini Flashで解釈し、操作リストを返す。"""
    genai.configure(api_key=os.environ["GEMINI_API_KEY"])
    model = genai.GenerativeModel("gemini-2.0-flash")

    # タイムラインの表示用変換（sfxパスをファイル名のみに）
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

    response = model.generate_content(prompt)
    text = response.text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1].rsplit("```", 1)[0]

    result = json.loads(text)
    return result.get("operations", [])


def apply_operations(
    timeline: list[dict],
    operations: list[dict],
    sfx_dir: str,
) -> list[dict]:
    """操作リストをタイムラインに適用する。"""
    timeline = [e.copy() for e in timeline]  # コピー

    for op in operations:
        action = op["action"]

        if action == "delete":
            ts = op["timestamp"]
            timeline = [
                e for e in timeline
                if abs(e["timestamp"] - ts) > 1.0
            ]

        elif action == "add":
            sfx_path = os.path.join(
                sfx_dir, op["sfx_category"], op["sfx_name"]
            )
            if os.path.exists(sfx_path):
                timeline.append({
                    "timestamp": op["timestamp"],
                    "sfx": sfx_path,
                    "volume_db": op.get("volume_db", 0),
                })

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
```

- [ ] **Step 2: Commit**

```bash
git add cooking-sfx-bot/adjust.py
git commit -m "feat(cooking-sfx-bot): add adjustment instruction parser"
```

---

### Task 10: SE素材管理 (sfx_manager.py)

**Files:**
- Create: `cooking-sfx-bot/sfx_manager.py`

- [ ] **Step 1: 実装**

```python
# sfx_manager.py
import os
import subprocess

CATEGORY_MAP = {
    "切る": "cutting",
    "混ぜる": "mixing",
    "注ぐ": "pouring",
    "演出": "text_emphasis",
    "リアクション": "reaction_happy",
    "転換": "transition",
    "その他": "misc",
}


def list_all_sfx(sfx_dir: str) -> str:
    """全SE素材をカテゴリ別にリスト表示する。"""
    lines = []
    for cat in sorted(os.listdir(sfx_dir)):
        cat_path = os.path.join(sfx_dir, cat)
        if not os.path.isdir(cat_path):
            continue
        files = sorted(f for f in os.listdir(cat_path) if f.endswith(".wav"))
        if files:
            names = ", ".join(f.replace(".wav", "") for f in files)
            lines.append(f"{cat}: {names}")
    return "\n".join(lines) if lines else "SE素材がありません"


def add_sfx(
    source_path: str,
    sfx_dir: str,
    category: str,
) -> str:
    """音声/動画ファイルをSE素材として追加する。

    Args:
        source_path: 元ファイルパス（音声 or 動画）
        sfx_dir: SE素材ルートディレクトリ
        category: カテゴリ名（英語）

    Returns:
        保存先の相対パス（例: "cutting/new_01.wav"）
    """
    cat_dir = os.path.join(sfx_dir, category)
    os.makedirs(cat_dir, exist_ok=True)

    # 連番でファイル名生成
    existing = [f for f in os.listdir(cat_dir) if f.endswith(".wav")]
    num = len(existing) + 1
    filename = f"custom_{num:02d}.wav"
    output_path = os.path.join(cat_dir, filename)

    # ffmpegで44100Hz monoのwavに変換
    subprocess.run([
        "ffmpeg", "-y",
        "-i", source_path,
        "-vn",
        "-acodec", "pcm_s16le",
        "-ar", "44100",
        "-ac", "1",
        output_path,
    ], capture_output=True, check=True)

    return f"{category}/{filename}"


def resolve_category(text: str) -> str | None:
    """日本語カテゴリ名を英語に変換する。"""
    return CATEGORY_MAP.get(text)
```

- [ ] **Step 2: Commit**

```bash
git add cooking-sfx-bot/sfx_manager.py
git commit -m "feat(cooking-sfx-bot): add SE material manager"
```

---

### Task 11: FastAPI + LINE Webhook (app.py)

**Files:**
- Create: `cooking-sfx-bot/app.py`

- [ ] **Step 1: 実装**

```python
# app.py
import os
import tempfile
import logging
import threading

from fastapi import FastAPI, Request, HTTPException
from linebot.v3 import WebhookParser
from linebot.v3.messaging import (
    ApiClient,
    Configuration,
    MessagingApi,
    MessagingApiBlob,
    ReplyMessageRequest,
    TextMessage,
    PushMessageRequest,
)
from linebot.v3.webhooks import (
    MessageEvent,
    TextMessageContent,
    VideoMessageContent,
    AudioMessageContent,
)

from pipeline.run_pipeline import run_pipeline, rerender
from session import SessionManager
from adjust import parse_adjustment, apply_operations
from sfx_manager import list_all_sfx, add_sfx, resolve_category

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()

CHANNEL_SECRET = os.environ["LINE_CHANNEL_SECRET"]
CHANNEL_TOKEN = os.environ["LINE_CHANNEL_ACCESS_TOKEN"]
SFX_DIR = os.environ.get("SFX_DIR", "/data/sfx")
SESSIONS_DIR = os.environ.get("SESSIONS_DIR", "/tmp/sessions")

parser = WebhookParser(CHANNEL_SECRET)
config = Configuration(access_token=CHANNEL_TOKEN)

sessions = SessionManager(SESSIONS_DIR)

# ユーザー状態（SE追加フロー用）
user_states: dict[str, dict] = {}


def get_api() -> MessagingApi:
    return MessagingApi(ApiClient(config))


def get_blob_api() -> MessagingApiBlob:
    return MessagingApiBlob(ApiClient(config))


def push_text(user_id: str, text: str):
    api = get_api()
    api.push_message(PushMessageRequest(
        to=user_id,
        messages=[TextMessage(text=text)],
    ))


def push_video(user_id: str, video_path: str, text: str):
    """動画をpushで送信（reply tokenが切れている場合用）"""
    # LINE APIでは動画はURLでしか送れないため、
    # 一時的にpublic URLを作るか、テキストで代替
    # V1ではテキスト+動画ファイルパスで対応
    # TODO: 動画アップロード対応
    api = get_api()
    api.push_message(PushMessageRequest(
        to=user_id,
        messages=[TextMessage(text=text)],
    ))


def format_timeline(timeline: list[dict]) -> str:
    lines = []
    for entry in timeline:
        ts = entry["timestamp"]
        name = os.path.basename(entry["sfx"]).replace(".wav", "")
        lines.append(f"{ts:.1f}s {name}")
    return " / ".join(lines)


def process_video_async(user_id: str, message_id: str):
    """バックグラウンドで動画処理を行い、結果をpushで返す。"""
    try:
        blob_api = get_blob_api()
        content = blob_api.get_message_content(message_id)

        with tempfile.TemporaryDirectory() as tmpdir:
            video_path = os.path.join(tmpdir, "input.mp4")
            with open(video_path, "wb") as f:
                f.write(content)

            output_dir = os.path.join(tmpdir, "out")
            result = run_pipeline(video_path, SFX_DIR, output_dir)

            # セッション保存
            sessions.save(user_id, {
                "video_path": video_path,
                "timeline": result["timeline"],
                "duration": result["duration"],
                "events": result["events"],
            })

            timeline_text = format_timeline(result["timeline"])
            push_text(user_id, f"SE挿入完了!\n\n{timeline_text}\n\n調整したい場合はメッセージで指示してください。")
            # TODO: 動画ファイルのアップロード・送信

    except Exception as e:
        logger.exception("Video processing failed")
        push_text(user_id, f"処理中にエラーが発生しました: {str(e)[:100]}")


@app.post("/webhook")
async def webhook(request: Request):
    signature = request.headers.get("X-Line-Signature", "")
    body = (await request.body()).decode("utf-8")

    try:
        events = parser.parse(body, signature)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid signature")

    for event in events:
        if not isinstance(event, MessageEvent):
            continue

        user_id = event.source.user_id
        message = event.message

        # 動画メッセージ → SE挿入パイプライン
        if isinstance(message, VideoMessageContent):
            api = get_api()
            api.reply_message(ReplyMessageRequest(
                reply_token=event.reply_token,
                messages=[TextMessage(text="動画を受け取りました。SE挿入中... (15-30秒)")],
            ))
            # バックグラウンド処理
            thread = threading.Thread(
                target=process_video_async,
                args=(user_id, message.id),
            )
            thread.start()

        # 音声メッセージ → SE追加フロー
        elif isinstance(message, AudioMessageContent):
            state = user_states.get(user_id, {})
            if state.get("mode") == "se_add":
                blob_api = get_blob_api()
                content = blob_api.get_message_content(message.id)

                tmp_path = f"/tmp/se_upload_{user_id}.wav"
                with open(tmp_path, "wb") as f:
                    f.write(content)

                user_states[user_id] = {"mode": "se_add_category", "file": tmp_path}

                api = get_api()
                api.reply_message(ReplyMessageRequest(
                    reply_token=event.reply_token,
                    messages=[TextMessage(
                        text="カテゴリを選んでください:\n切る / 混ぜる / 注ぐ / 演出 / リアクション / 転換 / その他"
                    )],
                ))
            else:
                api = get_api()
                api.reply_message(ReplyMessageRequest(
                    reply_token=event.reply_token,
                    messages=[TextMessage(text="SE追加する場合は先に「SE追加」と送ってください。")],
                ))

        # テキストメッセージ
        elif isinstance(message, TextMessageContent):
            text = message.text.strip()
            api = get_api()

            # SE追加開始
            if text == "SE追加":
                user_states[user_id] = {"mode": "se_add"}
                api.reply_message(ReplyMessageRequest(
                    reply_token=event.reply_token,
                    messages=[TextMessage(text="音声ファイルか動画を送ってください。")],
                ))

            # SE追加: カテゴリ指定
            elif user_states.get(user_id, {}).get("mode") == "se_add_category":
                state = user_states[user_id]
                category = resolve_category(text)
                if category:
                    result = add_sfx(state["file"], SFX_DIR, category)
                    user_states.pop(user_id, None)
                    api.reply_message(ReplyMessageRequest(
                        reply_token=event.reply_token,
                        messages=[TextMessage(text=f"{result} として追加しました!")],
                    ))
                else:
                    api.reply_message(ReplyMessageRequest(
                        reply_token=event.reply_token,
                        messages=[TextMessage(
                            text="カテゴリを選んでください:\n切る / 混ぜる / 注ぐ / 演出 / リアクション / 転換 / その他"
                        )],
                    ))

            # SE一覧
            elif text == "SE一覧":
                sfx_list = list_all_sfx(SFX_DIR)
                api.reply_message(ReplyMessageRequest(
                    reply_token=event.reply_token,
                    messages=[TextMessage(text=sfx_list)],
                ))

            # 調整指示
            else:
                session = sessions.load(user_id)
                if session:
                    try:
                        ops = parse_adjustment(text, session["timeline"], SFX_DIR)
                        if ops:
                            new_timeline = apply_operations(
                                session["timeline"], ops, SFX_DIR
                            )
                            session["timeline"] = new_timeline
                            sessions.save(user_id, session)

                            # 再合成（バックグラウンド）
                            api.reply_message(ReplyMessageRequest(
                                reply_token=event.reply_token,
                                messages=[TextMessage(text="調整して再生成中...")],
                            ))

                            def _rerender():
                                try:
                                    with tempfile.TemporaryDirectory() as tmpdir:
                                        result = rerender(
                                            session["video_path"],
                                            new_timeline,
                                            session["duration"],
                                            tmpdir,
                                        )
                                        tl = format_timeline(new_timeline)
                                        push_text(user_id, f"更新しました!\n\n{tl}")
                                except Exception as e:
                                    push_text(user_id, f"再生成エラー: {str(e)[:100]}")

                            threading.Thread(target=_rerender).start()
                        else:
                            api.reply_message(ReplyMessageRequest(
                                reply_token=event.reply_token,
                                messages=[TextMessage(text="指示を理解できませんでした。例: 「5秒の音消して」「25秒にぷにぷに追加」")],
                            ))
                    except Exception as e:
                        logger.exception("Adjustment failed")
                        api.reply_message(ReplyMessageRequest(
                            reply_token=event.reply_token,
                            messages=[TextMessage(text=f"調整エラー: {str(e)[:100]}")],
                        ))
                else:
                    api.reply_message(ReplyMessageRequest(
                        reply_token=event.reply_token,
                        messages=[TextMessage(text="動画を送ってください。SE自動挿入します!")],
                    ))

    return {"status": "ok"}


@app.get("/health")
async def health():
    return {"status": "ok"}
```

- [ ] **Step 2: Commit**

```bash
git add cooking-sfx-bot/app.py
git commit -m "feat(cooking-sfx-bot): add FastAPI LINE webhook app"
```

---

### Task 12: Dockerfile + fly.toml

**Files:**
- Create: `cooking-sfx-bot/Dockerfile`
- Create: `cooking-sfx-bot/fly.toml`

- [ ] **Step 1: Dockerfile作成**

```dockerfile
FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8080
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8080"]
```

- [ ] **Step 2: fly.toml作成**

```toml
app = "cooking-sfx-bot"
primary_region = "nrt"

[build]

[env]
  SFX_DIR = "/data/sfx"
  SESSIONS_DIR = "/tmp/sessions"

[http_service]
  internal_port = 8080
  force_https = true
  auto_stop_machines = "stop"
  auto_start_machines = true
  min_machines_running = 0

[[vm]]
  memory = "512mb"
  cpu_kind = "shared"
  cpus = 1

[mounts]
  source = "sfx_data"
  destination = "/data/sfx"
```

- [ ] **Step 3: Commit**

```bash
git add cooking-sfx-bot/Dockerfile cooking-sfx-bot/fly.toml
git commit -m "feat(cooking-sfx-bot): add Dockerfile and fly.toml"
```

---

### Task 13: Fly.ioデプロイ + LINE設定

**Files:** なし（CLIコマンドのみ）

- [ ] **Step 1: Fly.ioアプリ作成**

```bash
cd cooking-sfx-bot
fly launch --no-deploy --name cooking-sfx-bot --region nrt
```

- [ ] **Step 2: persistent volume作成**

```bash
fly volumes create sfx_data --size 1 --region nrt
```

- [ ] **Step 3: secrets設定**

```bash
fly secrets set LINE_CHANNEL_SECRET="..." LINE_CHANNEL_ACCESS_TOKEN="..." GEMINI_API_KEY="..."
```

- [ ] **Step 4: デプロイ**

```bash
fly deploy
```

- [ ] **Step 5: ヘルスチェック**

```bash
curl https://cooking-sfx-bot.fly.dev/health
```
Expected: `{"status":"ok"}`

- [ ] **Step 6: LINE Developers ConsoleでWebhook URL設定**

URL: `https://cooking-sfx-bot.fly.dev/webhook`
- Webhook利用: ON
- 応答メッセージ: OFF
- あいさつメッセージ: OFF

- [ ] **Step 7: SE素材をpersistent volumeに転送**

```bash
# ローカルからFly.ioにSE素材をコピー
fly ssh console -C "mkdir -p /data/sfx"
# tarで転送
tar czf /tmp/sfx.tar.gz -C cooking-sfx-bot/assets sfx
fly ssh sftp shell <<< "put /tmp/sfx.tar.gz /data/sfx.tar.gz"
fly ssh console -C "cd /data && tar xzf sfx.tar.gz && rm sfx.tar.gz"
```

- [ ] **Step 8: 動作確認 — LINEから動画を送信してテスト**

---
