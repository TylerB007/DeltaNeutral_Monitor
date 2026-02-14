# Delta-Neutral Strategy Simulator — Complete Guide

How to use the simulator, what every parameter means, and how every calculation works under the hood.

---

## Table of Contents

1. [What This Simulator Does](#1-what-this-simulator-does)
2. [The Strategy Explained](#2-the-strategy-explained)
3. [Input Parameters](#3-input-parameters)
   - [Position Parameters](#31-position-parameters)
   - [Market Assumptions](#32-market-assumptions)
   - [Strategy Parameters](#33-strategy-parameters)
   - [Simulation Settings](#34-simulation-settings)
4. [How the Calculations Work](#4-how-the-calculations-work)
   - [Price Path Generation (GBM)](#41-price-path-generation-geometric-brownian-motion)
   - [Uniswap V3 LP Math](#42-uniswap-v3-lp-math)
   - [Fee Income](#43-fee-income)
   - [Hedge P&L](#44-hedge-pl)
   - [Funding Rate Income](#45-funding-rate-income)
   - [Hedge Rebalancing](#46-hedge-rebalancing)
   - [Return Calculations](#47-return-calculations)
   - [Risk Metrics](#48-risk-metrics)
5. [Understanding the Output](#5-understanding-the-output)
   - [Metric Cards](#51-metric-cards)
   - [Confidence Band](#52-confidence-band)
   - [Charts](#53-charts)
   - [Simulation Summary](#54-simulation-summary)
6. [Example Scenarios](#6-example-scenarios)
7. [Limitations and Assumptions](#7-limitations-and-assumptions)

---

## 1. What This Simulator Does

The simulator models a **delta-neutral concentrated liquidity** strategy across hundreds of randomized market scenarios using Monte Carlo simulation. It answers the question:

> "If I provide liquidity in a Uniswap V3 pool and hedge my directional risk with short perpetual futures, what range of returns should I expect?"

For each simulation run, the engine:

1. Generates N random ETH price paths (using Geometric Brownian Motion)
2. For each path, steps through day by day computing:
   - The LP position's value, token composition, and delta
   - Swap fee income earned while price is in range
   - The short hedge's profit or loss as price moves
   - Funding rate payments earned or paid on the hedge
   - Rebalancing trades when delta drifts too far
3. Aggregates all paths into statistics and visualizations

The result shows the **distribution of outcomes** — not a single prediction, but a probability-weighted picture of what could happen.

---

## 2. The Strategy Explained

The delta-neutral LP strategy has three components:

### Leg 1: Provide Concentrated Liquidity

You deposit capital into a Uniswap V3 pool within a specific price range (e.g., ETH/USDC from $2,500 to $3,500). Your capital is split between ETH and USDC according to the Uniswap V3 math. While the price stays in your range, you earn swap fees from traders.

**The problem:** Your LP position has *directional exposure* (delta). If ETH goes up, your position sells ETH for USDC. If ETH goes down, it buys ETH with USDC. This creates *impermanent loss* — your LP is always worth less than if you had simply held the original tokens.

### Leg 2: Hedge with Short Futures

To neutralize the directional risk, you open a short perpetual futures position sized to match the LP's delta (ETH exposure). When ETH rises:
- Your LP loses value relative to holding (impermanent loss)
- Your short position gains value (it profits from falling/hedged exposure)

These two effects offset, making the combined position approximately market-neutral.

### Leg 3: Earn Net Yield

With directional risk removed, your return comes from:
- **Fee income** — swap fees from traders using the pool
- **Funding rate** — payments received (or paid) on the perpetual futures position
- Minus **gamma/rebalancing costs** — periodic hedge adjustments as delta changes
- Minus **impermanent loss** that isn't perfectly offset

The net yield is typically lower-risk and more predictable than an unhedged LP position.

---

## 3. Input Parameters

### 3.1 Position Parameters

#### Initial Investment

| Property | Value |
|---|---|
| **Default** | $100,000 |
| **Range** | $1,000+ |
| **Input type** | Number field |

The total capital deployed into the strategy. In the simulation, this entire amount is used to establish the LP position. The simulation calculates how much of this is in ETH vs USDC based on the entry price and range.

**Effect on results:** Scales all dollar-denominated outputs (fee income, P&L components) linearly. Percentage returns are unaffected. In real deployment, larger positions may earn proportionally more fees but also face more slippage when rebalancing.

#### Entry Price (ETH)

| Property | Value |
|---|---|
| **Default** | $3,000 |
| **Range** | $1+ |
| **Input type** | Number field |

The ETH price when the position is opened. Both the LP position and the short hedge are initialized at this price. The Monte Carlo simulation generates random price paths starting from this value.

**Effect on results:** Determines the initial token split and delta. The entry price should be within the LP range (between Lower and Upper). If it's outside the range, the position starts out-of-range and earns no fees initially.

#### LP Range — Lower

| Property | Value |
|---|---|
| **Default** | $2,500 |
| **Range** | $1+ |
| **Input type** | Number field |

The lower price bound of the concentrated liquidity range. If ETH drops below this price, the LP position converts to 100% ETH and stops earning swap fees.

**Effect on results:**
- **Wider gap** (lower value) → more room before going out of range on the downside → more time earning fees → but lower capital efficiency and lower fee yield
- **Narrower gap** (higher value, closer to entry) → higher capital efficiency and fee yield → but more likely to go out of range → higher impermanent loss and gamma costs

#### LP Range — Upper

| Property | Value |
|---|---|
| **Default** | $3,500 |
| **Range** | $1+ |
| **Input type** | Number field |

The upper price bound. If ETH rises above this price, the LP converts to 100% USDC and stops earning fees.

**Effect on results:** Same tradeoffs as the lower bound but in the upward direction. Together, the lower and upper bounds define the range width, which controls:
- **Capital efficiency** — displayed in the header as a multiplier (e.g., 5.4x means your concentrated position has 5.4x the effective liquidity of a full-range position)
- **Fee yield** — narrower range = higher fees per dollar of capital
- **Gamma** — narrower range = higher gamma = more frequent and costly hedge rebalancing
- **Time in range** — narrower range = higher probability of price exiting

### 3.2 Market Assumptions

#### Annualized Volatility

| Property | Value |
|---|---|
| **Default** | 60% |
| **Range** | 10% – 150% |
| **Input type** | Slider |

The expected annualized standard deviation of ETH price returns. This is the single most important parameter driving the simulation's price dynamics.

**Typical values:**
- Calm markets: 30–50%
- Normal conditions: 50–80%
- High volatility / bull runs: 80–120%
- Extreme events: 120%+

**Effect on results:**
- **Higher volatility → larger price swings** → more likely to exit the LP range
- **Higher volatility → more impermanent loss** → the LP value curve is concave (short gamma), so larger moves always hurt more
- **Higher volatility → more frequent hedge rebalancing** → delta changes faster, triggering more rebalance trades and higher costs
- **Higher volatility → potentially more trading volume** → which could mean higher fee income (though this is not modeled — fee APR is set separately)

This parameter is used directly in the Geometric Brownian Motion formula that generates each daily price step.

#### Fee APR

| Property | Value |
|---|---|
| **Default** | 25% |
| **Range** | 1% – 100% |
| **Input type** | Slider |

The annualized percentage return from swap fees earned by the LP position. This is the **primary income source** of the strategy.

**What it represents:** In a real Uniswap V3 pool, fee income depends on:
- Pool's daily trading volume
- Pool's fee tier (0.05%, 0.30%, or 1.00% per swap)
- Your share of the liquidity at the current price
- How concentrated your range is vs other LPs

For the simulator, you set the fee APR directly. A practical estimate:

```
Base Fee APR = (Daily Volume × Fee Tier × 365) / Pool TVL
Your Fee APR = Base Fee APR × Capital Efficiency Multiplier
```

**Effect on results:** This is a linear income driver. Fees are only earned on days when the price is within your LP range. On out-of-range days, fee income is zero. Higher fee APR directly increases the strategy's net return and win rate.

#### Funding Rate (Annualized)

| Property | Value |
|---|---|
| **Default** | +10% |
| **Range** | -30% to +50% |
| **Input type** | Slider |

The annualized funding rate on the perpetual futures used for hedging.

**How funding works:** Perpetual futures use a funding rate mechanism to stay anchored to the spot price. Periodically (typically every 8 hours), one side pays the other:
- **Positive funding (longs pay shorts):** When there's bullish demand, long traders pay short traders. Your short hedge *earns* funding income. This is a tailwind for the strategy.
- **Negative funding (shorts pay longs):** When bearish pressure dominates, short traders pay long traders. Your short hedge *pays* funding. This is a headwind.

**Historical context:** Crypto funding rates have a slight long-term positive bias because the market is structurally net-long. During bull markets, funding can spike to +50%+ annualized. During crashes, it can go deeply negative (-30% or worse), but these episodes are typically short-lived.

**Effect on results:**
- Positive funding → adds to returns, improves win rate
- Negative funding → subtracts from returns, reduces win rate
- The funding payment each day equals: `hedgeSize × price × (fundingRate / 365)`

### 3.3 Strategy Parameters

#### Hedge Ratio

| Property | Value |
|---|---|
| **Default** | 100% |
| **Range** | 0% – 100% |
| **Input type** | Slider |

What fraction of the LP position's delta (directional ETH exposure) is hedged with a short futures position.

**Key values:**
- **100%** — Fully delta-neutral. The short completely offsets the LP's ETH exposure. Returns come purely from fees + funding - costs. Immune to price direction.
- **50%** — Half-hedged. You still have 50% of the original directional exposure. Returns are a mix of yield and price speculation.
- **0%** — Unhedged LP. No short position at all. Equivalent to a standard Uniswap V3 LP. You're fully exposed to impermanent loss and price direction.

**Effect on results:** Lower hedge ratios increase variance (wider return distribution) and expose the position to directional moves. The "vs Unhedged" metric card shows the benefit of hedging. Try sliding from 100% down to 0% to see how the return distribution widens dramatically.

#### Rebalance Threshold

| Property | Value |
|---|---|
| **Default** | 2.0% |
| **Range** | 0.5% – 10% |
| **Input type** | Slider |

How much delta drift (as a fraction of the initial delta) is tolerated before the hedge is rebalanced.

**How it works:** As the price moves, the LP's delta changes (because of gamma — the second derivative). The short hedge, however, stays at its original size until you adjust it. When the mismatch between the current LP delta and the hedge size exceeds this threshold, the simulator triggers a rebalance trade.

**The tradeoff:**
- **Tighter threshold (0.5–1%)** → More frequent rebalancing → Tighter hedge → Higher trading costs → Smoother returns
- **Wider threshold (5–10%)** → Less frequent rebalancing → More delta drift between rebalances → Lower trading costs → More return variance

Each rebalance incurs a **10 basis point (0.1%) trading cost** on the adjustment amount, modeling exchange fees and slippage.

**Effect on results:** Shows up in the "Avg rebalances" count in the summary and the "Rebal. Costs" bar in the P&L attribution chart. With default settings (2%, 30 days, 60% vol), expect roughly 3–8 rebalances per path.

### 3.4 Simulation Settings

#### Duration

| Property | Value |
|---|---|
| **Default** | 30 days |
| **Range** | 7 – 365 days |
| **Input type** | Slider |

How many days the simulation runs.

**Effect on results:**
- **Short durations (7–14 days):** Less time for fee compounding, smaller price moves, tighter return distribution. Useful for near-term projections.
- **Medium durations (30–90 days):** Good balance. Shows meaningful fee accumulation and realistic price path divergence.
- **Long durations (180–365 days):** Shows long-term sustainability but with wider uncertainty bands. More paths will go out of range, more rebalancing events. The assumption that volatility and fee APR stay constant becomes less realistic.

#### Monte Carlo Paths

| Property | Value |
|---|---|
| **Default** | 200 |
| **Range** | 50 – 500 |
| **Input type** | Slider |

The number of independent random price paths generated.

**Effect on results:**
- **50 paths:** Fast but noisy. Return distribution will be lumpy. Good for quick exploration.
- **200 paths:** Smooth, reliable statistics. Recommended default.
- **500 paths:** High confidence. Very smooth distribution curves. Slightly slower (still under 1 second).

Each path uses an independent sequence of random numbers drawn from a standard normal distribution, so every path represents a distinct possible future.

---

## 4. How the Calculations Work

### 4.1 Price Path Generation (Geometric Brownian Motion)

Each simulated price path uses the standard GBM model from quantitative finance:

```
P(t+1) = P(t) × exp[(μ - σ²/2) × Δt + σ × √Δt × Z]
```

Where:
- `P(t)` = price at time t
- `μ` = drift (set to **0** for risk-neutral simulation)
- `σ` = annualized volatility (your Volatility parameter)
- `Δt` = time step = 1/365 (one day)
- `Z` = standard normal random variable (mean 0, std 1)

**Why zero drift?** The simulator uses risk-neutral pricing (μ = 0), which means it doesn't assume ETH will go up or down on average. The price is equally likely to rise or fall. This is the standard assumption for pricing derivatives and evaluating hedged strategies — the hedge is supposed to remove directional risk, so the expected drift doesn't matter.

**Random number generation:** Uses the Box-Muller transform to convert uniform random numbers into standard normal samples:

```
Z = √(-2 × ln(U₁)) × cos(2π × U₂)
```

Where U₁ and U₂ are uniform random numbers on (0, 1).

### 4.2 Uniswap V3 LP Math

The simulator implements the core Uniswap V3 concentrated liquidity formulas.

#### Liquidity (L)

Given your investment amount and the price range, the simulator calculates the liquidity parameter L:

```
L = Investment / (2√P - P/√Pb - √Pa)
```

Where:
- `P` = entry price
- `Pa` = lower price bound
- `Pb` = upper price bound

This L value stays constant for the life of the position (you don't add or remove liquidity during the simulation).

#### Token Amounts

At any price P, the LP holds:

| Condition | ETH (x) | USDC (y) |
|---|---|---|
| P < Pa (below range) | `L × (1/√Pa - 1/√Pb)` | 0 |
| Pa ≤ P ≤ Pb (in range) | `L × (1/√P - 1/√Pb)` | `L × (√P - √Pa)` |
| P > Pb (above range) | 0 | `L × (√Pb - √Pa)` |

As price rises within the range, ETH decreases and USDC increases (the AMM sells ETH for USDC). As price falls, the reverse happens.

#### Position Value

The LP position's total value in USD at any price:

```
V(P) = x(P) × P + y(P)
```

Expanding for price within range:

```
V(P) = L × (2√P - P/√Pb - √Pa)
```

This function is **concave** — it curves downward. This means the LP position always underperforms holding the same tokens outright, which is the mathematical source of impermanent loss.

#### Delta (Δ)

Delta measures the LP's sensitivity to price — how much the position value changes per $1 price move:

```
Δ = dV/dP = L × (1/√P - 1/√Pb)     [when in range]
```

This equals the amount of ETH held. As price rises, delta decreases (you hold less ETH). As price falls, delta increases (you hold more ETH). This is the value that the short hedge needs to match.

#### HODL Value

For comparison, the "HODL" strategy simply holds the initial token amounts:

```
V_hodl(P) = x₀ × P + y₀
```

Where x₀ and y₀ are the ETH and USDC amounts at position opening.

#### Impermanent Loss

```
IL = V_lp(P) - V_hodl(P)
```

IL is always ≤ 0 for any price move away from the entry price. It's zero only when the price hasn't moved.

### 4.3 Fee Income

Fees are earned **only when the price is within the LP range**. The daily fee income is:

```
Daily Fees = LP Value × (Fee APR / 365)
```

This is a simplified model. In reality, fee income depends on trading volume flowing through your specific tick range and your share of the liquidity at those ticks. By setting Fee APR directly, you control the assumed yield.

Fees accumulate cumulatively over the simulation. On days when the price is out of range, zero fees are earned.

### 4.4 Hedge P&L

The short futures position is tracked incrementally. Between each daily step:

```
Hedge P&L increment = -hedgeSize × (P_new - P_old)
```

- When price rises: `P_new > P_old`, the increment is negative (the short loses money)
- When price falls: `P_new < P_old`, the increment is positive (the short gains)

The cumulative hedge P&L is the running sum of all daily increments. This offset is what neutralizes the LP's directional exposure.

### 4.5 Funding Rate Income

Each day, the short position either earns or pays funding:

```
Daily Funding = hedgeSize × P_previous × (Funding Rate / 365)
```

- Positive funding rate → shorts earn → adds to the cumulative funding total
- Negative funding rate → shorts pay → subtracts

Funding is calculated on the previous day's price and the current hedge size.

### 4.6 Hedge Rebalancing

As price moves, the LP's delta changes but the hedge size stays fixed. The simulator checks each day:

```
Delta Drift = |current_delta × hedge_ratio - current_hedge_size|
Trigger:      Delta Drift / initial_delta > rebalance_threshold
```

When triggered:
1. The hedge size is adjusted to match `current_delta × hedge_ratio`
2. A **10 basis point (0.1%) trading cost** is charged on the adjustment amount:
   ```
   Rebalance Cost = |adjustment| × current_price × 0.001
   ```
3. The rebalance counter increments

**Why does delta drift?** Because the LP has negative gamma. Gamma measures how fast delta changes with price:

```
Γ = -L / (2 × P^(3/2))     [when in range]
```

Gamma is always negative, meaning:
- Price goes up → delta decreases → you need less short
- Price goes down → delta increases → you need more short

This is why the hedge must be periodically adjusted, and why narrower ranges (higher gamma) require more frequent rebalancing.

### 4.7 Return Calculations

Three strategies are compared at each time step:

**Hedged Strategy Return:**
```
Net Value = LP Value + Cumulative Fees + Hedge P&L + Funding - Rebalance Costs
Return = (Net Value - Initial Investment) / Initial Investment
```

**Unhedged LP Return:**
```
Net Value = LP Value + Cumulative Fees
Return = (Net Value - Initial Investment) / Initial Investment
```

**HODL Return:**
```
Net Value = x₀ × Current Price + y₀
Return = (Net Value - Initial Investment) / Initial Investment
```

### 4.8 Risk Metrics

#### Sharpe Ratio

Calculated per path, then averaged across all paths:

```
Daily Returns = [(V_t - V_{t-1}) / V_{t-1}]  for each day
Mean Daily Return = average(Daily Returns)
Std Daily Return = stddev(Daily Returns)
Sharpe = (Mean Daily Return / Std Daily Return) × √365
```

**Interpretation:** Sharpe > 1.0 is good, > 2.0 is excellent. A higher Sharpe means better risk-adjusted returns. The hedge should significantly improve the Sharpe ratio compared to an unhedged LP.

#### Max Drawdown

Tracked per path as the largest peak-to-trough decline:

```
For each day:
  Peak = max(Peak, Current Value)
  Drawdown = (Peak - Current Value) / Peak
  Max Drawdown = max(Max Drawdown, Drawdown)
```

The reported value is the average max drawdown across all paths.

#### Win Rate

```
Win Rate = (Number of paths with final return > 0) / Total paths
```

A hedged strategy should have a significantly higher win rate than an unhedged LP in most parameter configurations.

#### Percentiles

Returns are sorted across all paths, and the 5th, 25th, 50th (median), 75th, and 95th percentiles are extracted:

```
p5  = worst 5% scenario (downside risk)
p25 = below-average scenario
p50 = median (typical) outcome
p75 = above-average scenario
p95 = best 5% scenario (upside potential)
```

The tighter the spread between p5 and p95, the more predictable the strategy.

---

## 5. Understanding the Output

### 5.1 Metric Cards

Six summary cards appear after running the simulation:

| Card | What It Shows |
|---|---|
| **Median Return** | The 50th percentile return of the hedged strategy across all paths. The "most likely" outcome. Sub-text shows the mean (average), which can differ from the median if the distribution is skewed. |
| **Win Rate** | Percentage of simulated paths that ended with a positive return. Shows "X of Y paths" in sub-text. A well-configured hedge should produce 60–85% win rates. |
| **Sharpe Ratio** | Average annualized Sharpe ratio across all paths. Measures return per unit of risk. Green if ≥ 1.0, blue if ≥ 0, red if negative. |
| **Avg Max Drawdown** | Average worst peak-to-trough decline across all paths. Green if < 3%, amber if < 8%, red if higher. Shows the strategy's worst-case intra-period loss. |
| **Avg Fee Income** | Average total swap fees earned in dollar terms, with percentage of capital in sub-text. This is always positive and is the primary income source. |
| **vs Unhedged** | The difference between hedged and unhedged median returns. Positive means the hedge helped. Sub-text shows the unhedged median for direct comparison. |

### 5.2 Confidence Band

A horizontal bar showing the return at five percentile levels (5th, 25th, 50th, 75th, 95th). This gives a quick visual sense of the range of outcomes. A well-hedged strategy will have a tight spread. An unhedged LP or high-volatility scenario will have a much wider spread.

### 5.3 Charts

#### Simulated Price Paths

- **15 sample paths** in light blue (low opacity) showing the range of possible price trajectories
- **Median path** in bold blue — the path whose final return is closest to the 50th percentile
- **Two dashed amber lines** marking the LP range bounds (lower and upper)

**What to look for:** How many paths stay within the LP range (between the amber lines). Paths that exit the range represent periods where the LP earns no fees.

#### Strategy Returns Over Time (Median Path)

Three lines on a single chart showing cumulative % returns:

- **Hedged Strategy** (green, solid) — The complete strategy with hedge, fees, and funding
- **Unhedged LP** (amber, dashed) — LP position + fees, no hedge
- **HODL** (gray, dotted) — Simply holding the initial tokens

**What to look for:** The hedged line should be smoother and more predictable than the other two. The unhedged and HODL lines will track each other closely (both are exposed to price direction) but the unhedged LP will underperform HODL by the amount of impermanent loss. The gap between hedged and unhedged at the end is the value of hedging.

#### Average P&L Attribution (% of Capital)

A horizontal bar chart showing where the average return comes from:

| Bar | Color | What It Represents |
|---|---|---|
| **Fee Income** | Blue (positive) | Swap fees earned from the LP position |
| **Impermanent Loss** | Orange (negative) | Value loss from the AMM's concave payoff curve |
| **Hedge P&L** | Blue (positive or negative) | Profit/loss from the short futures position |
| **Funding** | Blue (positive or negative) | Net funding payments on the short |
| **Rebal. Costs** | Orange (negative) | Trading costs from hedge rebalancing |
| **Net Return** | Green/red | Sum of all components — the bottom line |

**What to look for:** In a well-functioning hedge, the Hedge P&L bar should approximately offset the Impermanent Loss bar. Fee Income and Funding should be positive contributors. Rebalancing Costs should be small relative to the other bars.

#### Return Distribution (Hedged vs Unhedged)

A histogram showing how many paths ended at each return level:

- **Green bars** — Hedged strategy return distribution
- **Amber bars** — Unhedged LP return distribution

**What to look for:** The hedged distribution (green) should be **taller and narrower** — tightly clustered around a positive value. The unhedged distribution (amber) should be **shorter and wider** — spread across a much larger range. This is the visual proof that hedging reduces variance while preserving expected returns.

### 5.4 Simulation Summary

A text summary at the bottom recapping:
- **Position** — Investment size, entry price, range, capital efficiency
- **Market** — Volatility, fee APR, funding rate assumptions
- **Hedge** — Ratio, threshold, average rebalance count
- **Key Insight** — A generated sentence summarizing the result quality

---

## 6. Example Scenarios

### Conservative (Low Vol, Wide Range)

| Parameter | Value |
|---|---|
| Volatility | 35% |
| LP Range | $2,000 – $4,000 |
| Fee APR | 15% |
| Funding Rate | +5% |
| Duration | 90 days |

Expected result: Modest but very consistent returns. High win rate (80%+). Price rarely exits the wide range. Low rebalancing frequency.

### Aggressive (High Vol, Narrow Range)

| Parameter | Value |
|---|---|
| Volatility | 90% |
| LP Range | $2,800 – $3,200 |
| Fee APR | 50% |
| Funding Rate | +15% |
| Duration | 30 days |

Expected result: Higher fee income from concentration, but higher gamma costs and more frequent rebalancing. Price exits the range more often. Win rate around 55–65%. Higher variance in outcomes.

### Bearish Funding Environment

| Parameter | Value |
|---|---|
| Volatility | 60% |
| LP Range | $2,500 – $3,500 |
| Fee APR | 25% |
| Funding Rate | -15% |
| Duration | 30 days |

Expected result: Negative funding eats into returns. The short hedge costs money to maintain. Lower win rate. This shows when **not** to run the strategy — when funding is deeply negative.

### No Hedge (Compare)

| Parameter | Value |
|---|---|
| Hedge Ratio | 0% |
| (all others) | default |

Expected result: Wide return distribution. Some paths are very profitable (ETH stayed flat), others are deeply negative (large price moves). Compare the distribution shape against 100% hedged to see the variance reduction.

---

## 7. Limitations and Assumptions

This simulator is an **educational tool** for understanding strategy mechanics. It makes several simplifying assumptions:

| Assumption | Reality |
|---|---|
| **Constant volatility** | Real volatility changes over time (vol clustering, mean reversion) |
| **Constant fee APR** | Real fee income varies with trading volume, which fluctuates daily |
| **Constant funding rate** | Real funding rates change every 8 hours based on market conditions |
| **Daily price steps** | Real prices move continuously; intra-day moves can trigger larger IL |
| **10bps rebalance cost** | Real costs depend on exchange fees, slippage, and position size |
| **No gas costs** | On-chain LP operations have gas costs (significant on Ethereum mainnet, low on L2s) |
| **No LP rebalancing** | The simulator doesn't model closing and re-opening the LP in a new range when price exits |
| **Perfect execution** | Real hedge trades may have slippage, delays, or partial fills |
| **Log-normal prices** | Real crypto prices can have jumps, gaps, and fat tails beyond what GBM models |
| **No counterparty risk** | Smart contract exploits, exchange failures, and liquidation cascades are not modeled |

Despite these simplifications, the simulator accurately captures the **core economics** of the strategy: the interplay between fee income, impermanent loss, hedge offset, funding rates, and rebalancing costs. It is a reliable tool for understanding how these components interact and for comparing different parameter configurations.
