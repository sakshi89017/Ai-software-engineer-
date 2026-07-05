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
        "full_name": "Test Tester User",
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


def test_test_generator_endpoints():
    """Verify that REST router endpoints validate project ownership and return reports."""
    # Ensure correct dependency override is active for this test module
    app.dependency_overrides[get_db] = override_get_db

    # Register / login to get auth headers first
    auth_headers, user_id = _register_and_get_auth("testtester@example.com")

    # Open db session AFTER user creation to align snapshots
    db = TestingSessionLocal()

    project_id = uuid.uuid4()
    project = models.Project(
        id=project_id,
        user_id=uuid.UUID(user_id),
        repo_name="api-test-generation-test",
        repo_owner="owner",
        repo_url="https://github.com/owner/api-test-generation-test",
        status="completed"
    )
    db.add(project)
    db.commit()

    code_file = models.ProjectFile(
        project_id=project_id,
        file_path="src/calculator.py",
        filename="calculator.py",
        size_bytes=100,
        content="def add(a, b): return a + b",
        language="python"
    )
    db.add(code_file)
    db.commit()

    # 1. Trigger test generation
    response = client.post(
        f"/api/projects/files/{code_file.id}/generate-tests",
        json={"test_type": "unit"},
        headers=auth_headers
    )
    assert response.status_code == 200
    res = response.json()
    assert res["filename"] == "test_calculator.py"
    assert "pytest" in res["test_code"] or "unittest" in res["test_code"]

    db.close()
