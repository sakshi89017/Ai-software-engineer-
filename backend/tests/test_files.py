import pytest
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


@patch("files.service.file_service.save_upload")
@patch("files.service.file_service.read_content")
@patch("files.service.file_service.delete_file")
def test_file_crud_flow(mock_delete, mock_read, mock_save):
    """Verify upload, read, list, and delete lifecycle of files."""
    headers = _get_auth_headers("fileuser@example.com")

    # Mock file_service behavior
    mock_save.return_value = {
        "filename": "test_script.py",
        "stored_path": "uploads/storage/user_id/uuid_test_script.py",
        "file_type": "py",
        "size_bytes": 100
    }
    mock_read.return_value = "print('hello world')"
    mock_delete.return_value = None

    # 1. Upload a file
    file_payload = {"upload": ("test_script.py", b"print('hello world')", "text/x-python")}
    response = client.post("/api/files/upload", files=file_payload, headers=headers)
    assert response.status_code == 201
    file_data = response.json()
    assert file_data["filename"] == "test_script.py"
    assert file_data["file_type"] == "py"
    file_id = file_data["id"]

    # 2. Get file details and content
    response = client.get(f"/api/files/{file_id}", headers=headers)
    assert response.status_code == 200
    single_file = response.json()
    assert single_file["id"] == file_id
    assert single_file["content"] == "print('hello world')"

    # 3. List files
    response = client.get("/api/files", headers=headers)
    assert response.status_code == 200
    files_list = response.json()
    assert len(files_list) >= 1
    assert any(item["id"] == file_id for item in files_list)

    # 4. Delete file
    response = client.delete(f"/api/files/{file_id}", headers=headers)
    assert response.status_code == 204

    # Verify 404 after delete
    response = client.get(f"/api/files/{file_id}", headers=headers)
    assert response.status_code == 404


@patch("files.service.file_service.save_upload")
@patch("files.service.file_service.read_content")
@patch("ai.service.ai_service.stream_reply")
def test_uploads_api_and_analysis(mock_stream, mock_read, mock_save):
    """Verify uploads API endpoints and streaming AI analysis."""
    headers = _get_auth_headers("uploaduser@example.com")

    # Mock file_service and AI streaming behavior
    mock_save.return_value = {
        "filename": "code.py",
        "stored_path": "uploads/storage/user_id/uuid_code.py",
        "file_type": "py",
        "size_bytes": 45
    }
    mock_read.return_value = "def add(a, b): return a + b"
    
    async def mock_generator(*args, **kwargs):
        yield "This code adds two numbers."
        yield " It is simple."
    mock_stream.return_value = mock_generator()

    # 1. Upload a file
    file_payload = {"upload": ("code.py", b"def add(a, b): return a + b", "text/x-python")}
    response = client.post("/api/uploads", files=file_payload, headers=headers)
    assert response.status_code == 201
    file_data = response.json()
    assert file_data["filename"] == "code.py"
    assert file_data["language"] == "py"
    file_id = file_data["id"]

    # 2. Get details (checking new fields: language, size, path, user_id)
    response = client.get(f"/api/uploads/{file_id}", headers=headers)
    assert response.status_code == 200
    single_file = response.json()
    assert single_file["id"] == file_id
    assert single_file["language"] == "py"
    assert "user_id" in single_file
    assert "size" in single_file
    assert "path" in single_file

    # 3. List uploads
    response = client.get("/api/uploads", headers=headers)
    assert response.status_code == 200
    assert len(response.json()) >= 1

    # 4. Run AI Code Analysis (streaming)
    response = client.post(
        f"/api/uploads/{file_id}/analyze",
        json={"action": "explain"},
        headers=headers
    )
    assert response.status_code == 200
    assert "text/event-stream" in response.headers["content-type"]

    # 4.5. Run AI Code Review
    response = client.post(f"/api/uploads/{file_id}/review", headers=headers)
    assert response.status_code == 200
    review_data = response.json()
    assert "quality_score" in review_data
    assert "issues" in review_data
    assert len(review_data["issues"]) > 0

    # 4.6. Export File Code Review
    for fmt in ["pdf", "markdown", "json"]:
        response = client.get(f"/api/uploads/{file_id}/review/export/{fmt}", headers=headers)
        assert response.status_code == 200

    # 4.7. Generate tests for uploaded file
    response = client.post(
        f"/api/uploads/{file_id}/generate-tests",
        json={"test_type": "unit"},
        headers=headers
    )
    assert response.status_code == 200
    test_res = response.json()
    assert "filename" in test_res
    assert "test_code" in test_res

    # 5. Delete file
    response = client.delete(f"/api/uploads/{file_id}", headers=headers)
    assert response.status_code == 204
