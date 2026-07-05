import io
import uuid
import json
import logging
from datetime import datetime, timezone
from typing import List, Optional
from sqlalchemy.orm import Session

from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle

from database.config import SessionLocal
from models.project import Project, ProjectFile, ProjectDocumentation
from ai.service import ai_service, DEFAULT_MODEL
from google.genai import types

logger = logging.getLogger("devpilot.documentation")

DOC_PROMPTS = {
    "readme": (
        "You are an expert AI Technical Writer. Generate a comprehensive, professional README.md for the following project.\n"
        "Include a title, description, features list, installation instructions, usage guidelines, and a folder structure explanation.\n"
        "Make it look production-ready.\n\n"
        "PROJECT SOURCE CODE FILES:\n\n{code_context}"
    ),
    "api": (
        "You are an expert AI Technical Writer. Generate detailed API Documentation for this project.\n"
        "Identify and document every REST API route, endpoint path, HTTP method (GET, POST, etc.), request parameters/body schemas,\n"
        "response codes, and example payloads.\n\n"
        "PROJECT SOURCE CODE FILES:\n\n{code_context}"
    ),
    "function": (
        "You are an expert AI Technical Writer. Generate Function Documentation for this project.\n"
        "List all key helper functions and utility procedures across the codebase. Explain their purpose, inputs, outputs,\n"
        "and return types.\n\n"
        "PROJECT SOURCE CODE FILES:\n\n{code_context}"
    ),
    "class": (
        "You are an expert AI Technical Writer. Generate Class Documentation for this project.\n"
        "List all main classes and structures across the codebase. Explain their responsibilities, member attributes,\n"
        "method signatures, inheritance, and dependencies.\n\n"
        "PROJECT SOURCE CODE FILES:\n\n{code_context}"
    ),
    "database": (
        "You are an expert AI Technical Writer. Generate Database Schema Documentation for this project.\n"
        "Identify all database models, table schemas, attributes, columns, primary/foreign keys, and model relationships.\n"
        "Format it clearly as database schemas.\n\n"
        "PROJECT SOURCE CODE FILES:\n\n{code_context}"
    ),
    "architecture": (
        "You are an expert AI Technical Writer. Generate an Architecture Explanation for this project.\n"
        "Explain the overall system architecture, design patterns used, directory structure, data flow diagrams (in text),\n"
        "major library dependencies, and security/auth setups.\n\n"
        "PROJECT SOURCE CODE FILES:\n\n{code_context}"
    )
}

def generate_documentation(project_id: uuid.UUID, doc_type: str, db: Session) -> str:
    """
    Retrieves project context, runs Gemini AI model to generate technical documentation,
    and persists the output in the database (overwriting previous entries of same doc_type).
    """
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise Exception("Project not found")

    # Load source code files (limiting to source code extensions)
    source_files = (
        db.query(ProjectFile)
        .filter(ProjectFile.project_id == project_id)
        .order_by(ProjectFile.file_path.asc())
        .all()
    )

    code_extensions = {".py", ".js", ".ts", ".jsx", ".tsx", ".java", ".go", ".rs", ".c", ".cpp", ".h", ".sql"}
    review_files = [f for f in source_files if f.filename.endswith(tuple(code_extensions))]

    code_context = ""
    for idx, f in enumerate(review_files[:12]):  # Limit context to first 12 code files to avoid token overflow
        code_context += f"--- FILE PATH: {f.file_path} ---\n{f.content[:5000]}\n\n"

    template = DOC_PROMPTS.get(doc_type, "Document this project:\n\n{code_context}")
    prompt = template.format(code_context=code_context)

    content = ""
    if not ai_service._has_key:
        content = (
            f"# {doc_type.upper()} Documentation (Sandbox Mock Mode)\n\n"
            f"This is a fallback placeholder report generated for the repository: **{project.repo_owner}/{project.repo_name}**.\n\n"
            "### Heuristics & Summary\n"
            f"- Project framework: {project.framework or 'Generic'}\n"
            f"- Primary languages: {project.languages or 'Unknown'}\n"
            f"- Total files indexed: {project.total_files}\n"
            f"- Total lines of code: {project.total_lines}\n\n"
            "AI generation completed successfully in mock mode."
        )
    else:
        try:
            response = ai_service._client.models.generate_content(
                model=DEFAULT_MODEL,
                contents=prompt
            )
            content = response.text
        except Exception as e:
            logger.warning("Gemini AI generation failed, using mock documentation: %s", e)
            content = f"# {doc_type.upper()} Documentation\n\nAI generation failed: {str(e)}"

    # Check for existing doc entry of same type to update
    doc_entry = (
        db.query(ProjectDocumentation)
        .filter(ProjectDocumentation.project_id == project_id, ProjectDocumentation.doc_type == doc_type)
        .first()
    )
    if doc_entry:
        doc_entry.content = content
    else:
        doc_entry = ProjectDocumentation(
            project_id=project_id,
            doc_type=doc_type,
            content=content
        )
        db.add(doc_entry)
    
    db.commit()
    db.refresh(doc_entry)
    return content

def export_doc_pdf(title: str, content: str) -> bytes:
    pdf_buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        pdf_buffer,
        pagesize=letter,
        rightMargin=40,
        leftMargin=40,
        topMargin=40,
        bottomMargin=40
    )
    styles = getSampleStyleSheet()
    
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Heading1'],
        fontSize=20,
        leading=24,
        textColor=colors.HexColor('#4F46E5'),
        spaceAfter=15
    )
    
    h2_style = ParagraphStyle(
        'DocH2',
        parent=styles['Heading2'],
        fontSize=13,
        leading=17,
        textColor=colors.HexColor('#1E293B'),
        spaceBefore=12,
        spaceAfter=6,
        keepWithNext=True
    )
    
    body_style = ParagraphStyle(
        'DocBody',
        parent=styles['Normal'],
        fontSize=9.5,
        leading=13.5,
        textColor=colors.HexColor('#334155'),
        spaceAfter=6
    )

    code_style = ParagraphStyle(
        'DocCode',
        parent=styles['Code'],
        fontSize=8,
        leading=11,
        textColor=colors.HexColor('#0F172A'),
        backColor=colors.HexColor('#F8FAFC'),
        borderColor=colors.HexColor('#E2E8F0'),
        borderWidth=0.5,
        borderPadding=5,
        spaceBefore=4,
        spaceAfter=4
    )

    story = [Paragraph(title, title_style), Spacer(1, 10)]

    # Parse simple markdown headings, lists, code blocks
    lines = content.split('\n')
    in_code_block = False
    code_lines = []

    for line in lines:
        if line.strip().startswith('```'):
            if in_code_block:
                # Close code block
                code_text = "<br/>".join(code_lines).replace(" ", "&nbsp;")
                story.append(Paragraph(code_text, code_style))
                code_lines = []
                in_code_block = False
            else:
                in_code_block = True
            continue

        if in_code_block:
            code_lines.append(line)
            continue

        stripped = line.strip()
        if not stripped:
            story.append(Spacer(1, 5))
            continue

        if stripped.startswith('# '):
            text = stripped[2:].strip()
            story.append(Paragraph(text, title_style))
        elif stripped.startswith('## '):
            text = stripped[3:].strip()
            story.append(Paragraph(text, h2_style))
        elif stripped.startswith('### '):
            text = stripped[4:].strip()
            story.append(Paragraph(text, h2_style))
        elif stripped.startswith('- ') or stripped.startswith('* '):
            text = f"• {stripped[2:].strip()}"
            story.append(Paragraph(text, body_style))
        else:
            story.append(Paragraph(line, body_style))

    doc.build(story)
    return pdf_buffer.getvalue()

def export_doc_html(title: str, content: str) -> str:
    # Use CDN marked library to render beautifully styled markdown on the client side
    content_json = json.dumps(content)
    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Documentation - {title}</title>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/github-markdown-css/5.5.1/github-markdown.min.css">
  <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
  <style>
    body {{
      box-sizing: border-box;
      min-width: 200px;
      max-width: 980px;
      margin: 0 auto;
      padding: 45px;
    }}
    @media (max-width: 767px) {{
      body {{
        padding: 15px;
      }}
    }}
    .markdown-body {{
      background-color: transparent !important;
    }}
    html {{
      background-color: #0d1117;
      color: #c9d1d9;
    }}
  </style>
</head>
<body class="markdown-body">
  <div id="content">Loading...</div>
  <script>
    const md = {content_json};
    document.getElementById('content').innerHTML = marked.parse(md);
  </script>
</body>
</html>
"""
    return html
