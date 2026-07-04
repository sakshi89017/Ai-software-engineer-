"""
AIService: the single point of contact with OpenAI. Routers never call the
OpenAI SDK directly — they call this service, so provider-specific quirks
(streaming event shapes, error types) stay isolated here.
"""
import os
import logging
from typing import AsyncGenerator, Optional

from openai import (
    AsyncOpenAI,
    APITimeoutError,
    RateLimitError,
    AuthenticationError,
    APIConnectionError,
    APIError,
)

from ai.prompts import SYSTEM_PROMPT, build_title_generation_prompt
from ai.utils import fallback_title_from_message, sanitize_title

logger = logging.getLogger("devpilot.ai")

DEFAULT_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
TITLE_MODEL = os.getenv("OPENAI_TITLE_MODEL", "gpt-4o-mini")


class AIServiceError(Exception):
    """Raised for any AI-provider failure; carries a user-safe message."""

    def __init__(self, message: str, status_code: int = 502):
        self.message = message
        self.status_code = status_code
        super().__init__(message)


class AIService:
    """Reusable service wrapping the OpenAI Responses API."""

    def __init__(self):
        api_key = os.getenv("OPENAI_API_KEY")
        # Client is constructed even without a key so the app can boot; the
        # first real call will raise AuthenticationError, which we translate
        # into a clean AIServiceError instead of a raw 500.
        self._client = AsyncOpenAI(api_key=api_key or "missing-key")
        self._has_key = bool(api_key)

    def _build_input(self, history: list[dict], new_message: str) -> list[dict]:
        """Builds the Responses API `input` array: system + prior turns + new turn."""
        messages = [{"role": "system", "content": SYSTEM_PROMPT}]
        for m in history:
            messages.append({"role": m["role"], "content": m["content"]})
        messages.append({"role": "user", "content": new_message})
        return messages

    async def stream_reply(
        self, history: list[dict], new_message: str
    ) -> AsyncGenerator[str, None]:
        """
        Streams the assistant's reply token-by-token using the Chat Completions API.
        Yields plain text deltas. Raises AIServiceError on any failure so the
        router can surface a clean error to the client mid-stream.
        """
        if not self._has_key:
            raise AIServiceError(
                "The AI service is not configured (missing OPENAI_API_KEY).", 503
            )

        try:
            stream = await self._client.chat.completions.create(
                model=DEFAULT_MODEL,
                messages=self._build_input(history, new_message),
                stream=True,
            )
            async for chunk in stream:
                if chunk.choices and len(chunk.choices) > 0:
                    delta = chunk.choices[0].delta.content
                    if delta:
                        yield delta

        except AuthenticationError as e:
            logger.error("OpenAI authentication error: %s", e)
            raise AIServiceError("Invalid or missing OpenAI API key.", 401)
        except RateLimitError as e:
            logger.error("OpenAI rate limit error: %s", e)
            raise AIServiceError("Rate limit exceeded. Please try again shortly.", 429)
        except APITimeoutError as e:
            logger.error("OpenAI timeout: %s", e)
            raise AIServiceError("The AI provider timed out. Please try again.", 504)
        except APIConnectionError as e:
            logger.error("OpenAI connection error: %s", e)
            raise AIServiceError("Could not reach the AI provider. Please try again.", 502)
        except APIError as e:
            logger.error("OpenAI API error: %s", e)
            raise AIServiceError("The AI provider returned an error.", 502)

    async def generate_title(self, first_message: str) -> str:
        """
        Generates a short chat title from the first user message. Falls back
        to a deterministic truncation if the AI call fails for any reason —
        title generation must never block chat creation.
        """
        if not self._has_key:
            return fallback_title_from_message(first_message)

        try:
            response = await self._client.chat.completions.create(
                model=TITLE_MODEL,
                messages=[
                    {"role": "system", "content": "You generate short chat titles only."},
                    {"role": "user", "content": build_title_generation_prompt(first_message)},
                ],
                stream=False,
            )
            raw_title = response.choices[0].message.content or ""
            return sanitize_title(raw_title) if raw_title.strip() else fallback_title_from_message(first_message)
        except Exception as e:  # noqa: BLE001 - title generation must never crash chat creation
            logger.warning("Title generation failed, using fallback: %s", e)
            return fallback_title_from_message(first_message)


# Singleton instance used by the router (stateless aside from the OpenAI client).
ai_service = AIService()
