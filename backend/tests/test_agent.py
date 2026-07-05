import pytest
import uuid
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from main import app
from database.config import Base, get_db
import models

# Use isolated in-memory SQLite database
SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Recreate tables
Base.metadata.create_all(bind=engine)

# Keep dummy session alive
keep_alive_db = TestingSessionLocal()


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db
client = TestClient(app)


def _register_and_get_auth(email: str) -> tuple[dict, str]:
    """Helper to register/login a user via client endpoints. Returns headers and user_id."""
    user_data = {
        "email": email,
        "full_name": "AI Agent Tester",
        "password": "SecurePassword123!"
    }
    reg_response = client.post("/api/auth/register", json=user_data)
    user_id = reg_response.json()["user"]["id"]
    
    login_response = client.post("/api/auth/login", json={
        "email": email,
        "password": "SecurePassword123!"
    })
    token = login_response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}, user_id


def test_ai_agent_endpoints():
    """Verify that REST router endpoints validate project ownership and return reports."""
    # Ensure correct dependency override is active for this test module
    app.dependency_overrides[get_db] = override_get_db

    # Register / login to get auth headers first
    auth_headers, user_id = _register_and_get_auth("agenttester@example.com")

    # Setup dummy project and target file
    db = TestingSessionLocal()
    project_id = uuid.uuid4()
    project = models.Project(
        id=project_id,
        user_id=uuid.UUID(user_id),
        repo_name="agent-test-repo",
        repo_owner="owner",
        repo_url="https://github.com/owner/agent-test-repo",
        status="completed"
    )
    db.add(project)
    db.commit()

    code_file = models.ProjectFile(
        project_id=project_id,
        file_path="src/main.py",
        filename="main.py",
        size_bytes=100,
        content="def hello():\n    pass\n",
        language="python"
    )
    db.add(code_file)
    db.commit()
    db.close()

    # 1. Trigger implementation plan generation
    response = client.post(
        f"/api/projects/{project_id}/agent/tasks",
        json={"issue_content": "Add login lockouts mechanism after 5 failed attempts"},
        headers=auth_headers
    )
    assert response.status_code == 200
    task_id = response.json()["id"]
    assert response.json()["status"] == "plan_generated"
    assert "Proposed Changes" in response.json()["implementation_plan"]

    # 2. List agent tasks
    response = client.get(f"/api/projects/{project_id}/agent/tasks", headers=auth_headers)
    assert response.status_code == 200
    assert len(response.json()) >= 1
    assert response.json()[0]["id"] == task_id

    # 3. Execute plan (generates code files, tests, documentation, and PR summary)
    response = client.post(f"/api/agent/tasks/{task_id}/execute", headers=auth_headers)
    assert response.status_code == 200
    res = response.json()
    assert res["status"] == "changes_generated"
    assert "proposed_changes" in res
    assert "proposed_tests" in res
    assert "proposed_docs" in res
    assert "pr_summary" in res

    # 4. Apply changes (overwrites files)
    response = client.post(f"/api/agent/tasks/{task_id}/apply", headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["status"] == "applied"

    # Verify that file has been modified in the database
    db = TestingSessionLocal()
    modified_file = db.query(models.ProjectFile).filter(
        models.ProjectFile.project_id == project_id,
        models.ProjectFile.file_path == "src/main.py"
    ).first()
    assert "lockout" in modified_file.content
    db.close()
