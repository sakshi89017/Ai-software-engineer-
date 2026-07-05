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
from schemas.file import UploadedFileOut, UploadedFileWithContent, AnalyzeRequest, FileReviewReportOut, FileReviewIssueOut, TestGenerateRequest, TestGenerateResponse
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


@router.post("/{file_id}/review", response_model=FileReviewReportOut)
def review_uploaded_file(
    file_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from projects.code_review import run_file_code_review

    record = _get_owned_file(db, file_id, current_user.id)
    try:
        content = file_service.read_content(record.stored_path)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="File content is no longer available")

    report, issues = run_file_code_review(record.filename, content)
    
    issues_out = []
    for issue in issues:
        issues_out.append(FileReviewIssueOut(
            file_path=issue.file_path,
            line_number=issue.line_number,
            category=issue.category,
            title=issue.title,
            description=issue.description,
            severity=issue.severity,
            recommended_fix=issue.recommended_fix,
            code_example=issue.code_example
        ))

    return FileReviewReportOut(
        quality_score=report.quality_score,
        security_score=report.security_score,
        performance_score=report.performance_score,
        architecture_score=report.architecture_score,
        summary=report.summary,
        issues=issues_out
    )


@router.get("/{file_id}/review/export/{format_type}")
def export_uploaded_file_review(
    file_id: uuid.UUID,
    format_type: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from fastapi import Response
    from projects.code_review import run_file_code_review, export_markdown_report, export_pdf_report

    record = _get_owned_file(db, file_id, current_user.id)
    try:
        content = file_service.read_content(record.stored_path)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="File content is no longer available")

    report, issues = run_file_code_review(record.filename, content)
    
    safe_filename = record.filename.replace(".", "_")

    if format_type.lower() == "json":
        issues_out = []
        for i in issues:
            issues_out.append({
                "file_path": i.file_path,
                "line_number": i.line_number,
                "category": i.category,
                "title": i.title,
                "description": i.description,
                "severity": i.severity,
                "recommended_fix": i.recommended_fix,
                "code_example": i.code_example
            })
        report_data = {
            "quality_score": report.quality_score,
            "security_score": report.security_score,
            "performance_score": report.performance_score,
            "architecture_score": report.architecture_score,
            "summary": report.summary,
            "issues": issues_out
        }
        json_content = json.dumps(report_data, default=str, indent=2)
        return Response(
            content=json_content,
            media_type="application/json",
            headers={"Content-Disposition": f"attachment; filename=codereview_{safe_filename}.json"}
        )

    elif format_type.lower() == "markdown":
        md_content = export_markdown_report(report, issues, record.filename)
        return Response(
            content=md_content,
            media_type="text/markdown",
            headers={"Content-Disposition": f"attachment; filename=codereview_{safe_filename}.md"}
        )

    elif format_type.lower() == "pdf":
        try:
            pdf_bytes = export_pdf_report(report, issues, record.filename)
            return Response(
                content=pdf_bytes,
                media_type="application/pdf",
                headers={"Content-Disposition": f"attachment; filename=codereview_{safe_filename}.pdf"}
            )
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to generate PDF: {str(e)}")

    else:
        raise HTTPException(status_code=400, detail="Invalid export format. Choose pdf, markdown, or json.")


@router.post("/{file_id}/generate-tests", response_model=TestGenerateResponse)
def generate_uploaded_file_tests(
    file_id: uuid.UUID,
    payload: TestGenerateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from projects.test_generator import generate_tests_for_code

    record = _get_owned_file(db, file_id, current_user.id)
    try:
        content = file_service.read_content(record.stored_path)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="File content is no longer available")

    # Map language from extension
    language = record.language
    if not language and "." in record.filename:
        language = record.filename.rsplit(".", 1)[-1]
    if not language:
        language = "python"

    test_code = generate_tests_for_code(record.filename, language, content, payload.test_type)

    # Determine filename suffix
    name_parts = record.filename.rsplit(".", 1)
    base_name = name_parts[0]
    ext = f".{name_parts[1]}" if len(name_parts) > 1 else ""
    
    # Standard testing file naming
    test_filename = f"test_{base_name}{ext}"
    if language == "go":
        test_filename = f"{base_name}_test.go"
    elif language in ("javascript", "typescript", "js", "ts", "jsx", "tsx"):
        test_filename = f"{base_name}.test{ext}"

    return TestGenerateResponse(
        filename=test_filename,
        test_code=test_code
    )
