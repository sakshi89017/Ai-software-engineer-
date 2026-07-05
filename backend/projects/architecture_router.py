import uuid
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel

from database.config import get_db
from models.user import User
from models.project import Project, ProjectArchitecture
from auth.dependencies import get_current_user
from projects.architecture import generate_architecture_doc

router = APIRouter(tags=["architecture"])

class ArchGenerateRequest(BaseModel):
    architecture_type: str  # "system_design" | "architecture_diagram" | "database_schema" | "folder_structure" | "api_flow" | "auth_flow" | "sequence_diagram" | "component_diagram" | "deployment_diagram"

class ArchOut(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    architecture_type: str
    content: str
    created_at: datetime

    class Config:
        from_attributes = True

def _get_owned_project(db: Session, project_id: uuid.UUID, user_id: uuid.UUID) -> Project:
    record = db.query(Project).filter(Project.id == project_id).first()
    if not record or record.user_id != user_id:
        raise HTTPException(status_code=404, detail="Project not found")
    return record

@router.post("/projects/{project_id}/architectures", response_model=ArchOut)
def trigger_architecture_generation(
    project_id: uuid.UUID,
    payload: ArchGenerateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_owned_project(db, project_id, current_user.id)
    
    allowed_types = {
        "system_design", "architecture_diagram", "database_schema", "folder_structure",
        "api_flow", "auth_flow", "sequence_diagram", "component_diagram", "deployment_diagram"
    }
    if payload.architecture_type.lower() not in allowed_types:
        raise HTTPException(status_code=400, detail=f"Invalid architecture_type. Allowed: {allowed_types}")

    generate_architecture_doc(project_id, payload.architecture_type.lower(), db)
    
    arch_entry = (
        db.query(ProjectArchitecture)
        .filter(ProjectArchitecture.project_id == project_id, ProjectArchitecture.architecture_type == payload.architecture_type.lower())
        .first()
    )
    return arch_entry

@router.get("/projects/{project_id}/architectures", response_model=List[ArchOut])
def list_project_architectures(
    project_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_owned_project(db, project_id, current_user.id)
    return (
        db.query(ProjectArchitecture)
        .filter(ProjectArchitecture.project_id == project_id)
        .order_by(ProjectArchitecture.created_at.desc())
        .all()
    )

@router.get("/projects/{project_id}/architectures/{architecture_type}", response_model=ArchOut)
def get_project_architecture(
    project_id: uuid.UUID,
    architecture_type: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_owned_project(db, project_id, current_user.id)
    
    arch_entry = (
        db.query(ProjectArchitecture)
        .filter(ProjectArchitecture.project_id == project_id, ProjectArchitecture.architecture_type == architecture_type.lower())
        .first()
    )
    if not arch_entry:
        raise HTTPException(status_code=404, detail=f"Architecture info of type '{architecture_type}' not found.")
    return arch_entry
