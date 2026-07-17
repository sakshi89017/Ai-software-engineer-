import uuid
from datetime import datetime
from pydantic import BaseModel, EmailStr, Field


class UserRegister(BaseModel):
    full_name: str = Field(min_length=2, max_length=255)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: uuid.UUID
    full_name: str
    email: EmailStr
    created_at: datetime

    class Config:
        from_attributes = True


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserOut


class RefreshRequest(BaseModel):
    refresh_token: str


class UserUpdate(BaseModel):
    """Body for PATCH /api/auth/me. Only full_name is editable for now —
    email changes would need re-verification, so that's out of scope here."""

    full_name: str = Field(min_length=2, max_length=255)


class ChangePasswordRequest(BaseModel):
    """Body for POST /api/auth/change-password. Confirmation matching is a
    frontend-only concern (see validations/auth.ts); the server only needs
    the current password (to verify) and the new one (to set)."""

    current_password: str = Field(min_length=1)
    new_password: str = Field(min_length=8, max_length=128)


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(min_length=8, max_length=128)
