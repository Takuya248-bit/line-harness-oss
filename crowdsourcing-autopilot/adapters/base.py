from __future__ import annotations

from abc import ABC, abstractmethod
from typing import List

from db.models import Job


class CookieExpiredError(Exception):
    """Raised when a cookie-based session has expired and needs manual renewal."""
    def __init__(self, platform: str):
        self.platform = platform
        super().__init__(f"{platform}: cookie expired or session invalid")


class BaseAdapter(ABC):
    platform_key: str = ""

    @abstractmethod
    async def fetch_jobs(self, keywords: List[str], **filters) -> List[Job]:
        ...

    @abstractmethod
    async def submit_proposal(self, job: Job, text: str) -> bool:
        ...

    @abstractmethod
    async def deliver(self, contract_id: str, content: str) -> bool:
        ...
