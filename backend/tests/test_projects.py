import pytest
import uuid
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from unittest.mock import patch
import sys
import os

# Add backend directory to Python path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from main import app
from database.config import Base, get_db
import models

# Use an isolated in-memory SQLite database
SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Create schema
Base.metadata.create_all(bind=engine)

def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()

app.dependency_overrides[get_db] = override_get_db
client = TestClient(app)


def _get_auth_headers(email: str) -> dict:
    """Helper to register/login a user and return Auth headers."""
    user_data = {
        "email": email,
        "full_name": "Test User",
        "password": "SecurePassword123!"
    }
    client.post("/api/auth/register", json=user_data)
    login_response = client.post("/api/auth/login", json={
        "email": email,
        "password": "SecurePassword123!"
    })
    token = login_response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@patch("projects.router.import_github_repository_bg")
def test_project_crud_flow(mock_bg_import):
    """Verify projects and github import crud endpoints."""
    headers = _get_auth_headers("projectuser@example.com")

    # 1. Trigger Github Import
    payload = {"repo_url": "https://github.com/octocat/Spoon-Knife"}
    response = client.post("/api/github/import", json=payload, headers=headers)
    assert response.status_code == 201
    proj_data = response.json()
    assert proj_data["repo_url"] == "https://github.com/octocat/Spoon-Knife"
    assert proj_data["status"] == "pending"
    project_id = proj_data["id"]

    # Verify background task was called
    mock_bg_import.assert_called_once()

    # 2. Get list of projects
    response = client.get("/api/projects", headers=headers)
    assert response.status_code == 200
    projects_list = response.json()
    assert len(projects_list) >= 1
    assert any(p["id"] == project_id for p in projects_list)

    # 3. Add a mock ProjectFile using DB directly to test details and file retrieval
    db = TestingSessionLocal()
    db_file = models.ProjectFile(
        project_id=uuid.UUID(project_id),
        file_path="src/main.py",
        filename="main.py",
        size_bytes=100,
        content="print('hello projects')",
        language="python"
    )
    db.add(db_file)
    db.commit()
    db.refresh(db_file)
    file_id = str(db_file.id)
    db.close()

    # 4. Get project details (including the files list tree)
    response = client.get(f"/api/projects/{project_id}", headers=headers)
    assert response.status_code == 200
    detail = response.json()
    assert detail["id"] == project_id
    assert len(detail["files"]) == 1
    assert detail["files"][0]["file_path"] == "src/main.py"

    # 5. Get project file content
    response = client.get(f"/api/projects/files/{file_id}", headers=headers)
    assert response.status_code == 200
    file_info = response.json()
    assert file_info["content"] == "print('hello projects')"

    # 6. Delete project
    response = client.delete(f"/api/projects/{project_id}", headers=headers)
    assert response.status_code == 204

    # Verify project is gone
    response = client.get(f"/api/projects/{project_id}", headers=headers)
    assert response.status_code == 404
