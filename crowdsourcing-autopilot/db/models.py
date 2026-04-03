from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field

BudgetType = Literal["hourly", "fixed"]
JobStatus = Literal["new", "notified", "applied", "skipped"]
ProposalStatus = Literal["draft", "sent", "accepted", "rejected"]
ContractStatus = Literal["active", "delivered", "completed", "cancelled"]
ReviewStatus = Literal["pending", "approved", "rejected"]


class Job(BaseModel):
    id: Optional[int] = None
    platform: str
    external_id: str
    title: str
    description: Optional[str] = None
    budget_min: Optional[float] = None
    budget_max: Optional[float] = None
    budget_type: Optional[BudgetType] = None
    category: Optional[str] = None
    score: Optional[int] = None
    status: JobStatus = "new"
    posted_at: Optional[datetime] = None
    scanned_at: Optional[datetime] = None


class Proposal(BaseModel):
    id: Optional[int] = None
    job_id: int
    text: str
    status: ProposalStatus = "draft"
    sent_at: Optional[datetime] = None
    created_at: Optional[datetime] = None


class Contract(BaseModel):
    id: Optional[int] = None
    job_id: int
    platform: str
    type: str
    rate: Optional[float] = None
    rate_type: Optional[str] = None
    deadline: Optional[str] = None
    status: ContractStatus = "active"
    created_at: Optional[datetime] = None


class Deliverable(BaseModel):
    id: Optional[int] = None
    contract_id: int
    content: Optional[str] = None
    review_status: ReviewStatus = "pending"
    submitted_at: Optional[datetime] = None
    created_at: Optional[datetime] = None


class ProposalTemplate(BaseModel):
    id: Optional[int] = None
    platform: Optional[str] = None
    category: Optional[str] = None
    text: str = Field(..., min_length=1)
    was_accepted: bool = False
    created_at: Optional[datetime] = None
