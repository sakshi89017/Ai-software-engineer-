import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
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


def test_chat_crud_flow():
    """Verify standard CRUD lifecycle of a chat for a single user."""
    headers = _get_auth_headers("chatuser1@example.com")

    # 1. Create a Chat
    response = client.post("/api/chat/new", json={"title": "My Test Chat"}, headers=headers)
    assert response.status_code == 201
    chat_data = response.json()
    assert chat_data["title"] == "My Test Chat"
    chat_id = chat_data["id"]

    # 2. Get Single Chat
    response = client.get(f"/api/chat/{chat_id}", headers=headers)
    assert response.status_code == 200
    single_chat = response.json()
    assert single_chat["id"] == chat_id
    assert single_chat["title"] == "My Test Chat"
    assert "messages" in single_chat

    # 3. List Chat History
    response = client.get("/api/chat/history", headers=headers)
    assert response.status_code == 200
    history = response.json()
    assert len(history) >= 1
    assert any(item["id"] == chat_id for item in history)

    # 4. Search Chat History
    response = client.get("/api/chat/history?search=Test", headers=headers)
    assert response.status_code == 200
    history_search = response.json()
    assert len(history_search) >= 1
    assert all("Test" in item["title"] for item in history_search)

    # Search for a term that won't match
    response = client.get("/api/chat/history?search=NonExistentTitle", headers=headers)
    assert response.status_code == 200
    history_search_empty = response.json()
    assert len(history_search_empty) == 0

    # 5. Rename Chat
    response = client.patch(f"/api/chat/{chat_id}", json={"title": "Renamed Chat"}, headers=headers)
    assert response.status_code == 200
    renamed_chat = response.json()
    assert renamed_chat["title"] == "Renamed Chat"

    # 6. Delete Chat
    response = client.delete(f"/api/chat/{chat_id}", headers=headers)
    assert response.status_code == 204

    # Verify 404 after delete
    response = client.get(f"/api/chat/{chat_id}", headers=headers)
    assert response.status_code == 404


def test_chat_cross_user_isolation():
    """Verify that User B cannot access or modify User A's chats."""
    headers_a = _get_auth_headers("user_a@example.com")
    headers_b = _get_auth_headers("user_b@example.com")

    # User A creates a chat
    response = client.post("/api/chat/new", json={"title": "User A Private Chat"}, headers=headers_a)
    chat_id = response.json()["id"]

    # User B tries to fetch User A's chat -> should return 404
    response = client.get(f"/api/chat/{chat_id}", headers=headers_b)
    assert response.status_code == 404

    # User B tries to rename User A's chat -> should return 404
    response = client.patch(f"/api/chat/{chat_id}", json={"title": "Hacked Title"}, headers=headers_b)
    assert response.status_code == 404

    # User B tries to delete User A's chat -> should return 404
    response = client.delete(f"/api/chat/{chat_id}", headers=headers_b)
    assert response.status_code == 404

    # Verify User A's chat is still intact and readable by User A
    response = client.get(f"/api/chat/{chat_id}", headers=headers_a)
    assert response.status_code == 200
    assert response.json()["title"] == "User A Private Chat"
