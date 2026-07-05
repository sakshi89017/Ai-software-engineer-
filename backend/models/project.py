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
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    owner = relationship("User", back_populates="projects")
    files = relationship("ProjectFile", back_populates="project", cascade="all, delete-orphan")
    reviews = relationship("CodeReviewReport", back_populates="project", cascade="all, delete-orphan")
    documentations = relationship("ProjectDocumentation", back_populates="project", cascade="all, delete-orphan")
    architectures = relationship("ProjectArchitecture", back_populates="project", cascade="all, delete-orphan")
    shared_teams = relationship("TeamProject", back_populates="project", cascade="all, delete-orphan")
    comments = relationship("ProjectComment", back_populates="project", cascade="all, delete-orphan")
    agent_tasks = relationship("ProjectAgentTask", back_populates="project", cascade="all, delete-orphan")


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


class CodeReviewReport(Base):
    __tablename__ = "code_review_reports"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    quality_score = Column(Integer, nullable=False, default=100)
    security_score = Column(Integer, nullable=False, default=100)
    performance_score = Column(Integer, nullable=False, default=100)
    architecture_score = Column(Integer, nullable=False, default=100)
    summary = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    project = relationship("Project", back_populates="reviews")
    issues = relationship("CodeReviewIssue", back_populates="report", cascade="all, delete-orphan")


class CodeReviewIssue(Base):
    __tablename__ = "code_review_issues"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    report_id = Column(UUID(as_uuid=True), ForeignKey("code_review_reports.id", ondelete="CASCADE"), nullable=False)
    file_path = Column(String(512), nullable=False)
    line_number = Column(Integer, nullable=True)
    category = Column(String(100), nullable=False)  # "security" | "performance" | "maintainability" | "complexity" | "documentation" | "testing" | "architecture"
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=False)
    severity = Column(String(50), nullable=False)  # "low" | "medium" | "high" | "critical"
    recommended_fix = Column(Text, nullable=False)
    code_example = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    report = relationship("CodeReviewReport", back_populates="issues")


class ProjectDocumentation(Base):
    __tablename__ = "project_documentations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    doc_type = Column(String(50), nullable=False)  # "readme" | "api" | "function" | "class" | "database" | "architecture"
    content = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    project = relationship("Project", back_populates="documentations")


class ProjectArchitecture(Base):
    __tablename__ = "project_architectures"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    architecture_type = Column(String(50), nullable=False)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    project = relationship("Project", back_populates="architectures")


class ProjectAgentTask(Base):
    __tablename__ = "project_agent_tasks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    issue_content = Column(Text, nullable=False)
    implementation_plan = Column(Text, nullable=True)
    proposed_changes = Column(Text, nullable=True)
    proposed_tests = Column(Text, nullable=True)
    proposed_docs = Column(Text, nullable=True)
    pr_summary = Column(Text, nullable=True)
    status = Column(String(50), default="plan_generated")
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    project = relationship("Project", back_populates="agent_tasks")
