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
        "full_name": "Team Collab Tester",
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


def test_team_collaboration_endpoints():
    """Verify that REST router endpoints validate project ownership and return reports."""
    # Ensure correct dependency override is active for this test module
    app.dependency_overrides[get_db] = override_get_db

    # Register / login to get auth headers first
    auth_headers, user_id = _register_and_get_auth("teamtester@example.com")

    # 1. Create a Team
    response = client.post(
        "/api/teams",
        json={"name": "DevPilot Core Team"},
        headers=auth_headers
    )
    assert response.status_code == 200
    team_id = response.json()["id"]
    assert response.json()["name"] == "DevPilot Core Team"

    # 2. List teams
    response = client.get("/api/teams", headers=auth_headers)
    assert response.status_code == 200
    assert len(response.json()) >= 1
    assert response.json()[0]["name"] == "DevPilot Core Team"

    # 3. Create Invitation
    response = client.post(
        f"/api/teams/{team_id}/invitations",
        json={"email": "invited_user@example.com", "role": "collaborator"},
        headers=auth_headers
    )
    assert response.status_code == 200
    assert response.json()["email"] == "invited_user@example.com"
    assert response.json()["status"] == "pending"

    # 4. Get Team Details
    response = client.get(f"/api/teams/{team_id}", headers=auth_headers)
    assert response.status_code == 200
    res = response.json()
    assert res["name"] == "DevPilot Core Team"
    assert len(res["members"]) == 1
    assert res["members"][0]["email"] == "teamtester@example.com"
    assert len(res["invitations"]) == 1
    assert res["invitations"][0]["email"] == "invited_user@example.com"

    # Setup dummy project
    db = TestingSessionLocal()
    project_id = uuid.uuid4()
    project = models.Project(
        id=project_id,
        user_id=uuid.UUID(user_id),
        repo_name="collab-test-repo",
        repo_owner="owner",
        repo_url="https://github.com/owner/collab-test-repo",
        status="completed"
    )
    db.add(project)
    db.commit()
    db.close()

    # 5. Post comment on Project
    response = client.post(
        f"/api/projects/{project_id}/comments",
        json={"content": "I noticed an issue with imports here, @invited_user@example.com!"},
        headers=auth_headers
    )
    assert response.status_code == 200
    assert "invited_user" in response.json()["content"]

    # 6. Retrieve comments
    response = client.get(f"/api/projects/{project_id}/comments", headers=auth_headers)
    assert response.status_code == 200
    assert len(response.json()) == 1
    assert response.json()[0]["content"] == "I noticed an issue with imports here, @invited_user@example.com!"
