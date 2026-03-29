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

def add_sfx(source_path: str, sfx_dir: str, category: str) -> str:
    cat_dir = os.path.join(sfx_dir, category)
    os.makedirs(cat_dir, exist_ok=True)
    existing = [f for f in os.listdir(cat_dir) if f.endswith(".wav")]
    num = len(existing) + 1
    filename = f"custom_{num:02d}.wav"
    output_path = os.path.join(cat_dir, filename)
    subprocess.run([
        "ffmpeg", "-y", "-i", source_path,
        "-vn", "-acodec", "pcm_s16le", "-ar", "44100", "-ac", "1",
        output_path,
    ], capture_output=True, check=True)
    return f"{category}/{filename}"

def resolve_category(text: str) -> str | None:
    return CATEGORY_MAP.get(text)
