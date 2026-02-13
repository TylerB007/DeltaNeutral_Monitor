# Delta-Neutral Strategy for Concentrated Liquidity Providers

## Reference Document — Cross-Referenced from 7+ Sources

---

## Table of Contents

1. [Core Concept](#1-core-concept)
2. [Why LPs Need Hedging](#2-why-lps-need-hedging)
3. [LP Positions as Options](#3-lp-positions-as-options--the-theoretical-foundation)
4. [Delta of a Concentrated Liquidity Position](#4-delta-of-a-concentrated-liquidity-position)
5. [Gamma Risk](#5-gamma-risk--second-order-exposure)
6. [Hedging Mechanics](#6-hedging-mechanics--constructing-the-delta-neutral-position)
7. [Dynamic Rebalancing](#7-dynamic-rebalancing)
8. [P&L Components](#8-pl-components)
9. [Funding Rate Considerations](#9-funding-rate-considerations)
10. [Position Sizing & Hedge Ratio](#10-position-sizing--hedge-ratio)
11. [Risk Scenarios](#11-risk-scenarios)
12. [Known Implementations & Protocols](#12-known-implementations--protocols)
13. [Practical Considerations](#13-practical-considerations)
14. [Source Consensus Summary](#14-source-consensus-summary)
15. [References](#15-references)

---

## 1. Core Concept

A **delta-neutral LP strategy** seeks to earn swap fees from providing concentrated
liquidity (e.g., on Uniswap V3) while **hedging away directional price exposure** so
that portfolio value is insensitive to changes in the underlying asset's price.

**How it works at a high level:**
1. Provide concentrated liquidity in a token pair (e.g., ETH/USDC) within a price range [P_a, P_b]
2. Calculate the **delta** (price sensitivity) of that LP position
3. Open a **short perpetual futures** (or other short instrument) position sized to offset the LP delta
4. Continuously **rebalance** the hedge as price moves and delta changes
5. Net result: fee income minus hedging costs, with minimal directional exposure

> **Source consensus:** Neutra Finance, Orange Finance, Cetra Finance, Parallel Finance,
> Teahouse Finance, Toros Finance, and academic papers (Khakhar & Chen 2022,
> arXiv:2407.05146, arXiv:2411.12375) all describe this same core mechanic.

---

## 2. Why LPs Need Hedging

### Impermanent Loss (IL) in Concentrated Liquidity

Impermanent Loss is the difference between the value of holding tokens in an LP position
versus simply holding them outright. In Uniswap V3's concentrated liquidity model, IL is
**amplified** compared to V2 because:

- Liquidity is concentrated in a narrow price range, creating higher capital efficiency
  but also higher sensitivity to price movements
- The LP position behaves like a **leveraged** version of a V2 position within its range
- When price exits the range, the position is 100% converted to the less valuable token

**Quantifying the amplification:** If a V2 position experiences X% IL from a given price
move, a concentrated V3 position over a range [P_a, P_b] experiences approximately:

```
IL_v3 ≈ IL_v2 × (P_b - P_a) / (P_current_range_width)
```

The narrower the range, the greater the amplification. A position concentrated in a
±5% range around the current price can experience 10-20x the IL of an equivalent V2
position for the same price move.

> **Source consensus:** Uniswap docs, Gamma Strategies, Guillaume Lambert (Panoptic),
> RareSkills, and multiple academic papers confirm this amplification effect.

---

## 3. LP Positions as Options — The Theoretical Foundation

A critical insight, established by Guillaume Lambert (Panoptic founder) and confirmed
by multiple academic papers, is that **Uniswap V3 LP positions are economically
equivalent to short put options** (or more precisely, short straddles when viewed
from a delta-neutral perspective).

### The Options Analogy

| LP Position Property | Options Equivalent |
|---|---|
| Providing liquidity in range [P_a, P_b] | Writing (selling) a put option with strikes at P_a and P_b |
| Earning swap fees | Collecting option premium (theta decay) |
| Suffering impermanent loss | Being assigned on the short option |
| Price exiting range | Option going deep in-the-money |
| Concentrated range (narrow) | Short-dated, at-the-money option (high gamma) |
| Wide range | Long-dated, out-of-the-money option (low gamma) |

### Key Implications

- **LP = short gamma:** The LP is short volatility — they profit when price stays
  stable (fees exceed IL) and lose when price moves significantly
- **LP = short convexity:** The position value curve is concave relative to spot price,
  meaning the LP always loses relative to a simple hold for any price movement
- **Hedging an LP = hedging a short option:** The same tools used to hedge options
  (delta hedging, gamma scalping) apply directly

> **Source consensus:** Guillaume Lambert/Panoptic, Gamma Strategies ("Impermanent Loss
> as Short Gamma"), Khakhar & Chen (2022), arXiv:2411.12375, and multiple DeFi
> researchers confirm this equivalence.

---

## 4. Delta of a Concentrated Liquidity Position

### Definition

**Delta (Δ)** = the rate of change of the LP position's value with respect to a change
in the spot price of the volatile asset.

```
Δ = dV/dS
```

where V = LP position value, S = spot price of the volatile asset.

### Formula for Uniswap V3 LP Delta

For a concentrated liquidity position with liquidity L in the range [P_a, P_b], the
position value at spot price S (where P_a ≤ S ≤ P_b) is:

```
V(S) = L × (√S - √P_a) + L × (1/√S - 1/√P_b) × S
```

More precisely, following the Uniswap V3 math:

**Token amounts held by the LP:**
```
x(S) = L × (1/√S - 1/√P_b)    [amount of token X (volatile asset)]
y(S) = L × (√S - √P_a)         [amount of token Y (stablecoin)]
```

**Position value in terms of token Y (e.g., USDC):**
```
V(S) = x(S) × S + y(S)
V(S) = L × (S/√S - S/√P_b + √S - √P_a)
V(S) = L × (2√S - S/√P_b - √P_a)
```

**Delta (dV/dS):**
```
Δ = dV/dS = L × (1/√S - 1/√P_b)
```

This is exactly equal to x(S), the amount of the volatile token held. This makes
intuitive sense: the LP's price sensitivity equals their exposure to the volatile asset.

### Simplified Hedge Ratio at Inception

From Parallel Finance's derivation, defining r = √(P_b / P_a):

```
Hedge Ratio = Δ₀ = (√r - 1) / (r - 1)
```

This gives the fraction of the position value that must be shorted to achieve
delta neutrality at the time of position creation.

**Example:** For an ETH/USDC position with P_a = 3000, P_b = 5000:
- r = √(5000/3000) = √1.667 ≈ 1.291
- Hedge Ratio = (1.291 - 1) / (1.667 - 1) = 0.291 / 0.667 ≈ 0.436
- You would need to short ~43.6% of the position's notional value in ETH

### Delta at Different Price Points

| Price relative to range | Delta | Interpretation |
|---|---|---|
| S < P_a (below range) | Δ = L × (1/√P_a - 1/√P_b) = max delta | 100% in volatile token, maximum long exposure |
| S = P_a (lower bound) | Δ = L × (1/√P_a - 1/√P_b) | Fully in volatile token |
| P_a < S < P_b (in range) | Δ = L × (1/√S - 1/√P_b) | Mixed, decreasing as S rises |
| S = P_b (upper bound) | Δ = 0 | Fully in stablecoin, no exposure |
| S > P_b (above range) | Δ = 0 | 100% stablecoin, no exposure |

> **Source consensus:** Parallel Finance, Guillaume Lambert, Atis Elsts (Uniswap V3
> Liquidity Math), Khakhar & Chen (2022), arXiv:2407.05146, and "Hedging Positions
> on Uniswap V3" all derive consistent formulas.

---

## 5. Gamma Risk — Second-Order Exposure

### Definition

**Gamma (Γ)** = the rate of change of delta with respect to spot price:

```
Γ = dΔ/dS = d²V/dS²
```

For the concentrated LP position:

```
Γ = -L / (2 × S^(3/2))
```

Gamma is **always negative** for LP positions, confirming the "short gamma" nature.

### Why Gamma Matters

- **Negative gamma** means that as price moves in either direction, the LP's delta
  changes adversely — they become longer as price falls and shorter as price rises
- This is the **fundamental source of impermanent loss**
- A delta hedge set at one price point becomes increasingly mismatched as price moves
- The hedger must **continuously rebalance** to maintain neutrality, and each rebalance
  locks in a small loss (the cost of being short gamma)

### Gamma and Range Width

**Narrower ranges = higher gamma = more hedging difficulty:**

```
Γ_concentrated / Γ_full_range ∝ 1 / (P_b - P_a)
```

From arXiv:2411.12375: "Although wider pricing ranges lead to larger delta risks, the
absolute value of gamma decreases. This indicates that delta hedging becomes easier for
wider pricing ranges compared to narrower ones. With a broader pricing range, delta
changes more smoothly as the spot price fluctuates."

### Gamma Scalping

**Panoptic's research** introduces gamma scalping for Uniswap LPs: if you can **short**
an LP position (via Panoptic or GammaSwap), you are **long gamma** and can profit by
delta-hedging — buying low and selling high as price oscillates.

The gamma scalper profits from realized volatility exceeding implied volatility
(analogous to traditional options gamma scalping).

> **Source consensus:** Panoptic (gamma scalping research), Gamma Strategies
> ("short gamma" paper), arXiv:2411.12375, and Khakhar & Chen (2022) all confirm
> the negative gamma nature and its implications.

---

## 6. Hedging Mechanics — Constructing the Delta-Neutral Position

### Step-by-Step Construction

**Step 1: Open LP Position**
- Deposit liquidity in range [P_a, P_b] at current price S₀
- Record the liquidity amount L

**Step 2: Calculate Initial Delta**
```
Δ₀ = L × (1/√S₀ - 1/√P_b)
```
This equals the amount of volatile token (e.g., ETH) held by the LP.

**Step 3: Open Short Hedge**
- Short Δ₀ units of the volatile asset using perpetual futures
- The short position has delta = -Δ₀, offsetting the LP's delta
- Net portfolio delta ≈ 0

**Step 4: Monitor and Rebalance**
- As S changes, LP delta changes (due to negative gamma)
- Periodically recalculate Δ(S) and adjust the short position
- If S falls: LP delta increases (more ETH exposure) → increase short
- If S rises: LP delta decreases (less ETH exposure) → decrease short

### Hedge Instruments

| Instrument | Pros | Cons |
|---|---|---|
| **Perpetual Futures** | No expiry, high liquidity, precise sizing | Funding rate costs, counterparty/exchange risk |
| **Inverse Perpetuals** | Self-hedging in some configurations | Complex payoff, limited availability |
| **Spot Short (borrow + sell)** | Simple, no funding rate | Borrow rate costs, liquidation risk |
| **Options (puts)** | Natural gamma hedge, capped downside | Premium cost, expiry management |
| **Protocol Shorts (Panoptic/GammaSwap)** | On-chain, composable | Liquidity constraints, protocol risk |

> **Source consensus:** Neutra Finance, Cetra Finance, Parallel Finance, Orange Finance,
> Teahouse Finance, and academic papers all recommend perpetual futures as the primary
> hedge instrument, with options as a complement.

---

## 7. Dynamic Rebalancing

### Why Rebalancing is Necessary

Because gamma is non-zero, the initial hedge becomes stale as price moves. The hedge
must be adjusted to track the changing delta.

### Rebalancing Approaches

**1. Time-Based Rebalancing**
- Rebalance at fixed intervals (e.g., every 1 hour, 4 hours, or daily)
- Simple to implement
- May miss large intra-period moves

**2. Delta-Threshold Rebalancing**
- Rebalance when |Δ_portfolio| exceeds a threshold (e.g., 0.05 ETH)
- More responsive to large moves
- Can lead to excessive trading in volatile markets

**3. Price-Threshold Rebalancing**
- Rebalance when price moves by X% from last hedge point
- Good balance of responsiveness and cost

**4. Hybrid Approaches**
- Combine time + threshold triggers
- Rebalance at minimum every N hours OR when delta exceeds threshold

### Rebalancing Cost-Benefit Tradeoff

From Atis Elsts ("Dynamic Hedging for Uniswap V3"):
- More frequent rebalancing → better hedge accuracy → higher trading costs
- Less frequent rebalancing → worse hedge accuracy → lower trading costs
- Optimal frequency depends on: volatility, fee tier, range width, trading costs

From arXiv:2411.12375: "Holding a Uniswap V3 position inherently involves gamma risk.
In scenarios with large gamma values, even minor changes in S can lead to substantial
delta risk, necessitating more frequent adjustments to maintain delta neutrality."

### Rebalancing Formula

At each rebalance point, calculate the new required hedge:

```
Short_new = L × (1/√S_current - 1/√P_b)
Adjustment = Short_new - Short_current
```

If Adjustment > 0: increase short (sell more)
If Adjustment < 0: decrease short (buy back)

> **Source consensus:** Atis Elsts, Khakhar & Chen, "Hedging Positions on Uniswap V3",
> Parallel Finance, and arXiv:2407.05146 all discuss rebalancing mechanics with
> consistent recommendations.

---

## 8. P&L Components

The total P&L of a delta-neutral LP strategy has these components:

```
Net P&L = Fee Income - Impermanent Loss - Hedging Costs - Rebalancing Costs
```

### Fee Income (Positive)
- Swap fees earned from the LP position (e.g., 0.05%, 0.30%, or 1.00% tier)
- Higher in concentrated ranges due to capital efficiency
- Proportional to trading volume passing through the position's range
- Accrues continuously

### Impermanent Loss (Negative, but hedged)
- The concavity cost of the LP position
- In a perfectly hedged position, IL is offset by hedge gains
- Residual IL exists due to discrete (not continuous) hedging

### Hedge Slippage / Gamma Cost (Negative)
- The cost of being short gamma and hedging discretely
- Each rebalance "locks in" a small loss equal to ½ × Γ × (ΔS)²
- Cumulative gamma cost over time:
  ```
  Gamma Cost ≈ ½ × |Γ| × σ² × S² × Δt
  ```
  where σ = realized volatility, Δt = time between rebalances

### Funding Rate Cost (Negative or Positive)
- Cost of carrying the short perpetual futures position
- Typically negative (you pay) in bullish markets
- Can be positive (you earn) in bearish markets
- See Section 9 for details

### Trading / Rebalancing Costs (Negative)
- Exchange fees for each hedge adjustment
- Slippage on perp trades
- Gas costs if hedging on-chain

### Net Profitability Condition

The strategy is profitable when:
```
Fee Income > Gamma Cost + |Funding Rate| + Trading Costs
```

This is analogous to the options market-making condition: theta (fee income) must
exceed the cost of gamma hedging.

> **Source consensus:** Neutra Finance (Parts 1 & 2), Cetra Finance, Orange Finance,
> and academic papers all identify these same P&L components. Neutra Finance provides
> the most detailed backtesting of net profitability.

---

## 9. Funding Rate Considerations

### What is the Funding Rate?

Perpetual futures use a **funding rate** mechanism to keep the futures price anchored
to spot price. Every 8 hours (typically), one side pays the other:

- **Positive funding:** Longs pay shorts (bullish market sentiment)
- **Negative funding:** Shorts pay longs (bearish market sentiment)

### Impact on Delta-Neutral Strategy

Since the strategy requires a **short** perp position:

- **Positive funding (bullish markets):** The short position **earns** funding — this
  is an additional income source that supplements fee income
- **Negative funding (bearish markets):** The short position **pays** funding — this
  is an additional cost that erodes profitability

### Historical Funding Rates

- In prolonged bull markets, annualized funding rates can reach 20-50%+ (favorable
  for the short hedger)
- In bear markets or crashes, funding can go deeply negative (-30% or worse
  annualized), making the strategy unprofitable
- Average funding rates tend to be slightly positive over long periods, providing
  a modest tailwind

### Funding Rate as Strategy Filter

Many practitioners use funding rate as a **strategy activation signal:**
- Enter positions when funding is positive (earning carry on the short)
- Exit or reduce when funding turns negative (paying carry)
- This transforms the strategy from "always on" to "conditional on funding"

> **Source consensus:** Cetra Finance, Toros Finance, Alpaca Finance, and Neutra Finance
> all discuss funding rate impact. Cetra explicitly notes the strategy works best in
> positive funding environments.

---

## 10. Position Sizing & Hedge Ratio

### Basic Position Sizing

Given capital C to deploy:

1. **LP Position Size:** Allocate a portion to LP (e.g., 60-70% of capital)
2. **Hedge Margin:** Reserve the remainder for perpetual futures margin (30-40%)
3. **Hedge Size:** Short Δ₀ units of the volatile asset at inception

### Calculating the Exact Hedge Quantity

At any point in time:

```
Hedge_quantity (in volatile token) = L × (1/√S - 1/√P_b)
```

This equals the amount of the volatile token currently held by the LP position.

**In dollar terms:**
```
Hedge_notional = Hedge_quantity × S
```

### Margin Requirements

For the short perpetual position, ensure adequate margin:
```
Required_margin = Hedge_notional / Leverage
```

Typical leverage for this strategy: 2-5x (conservative to avoid liquidation during
rebalancing delays).

### Capital Split Example

For $100,000 total capital, targeting a ±10% range on ETH at $3,000:
- LP deposit: ~$65,000 (split between ETH and USDC per the range)
- Perp margin: ~$35,000
- Initial hedge: ~0.436 × $65,000 ≈ $28,340 notional short
- At 3x leverage: requires ~$9,447 margin
- Remaining margin serves as buffer for adverse moves

> **Source consensus:** Parallel Finance, Orange Finance, Neutra Finance, and Teahouse
> Finance all discuss position sizing. The exact allocations vary but the principle
> of reserving 30-40% for hedge margin is consistent.

---

## 11. Risk Scenarios

### Scenario 1: Price Exits Range (Downside)

- LP position becomes 100% volatile token (e.g., all ETH)
- LP delta = L × (1/√P_a - 1/√P_b) (maximum, constant)
- LP stops earning fees
- Short perp position is profitable (offsetting LP loss)
- **Risk:** If hedge is correctly sized, losses are capped. If not rebalanced,
  the fixed delta may diverge from the now-constant LP delta

### Scenario 2: Price Exits Range (Upside)

- LP position becomes 100% stablecoin
- LP delta = 0
- LP stops earning fees
- Short perp position is losing money (price rose, short loses)
- **Risk:** Must close the short or accept losses. The LP position has "sold all
  the ETH" at prices within the range — gains are capped

### Scenario 3: Extreme Volatility (Price Whipsaws)

- Each rebalance locks in a gamma cost
- High realized volatility → high cumulative hedging costs
- Fee income may not cover the gamma costs
- **Risk:** Strategy becomes unprofitable. The LP is effectively short volatility
  and loses when realized vol exceeds the "implied vol" priced into fee income

### Scenario 4: Perp Liquidation

- If price drops sharply and the short perp becomes highly profitable, no risk
- If price rises sharply, the short perp loses value
- If margin is insufficient, the short perp gets liquidated
- **Risk:** Loss of hedge at the worst possible time (when you need it most).
  Always maintain adequate margin buffers

### Scenario 5: Funding Rate Spike

- In extreme bear markets, funding rate goes deeply negative
- Short position must pay large funding fees
- Can quickly erode profitability
- **Risk:** Monitor funding rates and have exit criteria

### Scenario 6: Basis Risk (CEX vs DEX)

- LP position is on-chain (e.g., Uniswap on Ethereum)
- Hedge is typically on a CEX (e.g., Binance, dYdX)
- Price discrepancies between venues can cause temporary hedge mismatches
- **Risk:** Usually small and mean-reverting, but can be significant during
  high-volatility events or network congestion

> **Source consensus:** Neutra Finance (Part 2), Cetra Finance, "Hedging Positions
> on Uniswap V3", and Parallel Finance all identify these risk scenarios.

---

## 12. Known Implementations & Protocols

### Automated Delta-Neutral Vaults

| Protocol | Description | Approach |
|---|---|---|
| **Neutra Finance** | Delta-neutral vaults on Uniswap V3 + GMX | Short perps on GMX to hedge LP delta |
| **Orange Finance** | Delta-neutral vault on Uniswap V3 | Uses Aave for borrowing + Uniswap LP |
| **Teahouse Finance** | Easy Earn delta-neutral vaults | Automated hedging with configurable parameters |
| **Toros Finance** | Delta-neutral yield tokens | Tokenized delta-neutral LP strategy |
| **Cetra Finance** | Delta-neutral DeFi strategies | Multi-protocol integration |
| **Alpaca Finance** | Market-neutral automated vaults | Leveraged LP + hedge |
| **NX Finance** | Delta-neutral vault | Structured product approach |

### LP Management (Non-Hedging)

| Protocol | Description | Approach |
|---|---|---|
| **Charm Finance (Alpha Vaults)** | Passive rebalancing LP vaults | Mean-reverting inventory management, no external hedge |
| **Arrakis Finance** | Uniswap V3 LP management | Automated range management |
| **Gamma Strategies** | Active LP management | Dynamic range adjustment |

### Hedging Infrastructure

| Protocol | Description | Use Case |
|---|---|---|
| **Panoptic** | Perpetual options on Uniswap V3 | Short LP positions for gamma hedging |
| **GammaSwap** | Borrow LP tokens (short LP) | Straddle = delta-neutral hedge for LP positions |
| **dYdX** | Decentralized perps | On-chain hedge instrument |
| **GMX** | Decentralized perps | On-chain hedge instrument |
| **Hyperliquid** | Decentralized perps | On-chain hedge instrument |

> **Source consensus:** Multiple protocol documentation sites confirm these
> implementations. Neutra Finance and Orange Finance provide the most detailed
> public documentation of their delta-neutral mechanics.

---

## 13. Practical Considerations

### Monitoring Requirements

A delta-neutral position requires continuous monitoring of:

1. **Current spot price** relative to LP range [P_a, P_b]
2. **Current LP delta** (recalculate from price and range)
3. **Current hedge size** on the perp exchange
4. **Net portfolio delta** = LP delta - hedge size
5. **Funding rate** on the perp exchange
6. **Available margin** on the perp exchange
7. **Accrued fees** from the LP position
8. **Gas costs** for any on-chain rebalancing

### Rebalancing Frequency Recommendations

| Market Condition | Recommended Frequency |
|---|---|
| Low volatility | Every 4-8 hours or 2-3% price move |
| Normal volatility | Every 1-4 hours or 1-2% price move |
| High volatility | Every 15-60 minutes or 0.5-1% price move |
| Extreme volatility | Consider closing the position entirely |

### Key Performance Metrics

- **APR from fees** (annualized fee income / capital deployed)
- **Net APR** (fee APR - hedging costs - funding costs)
- **Sharpe ratio** (risk-adjusted returns)
- **Maximum drawdown** (worst peak-to-trough decline)
- **Hedge efficiency** (% of IL successfully offset)
- **Rebalance frequency** (trades per day)
- **Capital utilization** (% of capital actively earning)

### Common Pitfalls

1. **Insufficient margin buffer** → forced liquidation of hedge during volatile moves
2. **Infrequent rebalancing** → hedge drift causes significant residual exposure
3. **Ignoring funding rates** → carry costs silently erode returns
4. **Too narrow a range** → high fees but extreme gamma, hedging costs dominate
5. **Not accounting for gas/trading costs** → theoretical profitability ≠ actual
6. **CEX/DEX basis risk** → price divergences during network congestion
7. **Ignoring range exit scenarios** → no plan for when price leaves the range

---

## 14. Source Consensus Summary

### Strong Consensus (All Sources Agree)

- LP positions in concentrated liquidity are equivalent to short options (short gamma)
- Delta hedging with perpetual futures is the primary hedging mechanism
- Narrower ranges amplify both fee income AND impermanent loss / gamma risk
- Continuous rebalancing is required due to negative gamma
- Net profitability depends on fee income exceeding hedging costs
- Funding rates significantly impact strategy viability

### Moderate Consensus (Most Sources Agree)

- Perpetual futures are the preferred hedge instrument over spot shorts or options
- Time-based or threshold-based rebalancing are both viable approaches
- 30-40% capital allocation to hedge margin is appropriate
- The strategy works best in range-bound, moderate-volatility environments
- Positive funding rate environments are most favorable

### Areas of Variation

- **Optimal range width:** Sources vary on whether ±5%, ±10%, or ±20% ranges
  are optimal — this depends heavily on the specific pair, fee tier, and market conditions
- **Rebalancing frequency:** Ranges from every 15 minutes to daily depending
  on the source and assumed market conditions
- **Hedge instrument:** Most recommend perps, but some protocols (GammaSwap,
  Panoptic) offer native on-chain alternatives
- **Strategy activation criteria:** Some run continuously, others activate only
  when funding rates are favorable

---

## 15. References

### Academic Papers
1. Khakhar, A. & Chen, X. (2022). "Delta Hedging Liquidity Positions on Automated Market Makers." arXiv:2208.03318
2. "Unified Approach for Hedging Impermanent Loss of Liquidity Provision." arXiv:2407.05146 (2024)
3. "Risk-Neutral Pricing Model of Uniswap Liquidity Providing Position: A Stopping Time Approach." arXiv:2411.12375 (2024)
4. Elsts, A. "Liquidity Math in Uniswap V3." Technical Note (atiselsts.github.io)
5. Elsts, A. "Liquidity Provider Strategies for Uniswap V3: Dynamic Hedging."

### Protocol Documentation
6. Neutra Finance — "Uniswap V3 Delta Neutral Strategy" Parts 1 & 2
7. Orange Finance — "Unraveling the Math for Delta Neutral Vault"
8. Teahouse Finance — "Delta-Neutral Strategy" Documentation
9. Toros Finance — "Delta-Neutral Yield" Documentation
10. Alpaca Finance — "Market-Neutral Strategy" Documentation
11. Cetra Finance — "Delta-Neutral DeFi Strategies Overview"
12. Parallel Finance — "Delta Hedge Uniswap V3 LP Positions"
13. Panoptic — "Gamma Scalping" Research
14. GammaSwap — "How to Profit from Volatility with GammaSwap"
15. Charm Finance — "Alpha Vaults Whitepaper" & "Passive Rebalancing"
16. NX Finance — "Delta Neutral Vault" Whitepaper

### DeFi Research
17. Lambert, G. (Panoptic) — "Understanding the Value of Uniswap V3 Liquidity Positions"
18. Gamma Strategies — "Impermanent Loss as Short Gamma Option Position"
19. "Hedging Positions on Uniswap V3" (Series, Parts 1-3)
20. Uniswap — "Concentrated Liquidity" Official Documentation
21. Uniswap Blog — "A Primer on Uniswap V3 Math" Parts 1 & 2
