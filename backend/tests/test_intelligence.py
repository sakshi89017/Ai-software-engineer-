import pytest
import uuid
import json
from unittest.mock import patch, MagicMock
import sys
import os

# Add backend directory to Python path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from projects.service import extract_intelligence_metadata
from ai.service import ai_service
from ai.router import _build_project_intelligence_prompt
from database.config import Base, get_db, SessionLocal
import models


def test_regex_metadata_extraction():
    """Verify that regex scanner extracts imports, classes, functions, routes, models, and env variables."""
    code_content = """
import os
import sys
from fastapi import APIRouter

router = APIRouter()

class UserProfile(Base):
    __tablename__ = "user_profiles"
    id = Column(Integer, primary_key=True)

@router.get("/api/v1/profile")
def get_user_profile():
    secret_key = os.getenv("SECRET_KEY")
    # TODO: Refactor profile retrieval
    return {"status": "ok"}
    """
    
    metadata = extract_intelligence_metadata(code_content, "main.py")
    
    assert "os" in metadata["imports"]
    assert "fastapi" in metadata["imports"]
    assert "UserProfile" in metadata["classes"]
    assert "UserProfile" in metadata["models"]
    assert "get_user_profile" in metadata["functions"]
    assert "/api/v1/profile" in metadata["routes"]
    assert "SECRET_KEY" in metadata["envs"]
    assert len(metadata["todos"]) == 1
    assert "Refactor profile retrieval" in metadata["todos"][0]


def test_gemini_generate_embeddings():
    """Verify embedding generation falls back or calls client wrapper."""
    texts = ["hello intelligence", "test embedding vector"]
    embeddings = ai_service.generate_embeddings(texts)
    assert len(embeddings) == 2
    assert len(embeddings[0]) == 768


@patch("projects.service.chroma_client")
def test_project_intelligence_prompt_builder(mock_chroma):
    """Verify that prompt builder injects routes, models, environment variables, and TODO comments."""
    # Setup mock database session
    db = MagicMock()
    
    # Mock project
    mock_project = MagicMock()
    mock_project.repo_name = "test-repo"
    mock_project.repo_owner = "test-owner"
    mock_project.framework = "FastAPI"
    mock_project.languages = "python,javascript"
    
    # Mock project file with metadata
    mock_file = MagicMock()
    mock_file.file_path = "src/app.py"
    mock_file.intelligence_metadata = json.dumps({
        "classes": ["App"],
        "functions": ["start"],
        "imports": ["os"],
        "routes": ["/api/v1/start"],
        "models": ["AppModel"],
        "envs": ["APP_PORT"],
        "todos": ["Implement start endpoint"]
    })
    
    db.query().filter().first.return_value = mock_project
    db.query().filter().all.return_value = [mock_file]
    
    # Query prompts
    prompt_routes = _build_project_intelligence_prompt(db, uuid.uuid4(), "Show all API routes")
    assert "/api/v1/start" in prompt_routes
    
    prompt_models = _build_project_intelligence_prompt(db, uuid.uuid4(), "Show database models")
    assert "AppModel" in prompt_models
    
    prompt_todos = _build_project_intelligence_prompt(db, uuid.uuid4(), "What are the TODO comments?")
    assert "Implement start endpoint" in prompt_todos
