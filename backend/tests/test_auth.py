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

# Use an isolated in-memory SQLite database for test runs
SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Create the schema in the memory database
Base.metadata.create_all(bind=engine)

def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()

# Inject the test database session into FastAPI dependency resolution
app.dependency_overrides[get_db] = override_get_db

client = TestClient(app)


def test_health_check():
    """Verify that the health check endpoint returns 200 OK."""
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "devpilot-ai-backend"}


def test_register_and_login():
    """Verify that a user can register and then log in successfully."""
    # 1. Register a new user
    user_data = {
        "email": "testuser@example.com",
        "full_name": "Test User",
        "password": "SecurePassword123!"
    }
    response = client.post("/api/auth/register", json=user_data)
    assert response.status_code == 201
    data = response.json()
    assert "user" in data
    assert data["user"]["email"] == "testuser@example.com"
    assert data["user"]["full_name"] == "Test User"
    assert "id" in data["user"]

    # 2. Login with the user's credentials
    login_data = {
        "email": "testuser@example.com",
        "password": "SecurePassword123!"
    }
    response = client.post("/api/auth/login", json=login_data)
    assert response.status_code == 200
    login_response = response.json()
    assert "access_token" in login_response
    assert "refresh_token" in login_response
    assert login_response["token_type"] == "bearer"
    assert login_response["user"]["email"] == "testuser@example.com"
