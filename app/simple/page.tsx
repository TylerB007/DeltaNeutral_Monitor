"use client";

import { useState, useMemo, useCallback } from "react";
import { runSimulation } from "@/lib/simulation";
import type { SimulationParams, SimulationResult } from "@/lib/types";
import Link from "next/link";
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
} from "recharts";

// ─── Preset types & constants ───────────────────────────────────────────────

type RangePreset = "narrow" | "medium" | "wide";
type MarketPreset = "calm" | "normal" | "volatile" | "bear";
type DurationPreset = "1w" | "1m" | "3m";

const RANGE_PRESETS: Record<
  RangePreset,
  { label: string; description: string; factor: number }
> = {
  narrow: {
    label: "Narrow (±8%)",
    description: "Higher fees, more rebalancing risk",
    factor: 0.08,
  },
  medium: {
    label: "Medium (±15%)",
    description: "Balanced risk and reward",
    factor: 0.15,
  },
  wide: {
    label: "Wide (±25%)",
    description: "Safer, but lower fee yield",
    factor: 0.25,
  },
};

const MARKET_PRESETS: Record<
  MarketPreset,
  {
    label: string;
    description: string;
    volatility: number;
    feeAPR: number;
    fundingRate: number;
  }
> = {
  calm: {
    label: "Calm",
    description: "Low volatility, steady fees",
    volatility: 0.35,
    feeAPR: 0.15,
    fundingRate: 0.05,
  },
  normal: {
    label: "Normal",
    description: "Typical market conditions",
    volatility: 0.6,
    feeAPR: 0.25,
    fundingRate: 0.1,
  },
  volatile: {
    label: "Volatile",
    description: "High vol, higher fees",
    volatility: 0.9,
    feeAPR: 0.4,
    fundingRate: 0.15,
  },
  bear: {
    label: "Bear",
    description: "Downturn, negative funding",
    volatility: 0.8,
    feeAPR: 0.2,
    fundingRate: -0.1,
  },
};

const DURATION_PRESETS: Record<
  DurationPreset,
  { label: string; days: number }
> = {
  "1w": { label: "1 Week", days: 7 },
  "1m": { label: "1 Month", days: 30 },
  "3m": { label: "3 Months", days: 90 },
};

const FIXED_PARAMS = {
  hedgeRatio: 1.0,
  rebalanceThreshold: 0.02,
  numPaths: 200,
};

// ─── Formatting helpers ─────────────────────────────────────────────────────

const fmtPct = (n: number, dec = 1) => `${(n * 100).toFixed(dec)}%`;
const fmtDollars = (n: number) =>
  `$${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const fmtNum = (n: number, dec = 2) => n.toFixed(dec);

// ─── Reusable UI components ────────────────────────────────────────────────

function NumberInput({
  label,
  value,
  onChange,
  prefix,
  min,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  prefix?: string;
  min?: number;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">
        {label}
      </label>
      <div className="flex items-center bg-slate-800 border border-slate-700 rounded-lg px-3 py-2">
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
          className="w-full bg-transparent text-slate-100 text-sm font-mono outline-none"
        />
      </div>
    </div>
  );
}

function OptionSelector<T extends string>({
  label,
  options,
  value,
  onChange,
  columns,
}: {
  label: string;
  options: { key: T; label: string; description: string }[];
  value: T;
  onChange: (v: T) => void;
  columns: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">
        {label}
      </label>
      <div className={`grid ${columns} gap-2`}>
        {options.map((opt) => (
          <button
            key={opt.key}
            onClick={() => onChange(opt.key)}
            className={`px-3 py-2.5 rounded-lg text-sm border transition-all text-left ${
              value === opt.key
                ? "bg-blue-600/20 border-blue-500 text-blue-300"
                : "bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600"
            }`}
          >
            <p className="font-medium text-xs">{opt.label}</p>
            <p className="text-[10px] opacity-60 mt-0.5">{opt.description}</p>
          </button>
        ))}
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
      <p
        className={`text-xl font-bold font-mono ${colorMap[color || "slate"]}`}
      >
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

function ChartTooltip({ active, payload, label, suffix }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs shadow-xl">
      <p className="text-slate-400 mb-1">Day {label}</p>
      {payload.map((entry: any, i: number) => (
        <p key={i} style={{ color: entry.color || entry.stroke }}>
          {entry.name}: {fmtNum(entry.value)}
          {suffix || ""}
        </p>
      ))}
    </div>
  );
}

// ─── Chart data builder ─────────────────────────────────────────────────────

function buildReturnsChartData(result: SimulationResult) {
  const medianPath = result.paths[result.medianPathIndex];
  return medianPath.steps.map((s) => ({
    day: s.day,
    hedged: +(s.hedgedReturn * 100).toFixed(2),
    unhedged: +(s.unhedgedReturn * 100).toFixed(2),
    hodl: +(s.hodlReturn * 100).toFixed(2),
  }));
}

// ─── Result explanation for beginners ───────────────────────────────────────

function getResultExplanation(
  result: SimulationResult,
  investment: number
): string {
  const s = result.stats;
  const expectedDollar = Math.abs(s.medianReturn * investment);

  if (s.winRate >= 0.7) {
    return (
      `Looking good! In ${(s.winRate * 100).toFixed(0)}% of the ${result.paths.length} simulated scenarios, ` +
      `the hedged strategy was profitable. You could expect to earn around ` +
      `$${expectedDollar.toFixed(0)} on your $${investment.toLocaleString()} ` +
      `investment (${(s.medianReturn * 100).toFixed(1)}% return). ` +
      `Fee income averaged $${s.meanFees.toFixed(0)}, which helped cover hedging costs in most scenarios.`
    );
  } else if (s.winRate >= 0.5) {
    return (
      `Results are mixed. The strategy was profitable in ${(s.winRate * 100).toFixed(0)}% ` +
      `of scenarios. The hedge reduced risk compared to an unhedged LP ` +
      `(unhedged win rate: ${(s.winRateUnhedged * 100).toFixed(0)}%). ` +
      `Consider trying a wider range or the "Calm" market preset to see if results improve.`
    );
  } else {
    return (
      `These conditions are challenging for this strategy. Only ` +
      `${(s.winRate * 100).toFixed(0)}% of scenarios were profitable, ` +
      `with a median return of ${(s.medianReturn * 100).toFixed(1)}%. ` +
      `High volatility or negative funding rates may be eating into returns. ` +
      `Try a wider range or calmer market conditions.`
    );
  }
}

// ─── Main Page Component ────────────────────────────────────────────────────

export default function SimpleSimulatorPage() {
  const [investment, setInvestment] = useState(10000);
  const [ethPrice, setEthPrice] = useState(3000);
  const [rangePreset, setRangePreset] = useState<RangePreset>("medium");
  const [marketPreset, setMarketPreset] = useState<MarketPreset>("normal");
  const [durationPreset, setDurationPreset] = useState<DurationPreset>("1m");
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  // Derive full SimulationParams from presets
  const params = useMemo((): SimulationParams => {
    const range = RANGE_PRESETS[rangePreset];
    const market = MARKET_PRESETS[marketPreset];
    const duration = DURATION_PRESETS[durationPreset];
    return {
      initialInvestment: investment,
      entryPrice: ethPrice,
      lowerPrice: ethPrice * (1 - range.factor),
      upperPrice: ethPrice * (1 + range.factor),
      volatility: market.volatility,
      feeAPR: market.feeAPR,
      fundingRate: market.fundingRate,
      hedgeRatio: FIXED_PARAMS.hedgeRatio,
      durationDays: duration.days,
      numPaths: FIXED_PARAMS.numPaths,
      rebalanceThreshold: FIXED_PARAMS.rebalanceThreshold,
    };
  }, [investment, ethPrice, rangePreset, marketPreset, durationPreset]);

  const handleRun = useCallback(() => {
    setIsRunning(true);
    setTimeout(() => {
      const res = runSimulation(params);
      setResult(res);
      setIsRunning(false);
    }, 20);
  }, [params]);

  // Pre-compute chart data
  const returnsData = useMemo(
    () => (result ? buildReturnsChartData(result) : []),
    [result]
  );

  // Risk level label from drawdown
  const riskLabel = (dd: number) =>
    dd < 0.03 ? "Low" : dd < 0.08 ? "Medium" : "High";
  const riskColor = (dd: number): "green" | "amber" | "red" =>
    dd < 0.03 ? "green" : dd < 0.08 ? "amber" : "red";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <header className="border-b border-slate-800/60 bg-gradient-to-r from-slate-900 via-slate-900 to-emerald-950/20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center text-sm font-bold">
                  DN
                </div>
                <h1 className="text-xl font-bold tracking-tight">
                  Quick Simulator
                </h1>
                <span className="text-[10px] bg-emerald-600/20 text-emerald-400 border border-emerald-600/30 px-2 py-0.5 rounded-full font-medium uppercase tracking-wide">
                  Beginner
                </span>
              </div>
              <p className="text-sm text-slate-400 max-w-xl">
                See how a delta-neutral LP strategy performs under different
                market conditions. Pick your settings below and hit Run.
              </p>
            </div>
            <Link
              href="/"
              className="hidden sm:flex items-center gap-1.5 text-xs text-slate-500 hover:text-blue-400 transition-colors border border-slate-800 rounded-lg px-3 py-2 hover:border-blue-500/30"
            >
              Advanced Simulator
              <svg
                className="w-3 h-3"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </Link>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* ── Controls ────────────────────────────────────────────── */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 space-y-5">
          <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">
            Settings
          </h2>

          {/* Row 1: Investment & ETH price */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <NumberInput
              label="Investment Amount"
              value={investment}
              onChange={setInvestment}
              prefix="$"
              min={100}
            />
            <NumberInput
              label="ETH Price"
              value={ethPrice}
              onChange={setEthPrice}
              prefix="$"
              min={1}
            />
          </div>

          {/* Row 2: Range Width */}
          <OptionSelector
            label="Price Range Width"
            options={Object.entries(RANGE_PRESETS).map(([key, val]) => ({
              key: key as RangePreset,
              label: val.label,
              description: val.description,
            }))}
            value={rangePreset}
            onChange={setRangePreset}
            columns="grid-cols-3"
          />

          {/* Row 3: Market Conditions */}
          <OptionSelector
            label="Market Conditions"
            options={Object.entries(MARKET_PRESETS).map(([key, val]) => ({
              key: key as MarketPreset,
              label: val.label,
              description: val.description,
            }))}
            value={marketPreset}
            onChange={setMarketPreset}
            columns="grid-cols-2 sm:grid-cols-4"
          />

          {/* Row 4: Duration */}
          <OptionSelector
            label="Time Period"
            options={Object.entries(DURATION_PRESETS).map(([key, val]) => ({
              key: key as DurationPreset,
              label: val.label,
              description: `${val.days} days`,
            }))}
            value={durationPreset}
            onChange={setDurationPreset}
            columns="grid-cols-3"
          />

          {/* Run button */}
          <button
            onClick={handleRun}
            disabled={isRunning}
            className="w-full mt-1 px-4 py-3 rounded-lg font-semibold text-sm transition-all
              bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
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

        {/* ── Empty state ─────────────────────────────────────────── */}
        {!result && !isRunning && (
          <div className="text-center py-14 space-y-4">
            <div className="text-slate-600 text-4xl mb-2">&#x26A1;</div>
            <h3 className="text-lg font-semibold text-slate-400">
              How it works
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl mx-auto mt-4 text-left">
              <div className="bg-slate-900/40 border border-slate-800/60 rounded-lg p-4">
                <p className="text-xs font-semibold text-emerald-500 uppercase mb-1">
                  1. Provide Liquidity
                </p>
                <p className="text-xs text-slate-500">
                  Your capital is deposited into a Uniswap V3 concentrated
                  liquidity position to earn swap fees.
                </p>
              </div>
              <div className="bg-slate-900/40 border border-slate-800/60 rounded-lg p-4">
                <p className="text-xs font-semibold text-blue-500 uppercase mb-1">
                  2. Hedge the Risk
                </p>
                <p className="text-xs text-slate-500">
                  A short perpetual futures position offsets the LP&apos;s
                  exposure to ETH price changes.
                </p>
              </div>
              <div className="bg-slate-900/40 border border-slate-800/60 rounded-lg p-4">
                <p className="text-xs font-semibold text-violet-500 uppercase mb-1">
                  3. Earn Net Yield
                </p>
                <p className="text-xs text-slate-500">
                  You earn fee income + funding regardless of whether ETH goes
                  up or down.
                </p>
              </div>
            </div>
            <p className="text-xs text-slate-600 mt-4">
              Choose your settings above and click{" "}
              <span className="text-emerald-400">Run Simulation</span> to see
              results across 200 market scenarios.
            </p>
          </div>
        )}

        {/* ── Results ─────────────────────────────────────────────── */}
        {result && (
          <>
            {/* Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <MetricCard
                label="Expected Return"
                value={`${result.stats.medianReturn >= 0 ? "+" : ""}${fmtPct(result.stats.medianReturn)}`}
                sub={`${result.stats.medianReturn >= 0 ? "+" : "-"}${fmtDollars(Math.abs(result.stats.medianReturn * investment))} on ${fmtDollars(investment)}`}
                color={result.stats.medianReturn >= 0 ? "green" : "red"}
              />
              <MetricCard
                label="Win Rate"
                value={fmtPct(result.stats.winRate, 0)}
                sub={`${result.paths.filter((p) => p.finalReturn > 0).length} of ${result.paths.length} scenarios profitable`}
                color={result.stats.winRate >= 0.5 ? "green" : "amber"}
              />
              <MetricCard
                label="Fee Income"
                value={fmtDollars(result.stats.meanFees)}
                sub={`${fmtPct(result.stats.meanFees / investment)} of capital`}
                color="green"
              />
              <MetricCard
                label="Risk Level"
                value={riskLabel(result.stats.avgMaxDrawdown)}
                sub={`Max drawdown: ${fmtPct(result.stats.avgMaxDrawdown)}`}
                color={riskColor(result.stats.avgMaxDrawdown)}
              />
            </div>

            {/* Beginner explanation */}
            <div className="bg-slate-900/40 border border-slate-800/50 rounded-lg px-5 py-4">
              <p className="text-sm text-slate-300 leading-relaxed">
                {getResultExplanation(result, investment)}
              </p>
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Chart 1: Strategy Returns Over Time */}
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

              {/* Chart 2: Return Distribution */}
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
                        value: "# Scenarios",
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

            {/* CTA to advanced */}
            <div className="bg-slate-900/40 border border-slate-800/50 rounded-lg px-5 py-4 flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-300 font-medium">
                  Want more control?
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  The advanced simulator lets you tune volatility, funding
                  rates, hedge ratio, rebalance thresholds, and more.
                </p>
              </div>
              <Link
                href="/"
                className="shrink-0 text-xs text-blue-400 hover:text-blue-300 transition-colors border border-blue-500/30 rounded-lg px-4 py-2 hover:bg-blue-600/10"
              >
                Advanced Mode
              </Link>
            </div>
          </>
        )}
      </div>

      {/* Mobile nav link */}
      <div className="sm:hidden fixed bottom-4 right-4">
        <Link
          href="/"
          className="flex items-center gap-1.5 text-xs text-slate-400 bg-slate-900 border border-slate-700 rounded-full px-4 py-2 shadow-lg"
        >
          Advanced
          <svg
            className="w-3 h-3"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 5l7 7-7 7"
            />
          </svg>
        </Link>
      </div>
    </div>
  );
}
