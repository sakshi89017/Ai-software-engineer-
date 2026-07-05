import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class MessageOut(BaseModel):
    id: uuid.UUID
    chat_id: uuid.UUID
    role: str
    content: str
    token_count: int
    file_id: Optional[uuid.UUID] = None
    created_at: datetime

    class Config:
        from_attributes = True


class ChatOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    title: str
    is_pinned: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ChatWithMessages(ChatOut):
    messages: list[MessageOut] = []


class ChatListItem(BaseModel):
    """Lightweight shape for the sidebar list — no message bodies."""
    id: uuid.UUID
    title: str
    is_pinned: bool
    created_at: datetime
    updated_at: datetime
    last_message_preview: Optional[str] = None

    class Config:
        from_attributes = True


class ChatCreate(BaseModel):
    title: Optional[str] = Field(default="New Chat", max_length=255)


class ChatUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=255)
    is_pinned: Optional[bool] = None


class SendMessageRequest(BaseModel):
    chat_id: Optional[uuid.UUID] = None
    content: str = Field(min_length=1, max_length=16000)
    regenerate: bool = False
    file_id: Optional[uuid.UUID] = None
