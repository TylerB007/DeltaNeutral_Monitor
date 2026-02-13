# Uniswap V3 Concentrated Liquidity — Complete Math Reference

## From On-Chain Data to Position Value, Greeks, and Fees

---

## Table of Contents

1. [Price Representation](#1-price-representation)
2. [Tick System](#2-tick-system)
3. [Liquidity](#3-liquidity)
4. [Token Amounts](#4-token-amounts-from-liquidity)
5. [Position Value](#5-position-value)
6. [Greeks: Delta & Gamma](#6-greeks-delta--gamma)
7. [Fee Accrual Math](#7-fee-accrual-math)
8. [On-Chain Data Pipeline](#8-on-chain-data-pipeline)
9. [Numerical Examples](#9-numerical-examples)
10. [Python Reference Implementation](#10-python-reference-implementation)
11. [References](#11-references)

---

## 1. Price Representation

### sqrtPriceX96

Uniswap V3 stores prices as the **square root of the price** in a **Q64.96 fixed-point
format**. This is stored in `slot0.sqrtPriceX96` of each pool contract.

```
sqrtPriceX96 = √P × 2⁹⁶
```

The Q64.96 format uses 64 bits for the integer part and 96 bits for the fractional part,
fitting within a 160-bit field (packed into slot0 alongside the current tick and other
data in a single 256-bit storage slot).

### Converting sqrtPriceX96 to Price

```
P = (sqrtPriceX96 / 2⁹⁶)²
```

Or equivalently:
```
P = sqrtPriceX96² / 2¹⁹²
```

### Price Convention

In Uniswap V3, price P represents the price of **token0 in terms of token1**:

```
P = token1_amount / token0_amount
```

For an ETH/USDC pool where ETH = token0, USDC = token1:
- P = 3000 means 1 ETH = 3000 USDC

**Important:** Token ordering is determined by contract address (lower address = token0).
Always verify which token is token0 vs token1 for the pool you're interacting with.

### Python Conversion

```python
Q96 = 2**96

def sqrtPriceX96_to_price(sqrtPriceX96: int, decimals0: int, decimals1: int) -> float:
    """Convert sqrtPriceX96 to human-readable price."""
    price = (sqrtPriceX96 / Q96) ** 2
    # Adjust for token decimal differences
    price = price * (10**decimals0) / (10**decimals1)
    return price

def price_to_sqrtPriceX96(price: float, decimals0: int, decimals1: int) -> int:
    """Convert human-readable price to sqrtPriceX96."""
    adjusted_price = price * (10**decimals1) / (10**decimals0)
    return int(math.sqrt(adjusted_price) * Q96)
```

> **Sources:** Uniswap V3 Math Primer (Part 1), RareSkills sqrtPriceX96 Guide,
> Uniswap SqrtPriceMath library docs.

---

## 2. Tick System

### Tick-Price Relationship

Uniswap V3 discretizes the continuous price space into **ticks**. Each tick `i`
corresponds to a specific price:

```
price(i) = 1.0001^i
```

Each tick represents a **0.01% (1 basis point)** price change from the adjacent tick.

### Converting Between Ticks and Prices

```
tick → price:    P = 1.0001^tick
price → tick:    tick = floor(log(P) / log(1.0001))
```

### Tick to sqrtPrice

```
√P(tick) = 1.0001^(tick/2) = √(1.0001^tick)
```

On-chain: `TickMath.getSqrtRatioAtTick(tick)` returns sqrtPriceX96 format.
Reverse: `TickMath.getTickAtSqrtRatio(sqrtPriceX96)` returns the tick.

### Tick Range

Valid ticks range from **-887272 to +887272**, corresponding to prices from
effectively 0 to infinity.

### Tick Spacing

Not every tick can be initialized. **Tick spacing** is determined by the pool's fee tier:

| Fee Tier | Tick Spacing | Price Increment per Usable Tick |
|---|---|---|
| 0.01% (1 bps) | 1 | 0.01% |
| 0.05% (5 bps) | 10 | 0.10% |
| 0.30% (30 bps) | 60 | 0.60% |
| 1.00% (100 bps) | 200 | 2.00% |

Only ticks divisible by the tick spacing can be used as position boundaries.

### Python Conversion

```python
import math

TICK_BASE = 1.0001

def tick_to_price(tick: int) -> float:
    return TICK_BASE ** tick

def price_to_tick(price: float) -> int:
    return math.floor(math.log(price) / math.log(TICK_BASE))

def tick_to_sqrtPrice(tick: int) -> float:
    return TICK_BASE ** (tick / 2)

def sqrtPrice_to_tick(sqrtPrice: float) -> int:
    return math.floor(math.log(sqrtPrice**2) / math.log(TICK_BASE))
```

> **Sources:** Uniswap V3 Math Primer (Part 1), MixBytes tick deep-dive,
> Uniswap TickMath library docs, Uniswap V3 Development Book.

---

## 3. Liquidity

### Definition

Liquidity `L` in Uniswap V3 is a measure of how much of each token is available for
trading within a given tick range. It relates token amounts to price changes via:

```
Δy = L × Δ(√P)          [token1 change per √price change]
Δx = L × Δ(1/√P)        [token0 change per inverse √price change]
```

These are the fundamental AMM invariants for concentrated liquidity.

### Computing L from Token Amounts

Given a position with range [P_a, P_b] and current price P (where P_a ≤ P ≤ P_b):

**From token0 (x) amount:**
```
L_x = x × (√P × √P_b) / (√P_b - √P)
```

**From token1 (y) amount:**
```
L_y = y / (√P - √P_a)
```

**When depositing both tokens (price is within range):**
```
L = min(L_x, L_y)
```

### Computing L from Tick Boundaries (using sqrtPrice)

Let `sa = √P_a`, `sb = √P_b`, `sp = √P`:

```
L_x = x × (sp × sb) / (sb - sp)
L_y = y / (sp - sa)
L = min(L_x, L_y)
```

### Cases When Price is Outside Range

**Price below range (P < P_a):** Position is 100% token0
```
L = x × (√P_a × √P_b) / (√P_b - √P_a)
```

**Price above range (P > P_b):** Position is 100% token1
```
L = y / (√P_b - √P_a)
```

### On-Chain Liquidity

Each position stores its `liquidity` value directly. The pool's total liquidity at the
current tick is available in `slot0` or via `pool.liquidity()`. Individual position
liquidity is available from the NonfungiblePositionManager or directly from the pool's
positions mapping.

> **Sources:** Atis Elsts "Liquidity Math in Uniswap V3" Technical Note,
> Uniswap V3 Development Book (Calculating Liquidity), Uniswap V3 Whitepaper Eq. 2.2.

---

## 4. Token Amounts from Liquidity

Given a position with liquidity L, range [P_a, P_b], and current price P:

### Case 1: Price Within Range (P_a ≤ P ≤ P_b)

```
x = L × (1/√P - 1/√P_b)
y = L × (√P - √P_a)
```

Or using sqrtPrice notation (sa = √P_a, sb = √P_b, sp = √P):
```
x = L × (sb - sp) / (sp × sb)
y = L × (sp - sa)
```

### Case 2: Price Below Range (P < P_a)

```
x = L × (1/√P_a - 1/√P_b)
y = 0
```

Position is 100% token0 (the volatile asset in ETH/USDC).

### Case 3: Price Above Range (P > P_b)

```
x = 0
y = L × (√P_b - √P_a)
```

Position is 100% token1 (the stablecoin in ETH/USDC).

### Summary Table

| Condition | token0 (x) | token1 (y) |
|---|---|---|
| P < P_a | L × (1/√P_a - 1/√P_b) | 0 |
| P_a ≤ P ≤ P_b | L × (1/√P - 1/√P_b) | L × (√P - √P_a) |
| P > P_b | 0 | L × (√P_b - √P_a) |

### Python Implementation

```python
def get_token_amounts(L: float, P: float, Pa: float, Pb: float) -> tuple[float, float]:
    """Calculate token amounts for a position.

    Args:
        L: Liquidity
        P: Current price (token0 in terms of token1)
        Pa: Lower price bound
        Pb: Upper price bound

    Returns:
        (x, y): Amounts of token0 and token1
    """
    sa = math.sqrt(Pa)
    sb = math.sqrt(Pb)

    if P <= Pa:
        # Below range: all token0
        x = L * (1/sa - 1/sb)
        y = 0
    elif P >= Pb:
        # Above range: all token1
        x = 0
        y = L * (sb - sa)
    else:
        # Within range
        sp = math.sqrt(P)
        x = L * (1/sp - 1/sb)
        y = L * (sp - sa)

    return (x, y)
```

> **Sources:** Uniswap V3 Math Primer (Part 2), SqrtPriceMath library
> (getAmount0Delta, getAmount1Delta), Atis Elsts Technical Note.

---

## 5. Position Value

### Value in Terms of Token1 (e.g., USDC)

The total value of the LP position in terms of token1:

```
V(P) = x(P) × P + y(P)
```

Expanding for P within range [P_a, P_b]:

```
V(P) = L × (1/√P - 1/√P_b) × P + L × (√P - √P_a)
     = L × (√P - P/√P_b) + L × (√P - √P_a)
     = L × (2√P - P/√P_b - √P_a)
```

### Value at the Three Cases

| Condition | V(P) |
|---|---|
| P < P_a | L × (1/√P_a - 1/√P_b) × P |
| P_a ≤ P ≤ P_b | L × (2√P - P/√P_b - √P_a) |
| P > P_b | L × (√P_b - √P_a) |

### HODL Value (for IL Comparison)

If instead of LP'ing, you simply held the initial token amounts (x₀, y₀):

```
V_hold(P) = x₀ × P + y₀
```

where x₀ = x(P₀) and y₀ = y(P₀) at the initial price P₀.

### Impermanent Loss

```
IL = V_LP(P) - V_hold(P)
```

IL is always ≤ 0 for any price move (the LP position value curve is concave).

> **Sources:** Guillaume Lambert (Panoptic), Atis Elsts Technical Note,
> Parallel Finance documentation.

---

## 6. Greeks: Delta & Gamma

### Delta (Δ) — First Derivative of Position Value

Delta measures the LP position's sensitivity to price changes:

```
Δ = dV/dP
```

**Within range (P_a ≤ P ≤ P_b):**
```
Δ = dV/dP = L × (1/√P - 1/√P_b)
```

This is exactly equal to x(P) — the amount of token0 held. This makes intuitive
sense: the position's price sensitivity equals its exposure to the volatile asset.

**Below range (P < P_a):**
```
Δ = L × (1/√P_a - 1/√P_b)     [constant, maximum delta]
```

**Above range (P > P_b):**
```
Δ = 0     [no volatile asset exposure]
```

### Gamma (Γ) — Second Derivative

Gamma measures how fast delta changes with price:

```
Γ = dΔ/dP = d²V/dP²
```

**Within range (P_a ≤ P ≤ P_b):**
```
Γ = -L / (2 × P^(3/2))
```

Gamma is **always negative** within the range, confirming the LP is "short gamma."

**Outside range:**
```
Γ = 0     [delta is constant, so its derivative is zero]
```

### Discontinuities at Range Boundaries

Both delta and gamma are **discontinuous** at P = P_a and P = P_b:
- At P_a: delta jumps from constant (max) to decreasing
- At P_b: delta jumps from decreasing to zero
- Gamma is non-zero only within the range

This discontinuity is important for hedging — as price approaches a boundary, the
hedge requirements change abruptly.

### Range Factor and Simplified Hedge Ratio

Define the **range factor** r:
```
r = √(P_b / P_a)
```

The **initial hedge ratio** (fraction of position to short for delta neutrality
at inception when P = √(P_a × P_b)):

```
Hedge Ratio = (√r - 1) / (r - 1)
```

### Effect of Range Width on Greeks

| Narrow Range (high r) | Wide Range (low r) |
|---|---|
| Higher delta sensitivity | Lower delta sensitivity |
| Higher |gamma| | Lower |gamma| |
| More frequent rebalancing needed | Less frequent rebalancing |
| Higher fee income per capital | Lower fee income per capital |
| Higher hedging cost | Lower hedging cost |

From arXiv:2411.12375: "wider pricing ranges lead to larger absolute delta but
the absolute value of gamma decreases, making delta hedging easier."

### Numerical Delta at Key Points

For L = 1000, P_a = 2500, P_b = 3500 (ETH/USDC):

| Price (P) | √P | Δ = L×(1/√P - 1/√P_b) | x (ETH) |
|---|---|---|---|
| 2500 (lower) | 50.00 | 1000 × (0.0200 - 0.0169) = 3.10 | 3.10 |
| 2800 | 52.92 | 1000 × (0.0189 - 0.0169) = 2.00 | 2.00 |
| 3000 | 54.77 | 1000 × (0.0183 - 0.0169) = 1.38 | 1.38 |
| 3200 | 56.57 | 1000 × (0.0177 - 0.0169) = 0.78 | 0.78 |
| 3500 (upper) | 59.16 | 1000 × (0.0169 - 0.0169) = 0.00 | 0.00 |

### Python Implementation

```python
def lp_delta(L: float, P: float, Pa: float, Pb: float) -> float:
    """Calculate the delta of a Uniswap V3 LP position.

    Returns the amount of token0 exposure (= hedge quantity needed).
    """
    if P <= Pa:
        return L * (1/math.sqrt(Pa) - 1/math.sqrt(Pb))
    elif P >= Pb:
        return 0.0
    else:
        return L * (1/math.sqrt(P) - 1/math.sqrt(Pb))

def lp_gamma(L: float, P: float, Pa: float, Pb: float) -> float:
    """Calculate the gamma of a Uniswap V3 LP position."""
    if Pa < P < Pb:
        return -L / (2 * P**(3/2))
    else:
        return 0.0

def hedge_ratio(Pa: float, Pb: float) -> float:
    """Calculate the initial hedge ratio (fraction to short)."""
    r = math.sqrt(Pb / Pa)
    return (math.sqrt(r) - 1) / (r - 1)
```

### Available Tools

- **HapticFinance/greeks-uni-v3** (GitHub): Code to compute delta and gamma for
  Uniswap V3 positions and set up LP positions with a target delta value
- **Desmos interactive calculator**: https://www.desmos.com/calculator/l8sqzlwkf5
  (explore how range width affects Greeks)

> **Sources:** Guillaume Lambert (Panoptic), HapticFinance/greeks-uni-v3,
> arXiv:2411.12375, Gamma Strategies "Short Gamma" paper, Parallel Finance,
> Orange Finance, "Hedging Positions on Uniswap V3" series.

---

## 7. Fee Accrual Math

### Overview

Uniswap V3 tracks fees using a system of **global**, **outside**, and **inside**
fee growth accumulators. All values are stored as Q128.128 fixed-point numbers
(scaled by 2¹²⁸).

### Key State Variables

**Pool-level (global):**
```
feeGrowthGlobal0X128   — total token0 fees per unit of liquidity (all time)
feeGrowthGlobal1X128   — total token1 fees per unit of liquidity (all time)
```

**Per-tick:**
```
tick.feeGrowthOutside0X128   — token0 fees accrued outside this tick
tick.feeGrowthOutside1X128   — token1 fees accrued outside this tick
```

**Per-position:**
```
position.feeGrowthInside0LastX128   — snapshot of feeGrowthInside at last update
position.feeGrowthInside1LastX128   — snapshot of feeGrowthInside at last update
position.tokensOwed0                — uncollected token0 fees
position.tokensOwed1                — uncollected token1 fees
```

### Computing feeGrowthInside

The fee growth **inside** a position's range [tickLower, tickUpper] is:

```
feeGrowthInside = feeGrowthGlobal - feeGrowthBelow - feeGrowthAbove
```

Where `feeGrowthBelow` and `feeGrowthAbove` depend on the current tick:

**feeGrowthBelow (for tickLower):**
```
if currentTick >= tickLower:
    feeGrowthBelow = tickLower.feeGrowthOutside
else:
    feeGrowthBelow = feeGrowthGlobal - tickLower.feeGrowthOutside
```

**feeGrowthAbove (for tickUpper):**
```
if currentTick < tickUpper:
    feeGrowthAbove = tickUpper.feeGrowthOutside
else:
    feeGrowthAbove = feeGrowthGlobal - tickUpper.feeGrowthOutside
```

### Computing Uncollected Fees

```
uncollected_fees = liquidity × (feeGrowthInside_current - feeGrowthInsideLast) / 2¹²⁸
```

For both tokens:
```
fees0 = L × (feeGrowthInside0_current - feeGrowthInside0Last) / 2¹²⁸
fees1 = L × (feeGrowthInside1_current - feeGrowthInside1Last) / 2¹²⁸
```

### Tick Crossing Behavior

When the current price crosses a tick during a swap, the tick's `feeGrowthOutside`
is **flipped**:

```
tick.feeGrowthOutside = feeGrowthGlobal - tick.feeGrowthOutside
```

This maintains the invariant that `feeGrowthOutside` always represents fees
accumulated on the side of the tick that is **not** the current side.

### Modular Arithmetic Note

All fee growth calculations use **unchecked 256-bit arithmetic** (modular overflow).
Subtractions may underflow, which is intentional — the difference is still correct
due to modular arithmetic. In Python:

```python
def sub_in_256(a: int, b: int) -> int:
    """256-bit modular subtraction."""
    return (a - b) % (2**256)
```

### Fee APR Estimation

To estimate annualized fee returns:

```
fee_income_period = fees0_value + fees1_value      (in USD)
position_value = V(P)                               (in USD)
period_length = time_elapsed                         (in seconds)

fee_APR = (fee_income_period / position_value) × (365.25 × 86400 / period_length)
```

### On-Chain Data Required

| Data Point | Source | Call |
|---|---|---|
| feeGrowthGlobal0X128 | Pool contract | `pool.feeGrowthGlobal0X128()` |
| feeGrowthGlobal1X128 | Pool contract | `pool.feeGrowthGlobal1X128()` |
| currentTick | Pool contract | `pool.slot0()` → tick |
| tickLower feeGrowthOutside | Pool contract | `pool.ticks(tickLower)` |
| tickUpper feeGrowthOutside | Pool contract | `pool.ticks(tickUpper)` |
| position liquidity | NFT Manager or Pool | `positions(tokenId)` or `pool.positions(key)` |
| feeGrowthInside0LastX128 | Position | `positions(tokenId)` |
| feeGrowthInside1LastX128 | Position | `positions(tokenId)` |

### Python Implementation

```python
Q128 = 2**128

def compute_fee_growth_inside(
    fee_growth_global: int,
    tick_lower_outside: int,
    tick_upper_outside: int,
    tick_lower: int,
    tick_upper: int,
    tick_current: int
) -> int:
    """Compute feeGrowthInside for a position range."""
    # Fee growth below
    if tick_current >= tick_lower:
        fee_growth_below = tick_lower_outside
    else:
        fee_growth_below = sub_in_256(fee_growth_global, tick_lower_outside)

    # Fee growth above
    if tick_current < tick_upper:
        fee_growth_above = tick_upper_outside
    else:
        fee_growth_above = sub_in_256(fee_growth_global, tick_upper_outside)

    # Fee growth inside
    return sub_in_256(
        sub_in_256(fee_growth_global, fee_growth_below),
        fee_growth_above
    )

def compute_uncollected_fees(
    liquidity: int,
    fee_growth_inside_current: int,
    fee_growth_inside_last: int,
    decimals: int
) -> float:
    """Compute uncollected fees for a position."""
    fee_growth_delta = sub_in_256(fee_growth_inside_current, fee_growth_inside_last)
    return (liquidity * fee_growth_delta) / Q128 / (10**decimals)
```

> **Sources:** Uniswap V3 Math Primer (Part 2), BailSec "Fee Accumulation
> Demystified", Uniswap V3 Development Book (Swap Fees), Uniswap Tick.sol
> source code, Uniswap fee returns math appendix (Adams & Liao 2022).

---

## 8. On-Chain Data Pipeline

### Step-by-Step: From NFT Token ID to Full Position Analysis

**Step 1: Get Position Data from NonfungiblePositionManager**

```python
# Contract: NonfungiblePositionManager
# Method: positions(uint256 tokenId)
# Returns: nonce, operator, token0, token1, fee, tickLower, tickUpper,
#          liquidity, feeGrowthInside0LastX128, feeGrowthInside1LastX128,
#          tokensOwed0, tokensOwed1
```

**Step 2: Get Pool Address**

```python
# Contract: UniswapV3Factory
# Method: getPool(token0, token1, fee)
# Returns: pool address
```

**Step 3: Get Current Pool State**

```python
# Contract: Pool
# Method: slot0()
# Returns: sqrtPriceX96, tick, observationIndex, ...

# Method: feeGrowthGlobal0X128()
# Method: feeGrowthGlobal1X128()
# Method: liquidity()   [total active liquidity at current tick]
```

**Step 4: Get Tick Data**

```python
# Contract: Pool
# Method: ticks(int24 tick)
# Returns: liquidityGross, liquidityNet, feeGrowthOutside0X128,
#          feeGrowthOutside1X128, ...
# Call for both tickLower and tickUpper
```

**Step 5: Compute Everything**

```python
# 1. Current price
P = sqrtPriceX96_to_price(sqrtPriceX96, decimals0, decimals1)

# 2. Range prices
Pa = tick_to_price(tickLower)   # adjusted for decimals
Pb = tick_to_price(tickUpper)   # adjusted for decimals

# 3. Token amounts
x, y = get_token_amounts(liquidity, P, Pa, Pb)

# 4. Position value (in token1 terms, e.g. USDC)
V = x * P + y

# 5. Delta (amount of token0 to hedge)
delta = lp_delta(liquidity, P, Pa, Pb)

# 6. Gamma
gamma = lp_gamma(liquidity, P, Pa, Pb)

# 7. Uncollected fees
fgi0 = compute_fee_growth_inside(fg_global0, tick_lower_out0, tick_upper_out0,
                                  tickLower, tickUpper, currentTick)
fees0 = compute_uncollected_fees(liquidity, fgi0, fgi0_last, decimals0)
# ... same for token1
```

### RPC Providers

For reading on-chain data:
- **Alchemy** — `eth_call` for contract reads
- **Infura** — standard Ethereum RPC
- **The Graph** — Uniswap V3 subgraph for indexed data (positions, pools, ticks)
- **Direct RPC** — any Ethereum node

### Subgraph Queries (Alternative)

The Uniswap V3 subgraph provides indexed position data:

```graphql
{
  position(id: "tokenId") {
    liquidity
    tickLower { tickIdx feeGrowthOutside0X128 feeGrowthOutside1X128 }
    tickUpper { tickIdx feeGrowthOutside0X128 feeGrowthOutside1X128 }
    pool {
      sqrtPrice
      tick
      feeGrowthGlobal0X128
      feeGrowthGlobal1X128
    }
    token0 { decimals symbol }
    token1 { decimals symbol }
  }
}
```

> **Sources:** Uniswap V3 contract interfaces (IUniswapV3PoolState, Tick.sol,
> NonfungiblePositionManager), Uniswap SDK v3 (liquidity-fees guide),
> Uniswap V3 Development Book.

---

## 9. Numerical Examples

### Example 1: ETH/USDC Position Analysis

**Setup:**
- Pool: ETH/USDC (0.30% fee tier, tick spacing = 60)
- Position range: $2,500 – $3,500
- Current ETH price: $3,000
- Liquidity: L = 10,000,000

**Tick Boundaries:**
```
tickLower = floor(log(2500) / log(1.0001)) = 78,244 → rounded to 78,240 (÷60)
tickUpper = floor(log(3500) / log(1.0001)) = 81,615 → rounded to 81,600 (÷60)
```

**Token Amounts:**
```
x = L × (1/√3000 - 1/√3500)
  = 10,000,000 × (0.01826 - 0.01690)
  = 10,000,000 × 0.001358
  = 13,580 ... but this is in raw token units

(Note: actual amounts depend on decimal adjustment and
 the relationship between L and real token quantities)
```

**For a position with ~1 ETH + ~1500 USDC deposited (simplified):**
```
L ≈ 1500 / (√3000 - √2500) = 1500 / (54.77 - 50.00) = 1500 / 4.77 ≈ 314.5
```

**Delta:**
```
Δ = L × (1/√P - 1/√P_b)
  = 314.5 × (1/54.77 - 1/59.16)
  = 314.5 × (0.01826 - 0.01690)
  = 314.5 × 0.00136
  ≈ 0.428 ETH
```

This means the LP holds ~0.428 ETH of exposure → short 0.428 ETH for delta neutrality.

**Gamma:**
```
Γ = -L / (2 × P^(3/2))
  = -314.5 / (2 × 3000^1.5)
  = -314.5 / (2 × 164,317)
  = -314.5 / 328,634
  ≈ -0.000957 ETH per $1 price move
```

### Example 2: Hedge Rebalancing

Starting from the above position with 0.428 ETH shorted:

**Price moves to $3,200:**
```
New Δ = 314.5 × (1/√3200 - 1/√3500)
      = 314.5 × (0.01768 - 0.01690)
      = 314.5 × 0.000778
      ≈ 0.245 ETH

Adjustment = 0.245 - 0.428 = -0.183 ETH
→ Buy back 0.183 ETH of the short (reduce short)
```

**Price moves to $2,700:**
```
New Δ = 314.5 × (1/√2700 - 1/√3500)
      = 314.5 × (0.01925 - 0.01690)
      = 314.5 × 0.00235
      ≈ 0.739 ETH

Adjustment = 0.739 - 0.428 = +0.311 ETH
→ Short an additional 0.311 ETH (increase short)
```

> **Sources:** Derived from formulas confirmed across all sources listed in Section 11.

---

## 10. Python Reference Implementation

### Complete Position Analyzer

```python
"""
Uniswap V3 Position Analyzer — Reference Implementation

Computes token amounts, position value, delta, gamma, and fee estimates
from on-chain position data.
"""

import math
from dataclasses import dataclass
from decimal import Decimal

Q96 = 2**96
Q128 = 2**128
TICK_BASE = 1.0001


@dataclass
class PositionData:
    """Raw on-chain position data."""
    token_id: int
    token0_symbol: str
    token1_symbol: str
    token0_decimals: int
    token1_decimals: int
    fee_tier: int           # e.g., 3000 for 0.30%
    tick_lower: int
    tick_upper: int
    liquidity: int
    sqrt_price_x96: int
    current_tick: int
    fee_growth_global0: int
    fee_growth_global1: int
    tick_lower_fg_outside0: int
    tick_lower_fg_outside1: int
    tick_upper_fg_outside0: int
    tick_upper_fg_outside1: int
    fg_inside0_last: int
    fg_inside1_last: int


@dataclass
class PositionAnalysis:
    """Computed position metrics."""
    current_price: float
    price_lower: float
    price_upper: float
    amount_token0: float
    amount_token1: float
    value_usd: float       # in terms of token1 (stablecoin)
    delta: float            # ETH exposure
    gamma: float            # rate of change of delta
    hedge_quantity: float   # amount of token0 to short
    uncollected_fees0: float
    uncollected_fees1: float
    in_range: bool


def sub_in_256(a: int, b: int) -> int:
    return (a - b) % (2**256)


def tick_to_price(tick: int, decimals0: int, decimals1: int) -> float:
    return (TICK_BASE ** tick) * (10**decimals0) / (10**decimals1)


def sqrtPriceX96_to_price(sqrt_price_x96: int, decimals0: int, decimals1: int) -> float:
    price = (sqrt_price_x96 / Q96) ** 2
    return price * (10**decimals0) / (10**decimals1)


def analyze_position(pos: PositionData) -> PositionAnalysis:
    """Full position analysis from on-chain data."""

    # 1. Prices
    P = sqrtPriceX96_to_price(pos.sqrt_price_x96, pos.token0_decimals, pos.token1_decimals)
    Pa = tick_to_price(pos.tick_lower, pos.token0_decimals, pos.token1_decimals)
    Pb = tick_to_price(pos.tick_upper, pos.token0_decimals, pos.token1_decimals)

    sa, sb, sp = math.sqrt(Pa), math.sqrt(Pb), math.sqrt(P)
    L = pos.liquidity

    # 2. Token amounts (adjusted for decimals already in price)
    if P <= Pa:
        x = L * (1/sa - 1/sb) / (10**pos.token0_decimals)
        y = 0
        in_range = False
    elif P >= Pb:
        x = 0
        y = L * (sb - sa) / (10**pos.token1_decimals)
        in_range = False
    else:
        x = L * (1/sp - 1/sb) / (10**pos.token0_decimals)
        y = L * (sp - sa) / (10**pos.token1_decimals)
        in_range = True

    # 3. Position value (in token1 terms)
    value = x * P + y

    # 4. Delta
    if P <= Pa:
        delta = L * (1/sa - 1/sb) / (10**pos.token0_decimals)
    elif P >= Pb:
        delta = 0.0
    else:
        delta = L * (1/sp - 1/sb) / (10**pos.token0_decimals)

    # 5. Gamma
    if Pa < P < Pb:
        gamma = -L / (2 * P**(3/2)) / (10**pos.token0_decimals)
    else:
        gamma = 0.0

    # 6. Uncollected fees
    # token0 fees
    if pos.current_tick >= pos.tick_lower:
        fg_below0 = pos.tick_lower_fg_outside0
    else:
        fg_below0 = sub_in_256(pos.fee_growth_global0, pos.tick_lower_fg_outside0)

    if pos.current_tick < pos.tick_upper:
        fg_above0 = pos.tick_upper_fg_outside0
    else:
        fg_above0 = sub_in_256(pos.fee_growth_global0, pos.tick_upper_fg_outside0)

    fgi0 = sub_in_256(sub_in_256(pos.fee_growth_global0, fg_below0), fg_above0)
    fees0 = (L * sub_in_256(fgi0, pos.fg_inside0_last)) / Q128 / (10**pos.token0_decimals)

    # token1 fees (same logic)
    if pos.current_tick >= pos.tick_lower:
        fg_below1 = pos.tick_lower_fg_outside1
    else:
        fg_below1 = sub_in_256(pos.fee_growth_global1, pos.tick_lower_fg_outside1)

    if pos.current_tick < pos.tick_upper:
        fg_above1 = pos.tick_upper_fg_outside1
    else:
        fg_above1 = sub_in_256(pos.fee_growth_global1, pos.tick_upper_fg_outside1)

    fgi1 = sub_in_256(sub_in_256(pos.fee_growth_global1, fg_below1), fg_above1)
    fees1 = (L * sub_in_256(fgi1, pos.fg_inside1_last)) / Q128 / (10**pos.token1_decimals)

    return PositionAnalysis(
        current_price=P,
        price_lower=Pa,
        price_upper=Pb,
        amount_token0=x,
        amount_token1=y,
        value_usd=value,
        delta=delta,
        gamma=gamma,
        hedge_quantity=delta,  # amount to short for neutrality
        uncollected_fees0=fees0,
        uncollected_fees1=fees1,
        in_range=in_range,
    )
```

> **Note:** This is a reference implementation. Production code should use
> integer arithmetic throughout and handle the Q-format fixed-point math
> without floating-point conversion until final display.

---

## 11. References

### Official Uniswap
1. Uniswap Blog — "A Primer on Uniswap V3 Math: As Easy As 1, 2, v3" (Part 1)
2. Uniswap Blog — "A Primer on Uniswap V3 Math Part 2: Stay Awake by Reading it Aloud"
3. Uniswap Docs — SqrtPriceMath Library Reference
4. Uniswap Docs — TickMath Library Reference
5. Uniswap Docs — IUniswapV3PoolState Interface
6. Uniswap Docs — Tick Library (Tick.sol)
7. Uniswap Docs — Collecting Fees (SDK v3 Guide)
8. Uniswap V3 Core — Tick.sol Source Code (GitHub)
9. Uniswap — Fee Returns Math Appendix (Adams & Liao, May 2022)

### Technical Notes & Papers
10. Elsts, A. — "Liquidity Math in Uniswap V3" Technical Note
11. Elsts, A. — "Uniswap V3 Liquidity Formula Explained"
12. Lambert, G. — "Understanding the Value of Uniswap V3 Liquidity Positions"
13. arXiv:2411.12375 — "Risk-Neutral Pricing Model of Uniswap LP Position"
14. Cartea, Drissi, Monga — "Predictable Loss and Optimal Liquidity Provision" (SIAM J. Fin. Math, arXiv:2309.08431)

### Development Resources
15. Uniswap V3 Development Book — "Calculating Liquidity" & "Swap Fees"
16. RareSkills — "Square Root Price in Uniswap V3"
17. MixBytes — "Uniswap V3 Ticks: Dive Into Concentrated Liquidity"
18. BailSec — "Uniswap V3 Fee Accumulation Demystified"
19. HapticFinance/greeks-uni-v3 — GitHub Repository for Greek Calculations

### DeFi Research
20. Gamma Strategies — "Impermanent Loss as Short Gamma Option Position"
21. Lambert, G. — "Gamma Transforms: How to Hedge Squeeth Using Uni V3"
22. Orange Finance — "Unraveling the Math for Delta Neutral Vault"
23. "Hedging Positions on Uniswap V3" (Series, Parts 1-3)
24. KyberSwap — "Choosing the Best Range to Maximize LP Returns"
