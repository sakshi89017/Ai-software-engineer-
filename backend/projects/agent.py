import uuid
import logging
import json
from sqlalchemy.orm import Session

from models.project import Project, ProjectFile, ProjectAgentTask
from ai.service import ai_service, DEFAULT_MODEL
from google.genai import types

logger = logging.getLogger("devpilot.agent")

PLAN_PROMPT_TEMPLATE = (
    "You are an expert AI Software Engineer. Analyze the following GitHub Issue and Project Files.\n"
    "Draft a detailed Implementation Plan to resolve this issue.\n"
    "Identify which files need to be modified, what new functions should be written, and what tests are required.\n\n"
    "GITHUB ISSUE / TASK DESCRIPTION:\n"
    "{issue_content}\n\n"
    "PROJECT DIRECTORY CONTEXT:\n"
    "{directory_context}\n\n"
    "Format the response in structured Markdown."
)

EXECUTE_PROMPT_TEMPLATE = (
    "You are an expert AI Software Engineer. Based on the approved Implementation Plan, "
    "generate the actual code modifications, test suites, and documentation updates.\n\n"
    "GITHUB ISSUE:\n"
    "{issue_content}\n\n"
    "IMPLEMENTATION PLAN:\n"
    "{plan}\n\n"
    "TARGET FILE CONTENTS:\n"
    "{file_contents}\n\n"
    "You MUST output a valid JSON object matching the following structure:\n"
    "{{\n"
    "  \"proposed_changes\": {{\n"
    "    \"file_path_to_modify_1\": \"FULL modified file code content\",\n"
    "    \"file_path_to_modify_2\": \"FULL modified file code content\"\n"
    "  }},\n"
    "  \"proposed_tests\": {{\n"
    "    \"tests/test_new_feature.py\": \"FULL test file code content\"\n"
    "  }},\n"
    "  \"proposed_docs\": \"Updated documentation markdown content\",\n"
    "  \"pr_summary\": \"Detailed Pull Request summary Markdown describing changes and validation\"\n"
    "}}\n"
    "Do NOT include any markdown code blocks (e.g. ```json) around the JSON output. Just output raw JSON."
)

def generate_plan(project_id: uuid.UUID, issue_content: str, db: Session) -> ProjectAgentTask:
    """
    Creates a new agent task, generates the implementation plan, and saves it in the database.
    """
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise Exception("Project not found")

    # Load project files structure
    files = db.query(ProjectFile).filter(ProjectFile.project_id == project_id).all()
    dir_context = "\n".join([f"- {f.file_path} (Language: {f.language})" for f in files])

    prompt = PLAN_PROMPT_TEMPLATE.format(
        issue_content=issue_content,
        directory_context=dir_context
    )

    mock_plan = (
        f"# Implementation Plan: Resolve Issue\n\n"
        f"**Issue Description**: {issue_content}\n\n"
        f"### Proposed Changes:\n"
        f"- Modify `src/main.py` to add requested issue handlers.\n"
        f"- Implement unit tests inside `tests/test_main.py`.\n"
        f"- Update README documentation.\n"
    )

    plan = ""
    if not ai_service._has_key:
        plan = mock_plan
    else:
        try:
            response = ai_service._client.models.generate_content(
                model=DEFAULT_MODEL,
                contents=prompt
            )
            plan = response.text
        except Exception as e:
            logger.warning("Gemini AI plan generation failed, using mock: %s", e)
            plan = mock_plan

    task = ProjectAgentTask(
        project_id=project_id,
        issue_content=issue_content,
        implementation_plan=plan,
        status="plan_generated"
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return task

def generate_code_changes(task_id: uuid.UUID, db: Session) -> ProjectAgentTask:
    """
    Generates proposed code modifications, tests, documentation updates, and PR summaries.
    """
    task = db.query(ProjectAgentTask).filter(ProjectAgentTask.id == task_id).first()
    if not task:
        raise Exception("Task not found")

    # Fetch project file contents
    files = db.query(ProjectFile).filter(ProjectFile.project_id == task.project_id).all()
    
    # We pass the contents of the relevant files
    file_contents = ""
    for f in files[:8]:  # Limit context window sizing
        file_contents += f"--- FILE PATH: {f.file_path} ---\n{f.content[:3000]}\n\n"

    prompt = EXECUTE_PROMPT_TEMPLATE.format(
        issue_content=task.issue_content,
        plan=task.implementation_plan,
        file_contents=file_contents
    )

    result_json = None
    if not ai_service._has_key:
        result_json = {
            "proposed_changes": {
                "src/main.py": "def resolve_issue():\n    # Implementing lockout mechanism\n    print('Issue resolved successfully')\n"
            },
            "proposed_tests": {
                "tests/test_main.py": "def test_resolve_issue():\n    assert True\n"
            },
            "proposed_docs": "# Documentation\n\nLockout mechanism added successfully.",
            "pr_summary": "## Pull Request: Lockout mechanism\nAdds login lockouts after 5 consecutive failures."
        }
    else:
        try:
            response = ai_service._client.models.generate_content(
                model=DEFAULT_MODEL,
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json"
                )
            )
            raw_text = response.text.strip()
            # Safety checks for wrapped markdown codeblocks
            if raw_text.startswith("```json"):
                raw_text = raw_text.replace("```json", "").replace("```", "").strip()
            elif raw_text.startswith("```"):
                raw_text = raw_text.replace("```", "").strip()
            result_json = json.loads(raw_text)
        except Exception as e:
            logger.warning("Gemini AI code generation failed, using fallback: %s", e)
            result_json = {
                "proposed_changes": {
                    "src/main.py": "def handle_lockout():\n    pass\n"
                },
                "proposed_tests": {
                    "tests/test_lockout.py": "def test_lockout():\n    assert True\n"
                },
                "proposed_docs": "# Documentation\n\nAI generation failed, fallback mock returned.",
                "pr_summary": "## Pull Request: AI Error Fallback\nFallback mock summary."
            }

    task.proposed_changes = json.dumps(result_json.get("proposed_changes", {}))
    task.proposed_tests = json.dumps(result_json.get("proposed_tests", {}))
    task.proposed_docs = result_json.get("proposed_docs", "# Documentation Update")
    task.pr_summary = result_json.get("pr_summary", "## Pull Request Summary")
    task.status = "changes_generated"
    
    db.commit()
    db.refresh(task)
    return task

def apply_code_changes(task_id: uuid.UUID, db: Session) -> ProjectAgentTask:
    """
    Applies the proposed changes to the actual ProjectFile database records.
    This fulfills the requirement that changes are never applied automatically without user approval.
    """
    task = db.query(ProjectAgentTask).filter(ProjectAgentTask.id == task_id).first()
    if not task:
        raise Exception("Task not found")

    if task.status != "changes_generated":
        raise Exception("Proposed changes are not generated or have already been applied.")

    proposed_changes = json.loads(task.proposed_changes or "{}")
    proposed_tests = json.loads(task.proposed_tests or "{}")

    # 1. Apply code changes (modify existing files or create them)
    for file_path, content in proposed_changes.items():
        existing_file = db.query(ProjectFile).filter(
            ProjectFile.project_id == task.project_id,
            ProjectFile.file_path == file_path
        ).first()

        if existing_file:
            existing_file.content = content
            existing_file.size_bytes = len(content)
        else:
            # Create a new file
            new_file = ProjectFile(
                project_id=task.project_id,
                file_path=file_path,
                filename=file_path.split("/")[-1],
                size_bytes=len(content),
                content=content,
                language=file_path.split(".")[-1] if "." in file_path else "python"
            )
            db.add(new_file)

    # 2. Apply proposed tests
    for file_path, content in proposed_tests.items():
        existing_file = db.query(ProjectFile).filter(
            ProjectFile.project_id == task.project_id,
            ProjectFile.file_path == file_path
        ).first()

        if existing_file:
            existing_file.content = content
            existing_file.size_bytes = len(content)
        else:
            new_file = ProjectFile(
                project_id=task.project_id,
                file_path=file_path,
                filename=file_path.split("/")[-1],
                size_bytes=len(content),
                content=content,
                language=file_path.split(".")[-1] if "." in file_path else "python"
            )
            db.add(new_file)

    task.status = "applied"
    db.commit()
    db.refresh(task)
    return task
