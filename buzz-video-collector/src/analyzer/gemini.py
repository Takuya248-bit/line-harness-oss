from __future__ import annotations
import time
from pathlib import Path
from typing import Optional

import google.generativeai as genai

from src.analyzer.text_judge import (
    TextJudgment, build_text_prompt, parse_text_judgments_batch,
)
from src.analyzer.visual_judge import (
    VisualJudgment, VISUAL_JUDGE_PROMPT, parse_visual_judgment,
)

class GeminiAnalyzer:
    def __init__(self, api_key: str, model: str = "gemini-2.5-flash-preview-05-20"):
        genai.configure(api_key=api_key)
        self._model = genai.GenerativeModel(model)

    def judge_texts(self, captions: list[str]) -> list[Optional[TextJudgment]]:
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
        path = Path(screenshot_path)
        if not path.exists():
            return None
        try:
            img_bytes = path.read_bytes()
            img_part = {"mime_type": "image/png", "data": img_bytes}
            resp = self._model.generate_content([VISUAL_JUDGE_PROMPT, img_part])
            return parse_visual_judgment(resp.text)
        except Exception as e:
            print(f"  Gemini visual error: {e}")
            return None

    def judge_texts_with_retry(self, captions: list[str], max_retries: int = 3) -> list[Optional[TextJudgment]]:
        for attempt in range(max_retries):
            results = self.judge_texts(captions)
            if results and any(r is not None for r in results):
                return results
            wait = [10, 30, 60][min(attempt, 2)]
            print(f"  Gemini retry in {wait}s (attempt {attempt + 1})")
            time.sleep(wait)
        return [None] * len(captions)
