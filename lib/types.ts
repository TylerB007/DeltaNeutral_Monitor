export interface SimulationParams {
  initialInvestment: number;
  entryPrice: number;
  lowerPrice: number;
  upperPrice: number;
  volatility: number; // annualized, as decimal (0.60 = 60%)
  feeAPR: number; // annualized, as decimal (0.25 = 25%)
  fundingRate: number; // annualized, as decimal (0.10 = 10%)
  hedgeRatio: number; // 0-1 (1.0 = 100% hedged)
  durationDays: number;
  numPaths: number;
  rebalanceThreshold: number; // as decimal (0.02 = 2%)
}

export interface TimeStep {
  day: number;
  price: number;
  lpValue: number;
  hodlValue: number;
  cumulativeFees: number;
  impermanentLoss: number;
  cumulativeHedgePnL: number;
  cumulativeFunding: number;
  cumulativeRebalanceCosts: number;
  hedgedReturn: number; // % return of hedged strategy
  unhedgedReturn: number; // % return of unhedged LP (LP value + fees)
  hodlReturn: number; // % return of just holding
  delta: number;
  hedgeSize: number;
  inRange: boolean;
}

export interface PathResult {
  steps: TimeStep[];
  finalReturn: number;
  finalReturnUnhedged: number;
  finalReturnHodl: number;
  totalFees: number;
  totalIL: number;
  totalHedgePnL: number;
  totalFundingPnL: number;
  totalRebalanceCosts: number;
  maxDrawdown: number;
  sharpeRatio: number;
  numRebalances: number;
}

export interface SimulationResult {
  paths: PathResult[];
  medianPathIndex: number;
  stats: {
    meanReturn: number;
    medianReturn: number;
    p5Return: number;
    p25Return: number;
    p75Return: number;
    p95Return: number;
    winRate: number;
    avgMaxDrawdown: number;
    avgSharpe: number;
    meanReturnUnhedged: number;
    medianReturnUnhedged: number;
    winRateUnhedged: number;
    meanFees: number;
    meanIL: number;
    meanHedgePnL: number;
    meanFunding: number;
    meanRebalanceCosts: number;
    avgRebalances: number;
  };
  returnDistribution: { bin: string; hedged: number; unhedged: number }[];
  percentilePaths: {
    p5: TimeStep[];
    p25: TimeStep[];
    median: TimeStep[];
    p75: TimeStep[];
    p95: TimeStep[];
  };
}
