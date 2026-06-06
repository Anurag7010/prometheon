"""Tests for core/cost_controller.py."""

from unittest.mock import patch

import pytest

from core.cost_controller import CostController


def _today() -> str:
    from datetime import date
    return date.today().isoformat()


def test_first_request_is_always_allowed():
    cc = CostController(daily_budget=100_000)
    budget = cc.check_budget("user_a")
    assert budget["allowed"] is True
    assert budget["used_today"] == 0
    assert budget["remaining"] == 100_000


def test_usage_is_recorded_correctly_per_user():
    cc = CostController(daily_budget=100_000)
    cc.record_usage("user_b", input_tokens=500, output_tokens=200)
    budget = cc.check_budget("user_b")
    assert budget["used_today"] == 700


def test_budget_check_returns_true_when_under_budget():
    cc = CostController(daily_budget=1000)
    cc.record_usage("user_c", input_tokens=400, output_tokens=400)
    result = cc.check_budget("user_c")
    assert result["allowed"] is True
    assert result["remaining"] == 200


def test_budget_check_returns_false_when_over_budget():
    cc = CostController(daily_budget=500)
    cc.record_usage("user_d", input_tokens=300, output_tokens=300)
    result = cc.check_budget("user_d")
    assert result["allowed"] is False
    assert result["remaining"] == 0


def test_users_have_independent_budgets():
    cc = CostController(daily_budget=500)
    cc.record_usage("user_e", input_tokens=400, output_tokens=200)  # over budget
    # user_f not touched — should still be allowed
    result = cc.check_budget("user_f")
    assert result["allowed"] is True


def test_get_user_stats_returns_correct_remaining():
    cc = CostController(daily_budget=1000)
    cc.record_usage("user_g", input_tokens=200, output_tokens=100)
    stats = cc.get_user_stats("user_g")
    assert stats["used_today"] == 300
    assert stats["remaining"] == 700
    assert stats["budget"] == 1000


def test_record_usage_accumulates_across_multiple_calls():
    cc = CostController(daily_budget=100_000)
    cc.record_usage("user_h", input_tokens=100, output_tokens=50)
    cc.record_usage("user_h", input_tokens=200, output_tokens=100)
    stats = cc.get_user_stats("user_h")
    assert stats["used_today"] == 450
