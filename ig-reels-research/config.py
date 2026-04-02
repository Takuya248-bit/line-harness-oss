"""設定"""
import os
from pathlib import Path

# ディレクトリ
BASE_DIR = Path(__file__).parent
REFERENCE_DIR = BASE_DIR / "reference"
REFERENCE_TYPE_A_DIR = REFERENCE_DIR / "type_a"
REFERENCE_TYPE_B_DIR = REFERENCE_DIR / "type_b"
SCREENSHOTS_DIR = BASE_DIR / "screenshots"
DB_PATH = BASE_DIR / "reels.db"

# Playwright
BROWSER_DATA_DIR = os.path.expanduser("~/Library/Application Support/Google/Chrome")
CHROME_PROFILE = "Default"
HEADLESS = False
VIEWPORT_WIDTH = 430
VIEWPORT_HEIGHT = 932

# スクリーンショットタイミング（秒）
SCREENSHOT_TIMINGS = [1.5, 4.0, 7.0]

# リール巡回
MAX_REELS_PER_SESSION = 50
SCROLL_WAIT_MIN = 2.0
SCROLL_WAIT_MAX = 5.0
HUMAN_PAUSE_MIN = 0.5
HUMAN_PAUSE_MAX = 2.0

# 類似度閾値（0-1、高いほど類似）
SIMILARITY_THRESHOLD = 0.6

# Instagram
INSTAGRAM_REELS_URL = "https://www.instagram.com/reels/"
