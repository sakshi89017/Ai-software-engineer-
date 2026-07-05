import uuid
from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, status
from fastapi.responses import Response, StreamingResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel

from database.config import get_db
from models.user import User
from models.project import Project, CodeReviewReport, CodeReviewIssue
from auth.dependencies import get_current_user
from projects.code_review import run_code_review, export_markdown_report, export_pdf_report

router = APIRouter(tags=["code_review"])


class IssueOut(BaseModel):
    id: uuid.UUID
    report_id: uuid.UUID
    file_path: str
    line_number: Optional[int] = None
    category: str
    title: str
    description: str
    severity: str
    recommended_fix: str
    code_example: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class ReportOut(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    quality_score: int
    security_score: int
    performance_score: int
    architecture_score: int
    summary: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class ReportDetailOut(ReportOut):
    issues: List[IssueOut] = []


def _get_owned_project(db: Session, project_id: uuid.UUID, user_id: uuid.UUID) -> Project:
    record = db.query(Project).filter(Project.id == project_id).first()
    if not record or record.user_id != user_id:
        raise HTTPException(status_code=404, detail="Project not found")
    return record


@router.post("/projects/{project_id}/review", response_model=ReportOut, status_code=status.HTTP_202_ACCEPTED)
def trigger_code_review(
    project_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Enforce project ownership
    _get_owned_project(db, project_id, current_user.id)

    # Initialize a temporary placeholder report with default status
    report = CodeReviewReport(
        project_id=project_id,
        quality_score=100,
        security_score=100,
        performance_score=100,
        architecture_score=100,
        summary="Automated review run currently analyzing files in background..."
    )
    db.add(report)
    db.commit()
    db.refresh(report)

    # Launch review in background tasks
    # We delete the temp placeholder report inside run_code_review or update it.
    # To keep it extremely simple: let's delete this temp placeholder report and let the background review create the real one!
    db.delete(report)
    db.commit()

    # If using in-memory sqlite (testing), pass db directly to keep connection active
    if "sqlite:///:memory:" in str(db.bind.url):
        background_tasks.add_task(run_code_review, project_id, db)
    else:
        background_tasks.add_task(run_code_review, project_id)

    return report


@router.get("/projects/{project_id}/reviews", response_model=list[ReportOut])
def list_code_reviews(
    project_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_owned_project(db, project_id, current_user.id)
    return (
        db.query(CodeReviewReport)
        .filter(CodeReviewReport.project_id == project_id)
        .order_by(CodeReviewReport.created_at.desc())
        .all()
    )


@router.get("/reviews/{report_id}", response_model=ReportDetailOut)
def get_code_review(
    report_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    report = db.query(CodeReviewReport).filter(CodeReviewReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Code review report not found")

    # Enforce ownership through the parent project
    _get_owned_project(db, report.project_id, current_user.id)

    return report


@router.get("/reviews/{report_id}/export/{format_type}")
def export_code_review(
    report_id: uuid.UUID,
    format_type: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    report = db.query(CodeReviewReport).filter(CodeReviewReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Code review report not found")

    project = _get_owned_project(db, report.project_id, current_user.id)
    issues = db.query(CodeReviewIssue).filter(CodeReviewIssue.report_id == report_id).all()
    
    repo_name = f"{project.repo_owner}_{project.repo_name}"

    if format_type.lower() == "json":
        # Export as JSON file attachment
        issues_list = [IssueOut.model_validate(i).model_dump() for i in issues]
        report_data = ReportOut.model_validate(report).model_dump()
        report_data["issues"] = issues_list
        
        json_content = json.dumps(report_data, default=str, indent=2)
        return Response(
            content=json_content,
            media_type="application/json",
            headers={"Content-Disposition": f"attachment; filename=codereview_{repo_name}.json"}
        )
        
    elif format_type.lower() == "markdown":
        # Export as Markdown file attachment
        md_content = export_markdown_report(report, issues, f"{project.repo_owner}/{project.repo_name}")
        return Response(
            content=md_content,
            media_type="text/markdown",
            headers={"Content-Disposition": f"attachment; filename=codereview_{repo_name}.md"}
        )
        
    elif format_type.lower() == "pdf":
        # Export as PDF attachment using reportlab
        try:
            pdf_bytes = export_pdf_report(report, issues, f"{project.repo_owner}/{project.repo_name}")
            return Response(
                content=pdf_bytes,
                media_type="application/pdf",
                headers={"Content-Disposition": f"attachment; filename=codereview_{repo_name}.pdf"}
            )
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to generate PDF: {str(e)}")
            
    else:
        raise HTTPException(status_code=400, detail="Invalid export format. Choose pdf, markdown, or json.")
import json
