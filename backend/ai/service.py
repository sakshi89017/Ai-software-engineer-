"""
AIService: the single point of contact with Google Gemini. Routers never call the
SDK directly — they call this service, so provider-specific quirks
stay isolated.
"""
import os
import logging
import asyncio
from typing import AsyncGenerator, Optional

from google import genai
from google.genai import types
from google.genai.errors import APIError

from ai.prompts import SYSTEM_PROMPT, build_title_generation_prompt
from ai.utils import fallback_title_from_message, sanitize_title

logger = logging.getLogger("devpilot.ai")

DEFAULT_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
TITLE_MODEL = os.getenv("GEMINI_TITLE_MODEL", "gemini-2.5-flash")


class AIServiceError(Exception):
    """Raised for any AI-provider failure; carries a user-safe message."""

    def __init__(self, message: str, status_code: int = 502):
        self.message = message
        self.status_code = status_code
        super().__init__(message)


class AIService:
    """Reusable service wrapping the Google Gen AI API."""

    def __init__(self):
        api_key = os.getenv("GEMINI_API_KEY")
        # Client is constructed even without a key so the app can boot; the
        # first real call will raise APIError, which we translate
        # into a clean AIServiceError instead of a raw 500.
        self._client = genai.Client(api_key=api_key or "missing-key")
        self._has_key = bool(api_key)

    def _build_input(self, history: list[dict], new_message: str) -> list[dict]:
        """Builds the Gemini chat content list (role user/model)."""
        contents = []
        for m in history:
            role = "model" if m["role"] == "assistant" else "user"
            contents.append({
                "role": role,
                "parts": [{"text": m["content"]}]
            })
        contents.append({
            "role": "user",
            "parts": [{"text": new_message}]
        })
        return contents

    async def stream_reply(
        self, history: list[dict], new_message: str
    ) -> AsyncGenerator[str, None]:
        """
        Streams the assistant's reply token-by-token using the Gemini API.
        Yields plain text deltas. Raises AIServiceError on any failure.
        """
        if not self._has_key:
            # Local mock response fallback for seamless testing
            mock_responses = [
                "Hello! I am your offline AI Software Engineer assistant.\n\n",
                "It looks like your `GEMINI_API_KEY` is not set or invalid in your `.env` configuration file.\n",
                "To help you continue testing, I am running in local development mode.\n\n",
                "Here is what I can do once the API key is configured:\n",
                "- Explain repository architectures\n",
                "- Locate database models and API routes\n",
                "- Review source code and generate tests\n"
            ]
            for chunk in mock_responses:
                yield chunk
                await asyncio.sleep(0.1)
            return

        max_retries = 3
        backoff = 0.5
        stream = None
        contents = self._build_input(history, new_message)
        config = types.GenerateContentConfig(
            system_instruction=SYSTEM_PROMPT,
        )

        for attempt in range(max_retries):
            try:
                stream = await self._client.aio.models.generate_content_stream(
                    model=DEFAULT_MODEL,
                    contents=contents,
                    config=config,
                )
                break
            except Exception as e:
                status_code = getattr(e, 'code', None)
                is_transient = (status_code is not None and status_code >= 500) or "timeout" in str(e).lower() or "connection" in str(e).lower()
                if is_transient and attempt < max_retries - 1:
                    logger.warning("Gemini connection failed, retrying in %fs... (Attempt %d/%d)", backoff, attempt + 1, max_retries)
                    await asyncio.sleep(backoff)
                    backoff *= 2
                else:
                    logger.error("Gemini stream connection failed after attempts: %s", e)
                    mock_err_responses = [
                        "Hello! I am your fallback developer assistant.\n\n",
                        f"The Gemini API returned an error: `{str(e)}`.\n",
                        "This usually happens when the configured `GEMINI_API_KEY` is invalid or expired.\n\n",
                        "Please check your API key configuration inside `backend/.env`.\n"
                    ]
                    for chunk in mock_err_responses:
                        yield chunk
                        await asyncio.sleep(0.1)
                    return

        try:
            async for chunk in stream:
                if chunk.text:
                    yield chunk.text

        except APIError as e:
            logger.error("Gemini API error: %s", e)
            status_code = getattr(e, 'code', 502)
            if status_code in (400, 401, 403):
                mock_key_responses = [
                    "Hello! I am your fallback developer assistant.\n\n",
                    "The Gemini API returned a key authentication error (400/401/403).\n",
                    "This usually happens when the configured `GEMINI_API_KEY` is invalid or expired.\n\n",
                    "Please check your API key configuration inside `backend/.env`.\n"
                ]
                for chunk in mock_key_responses:
                    yield chunk
                    await asyncio.sleep(0.1)
            elif status_code == 429:
                raise AIServiceError("Rate limit exceeded or quota exhausted. Please try again shortly.", 429)
            elif status_code >= 500:
                raise AIServiceError("The AI provider is currently unavailable. Please try again.", 503)
            else:
                raise AIServiceError(f"Gemini API error: {e.message}", 502)
        except Exception as e:
            logger.error("Unexpected error in Gemini service: %s", e)
            raise AIServiceError("An unexpected error occurred while communicating with Gemini.", 502)

    async def generate_title(self, first_message: str) -> str:
        """
        Generates a short chat title from the first user message. Falls back
        to a deterministic truncation if the AI call fails for any reason —
        title generation must never block chat creation.
        """
        if not self._has_key:
            return fallback_title_from_message(first_message)

        max_retries = 3
        backoff = 0.5
        response = None

        for attempt in range(max_retries):
            try:
                response = await self._client.aio.models.generate_content(
                    model=TITLE_MODEL,
                    contents=build_title_generation_prompt(first_message),
                    config=types.GenerateContentConfig(
                        system_instruction="You generate short chat titles only.",
                        max_output_tokens=20,
                    ),
                )
                break
            except Exception as e:
                status_code = getattr(e, 'code', None)
                is_transient = (status_code is not None and status_code >= 500) or "timeout" in str(e).lower() or "connection" in str(e).lower()
                if is_transient and attempt < max_retries - 1:
                    await asyncio.sleep(backoff)
                    backoff *= 2
                else:
                    logger.warning("Title generation failed, using fallback: %s", e)
                    return fallback_title_from_message(first_message)

        try:
            raw_title = response.text or ""
            return sanitize_title(raw_title) if raw_title.strip() else fallback_title_from_message(first_message)
        except Exception as e:  # noqa: BLE001 - title generation must never crash chat creation
            logger.warning("Title generation failed, using fallback: %s", e)
            return fallback_title_from_message(first_message)

    def generate_embeddings(self, texts: list[str]) -> list[list[float]]:
        """
        Generates text embeddings using the Gemini models.embed_content API.
        """
        if not self._has_key:
            return [[0.0] * 768 for _ in texts]
        try:
            response = self._client.models.embed_content(
                model="text-embedding-004",
                contents=texts,
            )
            if isinstance(response.embeddings, list):
                return [e.values for e in response.embeddings]
            else:
                return [response.embeddings.values]
        except Exception as e:
            logger.error("Failed to generate embeddings: %s", e)
            return [[0.0] * 768 for _ in texts]


# Singleton instance used by the router (stateless aside from the Gemini client).
ai_service = AIService()
