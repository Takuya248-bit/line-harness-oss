from src.collectors.hatena import HatenaCollector, _parse_hotentry_rss


SAMPLE_RSS = """<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
         xmlns="http://purl.org/rss/1.0/"
         xmlns:hatena="http://www.hatena.ne.jp/info/xmlns#">
  <item rdf:about="https://anond.hatelabo.jp/20260328123456">
    <title>職場で言われた衝撃の一言にモヤモヤが止まらない</title>
    <link>https://anond.hatelabo.jp/20260328123456</link>
    <description>上司に呼ばれて突然言われたのが...</description>
    <hatena:bookmarkcount>680</hatena:bookmarkcount>
  </item>
  <item rdf:about="https://anond.hatelabo.jp/20260328111111">
    <title>低ブクマの記事</title>
    <link>https://anond.hatelabo.jp/20260328111111</link>
    <description>あまり注目されない</description>
    <hatena:bookmarkcount>30</hatena:bookmarkcount>
  </item>
</rdf:RDF>
"""


def test_parse_filters_by_bookmarks():
    items = _parse_hotentry_rss(SAMPLE_RSS, min_bookmarks=100)
    assert len(items) == 1
    assert items[0].title == "職場で言われた衝撃の一言にモヤモヤが止まらない"
    assert items[0].engagement["bookmarks"] == 680
    assert items[0].source == "hatena"


def test_parse_no_results_high_threshold():
    items = _parse_hotentry_rss(SAMPLE_RSS, min_bookmarks=1000)
    assert len(items) == 0


def test_collector_source_name():
    c = HatenaCollector(config={"enabled": True, "min_bookmarks": 100})
    assert c.source_name == "hatena"
