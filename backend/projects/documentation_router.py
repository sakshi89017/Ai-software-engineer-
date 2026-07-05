import uuid
from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
from sqlalchemy.orm import Session
from pydantic import BaseModel

from database.config import get_db
from models.user import User
from models.project import Project, ProjectDocumentation
from auth.dependencies import get_current_user
from projects.documentation import generate_documentation, export_doc_pdf, export_doc_html

router = APIRouter(tags=["documentation"])

class DocGenerateRequest(BaseModel):
    doc_type: str  # "readme" | "api" | "function" | "class" | "database" | "architecture"

class DocOut(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    doc_type: str
    content: str
    created_at: datetime

    class Config:
        from_attributes = True

def _get_owned_project(db: Session, project_id: uuid.UUID, user_id: uuid.UUID) -> Project:
    record = db.query(Project).filter(Project.id == project_id).first()
    if not record or record.user_id != user_id:
        raise HTTPException(status_code=404, detail="Project not found")
    return record

@router.post("/projects/{project_id}/docs", response_model=DocOut)
def trigger_documentation_generation(
    project_id: uuid.UUID,
    payload: DocGenerateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_owned_project(db, project_id, current_user.id)
    
    allowed_types = {"readme", "api", "function", "class", "database", "architecture"}
    if payload.doc_type.lower() not in allowed_types:
        raise HTTPException(status_code=400, detail=f"Invalid doc_type. Allowed: {allowed_types}")

    generate_documentation(project_id, payload.doc_type.lower(), db)
    
    doc_entry = (
        db.query(ProjectDocumentation)
        .filter(ProjectDocumentation.project_id == project_id, ProjectDocumentation.doc_type == payload.doc_type.lower())
        .first()
    )
    return doc_entry

@router.get("/projects/{project_id}/docs", response_model=List[DocOut])
def list_project_documentations(
    project_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_owned_project(db, project_id, current_user.id)
    return (
        db.query(ProjectDocumentation)
        .filter(ProjectDocumentation.project_id == project_id)
        .order_by(ProjectDocumentation.created_at.desc())
        .all()
    )

@router.get("/projects/{project_id}/docs/{doc_type}", response_model=DocOut)
def get_project_documentation(
    project_id: uuid.UUID,
    doc_type: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_owned_project(db, project_id, current_user.id)
    
    doc_entry = (
        db.query(ProjectDocumentation)
        .filter(ProjectDocumentation.project_id == project_id, ProjectDocumentation.doc_type == doc_type.lower())
        .first()
    )
    if not doc_entry:
        raise HTTPException(status_code=404, detail=f"Documentation of type '{doc_type}' not found.")
    return doc_entry

@router.get("/projects/{project_id}/docs/{doc_type}/export/{format_type}")
def export_project_documentation(
    project_id: uuid.UUID,
    doc_type: str,
    format_type: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    project = _get_owned_project(db, project_id, current_user.id)
    
    doc_entry = (
        db.query(ProjectDocumentation)
        .filter(ProjectDocumentation.project_id == project_id, ProjectDocumentation.doc_type == doc_type.lower())
        .first()
    )
    if not doc_entry:
        raise HTTPException(status_code=404, detail=f"Documentation of type '{doc_type}' not found.")

    safe_title = f"{doc_type.upper()} Documentation - {project.repo_owner}/{project.repo_name}"
    safe_filename = f"{doc_type}_{project.repo_name}"

    if format_type.lower() == "markdown":
        return Response(
            content=doc_entry.content,
            media_type="text/markdown",
            headers={"Content-Disposition": f"attachment; filename={safe_filename}.md"}
        )

    elif format_type.lower() == "pdf":
        try:
            pdf_bytes = export_doc_pdf(safe_title, doc_entry.content)
            return Response(
                content=pdf_bytes,
                media_type="application/pdf",
                headers={"Content-Disposition": f"attachment; filename={safe_filename}.pdf"}
            )
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to generate PDF: {str(e)}")

    elif format_type.lower() == "html":
        html_content = export_doc_html(safe_title, doc_entry.content)
        return Response(
            content=html_content,
            media_type="text/html",
            headers={"Content-Disposition": f"attachment; filename={safe_filename}.html"}
        )

    else:
        raise HTTPException(status_code=400, detail="Invalid export format. Choose pdf, markdown, or html.")
