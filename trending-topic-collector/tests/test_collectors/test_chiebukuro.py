from datetime import datetime

from src.collectors.chiebukuro import ChiebukuroCollector, _parse_question_list_page


SAMPLE_HTML = """
<html><body>
<div class="Chie-Qa__QaListItem">
  <a class="Chie-Qa__QaListItem__Title" href="https://detail.chiebukuro.yahoo.co.jp/qa/question_detail/q12345">
    彼氏が海外赴任になったけどついていくべき？
  </a>
  <span class="Chie-Qa__QaListItem__ViewCount">85,000閲覧</span>
  <span class="Chie-Qa__QaListItem__AnswerCount">47回答</span>
</div>
<div class="Chie-Qa__QaListItem">
  <a class="Chie-Qa__QaListItem__Title" href="https://detail.chiebukuro.yahoo.co.jp/qa/question_detail/q67890">
    低閲覧の質問
  </a>
  <span class="Chie-Qa__QaListItem__ViewCount">500閲覧</span>
  <span class="Chie-Qa__QaListItem__AnswerCount">2回答</span>
</div>
</body></html>
"""


def test_parse_extracts_items():
    items = _parse_question_list_page(SAMPLE_HTML, min_views=10000, min_answers=3)
    assert len(items) == 1
    assert items[0].title == "彼氏が海外赴任になったけどついていくべき？"
    assert items[0].source == "chiebukuro"
    assert items[0].engagement["views"] == 85000
    assert items[0].engagement["answers"] == 47
    assert "q12345" in items[0].url


def test_parse_filters_low_engagement():
    items = _parse_question_list_page(SAMPLE_HTML, min_views=100000, min_answers=3)
    assert len(items) == 0


def test_collector_has_correct_source_name():
    c = ChiebukuroCollector(config={
        "enabled": True,
        "categories": ["恋愛相談"],
        "min_views": 10000,
        "min_answers": 3,
    })
    assert c.source_name == "chiebukuro"
