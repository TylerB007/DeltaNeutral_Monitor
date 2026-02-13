# Coinbase Nano Futures & Perpetual-Style Futures — Complete Reference

## Reference Document — Cross-Referenced from CFTC Filings, Coinbase Official Docs, Broker Specs, and Industry Sources

---

## Table of Contents

1. [Product Overview](#1-product-overview)
2. [Nano Bitcoin Monthly Futures (BIT)](#2-nano-bitcoin-monthly-futures-bit)
3. [Nano Ether Monthly Futures (ET)](#3-nano-ether-monthly-futures-et)
4. [Nano Bitcoin Perp-Style Futures (BIP)](#4-nano-bitcoin-perp-style-futures-bip)
5. [Nano Ether Perp-Style Futures (ETP)](#5-nano-ether-perp-style-futures-etp)
6. [Funding Rate Mechanism](#6-funding-rate-mechanism)
7. [Settlement & Index Methodology](#7-settlement--index-methodology)
8. [Margin & Leverage](#8-margin--leverage)
9. [Trading Access & API](#9-trading-access--api)
10. [Coinbase Advanced Trade Perpetuals (Alternative)](#10-coinbase-advanced-trade-perpetuals-alternative)
11. [Comparison: CDE Nano Perps vs Advanced Trade Perps](#11-comparison-cde-nano-perps-vs-advanced-trade-perps)
12. [Relevance to Delta-Neutral Strategy](#12-relevance-to-delta-neutral-strategy)
13. [References](#13-references)

---

## 1. Product Overview

Coinbase Derivatives Exchange (CDE), formerly FairX (acquired by Coinbase in 2022),
is a **CFTC-regulated** futures exchange that offers nano-sized crypto futures contracts.
These are designed for accessibility — small contract sizes, low margin requirements,
and USD cash settlement.

**There are TWO distinct Coinbase platforms for futures:**

| Platform | Products | API | Access |
|---|---|---|---|
| **Coinbase Derivatives Exchange (CDE)** | Nano monthly futures + Perp-style futures | FIX 4.4, SBE, UDP | Via third-party brokers (NinjaTrader, Tradovate, Interactive Brokers) |
| **Coinbase Advanced Trade** | Perpetual futures (international-style) | REST + WebSocket | Direct via Coinbase account + API keys |

This document covers both, with emphasis on the CDE nano contracts and the
Advanced Trade perpetuals.

> **Source consensus:** Coinbase official docs, CFTC filings, NinjaTrader, Tradovate,
> Optimus Futures, Insignia Futures, MarketsWiki, Nasdaq, The Block.

---

## 2. Nano Bitcoin Monthly Futures (BIT)

### Contract Specifications

| Specification | Details |
|---|---|
| **Symbol** | BIT |
| **Exchange** | Coinbase Derivatives Exchange (CDE) |
| **Contract Size** | 1/100th of 1 Bitcoin (0.01 BTC) |
| **Settlement** | Cash-settled in USD |
| **Tick Size** | $5.00 per Bitcoin |
| **Tick Value** | $0.05 per contract (0.01 × $5.00) |
| **Trading Hours** | Sunday 6:00 PM – Friday 5:00 PM ET (nearly 24/5) |
| **Contract Months** | Monthly expiration (nearest 3 months + quarterly) |
| **Last Trading Day** | Third Friday of the contract month |
| **Clearing** | Nodal Clear, LLC |
| **Launch Date** | June 27, 2022 |
| **Regulation** | CFTC-regulated |

### Notional Value Example

At BTC = $100,000:
- 1 contract = 0.01 BTC = **$1,000 notional**
- 10 contracts = 0.10 BTC = **$10,000 notional**
- 100 contracts = 1.00 BTC = **$100,000 notional**

### Fee Structure (via brokers, approximate)

| Fee Type | Amount |
|---|---|
| Exchange Fee (Non-Pro) | $0.10 |
| Commission | $0.25/contract |
| Clearing Fee | $0.09 |
| NFA Fee | $0.02 |
| **Total per contract** | **~$0.46** |

> **Sources:** Coinbase official spec sheet, NinjaTrader, Tradovate, Optimus Futures,
> Insignia Futures.

---

## 3. Nano Ether Monthly Futures (ET)

### Contract Specifications

| Specification | Details |
|---|---|
| **Symbol** | ET |
| **Exchange** | Coinbase Derivatives Exchange (CDE) |
| **Contract Size** | 1/10th of 1 Ether (0.10 ETH) |
| **Settlement** | Cash-settled in USD |
| **Tick Size** | $0.50 per Ether |
| **Tick Value** | $0.05 per contract (0.10 × $0.50) |
| **Trading Hours** | Sunday 6:00 PM – Friday 5:00 PM ET (nearly 24/5) |
| **Contract Months** | Monthly expiration |
| **Last Trading Day** | Third Friday of the contract month |
| **Clearing** | Nodal Clear, LLC |
| **Regulation** | CFTC-regulated |

### Notional Value Example

At ETH = $3,000:
- 1 contract = 0.10 ETH = **$300 notional**
- 10 contracts = 1.00 ETH = **$3,000 notional**
- 100 contracts = 10.0 ETH = **$30,000 notional**

> **Sources:** Coinbase official spec sheet, Insignia Futures, Tradovate spec PDF.

---

## 4. Nano Bitcoin Perp-Style Futures (BIP)

### Overview

US Perpetual-Style Futures are a **new product class** — long-dated futures contracts
(5-year expiration) that incorporate an hourly funding rate mechanism to closely track
spot prices. They combine the benefits of international perpetual futures with US
CFTC regulatory compliance.

### Contract Specifications

| Specification | Details |
|---|---|
| **Symbol** | BIP |
| **Exchange** | Coinbase Derivatives Exchange (CDE) |
| **Contract Size** | 1/100th of 1 Bitcoin (0.01 BTC) |
| **Settlement** | Cash-settled in USD |
| **Tick Size** | $5.00 per Bitcoin |
| **Tick Value** | $0.05 per contract |
| **Trading Hours** | 24/7 except Friday 5:00–6:00 PM ET (1-hour weekly break) |
| **Expiration** | Third Friday of December 2030 (5-year term) |
| **Last Trading Day** | 4:00 PM London time on expiration date |
| **Funding Rate** | Calculated hourly, settled twice daily |
| **Leverage** | Up to 10x intraday |
| **Clearing** | Nodal Clear, LLC |
| **Launch Date** | July 21, 2025 |
| **Position Limit** | 6,500,000 contracts (65,000 BTC equivalent) |
| **Regulation** | CFTC-regulated (self-certified) |

### Key Difference from Monthly Futures

- Monthly futures expire each month → must roll contracts
- Perp-style futures have a **5-year expiration** with **funding rate** to track spot
- Effectively functions like international perpetuals but within US regulatory framework
- Trading hours are **24/7** (vs 24/5 for monthly)

> **Sources:** CFTC filing 2025-32, Coinbase official BIP spec sheet, Coinbase blog,
> Nasdaq, The Block, MarketsWiki.

---

## 5. Nano Ether Perp-Style Futures (ETP)

### Contract Specifications

| Specification | Details |
|---|---|
| **Symbol** | ETP |
| **Exchange** | Coinbase Derivatives Exchange (CDE) |
| **Contract Size** | 1/10th of 1 Ether (0.10 ETH) |
| **Settlement** | Cash-settled in USD |
| **Tick Size** | $0.50 per Ether (estimated, consistent with ET monthly) |
| **Tick Value** | $0.05 per contract |
| **Trading Hours** | 24/7 except Friday 5:00–6:00 PM ET (1-hour weekly break) |
| **Expiration** | Third Friday of December 2030 (5-year term) |
| **Funding Rate** | Calculated hourly, settled twice daily |
| **Leverage** | Up to 10x intraday |
| **Clearing** | Nodal Clear, LLC |
| **Launch Date** | July 21, 2025 |
| **Regulation** | CFTC-regulated (self-certified) |
| **Underlying Index** | MarketVector Coinbase Ether Benchmark Rate |
| **Governing Rule** | CDE Rule 1131 |

> **Sources:** CFTC filing 2025-33, Coinbase official ETP spec sheet, MarketsWiki,
> Pillsbury Law analysis.

---

## 6. Funding Rate Mechanism

### How It Works

The funding rate is a percentage-based fee exchanged between long and short position
holders to keep the perp-style futures price anchored to spot.

### Calculation

```
Funding Rate = Average((Futures Mark - Spot Mark) / Spot Mark) over 20 intervals / 24
```

**Step by step:**
1. Over each 1-hour period, 20 three-minute intervals are sampled
2. In each interval, the difference between futures mark price and spot mark price
   is measured
3. The average of these 20 data points is taken
4. The average is **scaled down by a factor of 24** to represent the hourly premium

### Payment Direction

| Condition | Funding Rate | Who Pays |
|---|---|---|
| Futures > Spot (bullish demand) | Positive | Longs pay shorts |
| Futures < Spot (bearish demand) | Negative | Shorts pay longs |

### Settlement Schedule

- Funding **accrues hourly**
- Funding is **settled twice daily** during designated cash adjustment periods
  (mid-day and end-of-day margin runs)
- The Clearing House (Nodal Clear) aggregates each account's funding payments
  and disseminates to Clearing Firms

### Funding Payment Example

Position: 1 long BIP contract, BTC mark price = $100,000, funding rate = +0.010%

```
Funding Payment = Contracts × Contract Size × Mark Price × Funding Rate
                = 1 × 0.01 × $100,000 × 0.00010
                = $0.10 debit (long pays short)
```

For 100 contracts:
```
= 100 × 0.01 × $100,000 × 0.00010
= $10.00 debit
```

### Anti-Manipulation Controls

- **Fair Value Limits** are enabled to prevent artificial divergence between
  futures and spot prices
- The hourly averaging and smoothing make manipulation attempts "very difficult"
  per Coinbase documentation

> **Sources:** Coinbase Help Center (Funding Rate Mechanism), CFTC filings,
> Coinbase Learn (Understanding Funding Rates), Coinbase blog.

---

## 7. Settlement & Index Methodology

### Underlying Indices

| Contract | Index | Provider |
|---|---|---|
| BIT / BIP | MarketVector Coinbase Bitcoin Benchmark Rate | MarketVector Indexes GmbH (MVIS) |
| ET / ETP | MarketVector Coinbase Ether Benchmark Rate | MarketVector Indexes GmbH (MVIS) |

### Index Calculation

1. Uses a **1-hour settlement window**
2. Window is divided into **20 three-minute intervals**
3. In each interval: aggregate all trades and volume from the Coinbase spot exchange
4. Calculate **volume-weighted median price** for each interval
5. Final settlement = **simple average** of the 20 volume-weighted median prices

### Key Properties

- Based exclusively on **Coinbase spot exchange** data
- Volume-weighted **median** (not mean) — robust to outlier trades
- 1-hour averaging window — resistant to short-term manipulation
- Published by MVIS (Frankfurt, Germany) — independent third party

> **Sources:** CFTC filings (2025-32, 2025-33), Coinbase official documentation.

---

## 8. Margin & Leverage

### CDE Nano Futures (via Brokers)

Margin requirements vary by broker and account type:

| Broker | Day Trade Margin (BIT) | Overnight Margin |
|---|---|---|
| Optimus Futures | As low as $25 | Exchange minimum (~25%) |
| NinjaTrader | Varies | Exchange minimum |
| Interactive Brokers | Varies | Exchange minimum |

**Exchange minimum margin:** Approximately 25% of notional value.

Example at BTC = $100,000:
- 1 BIT contract notional = $1,000
- 25% margin = **$250 per contract**
- Some brokers offer reduced **day-trade margins** as low as $25

### CDE Perp-Style Futures

- Up to **10x intraday leverage** (10% margin)
- At BTC = $100,000: 1 BIP contract = $1,000 notional → $100 margin at 10x

### Important Margin Notes

- Margin is **cash-margined** (USD required)
- Whole contracts only — no fractional contracts
- Funds transfer from spot to derivatives account at 5:00 PM ET daily
- Position limits based on income/net worth tier certification

> **Sources:** Optimus Futures, NinjaTrader, Coinbase Help Center, Coinbase Learn.

---

## 9. Trading Access & API

### CDE Nano Futures — Broker Access

The CDE nano futures (BIT, ET, BIP, ETP) are **NOT directly accessible** via Coinbase's
REST/WebSocket API. They must be traded through **third-party brokers/FCMs**:

| Broker | Platform | Notes |
|---|---|---|
| **NinjaTrader** | NinjaTrader Desktop | Full charting + order management |
| **Tradovate** | Web + Desktop | Commission-free plans available |
| **Interactive Brokers** | TWS | Added nano BTC/ETH futures in 2025 |
| **Optimus Futures** | Multiple platforms | Low day-trade margins |
| **AMP Futures** | Multiple platforms | Competitive fees |

### CDE API Protocols

The CDE uses **institutional-grade protocols**, not consumer REST APIs:

| Protocol | Use Case |
|---|---|
| **FIX 4.4** (tag-value encoding) | Order entry, execution reports |
| **SBE** (Simple Binary Encoding) | Low-latency market data |
| **UDP Multicast** | Real-time market data distribution |

**Documentation:** `docs.cdp.coinbase.com/derivatives/docs/welcome`

### Implications for Our Monitor

For CDE nano futures positions, we would need to either:
1. Use the **broker's API** (e.g., Interactive Brokers TWS API, NinjaTrader API)
2. Use **FIX protocol** directly (requires CDE membership or FCM relationship)
3. Use the **Alternative:** Coinbase Advanced Trade perpetuals (see Section 10)

> **Sources:** Coinbase Developer Documentation, NinjaTrader, Tradovate, Interactive
> Brokers announcement, Coinbase Derivatives page.

---

## 10. Coinbase Advanced Trade Perpetuals (Alternative)

### Overview

Coinbase Advanced Trade offers **perpetual futures** directly accessible via REST and
WebSocket APIs. These are **different products** from the CDE nano perps but serve a
similar hedging purpose.

### Key Differences from CDE

| Feature | CDE Nano Perps (BIP/ETP) | Advanced Trade Perps |
|---|---|---|
| Regulation | CFTC-regulated | Varies by jurisdiction |
| API Access | FIX/SBE via brokers | REST + WebSocket (direct) |
| Contract Size | 0.01 BTC / 0.10 ETH | Flexible sizing |
| Leverage | Up to 10x | Up to 10x |
| Funding | Hourly calc, 2x daily settle | Continuous |
| Trading Hours | 24/7 (1hr weekly break) | 24/7 |
| Margin | USD cash only | USDC + multi-asset collateral |

### Advanced Trade API — Key Endpoints

**Perpetuals Management:**
```
GET  /api/v3/brokerage/intx/portfolio/{portfolio_uuid}/summary
GET  /api/v3/brokerage/intx/positions
GET  /api/v3/brokerage/intx/positions/{product_id}
POST /api/v3/brokerage/intx/allocate
POST /api/v3/brokerage/intx/multi_asset_collateral
```

**Order Management (works for spot + perps):**
```
POST /api/v3/brokerage/orders           # Create order
GET  /api/v3/brokerage/orders           # List orders
GET  /api/v3/brokerage/orders/{id}      # Get order
POST /api/v3/brokerage/orders/close     # Close position
```

**Futures Balance & Sweep:**
```
GET  /api/v3/brokerage/cfm/balance_summary
GET  /api/v3/brokerage/cfm/positions
POST /api/v3/brokerage/cfm/sweeps/schedule
GET  /api/v3/brokerage/cfm/sweeps
DELETE /api/v3/brokerage/cfm/sweeps
GET  /api/v3/brokerage/cfm/intraday/margin_setting
POST /api/v3/brokerage/cfm/intraday/margin_setting
GET  /api/v3/brokerage/cfm/intraday/current_margin_window
```

### Python SDK

**Official:** `coinbase-advanced-py` (pip install coinbase-advanced-py)

Key SDK methods for perpetuals:
```python
from coinbase.rest import RESTClient

client = RESTClient(api_key="...", api_secret="...")

# Portfolio & positions
client.get_perps_portfolio_summary(portfolio_uuid)
client.list_perps_positions(portfolio_uuid)
client.get_perps_position(portfolio_uuid, product_id)
client.get_perps_portfolio_balances(portfolio_uuid)

# Orders
client.create_order(product_id, side, order_type, size, ...)
client.close_position(product_id, size)

# Futures balance
client.get_futures_balance_summary()
client.list_futures_positions()
client.get_futures_position(product_id)

# Multi-asset collateral
client.opt_in_or_out_multi_asset_collateral(portfolio_uuid, opt_in=True)
```

**Authentication:** Uses CDP (Cloud Developer Platform) API keys.

### WebSocket Channels

```python
from coinbase.websocket import WSClient

ws = WSClient(api_key="...", api_secret="...")
ws.subscribe(product_ids=["BTC-PERP-INTX"], channels=["ticker", "level2"])
# Also: futures_balance_summary channel for real-time margin updates
```

> **Sources:** Coinbase Developer Documentation (Advanced Trade), GitHub
> coinbase/coinbase-advanced-py, Coinbase API changelog, PyPI.

---

## 11. Comparison: CDE Nano Perps vs Advanced Trade Perps

### For Our Delta-Neutral Strategy

| Consideration | CDE Nano Perps (BIP/ETP) | Advanced Trade Perps |
|---|---|---|
| **API ease of use** | Hard (FIX protocol or broker API) | Easy (REST + WebSocket + Python SDK) |
| **Programmatic access** | Complex | Simple |
| **Position monitoring** | Via broker platform/API | Direct via Coinbase API |
| **Funding rate data** | Via FIX/SBE market data | Via product endpoints |
| **Order execution** | Via broker | Direct |
| **Regulation** | CFTC (US-regulated) | Varies |
| **Contract granularity** | Whole contracts only (0.01 BTC min) | More flexible |
| **Best for** | Manual/broker-assisted trading | Automated monitoring & trading |

### Recommendation for This Project

**Coinbase Advanced Trade perpetuals** are the better fit for an automated
delta-neutral monitoring system because:
1. Direct REST + WebSocket API access (no broker intermediary)
2. Official Python SDK with position management methods
3. Real-time WebSocket feeds for price and balance monitoring
4. Programmatic order creation for hedge rebalancing
5. USDC + multi-asset collateral support

The CDE nano perps (BIP/ETP) may be preferable for **manual hedging** or if
**CFTC regulation** is a strict requirement.

---

## 12. Relevance to Delta-Neutral Strategy

### How These Products Serve as the Hedge Leg

In our delta-neutral LP strategy:
- **LP Position** = Uniswap V3 concentrated liquidity (long delta)
- **Hedge Position** = Short perpetual futures on Coinbase (short delta)

### Sizing the Hedge with Nano Contracts

**Example: Hedging an ETH/USDC LP position**

Given:
- LP delta = 2.5 ETH (calculated from LP math)
- Using CDE nano ETH perps (ETP): each contract = 0.10 ETH
- Required contracts = 2.5 / 0.10 = **25 contracts short**

Using Advanced Trade perps:
- Can specify exact size = **2.5 ETH short**
- More precise hedge (no rounding to whole contracts)

### Granularity Comparison

| Hedge Size Needed | BIP Contracts | ETP Contracts | AT Perps |
|---|---|---|---|
| 0.05 BTC | 5 | — | 0.05 BTC exact |
| 0.23 BTC | 23 | — | 0.23 BTC exact |
| 1.00 ETH | — | 10 | 1.00 ETH exact |
| 2.75 ETH | — | 28 (rounded) | 2.75 ETH exact |

### Monitoring Requirements

For the hedge leg, we need to track:
1. **Current short position size** (via API)
2. **Unrealized P&L** on the short
3. **Available margin / maintenance margin**
4. **Funding rate** (current and projected)
5. **Funding payments** (accrued and settled)
6. **Mark price vs spot price** (basis)

All of these are available via the Advanced Trade API endpoints listed in Section 10.

---

## 13. References

### Official Coinbase Sources
1. Coinbase Derivatives — Nano Bitcoin Futures Spec Sheet (PDF)
2. Coinbase Derivatives — Nano Ether Futures Spec Sheet (PDF)
3. Coinbase Derivatives — Nano Bitcoin Perp Style Spec (PDF)
4. Coinbase Derivatives — Nano Ether Perp Style Spec (PDF)
5. Coinbase Help Center — "Futures Intro"
6. Coinbase Help Center — "US Perpetual-Style Futures Overview"
7. Coinbase Help Center — "US Perpetual-Style Futures Funding Rate Mechanism"
8. Coinbase Learn — "US Perpetual-Style Futures 101"
9. Coinbase Learn — "Understanding Funding Rates in Perpetual Futures"
10. Coinbase Learn — "Getting Started with Futures: Coinbase Derivatives"
11. Coinbase Blog — "Coming July 21: US Perpetual-Style Futures"
12. Coinbase Blog — "Perpetual Futures Have Arrived in the US"
13. Coinbase Developer Docs — Advanced Trade Perpetual Futures Guide
14. Coinbase Developer Docs — Derivatives Exchange Welcome / Connectivity

### CFTC Filings
15. CFTC Filing 2025-32 — Listing of nano Bitcoin Perp Style Futures
16. CFTC Filing 2025-33 — Listing of nano Ether Perp Style Futures

### Broker Documentation
17. NinjaTrader — Nano Bitcoin Futures Contract Specs
18. Tradovate — Coinbase Derivatives Nano Bitcoin / Nano Ether Specs
19. Optimus Futures — Nano Bitcoin Futures Trading
20. Insignia Futures — Nano Bitcoin / Nano Ether Contract Specifications
21. Interactive Brokers — Coinbase Derivatives Nano Futures Announcement

### Developer Resources
22. GitHub — coinbase/coinbase-advanced-py (Official Python SDK)
23. PyPI — coinbase-advanced-py
24. Coinbase Developer Platform — Advanced Trade API Overview

### Industry Coverage
25. MarketsWiki — Nano Bitcoin Perpetual Futures
26. MarketsWiki — Nano Ether Perpetual Futures
27. Nasdaq — "Coinbase to Launch US Nano Bitcoin Perpetual-Style Futures"
28. The Block — "Coinbase launches CFTC-regulated perpetual futures"
29. Pillsbury Law — "CFTC Permits Listing of Perpetual Futures on BTC and ETH"
