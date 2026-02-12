"""Core monitoring logic for delta-neutral positions."""

import logging
from dataclasses import dataclass
from decimal import Decimal

logger = logging.getLogger(__name__)


@dataclass
class Position:
    exchange: str
    symbol: str
    spot_qty: Decimal
    perp_qty: Decimal
    entry_price: Decimal

    @property
    def net_delta(self) -> Decimal:
        return self.spot_qty + self.perp_qty


class Monitor:
    def __init__(self) -> None:
        self.positions: list[Position] = []

    def add_position(self, position: Position) -> None:
        self.positions.append(position)
        logger.info("Added position: %s %s", position.exchange, position.symbol)

    def total_delta(self) -> Decimal:
        return sum((p.net_delta for p in self.positions), Decimal(0))

    def check_health(self) -> dict:
        delta = self.total_delta()
        return {
            "total_delta": float(delta),
            "position_count": len(self.positions),
            "is_neutral": abs(delta) < Decimal("0.01"),
        }
