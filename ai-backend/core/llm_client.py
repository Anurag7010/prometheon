"""
core/llm_client.py

Central entry point for ALL LLM calls. Never call OpenAI directly in business logic.

Public functions:
    call_llm(prompt, ...)           → str
    call_llm_structured(prompt, schema, ...) → T (Pydantic model)
    complete(prompt, ...)           → dict  (normalized response shape)
    complete_with_fallback(prompt_name, user_vars, ...) → dict  (validated output with retry)
"""

import asyncio
import json
import time
from typing import Any, AsyncGenerator, Type, TypeVar

from openai import APIConnectionError, APIStatusError, APITimeoutError, AsyncOpenAI, OpenAI
from pydantic import BaseModel

from core.config import config
from core.retry import with_retry
from observability.logger import get_logger, log_llm_call, log_pipeline_event

logger = get_logger(__name__)

# ── Cost table (USD per 1k tokens) ───────────────────────────────────────────
COST_PER_1K_TOKENS: dict[str, dict[str, float]] = {
    "gpt-4o-mini": {"input": 0.000150, "output": 0.000600},
    "gpt-4o": {"input": 0.005000, "output": 0.015000},
    "gpt-4-turbo": {"input": 0.010000, "output": 0.030000},
    "gpt-3.5-turbo": {"input": 0.000500, "output": 0.001500},
}

_RETRYABLE = (APIStatusError, APITimeoutError, APIConnectionError)
T = TypeVar("T", bound=BaseModel)

_client = OpenAI(api_key=config.OPENAI_API_KEY)
_async_client = AsyncOpenAI(api_key=config.OPENAI_API_KEY)


def _estimate_cost(model: str, input_tokens: int, output_tokens: int) -> float:
    """Return estimated USD cost for a completion call."""
    rates = COST_PER_1K_TOKENS.get(model)
    if not rates:
        return 0.0
    return (input_tokens / 1000) * rates["input"] + (output_tokens / 1000) * rates["output"]


@with_retry(max_attempts=3, base_delay=1.0, backoff_factor=2.0, retryable_exceptions=_RETRYABLE)
def _call_openai(messages: list[dict], model: str, temperature: float, max_tokens: int) -> Any:
    """Raw retried OpenAI call — returns the full API response object."""
    return _client.chat.completions.create(
        model=model,
        messages=messages,
        temperature=temperature,
        max_tokens=max_tokens,
    )


def complete(
    prompt: str,
    *,
    system: str = "You are a helpful assistant.",
    system_prompt: str | None = None,
    model: str | None = None,
    temperature: float | None = None,
    max_tokens: int | None = None,
    trace_id: str | None = None,
    extra_metadata: dict | None = None,
) -> dict:
    """
    Send a prompt to the LLM and return a normalized response dict.

    Returns:
        {text, tokens_used, model, latency_ms, error}
        error is None on success, a string on failure.
    """
    resolved_model = model or config.MODEL_NAME
    resolved_temp = temperature if temperature is not None else config.TEMPERATURE
    resolved_tokens = max_tokens or config.MAX_TOKENS
    resolved_tid = trace_id or ""
    # system_prompt takes precedence over system when provided
    resolved_system = system_prompt if system_prompt is not None else system

    messages = [
        {"role": "system", "content": resolved_system},
        {"role": "user", "content": prompt},
    ]

    t0 = time.perf_counter()
    try:
        response = _call_openai(messages, resolved_model, resolved_temp, resolved_tokens)
        latency_ms = (time.perf_counter() - t0) * 1000
        usage = response.usage
        cost = _estimate_cost(resolved_model, usage.prompt_tokens, usage.completion_tokens)
        text = (response.choices[0].message.content or "").strip()

        log_llm_call(
            trace_id=resolved_tid,
            model=resolved_model,
            input_tokens=usage.prompt_tokens,
            output_tokens=usage.completion_tokens,
            latency_ms=latency_ms,
            cost_usd=cost,
        )
        if extra_metadata:
            logger.info(
                "[llm] extra_metadata",
                extra={"trace_id": resolved_tid, **extra_metadata},
            )
        return {
            "text": text,
            "tokens_used": usage.prompt_tokens + usage.completion_tokens,
            "model": resolved_model,
            "latency_ms": round(latency_ms, 2),
            "error": None,
        }

    except Exception as exc:
        latency_ms = (time.perf_counter() - t0) * 1000
        log_llm_call(
            trace_id=resolved_tid,
            model=resolved_model,
            input_tokens=0,
            output_tokens=0,
            latency_ms=latency_ms,
            cost_usd=0.0,
            error=str(exc),
        )
        return {
            "text": "",
            "tokens_used": 0,
            "model": resolved_model,
            "latency_ms": round(latency_ms, 2),
            "error": str(exc),
        }


def call_llm(
    prompt: str,
    *,
    system: str = "You are a helpful assistant.",
    model: str | None = None,
    temperature: float | None = None,
    max_tokens: int | None = None,
    trace_id: str | None = None,
) -> str:
    """Send a prompt and return response as a plain string. Raises RuntimeError on failure."""
    result = complete(
        prompt,
        system=system,
        model=model,
        temperature=temperature,
        max_tokens=max_tokens,
        trace_id=trace_id,
    )
    if result["error"]:
        raise RuntimeError(f"LLM call failed: {result['error']}")
    return result["text"]


def call_llm_structured(
    prompt: str,
    schema: Type[T],
    *,
    system: str = "You are a helpful assistant. Always respond with valid JSON only.",
    model: str | None = None,
    temperature: float | None = None,
    max_tokens: int | None = None,
    trace_id: str | None = None,
) -> T:
    """Send a prompt and parse the response into a validated Pydantic model."""
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
        trace_id=trace_id,
    )

    clean = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()

    try:
        data = json.loads(clean)
    except json.JSONDecodeError as exc:
        logger.error(f"[llm] Structured output not valid JSON: {exc}\nRaw: {raw[:300]}")
        raise ValueError(f"LLM returned invalid JSON: {exc}") from exc

    try:
        return schema.model_validate(data)
    except Exception as exc:
        logger.error(f"[llm] JSON failed schema '{schema.__name__}': {exc}")
        raise ValueError(f"LLM output failed schema validation: {exc}") from exc


async def stream(
    prompt: str,
    *,
    system: str = "You are a helpful assistant.",
    model: str | None = None,
    temperature: float | None = None,
    trace_id: str | None = None,
) -> AsyncGenerator[str, None]:
    """
    Stream tokens from the LLM one by one.

    Yields each token string as it arrives. Logs start/end with trace_id and latency.
    Re-raises on error — caller sends the error SSE event.
    No retry: streaming is stateful; retrying would duplicate tokens.
    """
    resolved_model = model or config.MODEL_NAME
    resolved_temp = temperature if temperature is not None else config.TEMPERATURE
    resolved_tokens = config.MAX_TOKENS
    resolved_tid = trace_id or ""

    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": prompt},
    ]

    t0 = time.perf_counter()
    token_count = 0
    logger.info("[llm] stream_start", extra={"trace_id": resolved_tid, "model": resolved_model})

    try:
        response = await _async_client.chat.completions.create(
            model=resolved_model,
            messages=messages,
            temperature=resolved_temp,
            max_tokens=resolved_tokens,
            stream=True,
        )
        async for chunk in response:
            choice = chunk.choices[0] if chunk.choices else None
            if not choice:
                continue
            if choice.finish_reason == "length":
                logger.warning(
                    "[llm] stream truncated: finish_reason=length", extra={"trace_id": resolved_tid}
                )
                continue
            delta_content = choice.delta.content if choice.delta else None
            if delta_content is not None:
                token_count += 1
                yield delta_content

        latency_ms = (time.perf_counter() - t0) * 1000
        logger.info(
            "[llm] stream_end",
            extra={
                "trace_id": resolved_tid,
                "token_count": token_count,
                "latency_ms": round(latency_ms, 2),
            },
        )
    except Exception as exc:
        latency_ms = (time.perf_counter() - t0) * 1000
        logger.error(
            "[llm] stream_error",
            extra={"trace_id": resolved_tid, "error": str(exc), "latency_ms": round(latency_ms, 2)},
        )
        raise


async def complete_with_fallback(
    prompt_name: str,
    user_vars: dict,
    trace_id: str | None = None,
    max_retries: int = 2,
) -> dict:
    """
    Complete with automatic output validation and retry.

    Returns:
        {success, data, raw, prompt_version, attempts, error}
    """
    if max_retries < 1:
        raise ValueError(f"max_retries must be >= 1, got {max_retries}")

    from core.output_validator import validate_json_output, validate_prose_output
    from core.prompt_registry import PromptRegistry

    template = PromptRegistry.get(prompt_name)
    user_prompt = PromptRegistry.render_user(prompt_name, **user_vars)
    raw_output = ""

    for attempt in range(1, max_retries + 1):
        current_prompt = user_prompt
        if attempt > 1:
            # Simplified retry prompt
            question = user_vars.get("question")
            current_prompt = f"Please answer this simply: {question}" if question else user_prompt
            log_pipeline_event(
                "prompt_retry", trace_id or "", {"prompt": prompt_name, "attempt": attempt}
            )

        result = await asyncio.to_thread(
            complete,
            current_prompt,
            system_prompt=template.system,
            trace_id=trace_id,
            extra_metadata={"prompt_version": template.version, "attempt": attempt},
        )

        raw_output = result.get("text", "")

        if result.get("error"):
            log_pipeline_event(
                "llm_call_failed",
                trace_id or "",
                {"prompt": prompt_name, "attempt": attempt, "error": result["error"]},
            )
            continue

        if template.output_schema:
            validation = validate_json_output(raw_output, template.output_schema)
        else:
            validation = validate_prose_output(raw_output)

        if validation.valid:
            return {
                "success": True,
                "data": validation.data,
                "raw": raw_output,
                "prompt_version": template.version,
                "attempts": attempt,
                "error": None,
            }

        log_pipeline_event(
            "output_validation_failed",
            trace_id or "",
            {"prompt": prompt_name, "attempt": attempt, "error": validation.error},
        )

    return {
        "success": False,
        "data": None,
        "raw": raw_output,
        "prompt_version": template.version,
        "attempts": max_retries,
        "error": f"Output validation failed after {max_retries} attempts",
    }
