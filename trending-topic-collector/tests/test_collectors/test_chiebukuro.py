from src.collectors.chiebukuro import ChiebukuroCollector, _parse_question_list_page


# 2026-03 現在の実際のHTML構造（ClapLv3List / ClapLv2ListItem）に基づくサンプル
SAMPLE_HTML = """
<html><body>
<div class="ClapLv3List_Chie-List__ListItem__ZEhUo">
  <div>
    <a class="ClapLv2ListItem_Chie-ListItem__Anchor__8LjVN"
       href="https://detail.chiebukuro.yahoo.co.jp/qa/question_detail/q12345">
      <div class="ClapLv2ListItem_Chie-ListItem__TextWrapper__tZD0m">
        <p class="ClapLv1TextBlock_Chie-TextBlock__Text__etZbS">
          彼氏が海外赴任になったけどついていくべき？
        </p>
      </div>
      <div class="ClapLv2ListItem_Chie-ListItem__Information__UD2fV">
        <div class="ClapLv2ListItem_Chie-ListItem__InformationItem__O91MH">
          <div aria-label="回答数：" class="ClapLv2ListItem_Chie-ListItem__InformationIcon__jPmBK"></div>
          <div class="ClapLv2ListItem_Chie-ListItem__InformationText__EHTFY">47</div>
        </div>
      </div>
    </a>
  </div>
</div>
<div class="ClapLv3List_Chie-List__ListItem__ZEhUo">
  <div>
    <a class="ClapLv2ListItem_Chie-ListItem__Anchor__8LjVN"
       href="https://detail.chiebukuro.yahoo.co.jp/qa/question_detail/q67890">
      <div class="ClapLv2ListItem_Chie-ListItem__TextWrapper__tZD0m">
        <p class="ClapLv1TextBlock_Chie-TextBlock__Text__etZbS">
          低回答の質問
        </p>
      </div>
      <div class="ClapLv2ListItem_Chie-ListItem__Information__UD2fV">
        <div class="ClapLv2ListItem_Chie-ListItem__InformationItem__O91MH">
          <div aria-label="回答数：" class="ClapLv2ListItem_Chie-ListItem__InformationIcon__jPmBK"></div>
          <div class="ClapLv2ListItem_Chie-ListItem__InformationText__EHTFY">1</div>
        </div>
      </div>
    </a>
  </div>
</div>
</body></html>
"""


def test_parse_extracts_items():
    items = _parse_question_list_page(SAMPLE_HTML, min_answers=3)
    assert len(items) == 1
    assert items[0].title == "彼氏が海外赴任になったけどついていくべき？"
    assert items[0].source == "chiebukuro"
    assert items[0].engagement["answers"] == 47
    assert "q12345" in items[0].url


def test_parse_filters_low_engagement():
    items = _parse_question_list_page(SAMPLE_HTML, min_answers=50)
    assert len(items) == 0


def test_collector_has_correct_source_name():
    c = ChiebukuroCollector(config={
        "enabled": True,
        "categories": ["恋愛相談"],
        "min_answers": 3,
    })
    assert c.source_name == "chiebukuro"
