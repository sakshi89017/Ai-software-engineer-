"""
The AI Software Engineer - FastAPI application entrypoint.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os

from database.config import Base, engine
import models  # noqa: F401 - ensures models are registered on Base before create_all
from api.auth_routes import router as auth_router
from ai.router import router as chat_router
from files.router import router as files_router
from projects.router import router as projects_router
from projects.code_review_router import router as code_review_router
from projects.documentation_router import router as doc_router
from projects.architecture_router import router as arch_router
from projects.analytics_router import router as analytics_router
from projects.team_router import router as team_router
from projects.agent_router import router as agent_router

app = FastAPI(
    title="The AI Software Engineer API",
    description="AI-powered software engineering assistant backend",
    version="1.0.0",
)

# CORS
origins = os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)



@app.get("/api/health")
def health_check():
    return {"status": "ok", "service": "the-ai-software-engineer-backend"}


app.include_router(auth_router)
app.include_router(chat_router)
app.include_router(files_router, prefix="/uploads")
app.include_router(files_router, prefix="/api/uploads")
app.include_router(files_router, prefix="/api/files")
app.include_router(projects_router)
app.include_router(projects_router, prefix="/api")
app.include_router(code_review_router)
app.include_router(code_review_router, prefix="/api")
app.include_router(doc_router)
app.include_router(doc_router, prefix="/api")
app.include_router(arch_router)
app.include_router(arch_router, prefix="/api")
app.include_router(analytics_router)
app.include_router(analytics_router, prefix="/api")
app.include_router(team_router)
app.include_router(team_router, prefix="/api")
app.include_router(agent_router)
app.include_router(agent_router, prefix="/api")
