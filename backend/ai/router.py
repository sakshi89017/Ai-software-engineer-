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
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(Chat).filter(Chat.user_id == current_user.id)
    if search:
        query = query.filter(Chat.title.ilike(f"%{search}%"))
    chats = query.order_by(Chat.updated_at.desc()).all()

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
def rename_chat(
    chat_id: uuid.UUID,
    payload: ChatUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    chat = _get_owned_chat(db, chat_id, current_user.id)
    chat.title = payload.title
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

    if payload.regenerate:
        # Regeneration reuses the last user message and drops the previous
        # assistant reply rather than appending a duplicate user turn.
        if not history_rows or history_rows[-1].role != "assistant":
            raise HTTPException(status_code=400, detail="Nothing to regenerate")
        last_assistant = history_rows[-1]
        last_user_row = history_rows[-2] if len(history_rows) >= 2 else None
        user_message_content = last_user_row.content if last_user_row else payload.content
        # Re-attach whatever file (if any) was originally sent with this user
        # message, so regenerating doesn't silently lose file context.
        new_message_file_id = last_user_row.file_id if last_user_row else None
        db.delete(last_assistant)
        db.commit()
        context_history = [{"role": m.role, "content": m.content} for m in history_rows[:-2]]
        new_user_content = user_message_content
        save_user_message = False
    else:
        context_history = [{"role": m.role, "content": m.content} for m in history_rows]
        new_user_content = payload.content
        new_message_file_id = payload.file_id
        save_user_message = True

    # If a file is attached, fold its content into the prompt sent to the
    # model for this turn only. The DB keeps the user's original typed
    # message clean; the file content is not duplicated into chat history.
    ai_prompt_content = new_user_content
    if new_message_file_id:
        ai_prompt_content = _build_file_prompt(
            db, current_user.id, new_message_file_id, new_user_content
        )

    chat_id = chat.id
    should_generate_title = is_new_chat or len(history_rows) == 0

    async def event_stream():
        nonlocal should_generate_title

        if is_new_chat:
            yield f"data: {json.dumps({'type': 'chat_created', 'chat_id': str(chat_id)})}\n\n"

        # Persist the user's message before generating a reply so it isn't
        # lost if the stream fails partway through.
        if save_user_message:
            user_msg = Message(
                chat_id=chat_id,
                role="user",
                content=new_user_content,
                token_count=estimate_token_count(new_user_content),
                file_id=new_message_file_id,
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
