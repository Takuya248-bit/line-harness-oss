from datetime import datetime
from unittest.mock import patch, MagicMock

from src.collectors.base import CollectedItem
from src.line_notifier import format_notification, send_notification


def _make_item(title, source, url, score, engagement):
    return (
        CollectedItem(
            title=title, url=url, source=source,
            engagement=engagement,
            collected_at=datetime(2026, 3, 28),
        ),
        score,
    )


def test_format_notification_single():
    items = [_make_item("テストトピック", "chiebukuro", "https://example.com", 75, {"views": 50000, "answers": 20})]
    text = format_notification(items)
    assert "バズネタ速報" in text
    assert "1件" in text
    assert "75点" in text
    assert "テストトピック" in text
    assert "https://example.com" in text


def test_format_notification_multiple():
    items = [
        _make_item("トピックA", "chiebukuro", "https://a.com", 82, {"views": 100000}),
        _make_item("トピックB", "reddit", "https://b.com", 71, {"upvotes": 3200}),
    ]
    text = format_notification(items)
    assert "2件" in text
    assert "82点" in text
    assert "71点" in text


def test_format_notification_empty():
    text = format_notification([])
    assert text is None


def test_send_notification_calls_api():
    with patch("src.line_notifier.requests.post") as mock_post:
        mock_post.return_value = MagicMock(status_code=200)
        items = [_make_item("テスト", "reddit", "https://x.com", 70, {"upvotes": 1000})]
        result = send_notification(items, token="test-token")
        assert result is True
        mock_post.assert_called_once()
        call_args = mock_post.call_args
        assert "Authorization" in call_args[1]["headers"]
