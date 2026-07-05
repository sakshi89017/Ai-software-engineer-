import uuid
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database.config import get_db
from models.user import User
from models.project import Project, ProjectFile
from auth.dependencies import get_current_user
from schemas.project import GithubImportRequest, ProjectOut, ProjectDetailOut, ProjectFileOut
from projects.service import import_github_repository_bg

router = APIRouter(tags=["projects"])


def _get_owned_project(db: Session, project_id: uuid.UUID, user_id: uuid.UUID) -> Project:
    record = db.query(Project).filter(Project.id == project_id).first()
    if not record or record.user_id != user_id:
        raise HTTPException(status_code=404, detail="Project not found")
    return record


@router.post("/github/import", response_model=ProjectOut, status_code=status.HTTP_201_CREATED)
def import_repository(
    payload: GithubImportRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Initialize Project entry
    project = Project(
        user_id=current_user.id,
        repo_url=payload.repo_url,
        status="pending",
        total_files=0,
        total_lines=0,
        size_bytes=0,
    )
    db.add(project)
    db.commit()
    db.refresh(project)

    # Queue the clone and index task
    background_tasks.add_task(import_github_repository_bg, project.id, payload.repo_url)

    return project


@router.get("/projects", response_model=list[ProjectOut])
def list_projects(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return (
        db.query(Project)
        .filter(Project.user_id == current_user.id)
        .order_by(Project.created_at.desc())
        .all()
    )


@router.get("/projects/{project_id}", response_model=ProjectDetailOut)
def get_project(
    project_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    project = _get_owned_project(db, project_id, current_user.id)
    return project


@router.get("/projects/files/{file_id}", response_model=ProjectFileOut)
def get_project_file(
    file_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    record = db.query(ProjectFile).filter(ProjectFile.id == file_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="File not found")

    # Access control check through parent project ownership
    _get_owned_project(db, record.project_id, current_user.id)

    return record


class TestGenerateRequest(BaseModel):
    test_type: str  # "unit" | "integration" | "mock_data" | "edge_cases"

class TestGenerateResponse(BaseModel):
    filename: str
    test_code: str

@router.post("/projects/files/{file_id}/generate-tests", response_model=TestGenerateResponse)
def generate_project_file_tests(
    file_id: uuid.UUID,
    payload: TestGenerateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from pydantic import BaseModel
    from projects.test_generator import generate_tests_for_code

    record = db.query(ProjectFile).filter(ProjectFile.id == file_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="File not found")

    # Access control check through parent project ownership
    _get_owned_project(db, record.project_id, current_user.id)

    test_code = generate_tests_for_code(record.filename, record.language or "python", record.content, payload.test_type)

    # Determine filename suffix
    name_parts = record.filename.rsplit(".", 1)
    base_name = name_parts[0]
    ext = f".{name_parts[1]}" if len(name_parts) > 1 else ""
    
    # Standard testing file naming
    test_filename = f"test_{base_name}{ext}"
    if record.language == "go":
        test_filename = f"{base_name}_test.go"
    elif record.language in ("javascript", "typescript"):
        test_filename = f"{base_name}.test{ext}"

    return TestGenerateResponse(
        filename=test_filename,
        test_code=test_code
    )






@router.delete("/projects/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(
    project_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    project = _get_owned_project(db, project_id, current_user.id)
    db.delete(project)
    db.commit()

    # Clean up ChromaDB collection
    try:
        from projects.service import chroma_client
        chroma_client.delete_collection(name=f"project_{project_id}")
    except Exception:
        pass

    return None
