"""
FileService: handles validation, safe on-disk storage, and content retrieval
for user-uploaded source files. Kept separate from the router so storage
strategy (local disk today, S3 tomorrow) can change without touching
request-handling code.
"""
import os
import re
import uuid
import logging
from pathlib import Path

from fastapi import UploadFile

logger = logging.getLogger("devpilot.files")

# Extension -> canonical "file_type" label used for storage/display and for
# tagging content when it's injected into the AI's context.
ALLOWED_EXTENSIONS: dict[str, str] = {
    ".py": "python",
    ".js": "javascript",
    ".ts": "typescript",
    ".tsx": "typescript",
    ".jsx": "javascript",
    ".java": "java",
    ".cpp": "cpp",
    ".cc": "cpp",
    ".h": "cpp",
    ".hpp": "cpp",
    ".html": "html",
    ".css": "css",
    ".json": "json",
    ".md": "markdown",
    ".txt": "text",
}

MAX_FILE_SIZE_BYTES = int(os.getenv("MAX_UPLOAD_SIZE_BYTES", str(2 * 1024 * 1024)))  # 2 MB default
UPLOAD_ROOT = Path(os.getenv("UPLOAD_ROOT", "uploads/storage")).resolve()


class FileValidationError(Exception):
    """Raised for any invalid upload; carries a user-safe message."""

    def __init__(self, message: str):
        self.message = message
        super().__init__(message)


def _sanitize_filename(filename: str) -> str:
    """
    Strips directory components and unsafe characters so the stored filename
    can never escape the upload directory (path traversal protection).
    """
    base = os.path.basename(filename)
    base = base.replace("\x00", "")
    # Keep only alnum, dot, dash, underscore, space.
    base = re.sub(r"[^A-Za-z0-9._\- ]", "_", base)
    return base[:255] or "upload"


def validate_extension(filename: str) -> str:
    """Returns the canonical file_type label, or raises FileValidationError."""
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        allowed = ", ".join(sorted(ALLOWED_EXTENSIONS))
        raise FileValidationError(f"Unsupported file type '{ext}'. Allowed: {allowed}")
    return ALLOWED_EXTENSIONS[ext]


class FileService:
    def __init__(self):
        UPLOAD_ROOT.mkdir(parents=True, exist_ok=True)

    def _user_dir(self, user_id: uuid.UUID) -> Path:
        user_dir = UPLOAD_ROOT / str(user_id)
        user_dir.mkdir(parents=True, exist_ok=True)
        return user_dir

    async def save_upload(self, user_id: uuid.UUID, upload: UploadFile) -> dict:
        """
        Validates and persists an uploaded file to disk. Returns a dict with
        the fields needed to create the UploadedFile DB row. Raises
        FileValidationError on any invalid input.
        """
        if not upload.filename:
            raise FileValidationError("No filename provided.")

        file_type = validate_extension(upload.filename)
        safe_name = _sanitize_filename(upload.filename)

        # Read into memory to enforce the size limit before writing to disk;
        # uploads are capped small enough (default 2 MB) that this is safe.
        contents = await upload.read()
        if len(contents) == 0:
            raise FileValidationError("The uploaded file is empty.")
        if len(contents) > MAX_FILE_SIZE_BYTES:
            max_mb = MAX_FILE_SIZE_BYTES / (1024 * 1024)
            raise FileValidationError(f"File exceeds the {max_mb:.1f}MB size limit.")

        # Reject anything that isn't valid text (binaries disguised with an
        # allowed extension) — we only support plain-text source files.
        try:
            contents.decode("utf-8")
        except UnicodeDecodeError:
            raise FileValidationError("File does not appear to be valid UTF-8 text.")

        stored_name = f"{uuid.uuid4()}_{safe_name}"
        stored_path = self._user_dir(user_id) / stored_name

        with open(stored_path, "wb") as f:
            f.write(contents)

        return {
            "filename": safe_name,
            "stored_path": str(stored_path),
            "file_type": file_type,
            "size_bytes": len(contents),
        }

    def read_content(self, stored_path: str) -> str:
        """Reads a stored file's text content. Raises FileNotFoundError if missing."""
        path = Path(stored_path)
        if not path.is_file():
            raise FileNotFoundError(stored_path)
        return path.read_text(encoding="utf-8")

    def delete_file(self, stored_path: str) -> None:
        """Best-effort disk cleanup; DB row deletion is handled by the caller."""
        try:
            Path(stored_path).unlink(missing_ok=True)
        except OSError as e:
            logger.warning("Could not delete file on disk %s: %s", stored_path, e)


file_service = FileService()
