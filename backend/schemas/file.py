import uuid
from datetime import datetime
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
