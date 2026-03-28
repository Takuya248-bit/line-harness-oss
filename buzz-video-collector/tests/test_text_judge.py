import json
from src.analyzer.text_judge import parse_text_judgment, TextJudgment

def test_parse_valid_json():
    raw = json.dumps({
        "tier": 1,
        "summary": "彼氏が友人と旅行に行っていた件",
        "comment_trigger": 25,
        "emotion": 20,
        "brevity": 18,
        "freshness": 10,
        "sakurako_angle": 7,
    })
    result = parse_text_judgment(raw)
    assert isinstance(result, TextJudgment)
    assert result.tier == 1
    assert result.total_score == 80
    assert result.summary == "彼氏が友人と旅行に行っていた件"

def test_parse_clamped_scores():
    raw = json.dumps({
        "tier": 2, "summary": "test",
        "comment_trigger": 50, "emotion": 40, "brevity": 30,
        "freshness": 20, "sakurako_angle": 15,
    })
    result = parse_text_judgment(raw)
    assert result.comment_trigger == 30
    assert result.emotion == 25
    assert result.brevity == 20
    assert result.freshness == 15
    assert result.sakurako_angle == 10
    assert result.total_score == 100

def test_parse_invalid_json_returns_none():
    result = parse_text_judgment("not json at all")
    assert result is None

def test_parse_json_in_markdown_fence():
    raw = '```json\n{"tier":3,"summary":"test","comment_trigger":10,"emotion":10,"brevity":10,"freshness":10,"sakurako_angle":5}\n```'
    result = parse_text_judgment(raw)
    assert result is not None
    assert result.tier == 3
