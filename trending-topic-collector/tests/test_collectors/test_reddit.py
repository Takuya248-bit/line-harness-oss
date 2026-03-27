from datetime import datetime, timedelta
from unittest.mock import patch, MagicMock

from src.collectors.reddit import RedditCollector, _parse_reddit_json


SAMPLE_REDDIT_JSON = {
    "data": {
        "children": [
            {
                "data": {
                    "title": "Why do Japanese people always bow?",
                    "selftext": "I noticed this cultural thing...",
                    "url": "https://www.reddit.com/r/japan/comments/abc123/",
                    "permalink": "/r/japan/comments/abc123/why_do_japanese_people_always_bow/",
                    "ups": 3200,
                    "num_comments": 450,
                    "created_utc": (datetime.now() - timedelta(hours=12)).timestamp(),
                    "subreddit": "japan",
                }
            },
            {
                "data": {
                    "title": "Low upvote post",
                    "selftext": "Not interesting",
                    "url": "https://www.reddit.com/r/japan/comments/xyz/",
                    "permalink": "/r/japan/comments/xyz/low/",
                    "ups": 50,
                    "num_comments": 3,
                    "created_utc": (datetime.now() - timedelta(hours=6)).timestamp(),
                    "subreddit": "japan",
                }
            },
        ]
    }
}


def test_parse_filters_by_upvotes():
    items = _parse_reddit_json(SAMPLE_REDDIT_JSON, min_upvotes=500, max_age_hours=48)
    assert len(items) == 1
    assert items[0].title == "Why do Japanese people always bow?"
    assert items[0].engagement["upvotes"] == 3200


def test_parse_skips_old_posts():
    old_data = {
        "data": {
            "children": [{
                "data": {
                    "title": "Old post",
                    "selftext": "",
                    "url": "https://www.reddit.com/r/japan/old/",
                    "permalink": "/r/japan/old/",
                    "ups": 5000,
                    "num_comments": 100,
                    "created_utc": (datetime.now() - timedelta(hours=72)).timestamp(),
                    "subreddit": "japan",
                }
            }]
        }
    }
    items = _parse_reddit_json(old_data, min_upvotes=500, max_age_hours=48)
    assert len(items) == 0


def test_collector_source_name():
    c = RedditCollector(config={"enabled": True, "subreddits": ["japan"], "min_upvotes": 500})
    assert c.source_name == "reddit"
