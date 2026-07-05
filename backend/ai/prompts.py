"""
Prompt definitions for The AI Software Engineer. Kept separate from service/business logic
so prompt tuning never requires touching request-handling code.
"""

SYSTEM_PROMPT = """You are The AI Software Engineer, an expert AI Software Engineering Assistant.

You specialize exclusively in:
- Software engineering and programming (all major languages)
- Debugging and root-cause analysis
- Software architecture and system design
- Code review and best practices
- Algorithms and data structures
- Databases (SQL and NoSQL) and data modeling
- DevOps, CI/CD, and infrastructure
- Testing strategy and test writing

Guidelines:
- Answer only software/technical questions professionally and precisely.
- If asked something unrelated to software engineering, politely redirect the
  user back to technical topics.
- Always format code in fenced Markdown code blocks with the correct language tag.
- Prefer concise, correct, production-quality code over verbose explanations.
- When debugging, identify the root cause before suggesting a fix.
- When reviewing code, call out concrete issues (correctness, security,
  performance, readability) rather than generic praise.
"""


def build_title_generation_prompt(first_message: str) -> str:
    """Prompt used to auto-generate a short chat title from the first user message."""
    return (
        "Generate a short, descriptive chat title (max 6 words, no quotes, "
        "no trailing punctuation) summarizing this request:\n\n"
        f"{first_message}"
    )


ANALYSIS_PROMPTS = {
    "explain": "Explain what this code does in detail, including its overall purpose, inputs/outputs, and any non-obvious logic:\n\n{code}",
    "bugs": "Analyze this code for bugs, errors, security vulnerabilities, or logical mistakes. Highlight the root cause of each issue and show how to fix it:\n\n{code}",
    "optimize": "Optimize this code for better performance, runtime speed, memory footprint, and algorithmic efficiency. Explain the optimization decisions:\n\n{code}",
    "comments": "Generate clear, concise comments for this code. Explain the purpose of major blocks, helper functions, and logic paths. Return the fully commented version of the code:\n\n{code}",
    "algorithm": "Identify and explain the algorithm implemented in this code step-by-step. Describe its time complexity (Big O) and space complexity:\n\n{code}",
    "improvements": "Suggest general improvements to this code, covering readability, styling conventions, folder/file structure, and best practices:\n\n{code}",
    "tests": "Generate comprehensive unit tests for this code using standard testing frameworks (e.g. pytest for Python, Jest for JS, JUnit for Java). Cover edge cases:\n\n{code}",
    "summarize": "Provide a high-level summary of this code file, listing its primary purpose, classes, exported interfaces, and main dependencies:\n\n{code}"
}


def build_analysis_prompt(action: str, code: str) -> str:
    """Prompt used to auto-generate code analysis responses based on the specified action."""
    template = ANALYSIS_PROMPTS.get(action, "Analyze this code:\n\n{code}")
    return template.format(code=code)
