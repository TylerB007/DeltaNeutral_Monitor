# DeltaNeutral Monitor

A monitoring tool for delta-neutral trading positions. Track funding rates, position health, and P&L across exchanges and protocols.

## Features

- Real-time position monitoring
- Funding rate tracking
- P&L calculation and alerts
- Multi-exchange support

## Setup

```bash
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

## Configuration

Copy the example config and fill in your API keys:

```bash
cp config/config.example.yaml config/config.yaml
```

## Usage

```bash
python -m src.main
```

## Project Structure

```
src/
  main.py          - Entry point
  monitor.py       - Core monitoring logic
  exchanges/       - Exchange connectors
  utils/           - Shared utilities
config/            - Configuration files
tests/             - Test suite
```
