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

EVENT_VOLUME = {
    "cutting": 2, "mixing": -4, "pouring": 0, "intro": 0,
    "plating": 0, "closeup_food": 2, "transition": 2,
    "text_emphasis": 0, "reaction": 0,
}

# デフォルトのリピート上限（カテゴリ別）
DEFAULT_MAX_REPEATS = {
    "mixing": 1,     # かき混ぜは1回まで（過剰になりやすい）
    "cutting": 2,
    "pouring": 1,
}

# misc をフォールバックに使うときの音量
FALLBACK_VOLUME = 0
MIN_INTERVAL = 1.5
CONFIDENCE_THRESHOLD = 0.3  # 低めに設定（カバレッジ優先）
MAX_GAP = 3.0  # これ以上SEが空く区間は埋める


def _list_sfx(sfx_dir, category):
    cat_dir = os.path.join(sfx_dir, category)
    if not os.path.isdir(cat_dir):
        return []
    return [os.path.join(cat_dir, f) for f in os.listdir(cat_dir) if f.endswith(".wav")]


def _pick_sfx(sfx_dir, category, recent):
    candidates = _list_sfx(sfx_dir, category)
    if not candidates:
        return None
    filtered = [c for c in candidates if c not in recent[-2:]]
    if not filtered:
        filtered = candidates
    return random.choice(filtered)


def _can_place(timeline, ts):
    """MIN_INTERVAL以上離れていればTrue"""
    if not timeline:
        return True
    return (ts - timeline[-1]["timestamp"]) >= MIN_INTERVAL


def _get_max_repeats(event_type, learned_rules):
    """学習ルールまたはデフォルトからリピート上限を取得。"""
    category = EVENT_TO_CATEGORY.get(event_type, "")
    # 学習ルール優先
    if event_type in learned_rules and "max_repeats" in learned_rules[event_type]:
        return learned_rules[event_type]["max_repeats"]
    if category in learned_rules and "max_repeats" in learned_rules[category]:
        return learned_rules[category]["max_repeats"]
    # デフォルト
    return DEFAULT_MAX_REPEATS.get(category, 2)


def _get_volume(event_type, base_vol, learned_rules):
    """学習ルールで音量を調整。"""
    if event_type in learned_rules and "volume_adjust" in learned_rules[event_type]:
        return learned_rules[event_type]["volume_adjust"]
    return base_vol


MAX_EVENT_DURATION = 3.0  # イベント区間の最大長（超えたら分割）


def _split_long_events(events):
    """3秒超のイベントを分割する（classify_scenesのバックストップ）。"""
    result = []
    for event in events:
        duration = event["end"] - event["start"]
        if duration <= MAX_EVENT_DURATION:
            result.append(event)
        else:
            t = event["start"]
            while t < event["end"]:
                end = min(t + MAX_EVENT_DURATION, event["end"])
                result.append({
                    "start": round(t, 2),
                    "end": round(end, 2),
                    "event": event.get("event", ""),
                    "confidence": event.get("confidence", 1.0),
                })
                t = end
    return result


def select_sfx(events, sfx_dir, scene_changes=None, video_duration=None, learned_rules=None):
    """シーン分類+シーン切り替えからSEタイムラインを生成する。

    Args:
        events: classify_scenesの出力
        sfx_dir: SE素材ルート
        scene_changes: detect_scene_changesの出力（シーン切り替えポイント）
        video_duration: 動画の長さ（秒）
        learned_rules: 学習済みルール辞書（LearningStore.load_rules()の返値）
    """
    if learned_rules is None:
        learned_rules = {}

    events = _split_long_events(events)
    timeline = []
    recent_sfx = []
    category_count = {}  # 同カテゴリの連続配置を追跡

    # --- Phase 1: 分類結果からSE配置 ---
    prev_event_type = None
    for event in events:
        if event.get("confidence", 1.0) < CONFIDENCE_THRESHOLD:
            continue
        event_type = event.get("event", "")
        category = EVENT_TO_CATEGORY.get(event_type)
        if not category:
            continue

        # 同カテゴリの連続区間はmax_repeats+1回まで（初回+リピート分）
        if event_type == prev_event_type:
            max_rep = _get_max_repeats(event_type, learned_rules)
            category_count[event_type] = category_count.get(event_type, 1) + 1
            if category_count[event_type] > max_rep + 1:
                continue
        else:
            prev_event_type = event_type
            category_count[event_type] = 1

        start = event["start"]
        end = event["end"]
        duration = end - start
        vol = _get_volume(event_type, EVENT_VOLUME.get(event_type, 0), learned_rules)

        if not _can_place(timeline, start):
            continue

        sfx = _pick_sfx(sfx_dir, category, recent_sfx)
        if not sfx:
            sfx = _pick_sfx(sfx_dir, "misc", recent_sfx)
        if not sfx:
            continue

        timeline.append({"timestamp": start, "sfx": sfx, "volume_db": vol})
        recent_sfx.append(sfx)

        # 長いシーン（3秒以上）→ リピート（学習ルールで上限制御）
        max_repeats = _get_max_repeats(event_type, learned_rules)
        if duration >= 3.0 and max_repeats > 0:
            repeat_interval = 2.0
            repeat_count = 0
            t = start + repeat_interval
            while t < end - 1.0 and repeat_count < max_repeats:
                if _can_place(timeline, t):
                    sfx2 = _pick_sfx(sfx_dir, category, recent_sfx)
                    if sfx2:
                        timeline.append({"timestamp": round(t, 2), "sfx": sfx2, "volume_db": vol - 1})
                        recent_sfx.append(sfx2)
                        repeat_count += 1
                t += repeat_interval

    # --- Phase 2: シーン切り替えポイントでSEがない箇所を埋める ---
    if scene_changes:
        for sc in scene_changes:
            ts = sc["timestamp"]
            # 既にSEがある場所はスキップ
            nearby = any(abs(e["timestamp"] - ts) < MIN_INTERVAL for e in timeline)
            if nearby:
                continue
            # miscからフォールバックSEを選ぶ
            sfx = _pick_sfx(sfx_dir, "misc", recent_sfx)
            if not sfx:
                sfx = _pick_sfx(sfx_dir, "text_emphasis", recent_sfx)
            if sfx:
                timeline.append({"timestamp": ts, "sfx": sfx, "volume_db": FALLBACK_VOLUME})
                recent_sfx.append(sfx)

    # --- Phase 3: MAX_GAP以上空いてる区間をフィラーで埋める ---
    timeline.sort(key=lambda x: x["timestamp"])
    if video_duration and timeline:
        filled = []
        filled.extend(timeline)

        # 冒頭チェック
        if timeline[0]["timestamp"] > MAX_GAP:
            sfx = _pick_sfx(sfx_dir, "misc", recent_sfx)
            if sfx:
                filled.insert(0, {"timestamp": 0.5, "sfx": sfx, "volume_db": 0})

        # 中間のギャップ
        for i in range(len(timeline) - 1):
            gap_start = timeline[i]["timestamp"]
            gap_end = timeline[i + 1]["timestamp"]
            gap = gap_end - gap_start
            if gap > MAX_GAP:
                mid = round((gap_start + gap_end) / 2, 2)
                sfx = _pick_sfx(sfx_dir, "misc", recent_sfx)
                if sfx:
                    filled.append({"timestamp": mid, "sfx": sfx, "volume_db": 0})
                    recent_sfx.append(sfx)

        # 末尾チェック
        if video_duration - timeline[-1]["timestamp"] > MAX_GAP:
            mid = round((timeline[-1]["timestamp"] + video_duration) / 2, 2)
            sfx = _pick_sfx(sfx_dir, "misc", recent_sfx)
            if sfx:
                filled.append({"timestamp": mid, "sfx": sfx, "volume_db": 0})

        timeline = filled

    # --- Phase 4: 冒頭クリック + 最後うまい ---
    # 冒頭にmouse_clickがなければ追加
    mouse_clicks = _list_sfx(sfx_dir, "misc")
    click_files = [f for f in mouse_clicks if "mouse_click" in os.path.basename(f)]
    if click_files:
        has_start = any(e["timestamp"] < 0.5 for e in timeline)
        if not has_start:
            timeline.append({"timestamp": 0.0, "sfx": click_files[0], "volume_db": 3})

    # 最後にうまい
    umai = _list_sfx(sfx_dir, "reaction_happy")
    umai_files = [f for f in umai if "umai" in os.path.basename(f)]
    if umai_files:
        end_time = video_duration if video_duration else (max(e["end"] for e in events) if events else 30.0)
        timeline.append({"timestamp": round(end_time - 0.5, 2), "sfx": umai_files[0], "volume_db": 3})

    timeline.sort(key=lambda x: x["timestamp"])
    return timeline
