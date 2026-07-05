import uuid
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel

from database.config import get_db
from models.user import User
from models.project import Project
from models.team import Team, TeamMember, TeamInvitation, TeamProject, ProjectComment, CollaborationActivity
from auth.dependencies import get_current_user

router = APIRouter(tags=["collaboration"])

# Pydantic schemas
class TeamCreate(BaseModel):
    name: str

class InviteCreate(BaseModel):
    email: str
    role: str = "collaborator"  # "admin" | "collaborator" | "viewer"

class CommentCreate(BaseModel):
    content: str
    file_path: Optional[str] = None

class TeamMemberOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    email: str
    role: str
    joined_at: datetime

    class Config:
        from_attributes = True

class TeamInvitationOut(BaseModel):
    id: uuid.UUID
    email: str
    role: str
    status: str
    created_at: datetime

    class Config:
        from_attributes = True

class ProjectOut(BaseModel):
    id: uuid.UUID
    repo_name: str
    status: str

    class Config:
        from_attributes = True

class TeamOut(BaseModel):
    id: uuid.UUID
    name: str
    owner_id: uuid.UUID
    created_at: datetime

    class Config:
        from_attributes = True

class ActivityOut(BaseModel):
    id: uuid.UUID
    user_email: str
    activity_type: str
    description: str
    created_at: datetime

class CommentOut(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    file_path: Optional[str]
    user_id: uuid.UUID
    user_email: str
    content: str
    created_at: datetime

# Helper to verify membership
def _verify_team_access(db: Session, team_id: uuid.UUID, user_id: uuid.UUID) -> TeamMember:
    member = db.query(TeamMember).filter(TeamMember.team_id == team_id, TeamMember.user_id == user_id).first()
    if not member:
        raise HTTPException(status_code=403, detail="You do not have access to this team.")
    return member

@router.post("/teams", response_model=TeamOut)
def create_team(
    payload: TeamCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    team = Team(name=payload.name, owner_id=current_user.id)
    db.add(team)
    db.commit()
    db.refresh(team)

    # Owner becomes team member
    member = TeamMember(team_id=team.id, user_id=current_user.id, role="owner")
    db.add(member)

    # Log activity
    activity = CollaborationActivity(
        team_id=team.id,
        user_id=current_user.id,
        activity_type="team_created",
        description=f"Team '{payload.name}' created by {current_user.email}."
    )
    db.add(activity)
    db.commit()
    return team

@router.get("/teams", response_model=List[TeamOut])
def list_my_teams(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Returns all teams where user is a member
    return (
        db.query(Team)
        .join(TeamMember)
        .filter(TeamMember.user_id == current_user.id)
        .order_by(Team.created_at.desc())
        .all()
    )

@router.get("/teams/{team_id}")
def get_team_details(
    team_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _verify_team_access(db, team_id, current_user.id)
    team = db.query(Team).filter(Team.id == team_id).first()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found.")

    # Retrieve members list
    raw_members = db.query(TeamMember).filter(TeamMember.team_id == team_id).all()
    members = []
    for m in raw_members:
        members.append({
            "id": m.id,
            "user_id": m.user_id,
            "email": m.user.email,
            "role": m.role,
            "joined_at": m.joined_at
        })

    # Retrieve invitations list
    invitations = db.query(TeamInvitation).filter(TeamInvitation.team_id == team_id).all()

    # Retrieve shared projects
    raw_shared = db.query(TeamProject).filter(TeamProject.team_id == team_id).all()
    shared_projects = []
    for p in raw_shared:
        shared_projects.append({
            "id": p.project_id,
            "repo_name": p.project.repo_name,
            "repo_owner": p.project.repo_owner,
            "status": p.project.status,
            "shared_at": p.shared_at
        })

    # Retrieve activity log
    raw_activities = (
        db.query(CollaborationActivity)
        .filter(CollaborationActivity.team_id == team_id)
        .order_by(CollaborationActivity.created_at.desc())
        .all()
    )
    activities = []
    for act in raw_activities:
        activities.append({
            "id": act.id,
            "user_email": act.user.email,
            "activity_type": act.activity_type,
            "description": act.description,
            "created_at": act.created_at
        })

    return {
        "id": team.id,
        "name": team.name,
        "owner_id": team.owner_id,
        "created_at": team.created_at,
        "members": members,
        "invitations": [TeamInvitationOut.model_validate(i) for i in invitations],
        "shared_projects": shared_projects,
        "activities": activities
    }

@router.post("/teams/{team_id}/invitations", response_model=TeamInvitationOut)
def invite_member(
    team_id: uuid.UUID,
    payload: InviteCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    member = _verify_team_access(db, team_id, current_user.id)
    if member.role not in {"owner", "admin"}:
        raise HTTPException(status_code=403, detail="Only owners and admins can invite members.")

    invitation = TeamInvitation(
        team_id=team_id,
        email=payload.email.strip().lower(),
        role=payload.role
    )
    db.add(invitation)

    activity = CollaborationActivity(
        team_id=team_id,
        user_id=current_user.id,
        activity_type="member_invited",
        description=f"{current_user.email} invited {payload.email} to join the team as '{payload.role}'."
    )
    db.add(activity)
    db.commit()
    db.refresh(invitation)
    return invitation

@router.post("/teams/invitations/{invite_token}/accept")
def accept_team_invitation(
    invite_token: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    invite = db.query(TeamInvitation).filter(TeamInvitation.token == invite_token).first()
    if not invite or invite.status != "pending":
        raise HTTPException(status_code=404, detail="Invitation link invalid or already processed.")

    if invite.email != current_user.email.strip().lower():
        raise HTTPException(status_code=400, detail="This invitation email belongs to a different account.")

    invite.status = "accepted"
    
    # Add to team members
    member = TeamMember(
        team_id=invite.team_id,
        user_id=current_user.id,
        role=invite.role
    )
    db.add(member)

    activity = CollaborationActivity(
        team_id=invite.team_id,
        user_id=current_user.id,
        activity_type="member_joined",
        description=f"{current_user.email} accepted invitation and joined the team."
    )
    db.add(activity)
    db.commit()
    return {"message": "Successfully joined the team!"}

@router.post("/teams/invitations/{invite_token}/decline")
def decline_team_invitation(
    invite_token: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    invite = db.query(TeamInvitation).filter(TeamInvitation.token == invite_token).first()
    if not invite or invite.status != "pending":
        raise HTTPException(status_code=404, detail="Invitation link invalid or already processed.")

    if invite.email != current_user.email.strip().lower():
        raise HTTPException(status_code=400, detail="This invitation email belongs to a different account.")

    invite.status = "declined"
    db.commit()
    return {"message": "Invitation declined."}

@router.post("/teams/{team_id}/projects/{project_id}")
def share_project_with_team(
    team_id: uuid.UUID,
    project_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _verify_team_access(db, team_id, current_user.id)
    
    # Verify project exists and user owns it
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project or project.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Project not found or you are not the owner.")

    # Check if already shared
    existing = db.query(TeamProject).filter(TeamProject.team_id == team_id, TeamProject.project_id == project_id).first()
    if existing:
        return {"message": "Project already shared with this team."}

    shared = TeamProject(team_id=team_id, project_id=project_id)
    db.add(shared)

    activity = CollaborationActivity(
        team_id=team_id,
        user_id=current_user.id,
        activity_type="project_shared",
        description=f"Project '{project.repo_name}' was shared with the team by {current_user.email}."
    )
    db.add(activity)
    db.commit()
    return {"message": "Project shared successfully!"}

@router.post("/projects/{project_id}/comments", response_model=CommentOut)
def add_comment(
    project_id: uuid.UUID,
    payload: CommentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Verify user has access to project (either they own it, or it is shared with a team they belong to)
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found.")

    has_access = False
    if project.user_id == current_user.id:
        has_access = True
    else:
        # Check if project is shared with any team current_user is in
        shared_teams = db.query(TeamProject.team_id).filter(TeamProject.project_id == project_id).subquery()
        is_member = db.query(TeamMember).filter(TeamMember.team_id.in_(shared_teams), TeamMember.user_id == current_user.id).first()
        if is_member:
            has_access = True

    if not has_access:
        raise HTTPException(status_code=403, detail="You do not have access to post comments on this project.")

    comment = ProjectComment(
        project_id=project_id,
        file_path=payload.file_path,
        user_id=current_user.id,
        content=payload.content
    )
    db.add(comment)
    
    # Mentions log trace: scanning content for mentions (e.g. '@user@example.com')
    # If mentions exist, we modify log or raise notifications
    mentions_found = []
    import re
    emails = re.findall(r'@[\w\.-]+@[\w\.-]+|@[\w\.-]+', payload.content)
    for email in emails:
        clean_email = email.replace("@", "")
        mentions_found.append(clean_email)

    db.commit()
    db.refresh(comment)

    return {
        "id": comment.id,
        "project_id": comment.project_id,
        "file_path": comment.file_path,
        "user_id": comment.user_id,
        "user_email": current_user.email,
        "content": comment.content,
        "created_at": comment.created_at
    }

@router.get("/projects/{project_id}/comments", response_model=List[CommentOut])
def get_comments(
    project_id: uuid.UUID,
    file_path: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found.")

    has_access = False
    if project.user_id == current_user.id:
        has_access = True
    else:
        shared_teams = db.query(TeamProject.team_id).filter(TeamProject.project_id == project_id).subquery()
        is_member = db.query(TeamMember).filter(TeamMember.team_id.in_(shared_teams), TeamMember.user_id == current_user.id).first()
        if is_member:
            has_access = True

    if not has_access:
        raise HTTPException(status_code=403, detail="You do not have access to view comments.")

    query = db.query(ProjectComment).filter(ProjectComment.project_id == project_id)
    if file_path:
        query = query.filter(ProjectComment.file_path == file_path)
    
    comments = query.order_by(ProjectComment.created_at.asc()).all()

    res = []
    for c in comments:
        res.append({
            "id": c.id,
            "project_id": c.project_id,
            "file_path": c.file_path,
            "user_id": c.user_id,
            "user_email": c.user.email,
            "content": c.content,
            "created_at": c.created_at
        })
    return res
