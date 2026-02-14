import {
  SimulationParams,
  TimeStep,
  PathResult,
  SimulationResult,
} from "./types";

// --- Random number generation ---

function normalRandom(): number {
  let u1 = Math.random();
  let u2 = Math.random();
  while (u1 === 0) u1 = Math.random();
  return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
}

// --- Uniswap V3 Math ---

function calculateLiquidity(
  investment: number,
  price: number,
  priceLower: number,
  priceUpper: number
): number {
  const sp = Math.sqrt(price);
  const sa = Math.sqrt(priceLower);
  const sb = Math.sqrt(priceUpper);
  // V(P) = L * (2*sqrt(P) - P/sqrt(Pb) - sqrt(Pa))
  const denominator = 2 * sp - price / sb - sa;
  if (denominator <= 0) return 0;
  return investment / denominator;
}

function getTokenAmounts(
  L: number,
  price: number,
  priceLower: number,
  priceUpper: number
): { x: number; y: number } {
  const sa = Math.sqrt(priceLower);
  const sb = Math.sqrt(priceUpper);

  if (price <= priceLower) {
    return { x: L * (1 / sa - 1 / sb), y: 0 };
  } else if (price >= priceUpper) {
    return { x: 0, y: L * (sb - sa) };
  } else {
    const sp = Math.sqrt(price);
    return { x: L * (1 / sp - 1 / sb), y: L * (sp - sa) };
  }
}

function positionValue(
  L: number,
  price: number,
  priceLower: number,
  priceUpper: number
): number {
  const { x, y } = getTokenAmounts(L, price, priceLower, priceUpper);
  return x * price + y;
}

function lpDelta(
  L: number,
  price: number,
  priceLower: number,
  priceUpper: number
): number {
  if (price <= priceLower) {
    return L * (1 / Math.sqrt(priceLower) - 1 / Math.sqrt(priceUpper));
  } else if (price >= priceUpper) {
    return 0;
  } else {
    return L * (1 / Math.sqrt(price) - 1 / Math.sqrt(priceUpper));
  }
}

// --- Single Path Simulation ---

function simulateSinglePath(params: SimulationParams): PathResult {
  const {
    initialInvestment,
    entryPrice,
    lowerPrice,
    upperPrice,
    volatility,
    feeAPR,
    fundingRate,
    hedgeRatio,
    durationDays,
    rebalanceThreshold,
  } = params;

  const L = calculateLiquidity(
    initialInvestment,
    entryPrice,
    lowerPrice,
    upperPrice
  );
  const { x: x0, y: y0 } = getTokenAmounts(
    L,
    entryPrice,
    lowerPrice,
    upperPrice
  );

  const initialDelta = lpDelta(L, entryPrice, lowerPrice, upperPrice);
  let hedgeSize = initialDelta * hedgeRatio;

  let cumulativeFees = 0;
  let cumulativeHedgePnL = 0;
  let cumulativeFunding = 0;
  let cumulativeRebalanceCosts = 0;
  let numRebalances = 0;
  let previousPrice = entryPrice;

  const steps: TimeStep[] = [];
  const dailyPnLs: number[] = [];
  let previousNetValue = initialInvestment;
  let peakNetValue = initialInvestment;
  let maxDrawdown = 0;

  // Record initial state
  steps.push({
    day: 0,
    price: entryPrice,
    lpValue: initialInvestment,
    hodlValue: initialInvestment,
    cumulativeFees: 0,
    impermanentLoss: 0,
    cumulativeHedgePnL: 0,
    cumulativeFunding: 0,
    cumulativeRebalanceCosts: 0,
    hedgedReturn: 0,
    unhedgedReturn: 0,
    hodlReturn: 0,
    delta: initialDelta,
    hedgeSize,
    inRange: true,
  });

  const dt = 1 / 365;
  let price = entryPrice;

  // When targetEndPrice is set, use a deterministic log-linear path with
  // small daily noise so rebalancing triggers realistically.
  const isFixedPrice = params.targetEndPrice != null;
  const logStart = Math.log(entryPrice);
  const logEnd = isFixedPrice ? Math.log(params.targetEndPrice!) : 0;
  const dailyLogStep = isFixedPrice ? (logEnd - logStart) / durationDays : 0;

  for (let day = 1; day <= durationDays; day++) {
    if (isFixedPrice) {
      // Deterministic path: linear in log-space with micro-noise for rebalance realism
      const noise = normalRandom() * 0.002; // tiny jitter
      price = Math.exp(logStart + dailyLogStep * day + noise);
      // On final day, snap exactly to target
      if (day === durationDays) price = params.targetEndPrice!;
    } else {
      // GBM price evolution (zero drift for risk-neutral simulation)
      const z = normalRandom();
      price =
        price *
        Math.exp(
          (-volatility * volatility / 2) * dt + volatility * Math.sqrt(dt) * z
        );
    }

    // Ensure price stays positive and reasonable
    price = Math.max(price, 1);

    // LP position value at new price
    const lpVal = positionValue(L, price, lowerPrice, upperPrice);
    const hodlVal = x0 * price + y0;
    const inRange = price > lowerPrice && price < upperPrice;
    const delta = lpDelta(L, price, lowerPrice, upperPrice);
    const il = lpVal - hodlVal;

    // Fee income (only earned when in range)
    if (inRange) {
      const dailyFeeRate = feeAPR / 365;
      const currentLpVal = positionValue(L, price, lowerPrice, upperPrice);
      cumulativeFees += currentLpVal * dailyFeeRate;
    }

    // Hedge P&L increment: short position gains when price falls
    cumulativeHedgePnL += -hedgeSize * (price - previousPrice);

    // Funding income: positive funding means shorts earn
    const dailyFundingRate = fundingRate / 365;
    cumulativeFunding += hedgeSize * previousPrice * dailyFundingRate;

    // Check rebalancing threshold
    if (initialDelta > 0) {
      const netDelta = Math.abs(delta * hedgeRatio - hedgeSize);
      if (netDelta / initialDelta > rebalanceThreshold) {
        const adjustment = Math.abs(delta * hedgeRatio - hedgeSize);
        cumulativeRebalanceCosts += adjustment * price * 0.001; // 10bps trading cost
        hedgeSize = delta * hedgeRatio;
        numRebalances++;
      }
    }

    // Calculate returns
    const hedgedNetValue =
      lpVal +
      cumulativeFees +
      cumulativeHedgePnL +
      cumulativeFunding -
      cumulativeRebalanceCosts;
    const unhedgedNetValue = lpVal + cumulativeFees;
    const hedgedReturn =
      (hedgedNetValue - initialInvestment) / initialInvestment;
    const unhedgedReturn =
      (unhedgedNetValue - initialInvestment) / initialInvestment;
    const hodlReturn = (hodlVal - initialInvestment) / initialInvestment;

    // Track drawdown on hedged strategy
    if (hedgedNetValue > peakNetValue) peakNetValue = hedgedNetValue;
    const drawdown = (peakNetValue - hedgedNetValue) / peakNetValue;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;

    // Daily P&L for Sharpe calculation
    const dailyPnL =
      (hedgedNetValue - previousNetValue) / previousNetValue;
    dailyPnLs.push(dailyPnL);
    previousNetValue = hedgedNetValue;

    steps.push({
      day,
      price,
      lpValue: lpVal,
      hodlValue: hodlVal,
      cumulativeFees,
      impermanentLoss: il,
      cumulativeHedgePnL,
      cumulativeFunding,
      cumulativeRebalanceCosts,
      hedgedReturn,
      unhedgedReturn,
      hodlReturn,
      delta,
      hedgeSize,
      inRange,
    });

    previousPrice = price;
  }

  // Calculate Sharpe ratio
  const meanDaily =
    dailyPnLs.reduce((a, b) => a + b, 0) / dailyPnLs.length;
  const stdDaily = Math.sqrt(
    dailyPnLs.reduce((sum, r) => sum + (r - meanDaily) ** 2, 0) /
      dailyPnLs.length
  );
  const sharpe = stdDaily > 0 ? (meanDaily / stdDaily) * Math.sqrt(365) : 0;

  const finalStep = steps[steps.length - 1];

  return {
    steps,
    finalReturn: finalStep.hedgedReturn,
    finalReturnUnhedged: finalStep.unhedgedReturn,
    finalReturnHodl: finalStep.hodlReturn,
    totalFees: cumulativeFees,
    totalIL: finalStep.impermanentLoss,
    totalHedgePnL: cumulativeHedgePnL,
    totalFundingPnL: cumulativeFunding,
    totalRebalanceCosts: cumulativeRebalanceCosts,
    maxDrawdown,
    sharpeRatio: sharpe,
    numRebalances,
  };
}

// --- Percentile helper ---

function percentile(arr: number[], p: number): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (idx - lower);
}

// --- Build return distribution histogram ---

function buildReturnDistribution(
  paths: PathResult[]
): { bin: string; hedged: number; unhedged: number }[] {
  const hedgedReturns = paths.map((p) => p.finalReturn * 100);
  const unhedgedReturns = paths.map((p) => p.finalReturnUnhedged * 100);

  const allReturns = [...hedgedReturns, ...unhedgedReturns];
  const minReturn = Math.floor(Math.min(...allReturns) / 2) * 2;
  const maxReturn = Math.ceil(Math.max(...allReturns) / 2) * 2;

  const binSize = Math.max(1, Math.round((maxReturn - minReturn) / 20));
  const bins: { bin: string; hedged: number; unhedged: number }[] = [];

  for (let start = minReturn; start < maxReturn; start += binSize) {
    const end = start + binSize;
    const label = `${start > 0 ? "+" : ""}${start}%`;
    const hedgedCount = hedgedReturns.filter(
      (r) => r >= start && r < end
    ).length;
    const unhedgedCount = unhedgedReturns.filter(
      (r) => r >= start && r < end
    ).length;
    bins.push({ bin: label, hedged: hedgedCount, unhedged: unhedgedCount });
  }

  return bins;
}

// --- Build percentile paths ---

function buildPercentilePaths(
  paths: PathResult[],
  durationDays: number
): SimulationResult["percentilePaths"] {
  const sortedByReturn = [...paths].sort(
    (a, b) => a.finalReturn - b.finalReturn
  );
  const n = sortedByReturn.length;

  const getPathAtPercentile = (p: number) => {
    const idx = Math.min(Math.floor((p / 100) * n), n - 1);
    return sortedByReturn[idx].steps;
  };

  return {
    p5: getPathAtPercentile(5),
    p25: getPathAtPercentile(25),
    median: getPathAtPercentile(50),
    p75: getPathAtPercentile(75),
    p95: getPathAtPercentile(95),
  };
}

// --- Main simulation runner ---

export function runSimulation(params: SimulationParams): SimulationResult {
  const paths: PathResult[] = [];

  for (let i = 0; i < params.numPaths; i++) {
    paths.push(simulateSinglePath(params));
  }

  const returns = paths.map((p) => p.finalReturn);
  const unhedgedReturns = paths.map((p) => p.finalReturnUnhedged);

  // Find median path index
  const medianReturn = percentile(returns, 50);
  let medianPathIndex = 0;
  let minDist = Infinity;
  for (let i = 0; i < returns.length; i++) {
    const dist = Math.abs(returns[i] - medianReturn);
    if (dist < minDist) {
      minDist = dist;
      medianPathIndex = i;
    }
  }

  const stats = {
    meanReturn:
      returns.reduce((a, b) => a + b, 0) / returns.length,
    medianReturn: percentile(returns, 50),
    p5Return: percentile(returns, 5),
    p25Return: percentile(returns, 25),
    p75Return: percentile(returns, 75),
    p95Return: percentile(returns, 95),
    winRate: returns.filter((r) => r > 0).length / returns.length,
    avgMaxDrawdown:
      paths.reduce((sum, p) => sum + p.maxDrawdown, 0) / paths.length,
    avgSharpe:
      paths.reduce((sum, p) => sum + p.sharpeRatio, 0) / paths.length,
    meanReturnUnhedged:
      unhedgedReturns.reduce((a, b) => a + b, 0) / unhedgedReturns.length,
    medianReturnUnhedged: percentile(unhedgedReturns, 50),
    winRateUnhedged:
      unhedgedReturns.filter((r) => r > 0).length / unhedgedReturns.length,
    meanFees:
      paths.reduce((sum, p) => sum + p.totalFees, 0) / paths.length,
    meanIL:
      paths.reduce((sum, p) => sum + p.totalIL, 0) / paths.length,
    meanHedgePnL:
      paths.reduce((sum, p) => sum + p.totalHedgePnL, 0) / paths.length,
    meanFunding:
      paths.reduce((sum, p) => sum + p.totalFundingPnL, 0) / paths.length,
    meanRebalanceCosts:
      paths.reduce((sum, p) => sum + p.totalRebalanceCosts, 0) / paths.length,
    avgRebalances:
      paths.reduce((sum, p) => sum + p.numRebalances, 0) / paths.length,
  };

  return {
    paths,
    medianPathIndex,
    stats,
    returnDistribution: buildReturnDistribution(paths),
    percentilePaths: buildPercentilePaths(paths, params.durationDays),
  };
}

// --- Exported utility for capital efficiency display ---

export function capitalEfficiency(
  priceLower: number,
  priceUpper: number
): number {
  return 1 / (1 - Math.sqrt(priceLower / priceUpper));
}

export function initialHedgeRatio(
  priceLower: number,
  priceUpper: number
): number {
  const r = Math.sqrt(priceUpper / priceLower);
  return (Math.sqrt(r) - 1) / (r - 1);
}
