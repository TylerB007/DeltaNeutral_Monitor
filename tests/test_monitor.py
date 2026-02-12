"""Tests for the Monitor class."""

from decimal import Decimal

from src.monitor import Monitor, Position


def test_net_delta_neutral():
    pos = Position(
        exchange="binance",
        symbol="BTCUSDT",
        spot_qty=Decimal("1.0"),
        perp_qty=Decimal("-1.0"),
        entry_price=Decimal("50000"),
    )
    assert pos.net_delta == Decimal("0")


def test_monitor_health_check():
    monitor = Monitor()
    monitor.add_position(
        Position(
            exchange="binance",
            symbol="BTCUSDT",
            spot_qty=Decimal("1.0"),
            perp_qty=Decimal("-1.0"),
            entry_price=Decimal("50000"),
        )
    )
    health = monitor.check_health()
    assert health["is_neutral"] is True
    assert health["position_count"] == 1


def test_monitor_unhealthy_delta():
    monitor = Monitor()
    monitor.add_position(
        Position(
            exchange="binance",
            symbol="BTCUSDT",
            spot_qty=Decimal("1.0"),
            perp_qty=Decimal("-0.5"),
            entry_price=Decimal("50000"),
        )
    )
    health = monitor.check_health()
    assert health["is_neutral"] is False
