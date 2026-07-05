import uuid
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, HttpUrl, field_validator


class GithubImportRequest(BaseModel):
    repo_url: str

    @field_validator("repo_url")
    @classmethod
    def validate_github_url(cls, v: str) -> str:
        url_str = str(v).strip()
        if not (url_str.startswith("https://github.com/") or url_str.startswith("http://github.com/")):
            raise ValueError("Repository URL must be a valid public GitHub link (starting with https://github.com/)")
        return url_str


class ProjectOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    repo_name: Optional[str] = None
    repo_owner: Optional[str] = None
    repo_url: str
    default_branch: Optional[str] = None
    languages: Optional[str] = None
    framework: Optional[str] = None
    total_files: int
    total_lines: int
    size_bytes: int
    last_commit_sha: Optional[str] = None
    last_commit_message: Optional[str] = None
    last_commit_author: Optional[str] = None
    last_commit_date: Optional[datetime] = None
    status: str
    error_message: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class ProjectFileTreeItem(BaseModel):
    id: uuid.UUID
    file_path: str
    filename: str
    size_bytes: int
    language: Optional[str] = None

    class Config:
        from_attributes = True


class ProjectDetailOut(ProjectOut):
    files: List[ProjectFileTreeItem] = []


class ProjectFileOut(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    file_path: str
    filename: str
    size_bytes: int
    content: str
    language: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True
