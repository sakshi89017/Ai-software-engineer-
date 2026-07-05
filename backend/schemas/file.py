import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class UploadedFileOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    filename: str
    language: str
    size: int
    path: str
    created_at: datetime

    # Keep backward compatibility for existing frontend calls
    file_type: str
    size_bytes: int

    class Config:
        from_attributes = True


class UploadedFileWithContent(UploadedFileOut):
    content: str


class AnalyzeRequest(BaseModel):
    action: str


class FileReviewIssueOut(BaseModel):
    file_path: str
    line_number: Optional[int] = None
    category: str
    title: str
    description: str
    severity: str
    recommended_fix: str
    code_example: Optional[str] = None


class FileReviewReportOut(BaseModel):
    quality_score: int
    security_score: int
    performance_score: int
    architecture_score: int
    summary: Optional[str] = None
    issues: list[FileReviewIssueOut] = []


class TestGenerateRequest(BaseModel):
    test_type: str  # "unit" | "integration" | "mock_data" | "edge_cases"


class TestGenerateResponse(BaseModel):
    filename: str
    test_code: str

