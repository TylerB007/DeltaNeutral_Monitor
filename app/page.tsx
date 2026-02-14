"use client";

import { useState, useMemo, useCallback } from "react";
import {
  runSimulation,
  capitalEfficiency,
  initialHedgeRatio,
} from "@/lib/simulation";
import type { SimulationParams, SimulationResult, TimeStep } from "@/lib/types";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  BarChart,
  Bar,
  Cell,
} from "recharts";

// ─── Defaults ────────────────────────────────────────────────────────────────

const DEFAULT_PARAMS: SimulationParams = {
  initialInvestment: 100000,
  entryPrice: 3000,
  lowerPrice: 2500,
  upperPrice: 3500,
  volatility: 0.6,
  feeAPR: 0.25,
  fundingRate: 0.1,
  hedgeRatio: 1.0,
  durationDays: 30,
  numPaths: 200,
  rebalanceThreshold: 0.02,
};

// ─── Formatting helpers ──────────────────────────────────────────────────────

const fmtPct = (n: number, dec = 1) => `${(n * 100).toFixed(dec)}%`;
const fmtDollars = (n: number) =>
  `$${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const fmtNum = (n: number, dec = 2) => n.toFixed(dec);

// ─── Reusable UI components ─────────────────────────────────────────────────

function ParamSlider({
  label,
  value,
  onChange,
  min,
  max,
  step,
  format,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-center">
        <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">
          {label}
        </label>
        <span className="text-sm font-mono text-slate-200 bg-slate-800 px-2 py-0.5 rounded">
          {format(value)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
      />
    </div>
  );
}

function NumberInput({
  label,
  value,
  onChange,
  prefix,
  min,
  max,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  prefix?: string;
  min?: number;
  max?: number;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">
        {label}
      </label>
      <div className="flex items-center bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5">
        {prefix && (
          <span className="text-slate-400 text-sm mr-1">{prefix}</span>
        )}
        <input
          type="number"
          value={value}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (!isNaN(v)) onChange(v);
          }}
          min={min}
          max={max}
          className="w-full bg-transparent text-slate-100 text-sm font-mono outline-none"
        />
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: "green" | "red" | "blue" | "amber" | "slate";
}) {
  const colorMap = {
    green: "text-emerald-400",
    red: "text-rose-400",
    blue: "text-blue-400",
    amber: "text-amber-400",
    slate: "text-slate-300",
  };
  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4">
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">
        {label}
      </p>
      <p className={`text-xl font-bold font-mono ${colorMap[color || "slate"]}`}>
        {value}
      </p>
      {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
    </div>
  );
}

function ChartCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-slate-300 mb-3">{title}</h3>
      {children}
    </div>
  );
}

// ─── Custom Tooltip ──────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label, suffix }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs shadow-xl">
      <p className="text-slate-400 mb-1">Day {label}</p>
      {payload.map((entry: any, i: number) => (
        <p key={i} style={{ color: entry.color || entry.stroke }}>
          {entry.name}: {fmtNum(entry.value)}{suffix || ""}
        </p>
      ))}
    </div>
  );
}

// ─── Chart data builders ─────────────────────────────────────────────────────

function buildPriceChartData(result: SimulationResult, numSample: number) {
  const medianPath = result.paths[result.medianPathIndex];
  const sampleIndices: number[] = [];
  const step = Math.max(1, Math.floor(result.paths.length / numSample));
  for (let i = 0; i < result.paths.length && sampleIndices.length < numSample; i += step) {
    if (i !== result.medianPathIndex) sampleIndices.push(i);
  }

  return medianPath.steps.map((s, idx) => {
    const point: Record<string, number> = {
      day: s.day,
      median: +s.price.toFixed(2),
    };
    sampleIndices.forEach((si, j) => {
      point[`s${j}`] = +result.paths[si].steps[idx].price.toFixed(2);
    });
    return point;
  });
}

function buildReturnsChartData(result: SimulationResult) {
  const medianPath = result.paths[result.medianPathIndex];
  return medianPath.steps.map((s) => ({
    day: s.day,
    hedged: +(s.hedgedReturn * 100).toFixed(2),
    unhedged: +(s.unhedgedReturn * 100).toFixed(2),
    hodl: +(s.hodlReturn * 100).toFixed(2),
  }));
}

function buildPnLData(result: SimulationResult, initialInvestment: number) {
  const s = result.stats;
  return [
    {
      name: "Fee Income",
      value: +((s.meanFees / initialInvestment) * 100).toFixed(2),
    },
    {
      name: "Impermanent Loss",
      value: +((s.meanIL / initialInvestment) * 100).toFixed(2),
    },
    {
      name: "Hedge P&L",
      value: +((s.meanHedgePnL / initialInvestment) * 100).toFixed(2),
    },
    {
      name: "Funding",
      value: +((s.meanFunding / initialInvestment) * 100).toFixed(2),
    },
    {
      name: "Rebal. Costs",
      value: +((-s.meanRebalanceCosts / initialInvestment) * 100).toFixed(2),
    },
    {
      name: "Net Return",
      value: +(s.meanReturn * 100).toFixed(2),
    },
  ];
}

// ─── Main Page Component ─────────────────────────────────────────────────────

export default function SimulatorPage() {
  const [params, setParams] = useState<SimulationParams>(DEFAULT_PARAMS);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const updateParam = useCallback(
    <K extends keyof SimulationParams>(key: K, value: SimulationParams[K]) => {
      setParams((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  const handleRun = useCallback(() => {
    setIsRunning(true);
    // Defer to allow UI to show loading state
    setTimeout(() => {
      const res = runSimulation(params);
      setResult(res);
      setIsRunning(false);
    }, 20);
  }, [params]);

  // Pre-compute chart data
  const priceData = useMemo(
    () => (result ? buildPriceChartData(result, 15) : []),
    [result]
  );
  const returnsData = useMemo(
    () => (result ? buildReturnsChartData(result) : []),
    [result]
  );
  const pnlData = useMemo(
    () => (result ? buildPnLData(result, params.initialInvestment) : []),
    [result, params.initialInvestment]
  );

  const capEff = capitalEfficiency(params.lowerPrice, params.upperPrice);
  const hedgeRatioCalc = initialHedgeRatio(params.lowerPrice, params.upperPrice);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <header className="border-b border-slate-800/60 bg-gradient-to-r from-slate-900 via-slate-900 to-blue-950/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-sm font-bold">
              DN
            </div>
            <h1 className="text-xl font-bold tracking-tight">
              Delta-Neutral Strategy Simulator
            </h1>
          </div>
          <p className="text-sm text-slate-400 max-w-2xl">
            Model a hedged concentrated liquidity position across hundreds of
            simulated market scenarios. See how delta-neutral hedging stabilizes
            returns by offsetting directional risk with short perpetual futures.
          </p>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* ── Controls ────────────────────────────────────────────── */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">
              Simulation Parameters
            </h2>
            <div className="flex items-center gap-3 text-xs text-slate-500">
              <span>
                Capital Efficiency:{" "}
                <span className="text-blue-400 font-mono">
                  {fmtNum(capEff, 1)}x
                </span>
              </span>
              <span>
                Hedge Ratio (calc):{" "}
                <span className="text-blue-400 font-mono">
                  {fmtPct(hedgeRatioCalc)}
                </span>
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-5">
            {/* Column 1: Position */}
            <div className="space-y-4">
              <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">
                Position
              </p>
              <NumberInput
                label="Initial Investment"
                value={params.initialInvestment}
                onChange={(v) => updateParam("initialInvestment", v)}
                prefix="$"
                min={1000}
              />
              <NumberInput
                label="Entry Price (ETH)"
                value={params.entryPrice}
                onChange={(v) => updateParam("entryPrice", v)}
                prefix="$"
                min={1}
              />
              <NumberInput
                label="LP Range — Lower"
                value={params.lowerPrice}
                onChange={(v) => updateParam("lowerPrice", v)}
                prefix="$"
                min={1}
              />
              <NumberInput
                label="LP Range — Upper"
                value={params.upperPrice}
                onChange={(v) => updateParam("upperPrice", v)}
                prefix="$"
                min={1}
              />
            </div>

            {/* Column 2: Market */}
            <div className="space-y-4">
              <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">
                Market Assumptions
              </p>
              <ParamSlider
                label="Annualized Volatility"
                value={params.volatility}
                onChange={(v) => updateParam("volatility", v)}
                min={0.1}
                max={1.5}
                step={0.05}
                format={(v) => fmtPct(v, 0)}
              />
              <ParamSlider
                label="Fee APR"
                value={params.feeAPR}
                onChange={(v) => updateParam("feeAPR", v)}
                min={0.01}
                max={1.0}
                step={0.01}
                format={(v) => fmtPct(v, 0)}
              />
              <ParamSlider
                label="Funding Rate (ann.)"
                value={params.fundingRate}
                onChange={(v) => updateParam("fundingRate", v)}
                min={-0.3}
                max={0.5}
                step={0.01}
                format={(v) => `${v >= 0 ? "+" : ""}${fmtPct(v, 0)}`}
              />
            </div>

            {/* Column 3: Strategy */}
            <div className="space-y-4">
              <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">
                Strategy
              </p>
              <ParamSlider
                label="Hedge Ratio"
                value={params.hedgeRatio}
                onChange={(v) => updateParam("hedgeRatio", v)}
                min={0}
                max={1}
                step={0.05}
                format={(v) => fmtPct(v, 0)}
              />
              <ParamSlider
                label="Rebalance Threshold"
                value={params.rebalanceThreshold}
                onChange={(v) => updateParam("rebalanceThreshold", v)}
                min={0.005}
                max={0.1}
                step={0.005}
                format={(v) => fmtPct(v, 1)}
              />
            </div>

            {/* Column 4: Simulation */}
            <div className="space-y-4">
              <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">
                Simulation
              </p>
              <ParamSlider
                label="Duration"
                value={params.durationDays}
                onChange={(v) => updateParam("durationDays", v)}
                min={7}
                max={365}
                step={1}
                format={(v) => `${v} days`}
              />
              <ParamSlider
                label="Monte Carlo Paths"
                value={params.numPaths}
                onChange={(v) => updateParam("numPaths", v)}
                min={50}
                max={500}
                step={10}
                format={(v) => `${v}`}
              />
              <button
                onClick={handleRun}
                disabled={isRunning}
                className="w-full mt-2 px-4 py-2.5 rounded-lg font-semibold text-sm transition-all
                  bg-blue-600 hover:bg-blue-500 active:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isRunning ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg
                      className="animate-spin h-4 w-4"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                        fill="none"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
                    </svg>
                    Simulating...
                  </span>
                ) : (
                  "Run Simulation"
                )}
              </button>
            </div>
          </div>
        </div>

        {/* ── Empty state ─────────────────────────────────────────── */}
        {!result && !isRunning && (
          <div className="text-center py-16 space-y-4">
            <div className="text-slate-600 text-5xl mb-2">&#x2194;</div>
            <h3 className="text-lg font-semibold text-slate-400">
              Configure & Run
            </h3>
            <p className="text-sm text-slate-500 max-w-lg mx-auto leading-relaxed">
              Set your position parameters above and click{" "}
              <span className="text-blue-400">Run Simulation</span>. The engine
              will generate {params.numPaths} Monte Carlo price paths and compute
              the hedged LP strategy returns for each, showing you the
              distribution of outcomes.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl mx-auto mt-6 text-left">
              <div className="bg-slate-900/40 border border-slate-800/60 rounded-lg p-4">
                <p className="text-xs font-semibold text-emerald-500 uppercase mb-1">
                  1. Provide Liquidity
                </p>
                <p className="text-xs text-slate-500">
                  Concentrate capital in a Uniswap V3 price range to earn
                  amplified swap fees.
                </p>
              </div>
              <div className="bg-slate-900/40 border border-slate-800/60 rounded-lg p-4">
                <p className="text-xs font-semibold text-blue-500 uppercase mb-1">
                  2. Hedge with Shorts
                </p>
                <p className="text-xs text-slate-500">
                  Short perpetual futures to offset the LP position&apos;s
                  directional (delta) exposure.
                </p>
              </div>
              <div className="bg-slate-900/40 border border-slate-800/60 rounded-lg p-4">
                <p className="text-xs font-semibold text-violet-500 uppercase mb-1">
                  3. Earn Net Yield
                </p>
                <p className="text-xs text-slate-500">
                  Collect fee income + funding while staying market-neutral
                  regardless of price direction.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── Results ─────────────────────────────────────────────── */}
        {result && (
          <>
            {/* Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <MetricCard
                label="Median Return"
                value={`${result.stats.medianReturn >= 0 ? "+" : ""}${fmtPct(result.stats.medianReturn)}`}
                sub={`Mean: ${result.stats.meanReturn >= 0 ? "+" : ""}${fmtPct(result.stats.meanReturn)}`}
                color={result.stats.medianReturn >= 0 ? "green" : "red"}
              />
              <MetricCard
                label="Win Rate"
                value={fmtPct(result.stats.winRate, 0)}
                sub={`${result.paths.filter((p) => p.finalReturn > 0).length} of ${result.paths.length} paths`}
                color={result.stats.winRate >= 0.5 ? "green" : "amber"}
              />
              <MetricCard
                label="Sharpe Ratio"
                value={fmtNum(result.stats.avgSharpe, 2)}
                sub="Annualized"
                color={result.stats.avgSharpe >= 1 ? "green" : result.stats.avgSharpe >= 0 ? "blue" : "red"}
              />
              <MetricCard
                label="Avg Max Drawdown"
                value={fmtPct(result.stats.avgMaxDrawdown)}
                sub="Peak-to-trough"
                color={result.stats.avgMaxDrawdown < 0.03 ? "green" : result.stats.avgMaxDrawdown < 0.08 ? "amber" : "red"}
              />
              <MetricCard
                label="Avg Fee Income"
                value={fmtDollars(result.stats.meanFees)}
                sub={`${fmtPct(result.stats.meanFees / params.initialInvestment)} of capital`}
                color="green"
              />
              <MetricCard
                label="vs Unhedged"
                value={`${result.stats.medianReturn >= result.stats.medianReturnUnhedged ? "+" : ""}${fmtPct(result.stats.medianReturn - result.stats.medianReturnUnhedged)}`}
                sub={`Unhedged median: ${result.stats.medianReturnUnhedged >= 0 ? "+" : ""}${fmtPct(result.stats.medianReturnUnhedged)}`}
                color={result.stats.medianReturn >= result.stats.medianReturnUnhedged ? "blue" : "amber"}
              />
            </div>

            {/* Confidence band */}
            <div className="bg-slate-900/40 border border-slate-800/50 rounded-lg px-5 py-3 flex flex-wrap items-center gap-x-6 gap-y-1 text-xs">
              <span className="text-slate-500 font-medium">
                Return confidence (hedged):
              </span>
              <span className="text-slate-400">
                5th:{" "}
                <span className="text-rose-400 font-mono">
                  {result.stats.p5Return >= 0 ? "+" : ""}
                  {fmtPct(result.stats.p5Return)}
                </span>
              </span>
              <span className="text-slate-400">
                25th:{" "}
                <span className="text-amber-400 font-mono">
                  {result.stats.p25Return >= 0 ? "+" : ""}
                  {fmtPct(result.stats.p25Return)}
                </span>
              </span>
              <span className="text-slate-400">
                50th:{" "}
                <span className="text-slate-200 font-mono">
                  {result.stats.medianReturn >= 0 ? "+" : ""}
                  {fmtPct(result.stats.medianReturn)}
                </span>
              </span>
              <span className="text-slate-400">
                75th:{" "}
                <span className="text-emerald-400 font-mono">
                  {result.stats.p75Return >= 0 ? "+" : ""}
                  {fmtPct(result.stats.p75Return)}
                </span>
              </span>
              <span className="text-slate-400">
                95th:{" "}
                <span className="text-emerald-300 font-mono">
                  {result.stats.p95Return >= 0 ? "+" : ""}
                  {fmtPct(result.stats.p95Return)}
                </span>
              </span>
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Chart 1: Price Paths */}
              <ChartCard title="Simulated Price Paths">
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={priceData}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="#334155"
                      strokeOpacity={0.3}
                    />
                    <XAxis
                      dataKey="day"
                      stroke="#64748b"
                      fontSize={10}
                      tickLine={false}
                    />
                    <YAxis
                      stroke="#64748b"
                      fontSize={10}
                      tickLine={false}
                      tickFormatter={(v) => `$${v.toLocaleString()}`}
                      domain={["auto", "auto"]}
                    />
                    <Tooltip content={<ChartTooltip suffix="" />} />
                    {/* Sample paths */}
                    {Array.from({ length: 15 }, (_, i) => (
                      <Line
                        key={i}
                        dataKey={`s${i}`}
                        stroke="#60a5fa"
                        strokeWidth={1}
                        strokeOpacity={0.12}
                        dot={false}
                        activeDot={false}
                        name={`Path ${i + 1}`}
                        legendType="none"
                      />
                    ))}
                    {/* Median */}
                    <Line
                      dataKey="median"
                      stroke="#3b82f6"
                      strokeWidth={2.5}
                      dot={false}
                      name="Median Price"
                    />
                    {/* LP range bounds */}
                    <ReferenceLine
                      y={params.upperPrice}
                      stroke="#f59e0b"
                      strokeDasharray="6 4"
                      strokeWidth={1.5}
                      label={{
                        value: `Upper $${params.upperPrice}`,
                        position: "right",
                        fill: "#f59e0b",
                        fontSize: 10,
                      }}
                    />
                    <ReferenceLine
                      y={params.lowerPrice}
                      stroke="#f59e0b"
                      strokeDasharray="6 4"
                      strokeWidth={1.5}
                      label={{
                        value: `Lower $${params.lowerPrice}`,
                        position: "right",
                        fill: "#f59e0b",
                        fontSize: 10,
                      }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>

              {/* Chart 2: Strategy Returns Comparison */}
              <ChartCard title="Strategy Returns Over Time (Median Path)">
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={returnsData}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="#334155"
                      strokeOpacity={0.3}
                    />
                    <XAxis
                      dataKey="day"
                      stroke="#64748b"
                      fontSize={10}
                      tickLine={false}
                    />
                    <YAxis
                      stroke="#64748b"
                      fontSize={10}
                      tickLine={false}
                      tickFormatter={(v) => `${v}%`}
                    />
                    <Tooltip content={<ChartTooltip suffix="%" />} />
                    <Legend
                      wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                    />
                    <ReferenceLine
                      y={0}
                      stroke="#475569"
                      strokeWidth={1}
                    />
                    <Line
                      dataKey="hedged"
                      stroke="#34d399"
                      strokeWidth={2.5}
                      dot={false}
                      name="Hedged Strategy"
                    />
                    <Line
                      dataKey="unhedged"
                      stroke="#fbbf24"
                      strokeWidth={1.5}
                      dot={false}
                      name="Unhedged LP"
                      strokeDasharray="4 2"
                    />
                    <Line
                      dataKey="hodl"
                      stroke="#94a3b8"
                      strokeWidth={1.5}
                      dot={false}
                      name="HODL"
                      strokeDasharray="2 2"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>

              {/* Chart 3: P&L Attribution */}
              <ChartCard title="Average P&L Attribution (% of Capital)">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart
                    data={pnlData}
                    layout="vertical"
                    margin={{ left: 10 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="#334155"
                      strokeOpacity={0.3}
                      horizontal={false}
                    />
                    <XAxis
                      type="number"
                      stroke="#64748b"
                      fontSize={10}
                      tickLine={false}
                      tickFormatter={(v) => `${v}%`}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      stroke="#64748b"
                      fontSize={10}
                      tickLine={false}
                      width={100}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "#1e293b",
                        border: "1px solid #334155",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                      formatter={(value: number) => [
                        `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`,
                      ]}
                    />
                    <ReferenceLine
                      x={0}
                      stroke="#475569"
                      strokeWidth={1}
                    />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={24}>
                      {pnlData.map((entry, index) => (
                        <Cell
                          key={index}
                          fill={
                            entry.name === "Net Return"
                              ? entry.value >= 0
                                ? "#34d399"
                                : "#f87171"
                              : entry.value >= 0
                                ? "#60a5fa"
                                : "#fb923c"
                          }
                          fillOpacity={entry.name === "Net Return" ? 1 : 0.7}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              {/* Chart 4: Return Distribution */}
              <ChartCard title="Return Distribution (Hedged vs Unhedged)">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={result.returnDistribution}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="#334155"
                      strokeOpacity={0.3}
                    />
                    <XAxis
                      dataKey="bin"
                      stroke="#64748b"
                      fontSize={9}
                      tickLine={false}
                      interval={Math.max(
                        0,
                        Math.floor(result.returnDistribution.length / 10) - 1
                      )}
                    />
                    <YAxis
                      stroke="#64748b"
                      fontSize={10}
                      tickLine={false}
                      label={{
                        value: "# Paths",
                        angle: -90,
                        position: "insideLeft",
                        fill: "#64748b",
                        fontSize: 10,
                        offset: 10,
                      }}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "#1e293b",
                        border: "1px solid #334155",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
                    <Legend
                      wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                    />
                    <Bar
                      dataKey="hedged"
                      fill="#34d399"
                      fillOpacity={0.8}
                      name="Hedged"
                      radius={[2, 2, 0, 0]}
                    />
                    <Bar
                      dataKey="unhedged"
                      fill="#fbbf24"
                      fillOpacity={0.5}
                      name="Unhedged"
                      radius={[2, 2, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>

            {/* Strategy summary */}
            <div className="bg-slate-900/40 border border-slate-800/50 rounded-lg p-5 text-xs text-slate-500 space-y-2">
              <p className="text-slate-400 font-semibold text-sm mb-2">
                Simulation Summary
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <p className="text-slate-600 mb-1">Position</p>
                  <p>
                    {fmtDollars(params.initialInvestment)} in ETH/USDC LP at $
                    {params.entryPrice}
                  </p>
                  <p>
                    Range: ${params.lowerPrice} &ndash; ${params.upperPrice} (
                    {fmtNum(capEff, 1)}x capital efficiency)
                  </p>
                </div>
                <div>
                  <p className="text-slate-600 mb-1">Market</p>
                  <p>Volatility: {fmtPct(params.volatility, 0)}</p>
                  <p>Fee APR: {fmtPct(params.feeAPR, 0)}</p>
                  <p>
                    Funding:{" "}
                    {params.fundingRate >= 0 ? "+" : ""}
                    {fmtPct(params.fundingRate, 0)}
                  </p>
                </div>
                <div>
                  <p className="text-slate-600 mb-1">Hedge</p>
                  <p>Ratio: {fmtPct(params.hedgeRatio, 0)}</p>
                  <p>Rebalance threshold: {fmtPct(params.rebalanceThreshold)}</p>
                  <p>
                    Avg rebalances:{" "}
                    {fmtNum(result.stats.avgRebalances, 1)} over{" "}
                    {params.durationDays} days
                  </p>
                </div>
                <div>
                  <p className="text-slate-600 mb-1">Key Insight</p>
                  <p className="text-slate-400">
                    {result.stats.winRate >= 0.7
                      ? `The hedged strategy was profitable in ${fmtPct(result.stats.winRate, 0)} of scenarios, with returns tightly clustered around ${result.stats.medianReturn >= 0 ? "+" : ""}${fmtPct(result.stats.medianReturn)}.`
                      : result.stats.winRate >= 0.5
                        ? `The hedge improved consistency. Win rate: ${fmtPct(result.stats.winRate, 0)} (hedged) vs ${fmtPct(result.stats.winRateUnhedged, 0)} (unhedged).`
                        : `Current parameters produce a challenging environment. Consider widening the range or waiting for more favorable funding rates.`}
                  </p>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
