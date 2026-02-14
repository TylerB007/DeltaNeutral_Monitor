# Delta-Neutral Strategy Simulator — Mathematical Audit Report

**Date**: 2026-02-14
**Scope**: `lib/simulation.ts` — all formulas, mechanisms, and assumptions
**Verdict**: Mathematically sound. No bugs found. Minor notes below.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Random Number Generation](#2-random-number-generation)
3. [Price Path Generation (GBM)](#3-price-path-generation-gbm)
4. [Uniswap V3 LP Mathematics](#4-uniswap-v3-lp-mathematics)
5. [Fee Income Calculation](#5-fee-income-calculation)
6. [Hedge P&L Calculation](#6-hedge-pl-calculation)
7. [Funding Rate Mechanics](#7-funding-rate-mechanics)
8. [Hedge Rebalancing Logic](#8-hedge-rebalancing-logic)
9. [Return Calculations](#9-return-calculations)
10. [Risk Metrics](#10-risk-metrics)
11. [Aggregation & Statistics](#11-aggregation--statistics)
12. [Findings Summary](#12-findings-summary)
13. [Known Limitations](#13-known-limitations)

---

## 1. Executive Summary

The simulation engine is mathematically correct for its intended purpose as an educational and scenario-analysis tool. All Uniswap V3 formulas match the academic literature and whitepaper. The GBM price model is standard. Hedge mechanics (linear short payoff, threshold rebalancing, funding) are correctly implemented. No bugs or incorrect formulas were found.

Seven minor notes are documented below — all are acceptable design choices, not errors.

---

## 2. Random Number Generation

**Code**: `simulation.ts` lines 10–15

```
Box-Muller transform: Z = sqrt(-2 * ln(U1)) * cos(2π * U2)
where U1, U2 ~ Uniform(0,1)
```

**Assessment**: Standard Box-Muller method producing normally-distributed random numbers. The `while (u1 === 0)` guard prevents `ln(0) = -Infinity`. Correct.

---

## 3. Price Path Generation (GBM)

**Code**: `simulation.ts` lines 145–155

```
S(t+dt) = S(t) * exp((-σ²/2) * dt + σ * √dt * Z)
where dt = 1/365, Z ~ N(0,1)
```

**Assessment**: This is the standard log-normal GBM discretization with the Ito correction term `-σ²/2`. Zero drift is appropriate for risk-neutral simulation (no directional bias assumed).

**Note**: Price is floored at 1 (line 155) to prevent negative/zero prices. This introduces a negligible bias for extremely unlikely paths. Acceptable.

---

## 4. Uniswap V3 LP Mathematics

### 4a. Liquidity Calculation

**Code**: `simulation.ts` lines 19–32

```
L = Investment / (2√P - P/√Pb - √Pa)
```

Derived from the Uniswap V3 position value formula `V(P) = L * (2√P - P/√Pb - √Pa)`. Correctly solves for L given total investment. The `denominator <= 0` guard handles edge cases where the price is outside the range.

**Verdict**: Correct. Matches `knowledge_base/uniswap_v3_math.md`.

### 4b. Token Amounts

**Code**: `simulation.ts` lines 34–51

Three cases handled:
- `P ≤ Pa`: all ETH → `x = L(1/√Pa - 1/√Pb)`, `y = 0`
- `P ≥ Pb`: all USDC → `x = 0`, `y = L(√Pb - √Pa)`
- `Pa < P < Pb`: mixed → `x = L(1/√P - 1/√Pb)`, `y = L(√P - √Pa)`

**Verdict**: Correct. Standard Uniswap V3 formulas.

### 4c. Position Value

**Code**: `simulation.ts` lines 53–61

```
V = x * P + y
```

**Verdict**: Correct.

### 4d. LP Delta (dV/dP)

**Code**: `simulation.ts` lines 63–76

```
In range: dV/dP = L * (1/√P - 1/√Pb)
Below range: constant (all ETH)
Above range: 0 (all USDC)
```

This is the derivative of the position value with respect to price. In-range delta equals the ETH token amount, which is the correct known result.

**Verdict**: Correct.

---

## 5. Fee Income Calculation

**Code**: `simulation.ts` lines 164–169

```
dailyFee = positionValue(L, price) * (feeAPR / 365)
Only accrued when price is in range.
```

**Assessment**: This is a simplification. Real fee income depends on trading volume flowing through the position's range, not position value. The model approximates it as a constant APR applied to the current position value. Since feeAPR is a user input, the user can adjust it to reflect different volume expectations.

**Note**: Using `positionValue()` as the fee base means IL reduces the fee base, which is directionally correct (larger IL → lower LP value → lower fee income). This is a reasonable secondary effect.

**Verdict**: Acceptable simplification.

---

## 6. Hedge P&L Calculation

**Code**: `simulation.ts` lines 171–172

```
hedgePnL += -hedgeSize * (price - previousPrice)
```

**Assessment**: Correct linear short payoff. The negative sign means the short profits when price falls and loses when price rises. `hedgeSize` is in ETH units, `(price - previousPrice)` is the price change in USD, so the product gives dollar P&L.

**Verdict**: Correct.

---

## 7. Funding Rate Mechanics

**Code**: `simulation.ts` lines 174–176

```
funding += hedgeSize * previousPrice * (fundingRate / 365)
```

**Assessment**: Funding is computed on the notional value of the hedge (`hedgeSize * previousPrice`) at a daily rate. Using `previousPrice` rather than `price` is a beginning-of-day convention — the difference is negligible.

**Note**: Real funding rates vary over time and settle every 8 hours. The constant annualized rate is a reasonable simplification for scenario analysis.

**Verdict**: Correct and appropriate.

---

## 8. Hedge Rebalancing Logic

**Code**: `simulation.ts` lines 178–187

```
Trigger:  |delta * hedgeRatio - hedgeSize| / initialDelta > rebalanceThreshold
Action:   hedgeSize = delta * hedgeRatio
Cost:     adjustment * price * 0.001 (10 bps)
```

**Assessment**: Threshold-based rebalancing is standard practice. The 10 bps cost model is reasonable for major perpetual markets. The `initialDelta > 0` guard prevents division by zero.

**Note**: The cost is proportional to the size of the adjustment and the current price — appropriate for a slippage model.

**Verdict**: Correct.

---

## 9. Return Calculations

**Code**: `simulation.ts` lines 189–201

| Strategy | Formula |
|---|---|
| Hedged | `(lpVal + fees + hedgePnL + funding - rebalanceCosts - investment) / investment` |
| Unhedged | `(lpVal + fees - investment) / investment` |
| HODL | `(hodlVal - investment) / investment` |

**Assessment**: All three return formulas are correct. The unhedged return includes fee income (correct — it represents an unhedged LP, not a raw hold). HODL uses the initial token amounts valued at current price.

**Verdict**: Correct.

---

## 10. Risk Metrics

### 10a. Sharpe Ratio

**Code**: `simulation.ts` lines 236–242

```
Sharpe = (meanDailyReturn / stdDailyReturn) * √365
```

Uses population standard deviation (divides by N, not N-1). This slightly underestimates the true Sharpe for very short durations. For 30+ day simulations the impact is negligible.

**Verdict**: Correct. Minor note on population vs sample std dev.

### 10b. Max Drawdown

**Code**: `simulation.ts` lines 203–206

```
Track running peak. Drawdown = (peak - current) / peak.
```

Standard peak-to-trough drawdown calculation on the hedged strategy value.

**Verdict**: Correct.

---

## 11. Aggregation & Statistics

### 11a. Median Path Selection

**Code**: `simulation.ts` lines 341–350

Selects the path whose final return is closest to the 50th percentile. This is an approximation — the "median path" ends at the median return but its intra-path behavior may differ from the median at every time step. For visualization purposes this is appropriate.

### 11b. Percentile Calculations

**Code**: `simulation.ts` lines 264–271

Standard linear interpolation between sorted values. Correct.

### 11c. Return Distribution Histogram

**Code**: `simulation.ts` lines 275–301

Dynamic bin sizing based on the range of returns. Both hedged and unhedged distributions share the same bins for visual comparison. Correct implementation.

---

## 12. Findings Summary

| # | Area | Finding | Severity |
|---|---|---|---|
| 1 | Price floor | Price floored at $1 — negligible bias for extreme paths | Info |
| 2 | Fee model | Constant APR on position value instead of volume-based | Design choice |
| 3 | Funding model | Constant annual rate instead of variable 8h settlements | Design choice |
| 4 | Funding notional | Uses `previousPrice` (start-of-day) for notional calc | Negligible |
| 5 | Sharpe std dev | Population std dev (N) instead of sample (N-1) | Negligible |
| 6 | Median path | Selected by final return only, not per-step median | Design choice |
| 7 | Rebalance cost | Flat 10 bps slippage, no gas costs modeled | Design choice |

**No bugs found. No incorrect formulas.**

---

## 13. Known Limitations

These are inherent simplifications of the model, not bugs:

1. **Constant volatility** — GBM assumes constant vol. Real markets have volatility clustering, fat tails, and mean reversion.
2. **Constant fee APR** — Real fee income depends on trading volume, which varies with conditions.
3. **Constant funding rate** — Real funding rates are variable and can swing dramatically.
4. **Daily time steps** — Intra-day price movements and rebalancing are not modeled.
5. **No gas costs** — Only trading slippage (10 bps) is modeled, not on-chain gas fees.
6. **No liquidation risk** — Perpetual futures margin is not tracked; no liquidation events.
7. **No fee compounding** — Fees accrue but are not reinvested into the LP position.
8. **Zero drift** — GBM uses zero drift (risk-neutral). Real markets may have a drift.
9. **Independent paths** — Each Monte Carlo path is independent; no correlation structure.
10. **Single pair** — Assumes ETH/USDC. The math generalizes to any token pair.

---

## Conclusion

The simulation engine is mathematically sound and suitable for educational scenario analysis. All Uniswap V3 formulas are correctly implemented and consistent with the literature. The simplifications are appropriate for the tool's scope and clearly documented. The hedge mechanics correctly model the linear short payoff, funding accrual, and threshold-based rebalancing with slippage costs.
