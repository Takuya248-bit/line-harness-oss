import numpy as np
from PIL import Image

def detect_scene_changes(frame_paths: list[str], fps: int = 4, threshold: float = 25.0) -> list[dict]:
    interval = 1.0 / fps
    changes = []
    prev_img = None
    for i, path in enumerate(frame_paths):
        img = np.array(Image.open(path).convert("L"), dtype=np.float32)
        if prev_img is not None:
            diff = float(np.mean(np.abs(img - prev_img)))
            if diff > threshold:
                changes.append({"timestamp": round(i * interval, 2), "diff": round(diff, 1)})
        prev_img = img
    return changes
