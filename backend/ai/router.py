"""
Chat API routes. Routers stay thin: DB access and request/response shaping
only. All AI-provider logic lives in ai/service.py.
"""
import json
import uuid
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import or_
from sqlalchemy.orm import Session

from database.config import get_db
from models.user import User
from models.chat import Chat, Message
from models.file import UploadedFile
from auth.dependencies import get_current_user
from utils.rate_limiter import enforce_chat_rate_limit
from ai.service import ai_service, AIServiceError
from ai.utils import estimate_token_count
from files.service import file_service
from schemas.chat import (
    ChatOut,
    ChatWithMessages,
    ChatListItem,
    ChatCreate,
    ChatUpdate,
    SendMessageRequest,
    MessageOut,
)

logger = logging.getLogger("devpilot.chat")

router = APIRouter(prefix="/api/chat", tags=["chat"])


def _get_owned_chat(db: Session, chat_id: uuid.UUID, user_id: uuid.UUID) -> Chat:
    """Fetches a chat and enforces that it belongs to the requesting user."""
    chat = db.query(Chat).filter(Chat.id == chat_id).first()
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    if chat.user_id != user_id:
        # 404 rather than 403 to avoid confirming the chat exists for another user.
        raise HTTPException(status_code=404, detail="Chat not found")
    return chat


@router.post("/new", response_model=ChatOut, status_code=status.HTTP_201_CREATED)
def create_chat(
    payload: ChatCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    chat = Chat(user_id=current_user.id, title=payload.title or "New Chat")
    db.add(chat)
    db.commit()
    db.refresh(chat)
    return chat


@router.get("/history", response_model=list[ChatListItem])
def get_history(
    search: Optional[str] = Query(default=None, max_length=255),
    sort: str = Query(default="newest"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(Chat).filter(Chat.user_id == current_user.id)
    if search:
        query = query.filter(Chat.title.ilike(f"%{search}%"))

    if sort == "pinned":
        query = query.order_by(Chat.is_pinned.desc(), Chat.updated_at.desc())
    elif sort == "oldest":
        query = query.order_by(Chat.updated_at.asc())
    else:  # newest
        query = query.order_by(Chat.updated_at.desc())

    chats = query.all()

    items: list[ChatListItem] = []
    for chat in chats:
        last_message = (
            db.query(Message)
            .filter(Message.chat_id == chat.id)
            .order_by(Message.created_at.desc())
            .first()
        )
        preview = last_message.content[:80] if last_message else None
        items.append(
            ChatListItem(
                id=chat.id,
                title=chat.title,
                is_pinned=chat.is_pinned,
                created_at=chat.created_at,
                updated_at=chat.updated_at,
                last_message_preview=preview,
            )
        )
    return items


@router.get("/{chat_id}", response_model=ChatWithMessages)
def get_chat(
    chat_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    chat = _get_owned_chat(db, chat_id, current_user.id)
    return chat


@router.patch("/{chat_id}", response_model=ChatOut)
def update_chat(
    chat_id: uuid.UUID,
    payload: ChatUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    chat = _get_owned_chat(db, chat_id, current_user.id)
    if payload.title is not None:
        chat.title = payload.title
    if payload.is_pinned is not None:
        chat.is_pinned = payload.is_pinned
    db.commit()
    db.refresh(chat)
    return chat


@router.delete("/{chat_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_chat(
    chat_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    chat = _get_owned_chat(db, chat_id, current_user.id)
    db.delete(chat)
    db.commit()
    return None


def _build_file_prompt(db: Session, user_id: uuid.UUID, file_id: uuid.UUID, question: str) -> str:
    """
    Resolves an uploaded file owned by `user_id` and folds its content into
    a prompt string for a single AI turn. Shared by the normal send path and
    the regenerate path so both inject file context identically.
    """
    file_record = db.query(UploadedFile).filter(UploadedFile.id == file_id).first()
    if not file_record or file_record.user_id != user_id:
        raise HTTPException(status_code=404, detail="File not found")
    try:
        file_content = file_service.read_content(file_record.stored_path)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="File content is no longer available")
    return (
        f"The user has attached a file named `{file_record.filename}` "
        f"({file_record.file_type}):\n\n```{file_record.file_type}\n{file_content}\n```\n\n"
        f"User's question about this file:\n{question}"
    )


def _build_project_intelligence_prompt(db: Session, project_id: uuid.UUID, user_query: str) -> str:
    """
    Retrieves codebase metadata (routes, database models, environment variables,
    classes, functions, TODO comments) and runs semantic document retrieval via
    ChromaDB to build a unified context block for Google Gemini.
    """
    from models.project import Project, ProjectFile

    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        return user_query

    files = db.query(ProjectFile).filter(ProjectFile.project_id == project_id).all()
    lower_query = user_query.lower()

    intel_context = []
    intel_context.append(f"Project Name: {project.repo_name or 'Repository'}")
    intel_context.append(f"Owner: {project.repo_owner or 'Unknown'}")
    intel_context.append(f"Framework: {project.framework or 'Generic'}")
    intel_context.append(f"Languages: {project.languages or 'Unknown'}")

    # API Routes extraction
    if any(k in lower_query for k in ["route", "api", "endpoint", "url", "path"]):
        all_routes = []
        for f in files:
            if f.intelligence_metadata:
                try:
                    meta = json.loads(f.intelligence_metadata)
                    for r in meta.get("routes", []):
                        all_routes.append(f"- `{r}` (defined in `{f.file_path}`)")
                except Exception:
                    pass
        if all_routes:
            intel_context.append("\n### API Routes defined in project:\n" + "\n".join(all_routes))
        else:
            intel_context.append("\nNo routes detected in the repository.")

    # Database Models extraction
    if any(k in lower_query for k in ["model", "database", "schema", "db", "table"]):
        all_models = []
        for f in files:
            if f.intelligence_metadata:
                try:
                    meta = json.loads(f.intelligence_metadata)
                    for m in meta.get("models", []):
                        all_models.append(f"- `{m}` (defined in `{f.file_path}`)")
                except Exception:
                    pass
        if all_models:
            intel_context.append("\n### Database Models defined in project:\n" + "\n".join(all_models))
        else:
            intel_context.append("\nNo database models detected in the repository.")

    # Environment Variables extraction
    if any(k in lower_query for k in ["env", "environment", "key", "config"]):
        all_envs = []
        for f in files:
            if f.intelligence_metadata:
                try:
                    meta = json.loads(f.intelligence_metadata)
                    for e in meta.get("envs", []):
                        all_envs.append(f"- `{e}` (referenced in `{f.file_path}`)")
                except Exception:
                    pass
        if all_envs:
            intel_context.append("\n### Environment Variables used in project:\n" + "\n".join(all_envs))

    # TODO comments extraction
    if "todo" in lower_query:
        all_todos = []
        for f in files:
            if f.intelligence_metadata:
                try:
                    meta = json.loads(f.intelligence_metadata)
                    for t in meta.get("todos", []):
                        all_todos.append(f"- [ ] {t} (in `{f.file_path}`)")
                except Exception:
                    pass
        if all_todos:
            intel_context.append("\n### TODO Comments found in project:\n" + "\n".join(all_todos))
        else:
            intel_context.append("\nNo TODO comments found in the repository.")

    # Folder Structure extraction
    if any(k in lower_query for k in ["folder", "structure", "layout", "tree", "files", "hierarchy"]):
        paths = sorted([f.file_path for f in files])
        intel_context.append("\n### Codebase Files Tree Layout:\n" + "\n".join(f"- `{p}`" for p in paths[:150]))
        if len(paths) > 150:
            intel_context.append(f"\n... and {len(paths) - 150} other files.")

    # Dependency Graph & Imports
    if any(k in lower_query for k in ["dependency", "dependencies", "import", "graph", "package"]):
        imports_map = {}
        for f in files:
            if f.intelligence_metadata:
                try:
                    meta = json.loads(f.intelligence_metadata)
                    for imp in meta.get("imports", []):
                        imports_map[f.file_path] = imports_map.get(f.file_path, []) + [imp]
                except Exception:
                    pass
        dep_lines = []
        for filepath, imps in list(imports_map.items())[:50]:
            dep_lines.append(f"- `{filepath}` imports: {', '.join(f'`{i}`' for i in imps[:5])}")
        if dep_lines:
            intel_context.append("\n### Codebase Dependency Mapping (sample):\n" + "\n".join(dep_lines))

    # Heuristic diagnostics (duplicate code, unused files)
    if any(k in lower_query for k in ["unused", "duplicate", "redundant", "similarity"]):
        paths = [f.file_path for f in files]
        intel_context.append(f"\nHere is a list of project files for diagnostic checks: {', '.join(paths[:120])}")

    # Semantic code query search in ChromaDB
    try:
        from projects.service import chroma_client
        collection = chroma_client.get_collection(name=f"project_{project_id}")
        query_embeddings = ai_service.generate_embeddings([user_query])
        if query_embeddings and len(query_embeddings) > 0:
            results = collection.query(
                query_embeddings=[query_embeddings[0]],
                n_results=3
            )
            matched_docs = []
            if results and "documents" in results and results["documents"]:
                for idx, doc in enumerate(results["documents"][0]):
                    metadata = results["metadatas"][0][idx] if results["metadatas"] else {}
                    matched_docs.append(f"--- MATCHING CODE FILE: {metadata.get('file_path', 'unknown')} ---\n{doc[:4000]}")
            if matched_docs:
                intel_context.append("\n### Semantically Relevant Code Snippets:\n" + "\n\n".join(matched_docs))
    except Exception as e:
        logger.warning("ChromaDB retrieval failed for project %s: %s", project_id, e)

    prompt = (
        f"You are responding within the context of the repository: **{project.repo_owner}/{project.repo_name}**.\n"
        f"Use the structural codebase info below to accurately answer the user's request.\n\n"
        f"--- Codebase Structural Intelligence Context ---\n"
        + "\n".join(intel_context) +
        f"\n\nUser Question:\n{user_query}"
    )
    return prompt



@router.post("/message")
async def send_message(
    payload: SendMessageRequest,
    db: Session = Depends(get_db),
    # Only this endpoint is rate-limited (it's the one that hits OpenAI) —
    # every other chat route above still uses the plain get_current_user.
    current_user: User = Depends(enforce_chat_rate_limit),
):
    """
    Streams an assistant reply via Server-Sent Events.

    Event payloads (JSON, one per `data:` line):
      {"type": "chat_created", "chat_id": "..."}   - only if a new chat was created
      {"type": "delta", "content": "..."}          - streamed text chunks
      {"type": "title", "title": "..."}            - only on first exchange in a chat
      {"type": "done", "message_id": "..."}        - stream finished successfully
      {"type": "error", "message": "..."}          - stream aborted with an error
    """
    # Resolve or create the chat up front so the client always has a chat_id
    # to associate the stream with, even for a brand-new conversation.
    is_new_chat = payload.chat_id is None
    if is_new_chat:
        chat = Chat(user_id=current_user.id, title="New Chat")
        db.add(chat)
        db.commit()
        db.refresh(chat)
    else:
        chat = _get_owned_chat(db, payload.chat_id, current_user.id)

    # Load prior turns for context (excludes the new message being sent now).
    history_rows = (
        db.query(Message)
        .filter(Message.chat_id == chat.id)
        .order_by(Message.created_at.asc())
        .all()
    )

    new_message_file_id: Optional[uuid.UUID] = None
    new_message_project_id: Optional[uuid.UUID] = None

    if payload.regenerate:
        # Regeneration reuses the last user message and drops the previous
        # assistant reply rather than appending a duplicate user turn.
        if not history_rows or history_rows[-1].role != "assistant":
            raise HTTPException(status_code=400, detail="Nothing to regenerate")
        last_assistant = history_rows[-1]
        last_user_row = history_rows[-2] if len(history_rows) >= 2 else None
        user_message_content = last_user_row.content if last_user_row else payload.content
        # Re-attach whatever file or project context was originally sent with this user
        # message, so regenerating doesn't silently lose context.
        new_message_file_id = last_user_row.file_id if last_user_row else None
        new_message_project_id = last_user_row.project_id if last_user_row else None
        db.delete(last_assistant)
        db.commit()
        context_history = [{"role": m.role, "content": m.content} for m in history_rows[:-2]]
        new_user_content = user_message_content
        save_user_message = False
    else:
        context_history = [{"role": m.role, "content": m.content} for m in history_rows]
        new_user_content = payload.content
        new_message_file_id = payload.file_id
        new_message_project_id = payload.project_id
        save_user_message = True

    # Fold attached file context or repository intelligence into user prompt
    ai_prompt_content = new_user_content
    if new_message_file_id:
        ai_prompt_content = _build_file_prompt(
            db, current_user.id, new_message_file_id, new_user_content
        )
    elif new_message_project_id:
        ai_prompt_content = _build_project_intelligence_prompt(
            db, new_message_project_id, new_user_content
        )

    chat_id = chat.id
    should_generate_title = is_new_chat or len(history_rows) == 0

    async def event_stream():
        nonlocal should_generate_title

        if is_new_chat:
            yield f"data: {json.dumps({'type': 'chat_created', 'chat_id': str(chat_id)})}\n\n"

        # Persist user message with context ids
        if save_user_message:
            user_msg = Message(
                chat_id=chat_id,
                role="user",
                content=new_user_content,
                token_count=estimate_token_count(new_user_content),
                file_id=new_message_file_id,
                project_id=new_message_project_id,
            )
            db.add(user_msg)
            db.commit()

        full_reply = ""
        try:
            async for delta in ai_service.stream_reply(context_history, ai_prompt_content):
                full_reply += delta
                yield f"data: {json.dumps({'type': 'delta', 'content': delta})}\n\n"
        except AIServiceError as e:
            logger.error("AI stream failed for chat %s: %s", chat_id, e.message)
            yield f"data: {json.dumps({'type': 'error', 'message': e.message})}\n\n"
            return
        except Exception as e:  # noqa: BLE001
            logger.exception("Unexpected error streaming chat %s", chat_id)
            yield f"data: {json.dumps({'type': 'error', 'message': 'An unexpected error occurred.'})}\n\n"
            return

        assistant_msg = Message(
            chat_id=chat_id,
            role="assistant",
            content=full_reply,
            token_count=estimate_token_count(full_reply),
        )
        db.add(assistant_msg)

        chat_row = db.query(Chat).filter(Chat.id == chat_id).first()
        if chat_row:
            from datetime import datetime, timezone

            chat_row.updated_at = datetime.now(timezone.utc)

        db.commit()
        db.refresh(assistant_msg)

        if should_generate_title:
            title = await ai_service.generate_title(new_user_content)
            chat_row = db.query(Chat).filter(Chat.id == chat_id).first()
            if chat_row:
                chat_row.title = title
                db.commit()
            yield f"data: {json.dumps({'type': 'title', 'title': title})}\n\n"

        yield f"data: {json.dumps({'type': 'done', 'message_id': str(assistant_msg.id)})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )
