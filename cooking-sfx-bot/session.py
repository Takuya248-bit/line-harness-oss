import json
import os
import glob
import time
from typing import Optional

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

    def load(self, user_id: str) -> Optional[dict]:
        path = self._path(user_id)
        if not os.path.exists(path):
            return None
        with open(path) as f:
            data = json.load(f)
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
