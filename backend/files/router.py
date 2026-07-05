"""
File upload endpoints. Ownership checks mirror ai/router.py's
_get_owned_chat pattern: a file that isn't the requester's own returns 404,
never 403, to avoid confirming existence to other users.
"""
import uuid
import json
import logging
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from database.config import get_db
from models.user import User
from models.file import UploadedFile
from auth.dependencies import get_current_user
from utils.rate_limiter import enforce_upload_rate_limit
from files.service import file_service, FileValidationError
from schemas.file import UploadedFileOut, UploadedFileWithContent, AnalyzeRequest
from ai.prompts import build_analysis_prompt
from ai.service import ai_service

logger = logging.getLogger("devpilot.files")

router = APIRouter(tags=["uploads"])


def _get_owned_file(db: Session, file_id: uuid.UUID, user_id: uuid.UUID) -> UploadedFile:
    record = db.query(UploadedFile).filter(UploadedFile.id == file_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="File not found")
    if record.user_id != user_id:
        raise HTTPException(status_code=404, detail="File not found")
    return record


@router.post("/upload", response_model=UploadedFileOut, status_code=status.HTTP_201_CREATED)
@router.post("", response_model=UploadedFileOut, status_code=status.HTTP_201_CREATED)
async def upload_file(
    upload: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(enforce_upload_rate_limit),
):
    try:
        saved = await file_service.save_upload(current_user.id, upload)
    except FileValidationError as e:
        raise HTTPException(status_code=400, detail=e.message)

    record = UploadedFile(
        user_id=current_user.id,
        filename=saved["filename"],
        stored_path=saved["stored_path"],
        file_type=saved["file_type"],
        size_bytes=saved["size_bytes"],
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


@router.get("", response_model=list[UploadedFileOut])
def list_files(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return (
        db.query(UploadedFile)
        .filter(UploadedFile.user_id == current_user.id)
        .order_by(UploadedFile.created_at.desc())
        .all()
    )


@router.get("/{file_id}", response_model=UploadedFileWithContent)
def get_file(
    file_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    record = _get_owned_file(db, file_id, current_user.id)
    try:
        content = file_service.read_content(record.stored_path)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="File content is no longer available")

    return UploadedFileWithContent(
        id=record.id,
        user_id=record.user_id,
        filename=record.filename,
        language=record.language,
        size=record.size,
        path=record.path,
        file_type=record.file_type,
        size_bytes=record.size_bytes,
        created_at=record.created_at,
        content=content,
    )


@router.delete("/{file_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_file(
    file_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    record = _get_owned_file(db, file_id, current_user.id)
    file_service.delete_file(record.stored_path)
    db.delete(record)
    db.commit()
    return None


@router.post("/{file_id}/analyze")
async def analyze_file(
    file_id: uuid.UUID,
    payload: AnalyzeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Streams AI code analysis response using Server-Sent Events.
    """
    record = _get_owned_file(db, file_id, current_user.id)
    try:
        content = file_service.read_content(record.stored_path)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="File content is no longer available")

    prompt = build_analysis_prompt(payload.action, content)

    async def event_generator():
        try:
            generator = ai_service.stream_reply(history=[], new_message=prompt)
            async for chunk in generator:
                yield f"data: {json.dumps({'type': 'delta', 'content': chunk})}\n\n"
            yield f"data: {json.dumps({'type': 'done'})}\n\n"
        except Exception as e:
            logger.error("AI analysis streaming failed: %s", e)
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")
