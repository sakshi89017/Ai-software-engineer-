import re
import uuid
import subprocess
import logging
import tempfile
from pathlib import Path
from datetime import datetime, timezone

from database.config import SessionLocal
from models.project import Project, ProjectFile
from files.service import ALLOWED_EXTENSIONS

logger = logging.getLogger("devpilot.projects")


def detect_framework_and_languages(repo_path: Path) -> tuple[str, list[str]]:
    """
    Scans project files using lightweight heuristics to identify the primary
    framework and list sorted language frequencies.
    """
    framework = "Generic"
    languages = set()

    # Framework detection
    if (repo_path / "package.json").is_file():
        try:
            content = (repo_path / "package.json").read_text(encoding="utf-8")
            if "next" in content:
                framework = "Next.js"
            elif "react" in content:
                framework = "React"
            elif "vue" in content:
                framework = "Vue"
            elif "express" in content:
                framework = "Express.js"
            else:
                framework = "Node.js"
        except Exception:
            framework = "JavaScript/Node"

    elif (repo_path / "requirements.txt").is_file() or (repo_path / "pyproject.toml").is_file():
        try:
            content = ""
            if (repo_path / "requirements.txt").is_file():
                content = (repo_path / "requirements.txt").read_text(encoding="utf-8")
            elif (repo_path / "pyproject.toml").is_file():
                content = (repo_path / "pyproject.toml").read_text(encoding="utf-8")

            if "django" in content.lower():
                framework = "Django"
            elif "fastapi" in content.lower():
                framework = "FastAPI"
            elif "flask" in content.lower():
                framework = "Flask"
            else:
                framework = "Python"
        except Exception:
            framework = "Python"

    elif (repo_path / "pom.xml").is_file() or (repo_path / "build.gradle").is_file():
        framework = "Spring Boot"
    elif (repo_path / "go.mod").is_file():
        framework = "Go"
    elif (repo_path / "Cargo.toml").is_file():
        framework = "Rust"

    # Languages count by files extension
    lang_counts = {}
    for file in repo_path.rglob("*"):
        if file.is_file():
            # Skip ignored directories
            if any(p in file.parts for p in ["node_modules", ".git", "dist", "build", "venv", ".cache", "__pycache__"]):
                continue
            ext = file.suffix.lower()
            if ext in ALLOWED_EXTENSIONS:
                lang = ALLOWED_EXTENSIONS[ext]
                lang_counts[lang] = lang_counts.get(lang, 0) + 1

    sorted_langs = sorted(lang_counts.keys(), key=lambda l: lang_counts[l], reverse=True)
    return framework, sorted_langs


def import_github_repository_bg(project_id: uuid.UUID, repo_url: str):
    """
    Executes shallow clone, file traversal, and SQLite/Postgres DB indexing
    runs in the background context.
    """
    db = SessionLocal()
    try:
        # 1. Update project status to cloning
        project = db.query(Project).filter(Project.id == project_id).first()
        if not project:
            return

        project.status = "cloning"
        db.commit()

        # Parse owner and name
        match = re.match(r"https?://github\.com/(?P<owner>[^/]+)/(?P<name>[^/.]+)(?:\.git)?", repo_url)
        if not match:
            raise Exception("Invalid GitHub URL format")

        owner = match.group("owner")
        repo_name = match.group("name")

        project.repo_owner = owner
        project.repo_name = repo_name
        db.commit()

        # 2. Shallow clone
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)

            cmd = ["git", "clone", "--depth", "1", repo_url, "."]
            res = subprocess.run(cmd, cwd=temp_path, capture_output=True, text=True)
            if res.returncode != 0:
                raise Exception(f"Git clone failed: {res.stderr or 'Unknown error'}")

            # 3. Commit diagnostics
            commit_cmd = ["git", "log", "-1", "--format=%H%n%s%n%an%n%at"]
            commit_res = subprocess.run(commit_cmd, cwd=temp_path, capture_output=True, text=True)
            if commit_res.returncode == 0:
                commit_lines = commit_res.stdout.strip().split("\n")
                if len(commit_lines) >= 4:
                    project.last_commit_sha = commit_lines[0]
                    project.last_commit_message = commit_lines[1]
                    project.last_commit_author = commit_lines[2]
                    try:
                        project.last_commit_date = datetime.fromtimestamp(int(commit_lines[3]), timezone.utc)
                    except Exception:
                        pass

            # Detect branch
            branch_cmd = ["git", "rev-parse", "--abbrev-ref", "HEAD"]
            branch_res = subprocess.run(branch_cmd, cwd=temp_path, capture_output=True, text=True)
            if branch_res.returncode == 0:
                project.default_branch = branch_res.stdout.strip()
            else:
                project.default_branch = "main"

            # 4. Framework and Languages Metadata
            project.status = "indexing"
            db.commit()

            framework, sorted_langs = detect_framework_and_languages(temp_path)
            project.framework = framework
            project.languages = ",".join(sorted_langs)
            db.commit()

            # 5. Travel codebase to index files
            total_files = 0
            total_lines = 0
            total_size = 0

            for file_path in temp_path.rglob("*"):
                if file_path.is_file():
                    # Ignored folders
                    if any(p in file_path.parts for p in ["node_modules", ".git", "dist", "build", "venv", ".cache", "__pycache__"]):
                        continue

                    ext = file_path.suffix.lower()
                    if ext in ALLOWED_EXTENSIONS:
                        try:
                            # Verify valid UTF-8
                            content = file_path.read_text(encoding="utf-8")
                            rel_path = str(file_path.relative_to(temp_path)).replace("\\", "/")
                            size = file_path.stat().st_size
                            lines = len(content.splitlines())

                            db_file = ProjectFile(
                                project_id=project.id,
                                file_path=rel_path,
                                filename=file_path.name,
                                size_bytes=size,
                                content=content,
                                language=ALLOWED_EXTENSIONS[ext]
                            )
                            db.add(db_file)

                            total_files += 1
                            total_lines += lines
                            total_size += size
                        except Exception:
                            # Skip binary files or un-decodable encodings
                            pass

            project.total_files = total_files
            project.total_lines = total_lines
            project.size_bytes = total_size
            project.status = "completed"
            db.commit()

    except Exception as e:
        db.rollback()
        logger.exception("Import repository background task failed: %s", repo_url)
        project = db.query(Project).filter(Project.id == project_id).first()
        if project:
            project.status = "failed"
            project.error_message = str(e)[:500]
            db.commit()
    finally:
        db.close()
