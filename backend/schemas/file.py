import uuid
from datetime import datetime
from pydantic import BaseModel


class UploadedFileOut(BaseModel):
    id: uuid.UUID
    filename: str
    file_type: str
    size_bytes: int
    created_at: datetime

    class Config:
        from_attributes = True


class UploadedFileWithContent(UploadedFileOut):
    content: str
