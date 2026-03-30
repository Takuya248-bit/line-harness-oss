import tempfile
from learning import LearningStore


def test_record_and_derive_rules():
    """調整操作を記録し、ルールが自動導出される"""
    with tempfile.TemporaryDirectory() as tmpdir:
        store = LearningStore(tmpdir)

        timeline = [
            {"timestamp": 2.0, "sfx": "/sfx/mixing/kakimazeru.wav", "volume_db": -4},
            {"timestamp": 4.0, "sfx": "/sfx/mixing/kakimazeru_long.wav", "volume_db": -5},
            {"timestamp": 6.0, "sfx": "/sfx/mixing/kakimazeru.wav", "volume_db": -5},
        ]
        events = [
            {"start": 0.0, "end": 10.0, "event": "mixing", "confidence": 0.9},
        ]

        # 3回deleteでmax_repeats=1に
        for ts in [2.0, 4.0, 6.0]:
            store.record_adjustment(
                "user1",
                [{"action": "delete", "timestamp": ts}],
                timeline, events,
            )

        rules = store.load_rules()
        assert "mixing" in rules
        assert rules["mixing"]["max_repeats"] == 1


def test_five_deletes_means_no_repeat():
    """5回deleteでリピート完全禁止"""
    with tempfile.TemporaryDirectory() as tmpdir:
        store = LearningStore(tmpdir)
        timeline = [{"timestamp": 1.0, "sfx": "/sfx/cutting/knife.wav", "volume_db": 2}]
        events = [{"start": 0.0, "end": 5.0, "event": "cutting", "confidence": 0.9}]

        for _ in range(5):
            store.record_adjustment(
                "user1",
                [{"action": "delete", "timestamp": 1.0}],
                timeline, events,
            )

        rules = store.load_rules()
        assert rules["cutting"]["max_repeats"] == 0


def test_stats_output():
    """get_statsが読める文字列を返す"""
    with tempfile.TemporaryDirectory() as tmpdir:
        store = LearningStore(tmpdir)
        assert "学習データなし" in store.get_stats()

        store.record_adjustment(
            "user1",
            [{"action": "delete", "timestamp": 5.0}],
            [{"timestamp": 5.0, "sfx": "/sfx/misc/coin.wav", "volume_db": 0}],
            [],
        )
        stats = store.get_stats()
        assert "調整記録: 1件" in stats
        assert "削除: 1" in stats
