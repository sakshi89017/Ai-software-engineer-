import pytest
import uuid
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from unittest.mock import patch

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from main import app
from database.config import Base, get_db
import models
from projects.code_review import run_code_review, export_markdown_report, export_pdf_report

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

# Keep a dummy session open to prevent SQLite in-memory database from being wiped between connections
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
        "full_name": "Reviewer Test User",
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


def test_code_review_analysis_and_exporters():
    """Verify code review scoring, issues list inserts, and Markdown/PDF exports."""
    # Ensure correct dependency override is active for this test module
    app.dependency_overrides[get_db] = override_get_db

    # 1. Setup user first (creates SQLite database state)
    headers, user_id = _register_and_get_auth("reviewer@example.com")
    
    # 2. Open db session AFTER user creation to align snapshots
    db = TestingSessionLocal()
    
    project_id = uuid.uuid4()
    project = models.Project(
        id=project_id,
        user_id=uuid.UUID(user_id),
        repo_name="review-test",
        repo_owner="owner",
        repo_url="https://github.com/owner/review-test",
        status="completed"
    )
    db.add(project)
    db.commit()

    code_file = models.ProjectFile(
        project_id=project_id,
        file_path="src/index.js",
        filename="index.js",
        size_bytes=150,
        content="const sql = 'SELECT * FROM users WHERE id = ' + id; db.execute(sql);",
        language="javascript"
    )
    db.add(code_file)
    db.commit()

    # Trigger review (calls mock since ai key is offline in test suite)
    report = run_code_review(project_id, db)
    assert report.quality_score == 88
    assert report.security_score == 90
    assert report.performance_score == 98
    assert report.architecture_score == 100

    # Retrieve saved issues
    issues = db.query(models.CodeReviewIssue).filter(models.CodeReviewIssue.report_id == report.id).all()
    assert len(issues) == 2
    assert any(i.category == "security" for i in issues)
    assert any(i.category == "performance" for i in issues)

    # Verify Markdown export
    md_report = export_markdown_report(report, issues, "owner/review-test")
    assert "AI Code Review Report" in md_report
    assert "Potential Hardcoded Secret" in md_report

    # Verify PDF export compiles bytes
    pdf_bytes = export_pdf_report(report, issues, "owner/review-test")
    assert isinstance(pdf_bytes, bytes)
    assert len(pdf_bytes) > 0
    db.close()


def test_code_review_endpoints():
    """Verify that REST router endpoints validate project ownership and return reports."""
    # Ensure correct dependency override is active for this test module
    app.dependency_overrides[get_db] = override_get_db

    # Register / login to get auth headers first
    auth_headers, user_id = _register_and_get_auth("reviewapi@example.com")

    # Open db session AFTER user creation to align snapshots
    db = TestingSessionLocal()

    project_id = uuid.uuid4()
    project = models.Project(
        id=project_id,
        user_id=uuid.UUID(user_id),
        repo_name="api-review-test",
        repo_owner="owner",
        repo_url="https://github.com/owner/api-review-test",
        status="completed"
    )
    db.add(project)
    db.commit()

    # 1. Trigger code review (returns 202 Accepted)
    response = client.post(f"/api/projects/{project_id}/review", headers=auth_headers)
    assert response.status_code == 202
    assert response.json()["project_id"] == str(project_id)

    # Run review manually to generate db entries for GET endpoints
    report = run_code_review(project_id, db)
    report_id = report.id

    # 2. List code reviews
    response = client.get(f"/api/projects/{project_id}/reviews", headers=auth_headers)
    assert response.status_code == 200
    assert len(response.json()) >= 1
    assert response.json()[0]["id"] == str(report_id)

    # 3. Retrieve detailed report
    response = client.get(f"/api/reviews/{report_id}", headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["quality_score"] == 95
    assert len(response.json()["issues"]) == 0

    # 4. Export report (JSON)
    response = client.get(f"/api/reviews/{report_id}/export/json", headers=auth_headers)
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/json"
    assert "codereview" in response.headers["content-disposition"]

    # 5. Export report (Markdown)
    response = client.get(f"/api/reviews/{report_id}/export/markdown", headers=auth_headers)
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/markdown")

    # 6. Export report (PDF)
    response = client.get(f"/api/reviews/{report_id}/export/pdf", headers=auth_headers)
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    db.close()
