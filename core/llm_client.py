"""
core/llm_client.py

Central entry point for ALL LLM calls in the system.
Business logic must NEVER call OpenAI directly — always go through here.

Responsibilities:
  - Construct and send chat completion requests
  - Enforce retry logic via core/retry.py
  - Log every call: model, tokens, latency, cost estimate
  - Support raw text responses and structured (JSON) responses
  - Validate structured outputs with Pydantic

Token cost estimates are approximate and based on gpt-4o-mini pricing.
Update COST_PER_1K_TOKENS if switching models.
"""

import json
import time
from typing import Any, Type, TypeVar

from openai import OpenAI, APIStatusError, APITimeoutError, APIConnectionError
from pydantic import BaseModel

from core.config import config
from core.retry import with_retry
from observability.logger import get_logger

logger = get_logger(__name__)

# Cost table (USD per 1k tokens) 
COST_PER_1K_TOKENS: dict[str, dict[str, float]] = {
    "gpt-4o-mini":   {"input": 0.000150, "output": 0.000600},
    "gpt-4o":        {"input": 0.005000, "output": 0.015000},
    "gpt-4-turbo":   {"input": 0.010000, "output": 0.030000},
    "gpt-3.5-turbo": {"input": 0.000500, "output": 0.001500},
}

# Retryable OpenAI exception types
_RETRYABLE = (APIStatusError, APITimeoutError, APIConnectionError)

T = TypeVar("T", bound=BaseModel)

# ── Internal OpenAI client (singleton) ──────────────────────────────────────
_client = OpenAI(api_key=config.OPENAI_API_KEY)

# ── Cost helper ──────────────────────────────────────────────────────────────

def _estimate_cost(model: str, input_tokens: int, output_tokens: int) -> float:
    """Return estimated USD cost for a completion call."""
    rates = COST_PER_1K_TOKENS.get(model)
    if not rates:
        return 0.0
    return (
        (input_tokens  / 1000) * rates["input"] +
        (output_tokens / 1000) * rates["output"]
    )


# ── Core LLM call ────────────────────────────────────────────────────────────

@with_retry(max_attempts=3, base_delay=1.0, backoff_factor=2.0, retryable_exceptions=_RETRYABLE)
def _call_openai(
    messages: list[dict],
    model: str,
    temperature: float,
    max_tokens: int,
) -> Any:
    """Raw call to OpenAI — wrapped by retry decorator. Returns the full API response."""
    return _client.chat.completions.create(
        model=model,
        messages=messages,
        temperature=temperature,
        max_tokens=max_tokens,
    )


def call_llm(
    prompt: str,
    *,
    system: str = "You are a helpful assistant.",
    model: str | None = None,
    temperature: float | None = None,
    max_tokens: int | None = None,
) -> str:
    """
    Send a user prompt to the LLM and return the response as a plain string.

    Args:
        prompt:      The user-facing prompt text.
        system:      System instruction (defaults to generic assistant).
        model:       Override config model for this call.
        temperature: Override config temperature for this call.
        max_tokens:  Override config max_tokens for this call.

    Returns:
        The model's response text (stripped).

    Raises:
        RuntimeError: If the LLM call fails after all retries.
    """
    resolved_model  = model       or config.MODEL_NAME
    resolved_temp   = temperature if temperature is not None else config.TEMPERATURE
    resolved_tokens = max_tokens  or config.MAX_TOKENS

    messages = [
        {"role": "system", "content": system},
        {"role": "user",   "content": prompt},
    ]

    logger.info(
        f"[llm] Calling model='{resolved_model}' "
        f"temp={resolved_temp} max_tokens={resolved_tokens}"
    )
    t0 = time.perf_counter()

    try:
        response = _call_openai(messages, resolved_model, resolved_temp, resolved_tokens)
    except Exception as exc:
        logger.error(f"[llm] Call failed: {exc}")
        raise RuntimeError(f"LLM call failed: {exc}") from exc

    latency_ms = (time.perf_counter() - t0) * 1000
    usage = response.usage
    cost  = _estimate_cost(resolved_model, usage.prompt_tokens, usage.completion_tokens)

    logger.info(
        f"[llm] Done in {latency_ms:.0f}ms | "
        f"input={usage.prompt_tokens} output={usage.completion_tokens} tokens | "
        f"est. cost=${cost:.6f}"
    )

    return response.choices[0].message.content.strip() 


def call_llm_structured(
    prompt: str,
    schema: Type[T],
    *,
    system: str = "You are a helpful assistant. Always respond with valid JSON only.",
    model: str | None = None,
    temperature: float | None = None,
    max_tokens: int | None = None,
) -> T:
    """
    Send a prompt to the LLM and parse the response into a Pydantic model.

    The system prompt automatically instructs the model to return JSON.
    The raw response is parsed and validated — invalid JSON raises ValueError.

    Args:
        prompt:  The user-facing prompt text.
        schema:  A Pydantic BaseModel subclass defining the expected shape.

    Returns:
        A validated instance of `schema`.

    Raises:
        ValueError:   If the response is not valid JSON or fails schema validation.
        RuntimeError: If the LLM call itself fails.
    """
    json_system = (
        f"{system}\n\n"
        "You must respond ONLY with a valid JSON object matching this schema:\n"
        f"{json.dumps(schema.model_json_schema(), indent=2)}\n"
        "No preamble, no explanation, no markdown fences — just the JSON object."
    )

    raw = call_llm(
        prompt,
        system=json_system,
        model=model,
        temperature=temperature,
        max_tokens=max_tokens,
    )

    # Strip accidental markdown fences
    clean = (
        raw.strip()
        .removeprefix("```json")
        .removeprefix("```")
        .removesuffix("```")
        .strip()
    )

    try:
        data = json.loads(clean)
    except json.JSONDecodeError as exc:
        logger.error(f"[llm] Structured output is not valid JSON: {exc}\nRaw: {raw[:300]}")
        raise ValueError(f"LLM returned invalid JSON: {exc}") from exc

    try:
        return schema.model_validate(data)
    except Exception as exc:
        logger.error(f"[llm] JSON does not match schema '{schema.__name__}': {exc}")
        raise ValueError(f"LLM output failed schema validation: {exc}") from exc