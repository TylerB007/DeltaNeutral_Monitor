"""DeltaNeutral Monitor - Entry point."""

import logging

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


def main() -> None:
    logger.info("DeltaNeutral Monitor starting...")
    # TODO: Load config, initialize exchange connectors, start monitoring loop


if __name__ == "__main__":
    main()
