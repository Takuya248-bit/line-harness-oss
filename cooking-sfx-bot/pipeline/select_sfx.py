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

MIN_INTERVAL = 1.0
CONFIDENCE_THRESHOLD = 0.6

def _list_sfx(sfx_dir: str, category: str) -> list:
    cat_dir = os.path.join(sfx_dir, category)
    if not os.path.isdir(cat_dir):
        return []
    return [os.path.join(cat_dir, f) for f in os.listdir(cat_dir) if f.endswith(".wav")]

def _pick_sfx(sfx_dir: str, category: str, recent: list) -> str:
    candidates = _list_sfx(sfx_dir, category)
    if not candidates:
        return None
    filtered = [c for c in candidates if c not in recent[-2:]]
    if not filtered:
        filtered = candidates
    return random.choice(filtered)

def select_sfx(events: list, sfx_dir: str) -> list:
    timeline = []
    recent_sfx: list = []

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

        if timeline and (start - timeline[-1]["timestamp"]) < MIN_INTERVAL:
            continue

        sfx = _pick_sfx(sfx_dir, category, recent_sfx)
        if not sfx:
            sfx = _pick_sfx(sfx_dir, "misc", recent_sfx)
        if not sfx:
            continue

        timeline.append({"timestamp": start, "sfx": sfx, "volume_db": vol})
        recent_sfx.append(sfx)

        if duration >= 5.0:
            repeat_interval = 2.5
            t = start + repeat_interval
            while t < end - 1.0:
                if timeline and (t - timeline[-1]["timestamp"]) >= MIN_INTERVAL:
                    sfx2 = _pick_sfx(sfx_dir, category, recent_sfx)
                    if sfx2:
                        timeline.append({"timestamp": round(t, 2), "sfx": sfx2, "volume_db": vol - 1})
                        recent_sfx.append(sfx2)
                t += repeat_interval

    umai = _list_sfx(sfx_dir, "reaction_happy")
    umai_files = [f for f in umai if "umai" in os.path.basename(f)]
    if umai_files and events:
        last_end = max(e["end"] for e in events)
        timeline.append({"timestamp": round(last_end - 0.5, 2), "sfx": umai_files[0], "volume_db": 3})

    timeline.sort(key=lambda x: x["timestamp"])
    return timeline
