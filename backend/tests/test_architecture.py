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
        "full_name": "Architect Test User",
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


def test_architecture_endpoints():
    """Verify that REST router endpoints validate project ownership and return reports."""
    # Ensure correct dependency override is active for this test module
    app.dependency_overrides[get_db] = override_get_db

    # Register / login to get auth headers first
    auth_headers, user_id = _register_and_get_auth("architect@example.com")

    # Open db session AFTER user creation to align snapshots
    db = TestingSessionLocal()

    project_id = uuid.uuid4()
    project = models.Project(
        id=project_id,
        user_id=uuid.UUID(user_id),
        repo_name="api-arch-test",
        repo_owner="owner",
        repo_url="https://github.com/owner/api-arch-test",
        status="completed"
    )
    db.add(project)
    db.commit()

    code_file = models.ProjectFile(
        project_id=project_id,
        file_path="src/main.py",
        filename="main.py",
        size_bytes=100,
        content="print('hello architecture diagram')",
        language="python"
    )
    db.add(code_file)
    db.commit()

    # 1. Trigger architecture blueprint generation (returns 200 OK)
    response = client.post(
        f"/api/projects/{project_id}/architectures",
        json={"architecture_type": "system_design"},
        headers=auth_headers
    )
    assert response.status_code == 200
    assert response.json()["architecture_type"] == "system_design"
    assert "mermaid" in response.json()["content"] or "System Design" in response.json()["content"]

    # 2. List architecture reports
    response = client.get(f"/api/projects/{project_id}/architectures", headers=auth_headers)
    assert response.status_code == 200
    assert len(response.json()) >= 1
    assert response.json()[0]["architecture_type"] == "system_design"

    # 3. Retrieve detailed blueprint
    response = client.get(f"/api/projects/{project_id}/architectures/system_design", headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["architecture_type"] == "system_design"
    
    db.close()
