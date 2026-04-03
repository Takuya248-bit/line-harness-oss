from __future__ import annotations

import os
from typing import List

import httpx

from adapters.base import BaseAdapter
from db.models import Job


class UpworkAdapter(BaseAdapter):
    """Upwork GraphQL API skeleton. Requires OAuth2 approval for production."""

    platform_key = "upwork"
    GRAPHQL_URL = "https://api.upwork.com/graphql"

    def __init__(self) -> None:
        self._client_id = os.environ.get("UPWORK_CLIENT_ID", "")
        self._client_secret = os.environ.get("UPWORK_CLIENT_SECRET", "")

    async def fetch_jobs(self, keywords: List[str], **filters) -> List[Job]:
        if not self._client_id or not self._client_secret:
            return []
        try:
            return await self._fetch_jobs_impl(keywords)
        except Exception:
            return []

    async def _fetch_jobs_impl(self, keywords: List[str]) -> List[Job]:
        query = """
        query JobSearch($keywords: String!) {
          marketplaceJobPostingsSearch(keywords: $keywords) {
            edges {
              node {
                id
                title
                description
                budget { minimum maximum type }
                postedOn
              }
            }
          }
        }
        """
        headers = {"Authorization": f"Bearer {await self._access_token()}"}
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                self.GRAPHQL_URL,
                json={
                    "query": query,
                    "variables": {"keywords": " ".join(keywords[:5])},
                },
                headers=headers,
            )
            resp.raise_for_status()
            data = resp.json().get("data") or {}
        jobs: List[Job] = []
        edges = (
            (data.get("marketplaceJobPostingsSearch") or {}).get("edges") or []
        )
        for edge in edges:
            node = edge.get("node") or {}
            ext = str(node.get("id") or "").replace(":", "-")
            if not ext:
                continue
            budget = node.get("budget") or {}
            jobs.append(
                Job(
                    platform=self.platform_key,
                    external_id=ext,
                    title=str(node.get("title") or "(no title)"),
                    description=node.get("description"),
                    budget_min=_f(budget.get("minimum")),
                    budget_max=_f(budget.get("maximum")),
                    budget_type=_budget_type(budget.get("type")),
                    category="tech",
                )
            )
        return jobs

    async def _access_token(self) -> str:
        token_url = "https://www.upwork.com/api/v3/oauth2/token"
        async with httpx.AsyncClient(timeout=60.0) as client:
            r = await client.post(
                token_url,
                data={
                    "grant_type": "client_credentials",
                    "client_id": self._client_id,
                    "client_secret": self._client_secret,
                },
            )
            r.raise_for_status()
            return str(r.json().get("access_token") or "")

    async def submit_proposal(self, job: Job, text: str) -> bool:
        return False

    async def deliver(self, contract_id: str, content: str) -> bool:
        return False


def _f(v) -> float | None:
    try:
        if v is None:
            return None
        return float(v)
    except (TypeError, ValueError):
        return None


def _budget_type(raw) -> str | None:
    if raw is None:
        return None
    s = str(raw).lower()
    if "hour" in s:
        return "hourly"
    return "fixed"
