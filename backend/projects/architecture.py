import uuid
import logging
from datetime import datetime, timezone
from sqlalchemy.orm import Session

from models.project import Project, ProjectFile, ProjectArchitecture
from ai.service import ai_service, DEFAULT_MODEL
from google.genai import types

logger = logging.getLogger("devpilot.architecture")

ARCH_PROMPTS = {
    "system_design": (
        "You are an expert Principal Solutions Architect. Generate System Design documentation for this project.\n"
        "Describe the architectural patterns, layers, high-level decisions, and non-functional requirements.\n"
        "Embed a Mermaid diagram representing the layers of the application.\n\n"
        "PROJECT SOURCE CODE FILES:\n\n{code_context}"
    ),
    "architecture_diagram": (
        "You are an expert Principal Solutions Architect. Generate an Architecture Diagram for this project.\n"
        "Explain the key architectural blocks and interactions. You MUST include a beautiful, detailed Mermaid diagram (graph TD or graph LR)\n"
        "illustrating the component architecture and data connections.\n\n"
        "PROJECT SOURCE CODE FILES:\n\n{code_context}"
    ),
    "database_schema": (
        "You are an expert Database Architect. Generate Database Schema documentation for this project.\n"
        "Explain the table setups, relationships, keys, indices. You MUST include a beautiful Mermaid erDiagram\n"
        "mapping out the tables, columns, and relations.\n\n"
        "PROJECT SOURCE CODE FILES:\n\n{code_context}"
    ),
    "folder_structure": (
        "You are an expert Technical Writer. Document the Project Folder Structure.\n"
        "Explain the purpose of key directories. You MUST include a tree diagram (or standard text folder structure) and a Mermaid flowchart map\n"
        "depicting directory organization.\n\n"
        "PROJECT SOURCE CODE FILES:\n\n{code_context}"
    ),
    "api_flow": (
        "You are an expert Integration Engineer. Generate the API Flow explanation for this project.\n"
        "Detail the request-response lifecycle for core endpoints. You MUST include a Mermaid flowchart representing\n"
        "the request routing, middleware interceptors, controller handlers, database queries, and response compilation.\n\n"
        "PROJECT SOURCE CODE FILES:\n\n{code_context}"
    ),
    "auth_flow": (
        "You are an expert Security Engineer. Generate the Authentication Flow explanation for this project.\n"
        "Detail how users are registered, logged in, passwords hashed, and how session/JWT authentication headers are verified.\n"
        "You MUST include a beautiful Mermaid flowchart or sequenceDiagram representing the user credentials check and JWT generation/validation.\n\n"
        "PROJECT SOURCE CODE FILES:\n\n{code_context}"
    ),
    "sequence_diagram": (
        "You are an expert Software Engineer. Generate a Sequence Diagram representing core user operations flow.\n"
        "Describe step-by-step process flow between objects. You MUST include a beautiful, complete Mermaid sequenceDiagram\n"
        "showing interactions between User, Frontend, Router, Service, Database.\n\n"
        "PROJECT SOURCE CODE FILES:\n\n{code_context}"
    ),
    "component_diagram": (
        "You are an expert Systems Analyst. Generate a Component Diagram for the codebase.\n"
        "Describe compile-time and runtime modular units. You MUST include a beautiful Mermaid graph showing modules,\n"
        "packages, controllers, repositories, and interfaces.\n\n"
        "PROJECT SOURCE CODE FILES:\n\n{code_context}"
    ),
    "deployment_diagram": (
        "You are an expert DevOps Architect. Generate a Deployment Diagram for the production layout.\n"
        "Describe physical servers, cloud containers, CDN, database clusters, and load balancers.\n"
        "You MUST include a beautiful Mermaid diagram (graph TB or graph LR) showing the physical topology of the system.\n\n"
        "PROJECT SOURCE CODE FILES:\n\n{code_context}"
    )
}

def generate_architecture_doc(project_id: uuid.UUID, arch_type: str, db: Session) -> str:
    """
    Loads project files, invokes Gemini model to generate system designs and Mermaid charts,
    and stores/updates the result in the database.
    """
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise Exception("Project not found")

    # Load source code files
    source_files = (
        db.query(ProjectFile)
        .filter(ProjectFile.project_id == project_id)
        .order_by(ProjectFile.file_path.asc())
        .all()
    )

    code_extensions = {".py", ".js", ".ts", ".jsx", ".tsx", ".java", ".go", ".rs", ".c", ".cpp", ".h", ".sql"}
    review_files = [f for f in source_files if f.filename.endswith(tuple(code_extensions))]

    code_context = ""
    for idx, f in enumerate(review_files[:12]):
        code_context += f"--- FILE PATH: {f.file_path} ---\n{f.content[:5000]}\n\n"

    template = ARCH_PROMPTS.get(arch_type, "Provide architecture explanation for this codebase:\n\n{code_context}")
    prompt = template.format(code_context=code_context)

    mock_charts = {
        "system_design": (
            "# System Design\n\nFallback mock system layout.\n\n"
            "```mermaid\n"
            "graph TD\n"
            "  Client[Client UI] --> Gateway[API Gateway]\n"
            "  Gateway --> Auth[Auth Service]\n"
            "  Gateway --> Core[Core Engine]\n"
            "  Core --> DB[(Database)]\n"
            "```\n"
        ),
        "architecture_diagram": (
            "# Architecture Diagram\n\nFallback mock components map.\n\n"
            "```mermaid\n"
            "graph LR\n"
            "  UI[Frontend App] --> REST[FastAPI Router]\n"
            "  REST --> DB[(SQLite Database)]\n"
            "  REST --> Gemini[Gemini GenAI client]\n"
            "```\n"
        ),
        "database_schema": (
            "# Database Schema\n\nFallback mock database schema.\n\n"
            "```mermaid\n"
            "erDiagram\n"
            "  USER ||--o{ PROJECT : owns\n"
            "  PROJECT ||--o{ FILE : contains\n"
            "  PROJECT ||--o{ DOCUMENTATION : has\n"
            "```\n"
        ),
        "folder_structure": (
            "# Folder Structure\n\nFallback mock folder layout.\n\n"
            "```mermaid\n"
            "graph TD\n"
            "  Root[project-root] --> Backend[backend]\n"
            "  Root --> Frontend[frontend]\n"
            "  Backend --> API[api]\n"
            "  Frontend --> Src[src]\n"
            "```\n"
        ),
        "api_flow": (
            "# API Flow\n\nFallback mock request-response flow.\n\n"
            "```mermaid\n"
            "graph TD\n"
            "  Req[HTTP Request] --> Auth[Token Middleware]\n"
            "  Auth --> Route[FastAPI Route Handler]\n"
            "  Route --> Resp[HTTP Response]\n"
            "```\n"
        ),
        "auth_flow": (
            "# Authentication Flow\n\nFallback mock authentication flow.\n\n"
            "```mermaid\n"
            "graph TD\n"
            "  Login[User Login Credentials] --> Ver[Password Check]\n"
            "  Ver --> JWT[Generate JWT Access Token]\n"
            "  JWT --> Header[Set Authorization Header]\n"
            "```\n"
        ),
        "sequence_diagram": (
            "# Sequence Diagram\n\nFallback mock sequence diagram.\n\n"
            "```mermaid\n"
            "sequenceDiagram\n"
            "  User->>Frontend: Click Trigger Action\n"
            "  Frontend->>Backend: API Request\n"
            "  Backend->>Database: Query State\n"
            "  Database-->>Backend: Return Result\n"
            "  Backend-->>Frontend: Response\n"
            "```\n"
        ),
        "component_diagram": (
            "# Component Diagram\n\nFallback mock component diagram.\n\n"
            "```mermaid\n"
            "graph TD\n"
            "  subsystem[API Layer] --> service[Service Module]\n"
            "  service --> db[Data Layer]\n"
            "```\n"
        ),
        "deployment_diagram": (
            "# Deployment Diagram\n\nFallback mock deployment topology.\n\n"
            "```mermaid\n"
            "graph LR\n"
            "  Vercel[Vercel CDN] --> Render[Render Backend Instance]\n"
            "  Render --> SQLite[(SQLite Cloud/Local DB)]\n"
            "```\n"
        )
    }

    content = ""
    if not ai_service._has_key:
        content = mock_charts.get(arch_type, "# Architecture\n\nAI generation mock fallback.")
    else:
        try:
            response = ai_service._client.models.generate_content(
                model=DEFAULT_MODEL,
                contents=prompt
            )
            content = response.text
        except Exception as e:
            logger.warning("Gemini AI architecture generation failed, using mock: %s", e)
            content = mock_charts.get(arch_type, "# Architecture\n\nAI generation mock fallback.")

    # Save to db
    arch_entry = (
        db.query(ProjectArchitecture)
        .filter(ProjectArchitecture.project_id == project_id, ProjectArchitecture.architecture_type == arch_type)
        .first()
    )
    if arch_entry:
        arch_entry.content = content
    else:
        arch_entry = ProjectArchitecture(
            project_id=project_id,
            architecture_type=arch_type,
            content=content
        )
        db.add(arch_entry)

    db.commit()
    db.refresh(arch_entry)
    return content
