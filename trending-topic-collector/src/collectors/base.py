from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime


@dataclass
class CollectedItem:
    """各ソースから収集した1件のトピック"""
    title: str
    url: str
    source: str  # chiebukuro, twitter, youtube, reddit, hatena
    body_snippet: str = ""
    category: str = ""
    collected_at: datetime = field(default_factory=datetime.now)
    engagement: dict = field(default_factory=dict)


class BaseCollector(ABC):
    """コレクターの基底クラス"""
    source_name: str = ""

    @abstractmethod
    def collect(self) -> list[CollectedItem]:
        """トピックを収集して返す"""
        ...
