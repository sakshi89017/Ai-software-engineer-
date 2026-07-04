"""
Small stateless helpers for the AI module: token estimation and title
fallbacks. Kept dependency-light (no tiktoken requirement) so the module
works even before an OpenAI key is configured.
"""
import re


def estimate_token_count(text: str) -> int:
    """
    Cheap, dependency-free token estimate (~4 chars per token, English-biased).
    Good enough for storage/analytics; not used for billing-accurate counts.
    """
    if not text:
        return 0
    return max(1, len(text) // 4)


def fallback_title_from_message(message: str, max_words: int = 6) -> str:
    """
    Deterministic fallback title generator used if the AI title call fails
    (timeout, rate limit, missing key, etc.) so a chat is never left titleless.
    """
    cleaned = re.sub(r"\s+", " ", message).strip()
    words = cleaned.split(" ")[:max_words]
    title = " ".join(words)
    if len(cleaned.split(" ")) > max_words:
        title += "..."
    return title[:255] if title else "New Chat"


def sanitize_title(raw_title: str) -> str:
    """Strip quotes/markdown artifacts the model sometimes wraps titles in."""
    title = raw_title.strip().strip('"').strip("'").strip()
    title = title.rstrip(".!")
    return title[:255] if title else "New Chat"
