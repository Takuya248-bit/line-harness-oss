import csv
import tempfile
from datetime import datetime
from pathlib import Path
from src.collectors.base import VideoItem
from src.analyzer.text_judge import TextJudgment
from src.analyzer.visual_judge import VisualJudgment
from src.output.csv_export import export_csv, ScoredVideo

def test_csv_export():
    item = VideoItem(url="https://example.com/1", source="ig_reels", caption="テスト",
                     likes=10000, views=500000, collected_at=datetime(2026, 3, 28))
    tj = TextJudgment(tier=1, summary="要約", comment_trigger=20, emotion=15, brevity=18, freshness=10, sakurako_angle=7)
    vj = VisualJudgment(format="テロップ主体", telop_amount="多い", mood="エンタメ")
    scored = [ScoredVideo(item=item, text=tj, visual=vj)]
    with tempfile.TemporaryDirectory() as d:
        out = Path(d) / "test.csv"
        export_csv(scored, str(out))
        assert out.exists()
        with open(out, encoding="utf-8-sig") as f:
            rows = list(csv.reader(f))
        assert len(rows) == 2
        assert rows[0][0] == "スコア"
        assert rows[1][0] == "70"
