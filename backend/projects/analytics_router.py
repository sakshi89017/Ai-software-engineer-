import uuid
from datetime import datetime, timedelta, timezone
from typing import List, Dict, Any
from sqlalchemy import func
from sqlalchemy.orm import Session
from fastapi import APIRouter, Depends

from database.config import get_db
from models.user import User
from models.project import Project, ProjectFile, CodeReviewReport, ProjectDocumentation
from models.file import UploadedFile
from models.chat import Chat
from auth.dependencies import get_current_user

router = APIRouter(tags=["analytics"])

@router.get("/dashboard/analytics")
def get_dashboard_analytics(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # 1. Base Counts
    projects_count = db.query(Project).filter(Project.user_id == current_user.id).count()
    uploaded_files_count = db.query(UploadedFile).filter(UploadedFile.user_id == current_user.id).count()
    ai_chats_count = db.query(Chat).filter(Chat.user_id == current_user.id).count()
    
    code_reviews_count = (
        db.query(CodeReviewReport)
        .join(Project)
        .filter(Project.user_id == current_user.id)
        .count()
    )
    
    docs_generated_count = (
        db.query(ProjectDocumentation)
        .join(Project)
        .filter(Project.user_id == current_user.id)
        .count()
    )

    tests_generated_count = (
        db.query(ProjectFile)
        .join(Project)
        .filter(
            Project.user_id == current_user.id,
            (ProjectFile.filename.like("test_%")) |
            (ProjectFile.filename.like("%_test.go")) |
            (ProjectFile.filename.like("%.test.%")) |
            (ProjectFile.filename.like("%Spec.%"))
        )
        .count()
    )

    # 2. Language Usage
    proj_lang_stats = (
        db.query(ProjectFile.language, func.count(ProjectFile.id))
        .join(Project)
        .filter(Project.user_id == current_user.id, ProjectFile.language.isnot(None))
        .group_by(ProjectFile.language)
        .all()
    )
    
    uploaded_lang_stats = (
        db.query(UploadedFile.file_type, func.count(UploadedFile.id))
        .filter(UploadedFile.user_id == current_user.id, UploadedFile.file_type.isnot(None))
        .group_by(UploadedFile.file_type)
        .all()
    )

    lang_counts = {}
    for lang, count in proj_lang_stats:
        if lang:
            l_lower = lang.lower()
            lang_counts[l_lower] = lang_counts.get(l_lower, 0) + count
            
    for lang, count in uploaded_lang_stats:
        if lang:
            l_lower = lang.lower()
            lang_counts[l_lower] = lang_counts.get(l_lower, 0) + count

    # Form list and sort by count descending
    language_usage = [
        {"language": lang.capitalize(), "count": count}
        for lang, count in sorted(lang_counts.items(), key=lambda x: x[1], reverse=True)
    ]

    # 3. Weekly Activity (past 7 days)
    today = datetime.now(timezone.utc).date()
    weekly_activity = []
    
    for i in range(6, -1, -1):
        target_date = today - timedelta(days=i)
        start_dt = datetime.combine(target_date, datetime.min.time(), tzinfo=timezone.utc)
        end_dt = datetime.combine(target_date, datetime.max.time(), tzinfo=timezone.utc)
        
        chats_on_day = db.query(Chat).filter(
            Chat.user_id == current_user.id,
            Chat.created_at >= start_dt,
            Chat.created_at <= end_dt
        ).count()
        
        uploads_on_day = db.query(UploadedFile).filter(
            UploadedFile.user_id == current_user.id,
            UploadedFile.created_at >= start_dt,
            UploadedFile.created_at <= end_dt
        ).count()

        reviews_on_day = db.query(CodeReviewReport).join(Project).filter(
            Project.user_id == current_user.id,
            CodeReviewReport.created_at >= start_dt,
            CodeReviewReport.created_at <= end_dt
        ).count()

        weekly_activity.append({
            "day": target_date.strftime("%a"),
            "chats": chats_on_day,
            "uploads": uploads_on_day,
            "reviews": reviews_on_day,
            "total": chats_on_day + uploads_on_day + reviews_on_day
        })

    # 4. Technical Debt (calculated from average quality score of review reports)
    avg_quality = (
        db.query(func.avg(CodeReviewReport.quality_score))
        .join(Project)
        .filter(Project.user_id == current_user.id)
        .scalar()
    )
    
    tech_debt = 0.0
    if avg_quality is not None:
        tech_debt = max(0.0, float(100.0 - avg_quality))

    return {
        "projects": projects_count,
        "repositories": projects_count,
        "uploaded_files": uploaded_files_count,
        "ai_chats": ai_chats_count,
        "code_reviews": code_reviews_count,
        "docs_generated": docs_generated_count,
        "tests_generated": tests_generated_count,
        "weekly_activity": weekly_activity,
        "language_usage": language_usage[:5],
        "technical_debt": round(tech_debt, 1)
    }
