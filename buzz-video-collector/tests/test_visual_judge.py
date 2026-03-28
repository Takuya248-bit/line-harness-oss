import json
from src.analyzer.visual_judge import parse_visual_judgment, VisualJudgment

def test_parse_valid():
    raw = json.dumps({
        "format": "テロップ主体",
        "telop_amount": "多い",
        "mood": "エンタメ",
    })
    result = parse_visual_judgment(raw)
    assert isinstance(result, VisualJudgment)
    assert result.format == "テロップ主体"
    assert result.telop_amount == "多い"
    assert result.mood == "エンタメ"

def test_parse_invalid_returns_none():
    assert parse_visual_judgment("broken") is None

def test_parse_unknown_format_falls_back():
    raw = json.dumps({
        "format": "アニメーション",
        "telop_amount": "普通",
        "mood": "おしゃれ",
    })
    result = parse_visual_judgment(raw)
    assert result is not None
    assert result.format == "その他"

def test_parse_from_markdown_fence():
    raw = '```json\n{"format":"顔出しトーク","telop_amount":"少ない","mood":"カジュアル"}\n```'
    result = parse_visual_judgment(raw)
    assert result is not None
    assert result.format == "顔出しトーク"
