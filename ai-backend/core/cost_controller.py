"""
core/cost_controller.py

Per-user daily token budget tracker.

NOTE: In-memory — resets on server restart.
For production with multiple instances, persist to PostgreSQL or Redis.
"""

from collections import defaultdict
from datetime import date
from typing import Optional

from observability.logger import log_pipeline_event

PRICING: dict[str, dict[str, float]] = {
    'gpt-4o': {'input': 5.0 / 1_000_000, 'output': 15.0 / 1_000_000},
    'gpt-4o-mini': {'input': 0.15 / 1_000_000, 'output': 0.60 / 1_000_000},
}

DEFAULT_DAILY_TOKEN_BUDGET = 100_000


class CostController:
    """
    Tracks per-user daily token usage and enforces budgets.

    In-memory cache for today's usage; rebuilt from zero on server restart.
    """

    def __init__(self, daily_budget: int = DEFAULT_DAILY_TOKEN_BUDGET):
        self.daily_budget = daily_budget
        self._usage: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))

    def record_usage(
        self,
        user_id: str,
        input_tokens: int,
        output_tokens: int,
        model: str = 'gpt-4o',
        trace_id: Optional[str] = None,
    ) -> None:
        """Record token usage for a user."""
        today = date.today().isoformat()
        total = input_tokens + output_tokens
        self._usage[user_id][today] += total

        pricing = PRICING.get(model, PRICING['gpt-4o'])
        cost_usd = (input_tokens * pricing['input']) + (output_tokens * pricing['output'])

        log_pipeline_event(
            event='token_usage_recorded',
            trace_id=trace_id or '',
            metadata={
                'user_id': user_id,
                'input_tokens': input_tokens,
                'output_tokens': output_tokens,
                'total_tokens': total,
                'estimated_cost_usd': round(cost_usd, 6),
                'daily_total': self._usage[user_id][today],
            },
        )

    def check_budget(self, user_id: str, trace_id: Optional[str] = None) -> dict:
        """
        Check if user has remaining budget for today.

        Returns dict with allowed, used_today, budget, remaining, reset_at.
        """
        today = date.today().isoformat()
        used = self._usage[user_id][today]
        remaining = max(0, self.daily_budget - used)
        allowed = remaining > 0

        if not allowed:
            log_pipeline_event(
                event='budget_exceeded',
                trace_id=trace_id or '',
                metadata={
                    'user_id': user_id,
                    'used_today': used,
                    'budget': self.daily_budget,
                },
            )

        return {
            'allowed': allowed,
            'used_today': used,
            'budget': self.daily_budget,
            'remaining': remaining,
            'reset_at': 'midnight UTC',
        }

    def get_user_stats(self, user_id: str) -> dict:
        """Return usage stats for a user."""
        today = date.today().isoformat()
        used = self._usage[user_id][today]
        return {
            'used_today': used,
            'budget': self.daily_budget,
            'remaining': max(0, self.daily_budget - used),
        }


cost_controller = CostController()
