from __future__ import annotations
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional


@dataclass
class VideoItem:
    url: str
    source: str
    caption: str = ""
    likes: int = 0
    views: int = 0
    comments: int = 0
    screenshot_path: str = ""
    posted_at: Optional[datetime] = None
    collected_at: datetime = field(default_factory=datetime.now)


class BaseCollector(ABC):
    source_name: str = ""

    @abstractmethod
    def collect(self) -> list[VideoItem]:
        ...
