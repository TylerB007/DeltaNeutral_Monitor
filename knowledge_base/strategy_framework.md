# Strategy Framework — Range Selection, Rebalancing, and Funding Rate Analysis

## Decision Logic for Delta-Neutral LP Management

---

## Table of Contents

1. [Range Selection](#1-range-selection)
2. [Rebalancing Decision Logic](#2-rebalancing-decision-logic)
3. [Funding Rate Analysis](#3-funding-rate-analysis)
4. [Strategy Activation & Exit Criteria](#4-strategy-activation--exit-criteria)
5. [Monitoring Dashboard Metrics](#5-monitoring-dashboard-metrics)
6. [References](#6-references)

---

## 1. Range Selection

### The Core Tradeoff

Range width creates a three-way tension between:

1. **Fee income** — narrower range → higher fees per unit of capital
2. **Hedging cost** — narrower range → higher gamma → more expensive to hedge
3. **Time in range** — narrower range → more likely price exits → LP goes idle

The optimal range width maximizes:

```
Net Yield = Fee APR - Gamma Hedging Cost - Funding Cost - Rebalancing Cost
```

### Academic Framework (Cartea, Drissi & Monga, 2024)

The most rigorous treatment comes from a paper published in the SIAM Journal on
Financial Mathematics. Key results:

**Optimal range width is determined by:**
- Profitability of the pool (fee income minus gas/trading costs)
- Predictable Loss (PL) of the LP position (their term for IL in continuous time)
- Concentration risk (probability of price exiting the range)

**Key insight on volatility:**
> "When volatility increases, PL increases, so there is an incentive for the LP
> to widen the range of liquidity provision to reduce the strategy's exposure to PL."

**Closed-form solution:** They derive a self-financing optimal strategy where range
width adapts to current market conditions. The width is inversely related to the
fee-to-volatility ratio.

### Fee Tier Alignment

| Fee Tier | Typical Pairs | Volatility Profile | Suggested Range Width |
|---|---|---|---|
| 0.01% (1 bps) | Stablecoin/stablecoin | Very low | ±0.1% – ±0.5% |
| 0.05% (5 bps) | Correlated pairs | Low | ±1% – ±5% |
| 0.30% (30 bps) | Major pairs (ETH/USDC) | Medium | ±5% – ±20% |
| 1.00% (100 bps) | Exotic/illiquid pairs | High | ±20% – ±50% |

### Volatility-Based Range Sizing

A practical approach using historical volatility:

```
Range Width (%) = k × σ_daily × √(target_days_in_range)
```

Where:
- `σ_daily` = daily volatility of the asset (e.g., 3% for ETH)
- `target_days_in_range` = how many days you want the price to stay in range
  before needing to reposition
- `k` = confidence multiplier (1.0 for ~68%, 1.5 for ~87%, 2.0 for ~95%)

**Example:** ETH with 3% daily volatility, targeting 7 days in range at 95% confidence:
```
Width = 2.0 × 3% × √7 = 2.0 × 3% × 2.65 = 15.9%
→ Range: ±8% around current price
→ At ETH = $3,000: range [$2,760, $3,240]
```

### Gamma-Fee Breakeven Analysis

For the delta-neutral strategy, the range must generate enough fees to cover
the gamma hedging cost. The breakeven condition:

```
Fee Income per period > ½ × |Γ| × σ² × P² × Δt
```

Where:
- |Γ| = absolute gamma of the position
- σ = volatility (annualized, convert to period)
- P = current price
- Δt = time period

**Narrower range → higher |Γ| → higher right side → needs more fee income to break even**

This creates a natural floor on range width: below a certain width, the gamma cost
always exceeds fee income, regardless of volume.

### Range Selection Decision Tree

```
1. Determine fee tier based on pair type
2. Estimate current implied volatility (from options or historical vol)
3. Set target days in range (7-30 days recommended)
4. Calculate range width using volatility formula
5. Compute expected fee APR for that range width
6. Compute expected gamma hedging cost for that range width
7. If fee APR > gamma cost + funding cost + rebalancing cost:
     → PROCEED with the range
   Else:
     → WIDEN the range and re-check
     → If no profitable range exists, SKIP this pool
8. Round tick boundaries to nearest valid tick spacing
```

> **Sources:** Cartea, Drissi & Monga (SIAM J. Financial Math, arXiv:2309.08431),
> KyberSwap "Choosing the Best Range", Cyfrin "Concentrated Liquidity & Capital
> Efficiency", Nansen "What is Uniswap V3", Flying Tulip "Dynamic Concentrated
> Liquidity Model".

---

## 2. Rebalancing Decision Logic

### Two Types of Rebalancing

1. **Hedge Rebalancing** — adjusting the short perp position to match changing LP delta
2. **LP Rebalancing** — closing and re-opening the LP position in a new range

### 2.1 Hedge Rebalancing

#### When to Rebalance the Hedge

**Threshold-based approach (recommended):**

```
Rebalance when: |net_delta| > threshold
Where: net_delta = LP_delta - hedge_size
       threshold = f(position_size, risk_tolerance)
```

Suggested thresholds:

| Position Size | Delta Threshold | Rationale |
|---|---|---|
| < $10,000 | 5% of position | Trading costs dominate at small sizes |
| $10K – $100K | 2-3% of position | Balance cost vs accuracy |
| > $100K | 1% of position | Accuracy matters, costs are proportionally small |

**Time-based approach (simpler):**

| Volatility | Rebalance Interval |
|---|---|
| Low (σ < 2%/day) | Every 8 hours |
| Medium (σ = 2-5%/day) | Every 2-4 hours |
| High (σ > 5%/day) | Every 30-60 minutes |
| Extreme (σ > 10%/day) | Consider closing position |

**Hybrid approach (best):**
```
Rebalance if:
  (|net_delta| > threshold) OR (time_since_last_rebalance > max_interval)
```

#### Hedge Rebalancing Cost

Each rebalance incurs:
```
Cost = exchange_fee × |adjustment_size| × price + slippage + gas_cost
```

Minimize total cost by choosing threshold that balances:
- **Too tight** → frequent rebalancing → high trading costs
- **Too loose** → poor hedge accuracy → residual directional exposure

#### Gamma-Informed Rebalancing

Since gamma tells you how fast delta changes per unit of price movement:

```
Expected delta change = Γ × ΔP
Time to reach threshold ≈ threshold / (|Γ| × σ_daily × P / √(periods_per_day))
```

If gamma is high (narrow range), rebalance more frequently.
If gamma is low (wide range), rebalance less frequently.

### 2.2 LP Rebalancing (Range Re-Centering)

#### When to Re-Center the LP Range

**Trigger 1: Price exits range**
- Position stops earning fees
- 100% converted to one token
- Must close and re-open in new range centered on current price

**Trigger 2: Price near range boundary**
```
Re-center when:
  (P < Pa + buffer) OR (P > Pb - buffer)
Where:
  buffer = (Pb - Pa) × buffer_pct     [e.g., 10-20% of range width]
```

**Trigger 3: IL exceeds threshold**
```
Re-center when:
  IL / position_value > max_IL_pct     [e.g., 5-10%]
```

**Trigger 4: Fee efficiency drops**
```
Re-center when:
  fee_APR < min_acceptable_APR
```
This can happen if the position is at the edge of its range and price is spending
most of its time outside.

#### LP Rebalancing Cost

Re-centering the LP position is more expensive than hedge rebalancing:
1. Gas to remove liquidity from old range
2. Gas to add liquidity to new range
3. Swap costs to rebalance token ratio for new range
4. Potential MEV exposure during the swap

**Estimated cost per LP rebalance:**
- Ethereum mainnet: $20-100+ in gas (varies with congestion)
- L2 (Arbitrum, Optimism, Base): $0.50-5.00
- Swap slippage: 0.05-0.30% depending on size and pool depth

#### LP Rebalancing Decision Matrix

| Price Position | Action | Priority |
|---|---|---|
| In center 60% of range | No action | — |
| In outer 20% of range | Monitor closely | Low |
| Within 10% of boundary | Prepare to re-center | Medium |
| At or beyond boundary | Re-center immediately | High |
| Far beyond boundary | Close position, reassess | Critical |

> **Sources:** Atis Elsts "Dynamic Hedging", arXiv:2411.12375, Neutra Finance
> (Parts 1 & 2), Cetra Finance, "Hedging Positions on Uniswap V3" series,
> KyberSwap rebalancing analysis.

---

## 3. Funding Rate Analysis

### Funding Rate Impact on Strategy P&L

In the delta-neutral strategy, the short perpetual position either earns or pays
funding. This is a **major P&L component** that can make or break the strategy.

```
Net Strategy Yield = Fee APR - Gamma Cost - |Funding Cost| - Trading Costs
```

If funding is positive (longs pay shorts):
```
→ Short position EARNS funding → adds to yield
```

If funding is negative (shorts pay longs):
```
→ Short position PAYS funding → subtracts from yield
```

### Historical Funding Rate Patterns

#### Typical Ranges (Bitcoin/Ethereum Perpetuals)

| Market Condition | Annualized Funding | Impact on Strategy |
|---|---|---|
| Strong bull | +20% to +50%+ | Highly favorable (short earns) |
| Moderate bull | +5% to +20% | Favorable |
| Neutral | -5% to +5% | Neutral |
| Moderate bear | -5% to -20% | Unfavorable |
| Capitulation / panic | -30% to -100%+ (briefly) | Dangerous |

#### Key Patterns from 2024-2025 Data

1. **Persistent positive bias:** Funding rates have a slight long-term positive bias
   because traders tend to be structurally long crypto. This is a tailwind for the
   delta-neutral strategy.

2. **Extreme spikes during euphoria:** During rapid price rallies, funding can spike
   to 0.1%+ per 8 hours (>100% annualized). This is very profitable for the short.

3. **Negative during crashes:** During sharp selloffs, funding goes negative as
   traders rush to short. The short hedger pays funding during exactly the period
   when they're most needed.

4. **Mean reversion:** Extreme funding rates (positive or negative) tend to
   mean-revert within days. Extended periods of extreme funding are rare.

### Funding Rate as Strategy Signal

#### Sentiment Indicators

| Signal | Interpretation | Strategy Action |
|---|---|---|
| High positive + rising OI | Bullish overheating | Favorable for entry (earning carry) |
| Deeply negative + falling OI | Long squeeze / capitulation | Unfavorable (paying carry), wait |
| Funding normalizing after extreme | Market calming | Consider entry |
| Persistently moderate positive | Healthy trend | Ideal conditions |

#### Long Squeeze Detection

From the research:
> "The simultaneous fall in price and OI is directly tied to funding turning negative.
> Mass forced long closures create excess sell pressure, briefly pushing the contract
> below spot. Negative funding combined with a sharp drop in OI is the most reliable
> signal of bull capitulation."

### Carry Analysis Framework

For evaluating whether the funding rate environment is favorable:

```python
def is_funding_favorable(
    current_funding_8h: float,      # current 8-hour funding rate
    avg_funding_7d: float,          # 7-day average
    avg_funding_30d: float,         # 30-day average
    fee_apr: float,                 # LP fee APR estimate
    gamma_cost_apr: float,          # estimated gamma hedging cost APR
) -> dict:
    """Evaluate funding rate environment for delta-neutral strategy."""

    # Annualize the funding rates
    funding_apr = current_funding_8h * 3 * 365  # 3 periods/day × 365 days
    avg_7d_apr = avg_funding_7d * 3 * 365
    avg_30d_apr = avg_funding_30d * 3 * 365

    # Net yield calculation
    # Positive funding = short earns → adds to yield
    net_yield = fee_apr + funding_apr - gamma_cost_apr

    return {
        "funding_apr": funding_apr,
        "avg_7d_apr": avg_7d_apr,
        "avg_30d_apr": avg_30d_apr,
        "net_yield": net_yield,
        "is_profitable": net_yield > 0,
        "signal": (
            "STRONG_ENTRY" if funding_apr > 10 and net_yield > 15 else
            "ENTRY" if net_yield > 5 else
            "HOLD" if net_yield > 0 else
            "CAUTION" if net_yield > -5 else
            "EXIT"
        ),
    }
```

### Funding Rate Data Sources

| Source | Data Available | Access |
|---|---|---|
| **Coinbase Advanced Trade** | Current funding rate | API (product endpoint) |
| **Coinbase CDE** | Hourly funding rates | FIX/SBE market data |
| **CoinMarketCap** | Dashboard, cross-exchange | Web / API |
| **MacroMicro** | Historical charts | Web |
| **CoinAPI** | Historical data, multiple exchanges | API (paid) |
| **CF Benchmarks (KFRI)** | Institutional-grade BTC funding index | API |

> **Sources:** Coinbase "Understanding Funding Rates", MacroMicro BTC funding charts,
> CoinAPI historical data blog, ForkLog funding rate analysis, CF Benchmarks KFRI,
> arXiv:2506.08573 "Designing Funding Rates for Perpetual Futures".

---

## 4. Strategy Activation & Exit Criteria

### Entry Criteria (all must be met)

```
1. Fee APR estimate > minimum_threshold (e.g., 15% APR)
2. Funding rate > -5% annualized (not deeply negative)
3. Volatility within acceptable range (not extreme)
4. Sufficient capital for LP + hedge margin
5. Hedge instrument available with adequate liquidity
```

### Exit Criteria (any triggers exit)

```
1. Net yield (fee + funding - gamma - costs) < 0 for > 24 hours
2. Funding rate < -20% annualized for > 12 hours
3. Price exits range with no clear re-entry opportunity
4. Hedge margin < 150% of maintenance requirement
5. Realized volatility > 2x implied volatility (gamma costs exploding)
6. Smart contract risk event (exploit, governance attack, etc.)
```

### Position Sizing Rules

```
max_position_per_pool = total_capital × max_allocation_pct    [e.g., 30%]
lp_allocation = position_capital × 0.65                       [65% to LP]
hedge_margin = position_capital × 0.35                        [35% to perp margin]
max_leverage = 3x on perp side                                [conservative]
```

### Risk Limits

| Risk Metric | Limit | Action if Breached |
|---|---|---|
| Net portfolio delta | < 5% of position | Rebalance hedge |
| Hedge margin utilization | < 70% | Add margin or reduce position |
| Daily P&L drawdown | > -2% of capital | Review and potentially exit |
| Cumulative drawdown | > -5% of capital | Exit and reassess |
| Time out of range | > 4 hours | Re-center LP or exit |
| Funding rate (annualized) | < -20% | Exit short, pause strategy |

> **Sources:** Synthesized from Neutra Finance backtesting results, Cetra Finance
> strategy overview, Parallel Finance risk framework, academic papers.

---

## 5. Monitoring Dashboard Metrics

### Real-Time Metrics (update every block / every few seconds)

| Metric | Source | Formula |
|---|---|---|
| Current Price | Pool slot0 | sqrtPriceX96 → P |
| LP Delta | Computed | L × (1/√P - 1/√P_b) |
| Hedge Size | Exchange API | Current short position size |
| **Net Delta** | Computed | LP Delta - Hedge Size |
| Price Distance to Range Edge | Computed | min(P - P_a, P_b - P) / (P_b - P_a) |
| Margin Utilization | Exchange API | Used margin / Total margin |

### Periodic Metrics (update every 1-5 minutes)

| Metric | Source | Formula |
|---|---|---|
| Uncollected Fees (token0) | On-chain | feeGrowthInside calculation |
| Uncollected Fees (token1) | On-chain | feeGrowthInside calculation |
| Fee APR (rolling) | Computed | (fees_earned / position_value) × annualize |
| Funding Rate | Exchange API | Current 8h rate |
| Funding APR | Computed | rate × 3 × 365 |
| Position Value | Computed | x × P + y |
| HODL Value | Computed | x₀ × P + y₀ |
| Impermanent Loss | Computed | V_LP - V_HODL |
| IL as % | Computed | IL / V_HODL × 100 |

### Cumulative Metrics (update hourly or on-demand)

| Metric | Formula |
|---|---|
| Total Fees Earned | Σ collected fees + current uncollected |
| Total Funding Earned/Paid | Σ funding payments from exchange |
| Total Hedge P&L | Current perp unrealized + Σ realized |
| Total Rebalancing Costs | Σ trading fees + gas costs |
| **Net Strategy P&L** | Fees + Funding + Hedge P&L - Rebalance Costs |
| **Net Strategy APR** | Net P&L / Initial Capital × annualize |
| Sharpe Ratio | mean(daily returns) / std(daily returns) × √365 |
| Max Drawdown | max peak-to-trough decline |

### Alert Thresholds

| Alert | Condition | Severity |
|---|---|---|
| Delta drift | \|net_delta\| > 3% of position | Warning |
| Delta drift | \|net_delta\| > 5% of position | Critical |
| Near range edge | Price within 10% of boundary | Warning |
| Out of range | Price outside [P_a, P_b] | Critical |
| Low margin | Margin util > 60% | Warning |
| Margin danger | Margin util > 80% | Critical |
| Negative funding | Funding APR < -10% | Warning |
| Extreme negative funding | Funding APR < -30% | Critical |
| P&L drawdown | Daily loss > 1% | Warning |
| P&L drawdown | Cumulative loss > 3% | Critical |

> **Sources:** Compiled from all knowledge base documents. Metrics derived from
> Uniswap V3 math, Coinbase API capabilities, and delta-neutral strategy mechanics.

---

## 6. References

### Academic Papers
1. Cartea, A., Drissi, F., Monga, M. — "Decentralised Finance and Automated Market Making: Predictable Loss and Optimal Liquidity Provision." SIAM J. Financial Mathematics, arXiv:2309.08431 (2024)
2. arXiv:2411.12375 — "Risk-Neutral Pricing Model of Uniswap LP Position" (2024)
3. arXiv:2506.08573 — "Designing Funding Rates for Perpetual Futures in Cryptocurrency Markets" (2025)
4. Ackerer, D., Hugonnier, J., Jermann, U. — "Perpetual Futures Pricing" (Wharton)
5. NYU Stern — "Fragmentation and Optimal Liquidity Supply on Decentralized Exchanges"

### Protocol & Industry
6. Neutra Finance — "Uniswap V3 Delta Neutral Strategy" Parts 1 & 2
7. Cetra Finance — "Delta-Neutral DeFi Strategies Overview"
8. KyberSwap — "Choosing the Best Range to Maximize LP Returns"
9. Flying Tulip — "Dynamic Concentrated Liquidity Model"
10. Coinbase — "Understanding Funding Rates in Perpetual Futures"

### DeFi Research
11. Atis Elsts — "Liquidity Provider Strategies for Uniswap V3: Dynamic Hedging"
12. "Hedging Positions on Uniswap V3" (Series, Parts 1-3)
13. ForkLog — "The Funding Rate: How It Helps Anticipate Price Reversals"
14. MacroMicro — Bitcoin Perpetual Futures Funding Rate (Historical Data)
15. CoinAPI — "Historical Data for Perpetual Futures"
