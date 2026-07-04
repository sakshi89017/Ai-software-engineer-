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
app.include_router(files_router)
