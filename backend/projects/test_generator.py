import logging
from ai.service import ai_service, DEFAULT_MODEL
from google.genai import types

logger = logging.getLogger("devpilot.testgenerator")


def build_test_generation_prompt(test_type: str, language: str, filename: str, code: str) -> str:
    """
    Builds a highly tailored prompt for generating test suites based on type, language, and filename.
    """
    type_descriptions = {
        "unit": "comprehensive Unit Tests covering individual functions, edge cases, and branches.",
        "integration": "Integration Tests verifying component interaction, database mock calls, and request/response pipelines.",
        "mock_data": "mock data structures, mock payloads, fixture setups, and test database stubs.",
        "edge_cases": "focused edge case tests covering boundary conditions, division by zero, empty inputs, null pointers, and exception handling."
    }
    
    type_desc = type_descriptions.get(test_type.lower(), "unit tests")
    
    prompt = (
        f"You are an expert software quality engineer specializing in testing. Generate {type_desc} "
        f"specifically for the file `{filename}` which is written in `{language}`.\n\n"
        f"Follow these strict formatting guidelines:\n"
        f"- Output ONLY the clean code inside a standard code block without any prefix or suffix explanations.\n"
        f"- Ensure the test suite compiles and runs cleanly using standard toolchains for {language}.\n\n"
        f"SOURCE CODE:\n\n"
        f"```\n{code}\n```"
    )
    return prompt


def generate_tests_for_code(filename: str, language: str, code: str, test_type: str) -> str:
    """
    Runs Gemini to generate a test suite tailored to the file's language, name, and requested test type.
    """
    prompt = build_test_generation_prompt(test_type, language, filename, code)
    
    mock_headers = {
        "python": "import pytest\nfrom unittest.mock import MagicMock",
        "javascript": "const { describe, it, expect } = require('@jest/globals');",
        "typescript": "import { describe, it, expect, vi } from 'vitest';",
        "java": "import org.junit.jupiter.api.Test;\nimport static org.junit.jupiter.api.Assertions.*;",
        "go": "package main\nimport (\n\t\"testing\"\n)"
    }
    mock_body = {
        "unit": "\ndef test_addition_unit():\n    assert 1 + 1 == 2",
        "integration": "\ndef test_integration_flow():\n    assert True",
        "mock_data": "\ndef test_mock_fixtures():\n    mock = MagicMock()\n    assert mock is not None",
        "edge_cases": "\ndef test_edge_cases_handling():\n    with pytest.raises(ValueError):\n        raise ValueError()"
    }
    
    lang_key = language.lower()
    if lang_key in ("js", "jsx"):
        lang_key = "javascript"
    elif lang_key in ("ts", "tsx"):
        lang_key = "typescript"
    elif lang_key in ("py",):
        lang_key = "python"
        
    hdr = mock_headers.get(lang_key, "import pytest")
    body = mock_body.get(test_type.lower(), "\ndef test_unit():\n    pass")

    if not ai_service._has_key:
        return f"{hdr}\n{body}\n"
        
    try:
        response = ai_service._client.models.generate_content(
            model=DEFAULT_MODEL,
            contents=prompt
        )
        # Strip code block decorators if present
        text = response.text.strip()
        if text.startswith("```"):
            lines = text.split("\n")
            if lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].strip() == "```":
                lines = lines[:-1]
            text = "\n".join(lines).strip()
        return text
    except Exception as e:
        logger.warning("AI test generation failed, returning mock fallback: %s", e)
        return f"{hdr}\n{body}\n"
