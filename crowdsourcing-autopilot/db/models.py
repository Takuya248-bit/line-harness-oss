"""Pydantic models for DB rows and config YAML."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class Job(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: int | None = None
    platform: str
    external_id: str
    title: str | None = None
    description: str | None = None
    url: str | None = None
    budget_min: float | None = None
    budget_max: float | None = None
    currency: str = "JPY"
    status: str = "open"
    raw_html: str | None = None
    metadata_json: str | None = None
    first_seen_at: datetime | None = None
    last_seen_at: datetime | None = None


class ProposalTemplate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: int | None = None
    name: str
    platform: str | None = None
    body_template: str
    is_active: int = 1
    created_at: datetime | None = None
    updated_at: datetime | None = None


ProposalStatus = Literal["draft", "queued", "sent", "rejected", "accepted"]
ContractStatus = Literal["active", "completed", "cancelled"]
DeliverableStatus = Literal["pending", "submitted", "approved", "rejected"]


class Proposal(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: int | None = None
    job_id: int
    template_id: int | None = None
    body: str
    status: ProposalStatus = "draft"
    model: str | None = None
    created_at: datetime | None = None
    sent_at: datetime | None = None


class Contract(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: int | None = None
    job_id: int
    proposal_id: int | None = None
    platform_contract_id: str | None = None
    status: ContractStatus = "active"
    agreed_price: float | None = None
    currency: str = "JPY"
    agreed_at: datetime | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class Deliverable(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: int | None = None
    contract_id: int
    title: str | None = None
    description: str | None = None
    status: DeliverableStatus = "pending"
    submitted_at: datetime | None = None
    approved_at: datetime | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class PlatformConfig(BaseModel):
    model_config = ConfigDict(extra="allow")

    enabled: bool = True
    base_url: str
    job_search_url: str
    notes: str | None = None


class PlatformsConfigFile(BaseModel):
    """Root model for config/platforms.yaml."""

    model_config = ConfigDict(extra="ignore")

    defaults: dict[str, Any] = Field(default_factory=dict)
    platforms: dict[str, PlatformConfig]


class ScanSchedule(BaseModel):
    model_config = ConfigDict(extra="ignore")

    interval_minutes: int = 15


class ScanFilters(BaseModel):
    model_config = ConfigDict(extra="ignore")

    keywords: list[str] = Field(default_factory=list)
    exclude_keywords: list[str] = Field(default_factory=list)


class ScanLimits(BaseModel):
    model_config = ConfigDict(extra="ignore")

    max_pages_per_run: int = 5
    min_interval_seconds_between_requests: float = 2.0


class ScanConfigFile(BaseModel):
    """Root model for config/scan.yaml."""

    model_config = ConfigDict(extra="ignore")

    schedule: ScanSchedule = Field(default_factory=ScanSchedule)
    filters: ScanFilters = Field(default_factory=ScanFilters)
    limits: ScanLimits = Field(default_factory=ScanLimits)
