import uuid
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from database.config import get_db
from models.user import User
from models.project import Project, ProjectAgentTask
from auth.dependencies import get_current_user
from projects.agent import generate_plan, generate_code_changes, apply_code_changes

router = APIRouter(tags=["agent"])

class TaskCreateRequest(BaseModel):
    issue_content: str

class TaskOut(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    issue_content: str
    implementation_plan: Optional[str]
    proposed_changes: Optional[str]
    proposed_tests: Optional[str]
    proposed_docs: Optional[str]
    pr_summary: Optional[str]
    status: str
    created_at: datetime

    class Config:
        from_attributes = True

def _get_owned_project(db: Session, project_id: uuid.UUID, user_id: uuid.UUID) -> Project:
    record = db.query(Project).filter(Project.id == project_id).first()
    if not record or record.user_id != user_id:
        raise HTTPException(status_code=404, detail="Project not found")
    return record

@router.post("/projects/{project_id}/agent/tasks", response_model=TaskOut)
def create_agent_task(
    project_id: uuid.UUID,
    payload: TaskCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_owned_project(db, project_id, current_user.id)
    if not payload.issue_content.strip():
        raise HTTPException(status_code=400, detail="Issue description cannot be empty.")
    
    return generate_plan(project_id, payload.issue_content, db)

@router.get("/projects/{project_id}/agent/tasks", response_model=List[TaskOut])
def list_agent_tasks(
    project_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_owned_project(db, project_id, current_user.id)
    return (
        db.query(ProjectAgentTask)
        .filter(ProjectAgentTask.project_id == project_id)
        .order_by(ProjectAgentTask.created_at.desc())
        .all()
    )

@router.post("/agent/tasks/{task_id}/execute", response_model=TaskOut)
def execute_agent_plan(
    task_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = db.query(ProjectAgentTask).filter(ProjectAgentTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    _get_owned_project(db, task.project_id, current_user.id)
    return generate_code_changes(task_id, db)

@router.post("/agent/tasks/{task_id}/apply", response_model=TaskOut)
def apply_agent_changes(
    task_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = db.query(ProjectAgentTask).filter(ProjectAgentTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    _get_owned_project(db, task.project_id, current_user.id)
    return apply_code_changes(task_id, db)
