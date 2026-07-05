import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, DateTime, Integer, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from database.config import Base


class Project(Base):
    __tablename__ = "projects"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    repo_name = Column(String(255), nullable=True)
    repo_owner = Column(String(255), nullable=True)
    repo_url = Column(String(512), nullable=False)
    default_branch = Column(String(100), nullable=True)
    languages = Column(String(512), nullable=True)
    framework = Column(String(100), nullable=True)
    total_files = Column(Integer, default=0)
    total_lines = Column(Integer, default=0)
    size_bytes = Column(Integer, default=0)
    last_commit_sha = Column(String(100), nullable=True)
    last_commit_message = Column(String(255), nullable=True)
    last_commit_author = Column(String(100), nullable=True)
    last_commit_date = Column(DateTime(timezone=True), nullable=True)
    status = Column(String(50), default="pending")  # "pending", "cloning", "indexing", "completed", "failed"
    error_message = Column(String(500), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    owner = relationship("User", back_populates="projects")
    files = relationship("ProjectFile", back_populates="project", cascade="all, delete-orphan")


class ProjectFile(Base):
    __tablename__ = "project_files"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    file_path = Column(String(512), nullable=False)
    filename = Column(String(255), nullable=False)
    size_bytes = Column(Integer, nullable=False)
    content = Column(Text, nullable=False)
    language = Column(String(100), nullable=True)
    intelligence_metadata = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    project = relationship("Project", back_populates="files")
