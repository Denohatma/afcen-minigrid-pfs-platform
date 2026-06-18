from __future__ import annotations

from pydantic import BaseModel


class RunResponse(BaseModel):
    id: str
    site_id: str
    status: str
    adapter_timings: dict | None = None
    adapter_errors: dict | None = None
    summary_metrics: dict | None = None
    started_at: str | None = None
    completed_at: str | None = None


class RunListResponse(BaseModel):
    runs: list[RunResponse]
    total: int


class AdapterResultResponse(BaseModel):
    adapter_name: str
    status: str
    duration_seconds: float | None = None


class RunDetailResponse(RunResponse):
    adapter_results: list[AdapterResultResponse] = []


class DocumentResponse(BaseModel):
    id: str
    run_id: str
    format: str
    filename: str
    size_bytes: int
    created_at: str


class DocumentDownloadResponse(BaseModel):
    download_url: str
    filename: str
    expires_in_seconds: int = 900
