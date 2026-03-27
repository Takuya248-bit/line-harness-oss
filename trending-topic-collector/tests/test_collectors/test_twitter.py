from src.collectors.twitter import TwitterCollector, _parse_search_results


SAMPLE_RESULTS = [
    {
        "text": "海外生活あるある：スーパーで「すみません」って言いそうになる",
        "url": "https://x.com/user1/status/123",
        "faves": 15000,
        "retweets": 3000,
        "replies": 500,
    },
    {
        "text": "今日の天気",
        "url": "https://x.com/user2/status/456",
        "faves": 100,
        "retweets": 5,
        "replies": 2,
    },
]


def test_parse_filters_by_faves():
    items = _parse_search_results(SAMPLE_RESULTS, min_faves=5000)
    assert len(items) == 1
    assert items[0].engagement["faves"] == 15000
    assert "海外生活あるある" in items[0].title


def test_collector_source_name():
    c = TwitterCollector(config={"enabled": False, "queries": [], "min_faves": 5000})
    assert c.source_name == "twitter"


def test_collector_disabled_returns_empty():
    c = TwitterCollector(config={"enabled": False, "queries": ["test"], "min_faves": 5000})
    items = c.collect()
    assert items == []
