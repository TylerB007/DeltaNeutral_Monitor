"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
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

type RangePresetKey = "narrow" | "medium" | "wide";
type RangePreset = RangePresetKey | "custom";
type MarketPreset = "calm" | "normal" | "volatile" | "bear";
type DurationPreset = "1w" | "1m" | "3m";

const RANGE_PRESETS: Record<
  RangePresetKey,
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
    detail: string;
    volatility: number;
    fundingRate: number;
  }
> = {
  calm: {
    label: "Calm",
    description: "Small price swings, low hedge income",
    detail:
      "ETH moves slowly, so IL risk is low — but you earn less from the hedge since funding rates are modest.",
    volatility: 0.35,
    fundingRate: 0.05,
  },
  normal: {
    label: "Normal",
    description: "Moderate swings, solid hedge income",
    detail:
      "A typical market. Price moves enough to generate fees and the hedge earns decent funding income.",
    volatility: 0.6,
    fundingRate: 0.1,
  },
  volatile: {
    label: "Volatile",
    description: "Big price swings, high hedge income",
    detail:
      "Large price moves increase IL risk and rebalancing, but funding rates are high — so the hedge earns more.",
    volatility: 0.9,
    fundingRate: 0.15,
  },
  bear: {
    label: "Bear Market",
    description: "Big swings, hedge costs you money",
    detail:
      "Prices drop and funding turns negative — meaning you pay to hold the short hedge instead of earning from it.",
    volatility: 0.8,
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
  suffix,
  min,
  max,
  step,
  hint,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  prefix?: string;
  suffix?: string;
  min?: number;
  max?: number;
  step?: number;
  hint?: string;
}) {
  // Use a local string so the user can freely clear/type without "0" sticking
  const [localValue, setLocalValue] = useState(String(value));
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync from parent when value changes externally (but not while user is typing)
  useEffect(() => {
    if (document.activeElement !== inputRef.current) {
      setLocalValue(String(value));
    }
  }, [value]);

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
          ref={inputRef}
          type="number"
          value={localValue}
          onChange={(e) => {
            const raw = e.target.value;
            setLocalValue(raw);
            const v = Number(raw);
            if (raw !== "" && !isNaN(v)) onChange(v);
          }}
          onBlur={() => {
            // On blur, if empty or invalid, reset to parent value
            const v = Number(localValue);
            if (localValue === "" || isNaN(v)) {
              setLocalValue(String(value));
            } else {
              setLocalValue(String(v)); // normalize (removes leading zeros)
              onChange(v);
            }
          }}
          min={min}
          max={max}
          step={step}
          className="w-full bg-transparent text-slate-100 text-sm font-mono outline-none"
        />
        {suffix && (
          <span className="text-slate-400 text-sm ml-1">{suffix}</span>
        )}
      </div>
      {hint && (
        <p className="text-[10px] text-slate-500">{hint}</p>
      )}
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

// ─── P&L Detail Content ──────────────────────────────────────────────────────

const PNL_DETAILS: Record<
  string,
  { title: string; sections: { heading: string; body: string }[] }
> = {
  "LP Value Change (IL)": {
    title: "Impermanent Loss (IL)",
    sections: [
      {
        heading: "What is it?",
        body: "Impermanent Loss is the difference between holding your tokens in a liquidity pool vs. simply holding them in your wallet. When the price moves away from your entry, the pool automatically rebalances your token mix — selling the token that's gaining and buying the one that's losing — so you end up with less value than a pure holder.",
      },
      {
        heading: "When does it hurt?",
        body: "IL gets worse the further the price moves from your entry. A concentrated (narrow) range amplifies IL because smaller moves cause larger rebalances. If the price goes completely out of range, IL maxes out — your position becomes 100% of the losing token.",
      },
      {
        heading: "How to manage it",
        body: "Use a wider price range to reduce IL sensitivity. The short hedge is specifically designed to offset IL by profiting from the same price move that causes the loss. A 100% hedge ratio aims to fully neutralize IL.",
      },
    ],
  },
  "LP Fee Income": {
    title: "LP Fee Income",
    sections: [
      {
        heading: "What is it?",
        body: "Every time someone swaps tokens through the Uniswap pool, they pay a fee (e.g., 0.3% or 0.05%). As a liquidity provider, you earn a proportional share of these fees based on how much liquidity you've contributed within the active price range.",
      },
      {
        heading: "When do you earn more?",
        body: "Fee income is higher when: (1) trading volume is high, (2) your range is narrow (more concentrated = bigger share of fees), and (3) the price stays within your range. If the price goes out of range, you earn zero fees until it returns.",
      },
      {
        heading: "Key tradeoff",
        body: "Narrower ranges earn more fees per dollar deployed, but have higher IL risk and go out of range more easily. The Fee APR you set in the inputs approximates the annualized yield you'd earn if the price stayed in range all the time.",
      },
    ],
  },
  "Short Hedge P&L": {
    title: "Short Hedge P&L",
    sections: [
      {
        heading: "What is it?",
        body: "This is the profit or loss from your short perpetual futures position. When you short ETH perps, you profit when ETH's price drops and lose when it rises. This is designed to offset the Impermanent Loss from your LP position.",
      },
      {
        heading: "How the hedge works",
        body: "The LP position has positive delta (it gains value when ETH goes up, but less than a pure holder). The short hedge has negative delta. Combined, they create a 'delta-neutral' position where price movements in either direction are offset. The hedge size is calibrated to match the LP's delta exposure.",
      },
      {
        heading: "Why it might not perfectly offset IL",
        body: "LP delta changes as the price moves (it's not constant). The hedge is rebalanced periodically, but between rebalances there's a small mismatch. This 'gamma' effect means the hedge can slightly over- or under-compensate, especially during large price swings.",
      },
    ],
  },
  "Funding Income": {
    title: "Funding Income",
    sections: [
      {
        heading: "What is it?",
        body: "Perpetual futures use a 'funding rate' mechanism to keep their price anchored to the spot price. When funding is positive (most of the time in bull markets), shorts receive payments from longs. When negative (bear markets), shorts pay longs.",
      },
      {
        heading: "Why it matters",
        body: "Positive funding is a significant source of income for the delta-neutral strategy. It's essentially being paid to hold the hedge. In the 'Calm' and 'Normal' market presets, funding contributes meaningfully to total returns. In 'Bear Market' mode, negative funding eats into returns.",
      },
      {
        heading: "How it's calculated",
        body: "Daily funding = hedge size (in ETH) x ETH price x (annual funding rate / 365). The funding rate you see in the market preset reflects annualized rates. Actual rates on exchanges fluctuate — the sim uses a constant average.",
      },
    ],
  },
  "Rebalance Costs": {
    title: "Rebalance Costs",
    sections: [
      {
        heading: "What is it?",
        body: "As the ETH price moves, your LP's delta (price sensitivity) changes. The hedge needs to be adjusted to stay matched. Each adjustment incurs a trading cost — typically around 10 basis points (0.1%) of the trade size on the perpetual exchange.",
      },
      {
        heading: "When are costs higher?",
        body: "More volatile markets trigger more frequent rebalances. Narrow LP ranges cause delta to change faster, also increasing rebalance frequency. The simulation rebalances when the net delta mismatch exceeds 2% of the initial delta.",
      },
      {
        heading: "Impact on returns",
        body: "Rebalance costs are usually the smallest drag on returns. In calm markets with wide ranges, you might only rebalance a handful of times over 30 days. In volatile markets with narrow ranges, costs can add up but are typically dwarfed by fee income and funding.",
      },
    ],
  },
};

function PnlDetailModal({
  layerLabel,
  onClose,
}: {
  layerLabel: string;
  onClose: () => void;
}) {
  const detail = PNL_DETAILS[layerLabel];
  if (!detail) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full max-h-[80vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-slate-900 border-b border-slate-800 px-6 py-4 flex items-center justify-between rounded-t-2xl">
          <h3 className="text-base font-bold text-slate-100">{detail.title}</h3>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-300 transition-colors p-1"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-6 py-5 space-y-5">
          {detail.sections.map((sec, i) => (
            <div key={i}>
              <h4 className="text-sm font-semibold text-slate-300 mb-1.5">{sec.heading}</h4>
              <p className="text-sm text-slate-400 leading-relaxed">{sec.body}</p>
            </div>
          ))}
        </div>
        <div className="px-6 py-4 border-t border-slate-800">
          <button
            onClick={onClose}
            className="w-full px-4 py-2.5 rounded-lg text-sm font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Scenario Table Modal ────────────────────────────────────────────────────

type SortColumn = "scenario" | "endPrice" | "priceChange" | "fees" | "il" | "hedgePnl" | "funding" | "rebalanceCost" | "netReturn";
type SortDir = "asc" | "desc";

function ScenarioTableModal({
  result,
  investment,
  entryPrice,
  onClose,
}: {
  result: SimulationResult;
  investment: number;
  entryPrice: number;
  onClose: () => void;
}) {
  const [sortCol, setSortCol] = useState<SortColumn>("scenario");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const handleSort = (col: SortColumn) => {
    if (sortCol === col) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortCol(col);
      setSortDir(col === "scenario" ? "asc" : "desc");
    }
  };

  const rows = useMemo(() => {
    const data = result.paths.map((p, i) => {
      const endPrice = p.steps[p.steps.length - 1].price;
      return {
        scenario: i + 1,
        endPrice,
        priceChange: (endPrice - entryPrice) / entryPrice,
        fees: p.totalFees,
        il: p.totalIL,
        hedgePnl: p.totalHedgePnL,
        funding: p.totalFundingPnL,
        rebalanceCost: p.totalRebalanceCosts,
        netReturn: p.finalReturn,
      };
    });

    data.sort((a, b) => {
      const aVal = a[sortCol];
      const bVal = b[sortCol];
      return sortDir === "asc" ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });

    return data;
  }, [result, entryPrice, sortCol, sortDir]);

  const SortHeader = ({ col, label, className }: { col: SortColumn; label: string; className?: string }) => (
    <th
      className={`px-3 py-2.5 text-left text-[10px] font-semibold text-slate-400 uppercase tracking-wider cursor-pointer hover:text-slate-200 transition-colors select-none whitespace-nowrap ${className || ""}`}
      onClick={() => handleSort(col)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {sortCol === col && (
          <span className="text-blue-400">{sortDir === "asc" ? "\u25B2" : "\u25BC"}</span>
        )}
      </span>
    </th>
  );

  const fmtCell = (val: number, isDollar = true) => {
    const prefix = val >= 0 ? "+" : "-";
    const abs = Math.abs(val);
    return (
      <span className={val >= 0 ? "text-emerald-400" : "text-rose-400"}>
        {prefix}{isDollar ? "$" : ""}{isDollar ? abs.toLocaleString(undefined, { maximumFractionDigits: 0 }) : (abs * 100).toFixed(1) + "%"}
      </span>
    );
  };

  // Summary stats
  const profitable = rows.filter(r => r.netReturn > 0).length;
  const avgReturn = rows.reduce((s, r) => s + r.netReturn, 0) / rows.length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative bg-slate-900 border border-slate-700 rounded-2xl max-w-6xl w-full max-h-[85vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="shrink-0 border-b border-slate-800 px-6 py-4 flex items-center justify-between rounded-t-2xl">
          <div>
            <h3 className="text-base font-bold text-slate-100">All Simulated Scenarios</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {result.paths.length} Monte Carlo paths &middot; {profitable} profitable ({(profitable / result.paths.length * 100).toFixed(0)}%) &middot; Avg return: {avgReturn >= 0 ? "+" : ""}{(avgReturn * 100).toFixed(1)}%
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-300 transition-colors p-1"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Table */}
        <div className="overflow-auto flex-1">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-slate-900/95 backdrop-blur-sm border-b border-slate-800">
              <tr>
                <SortHeader col="scenario" label="#" className="w-12" />
                <SortHeader col="endPrice" label="End Price" />
                <SortHeader col="priceChange" label="Price Chg" />
                <SortHeader col="fees" label="Fees" />
                <SortHeader col="il" label="IL" />
                <SortHeader col="hedgePnl" label="Hedge P&L" />
                <SortHeader col="funding" label="Funding" />
                <SortHeader col="rebalanceCost" label="Rebal Cost" />
                <SortHeader col="netReturn" label="Net Return" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {rows.map((row) => (
                <tr
                  key={row.scenario}
                  className="hover:bg-slate-800/40 transition-colors"
                >
                  <td className="px-3 py-2 font-mono text-slate-500">{row.scenario}</td>
                  <td className="px-3 py-2 font-mono text-slate-300">
                    ${Math.round(row.endPrice).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 font-mono">{fmtCell(row.priceChange, false)}</td>
                  <td className="px-3 py-2 font-mono">{fmtCell(row.fees)}</td>
                  <td className="px-3 py-2 font-mono">{fmtCell(row.il)}</td>
                  <td className="px-3 py-2 font-mono">{fmtCell(row.hedgePnl)}</td>
                  <td className="px-3 py-2 font-mono">{fmtCell(row.funding)}</td>
                  <td className="px-3 py-2 font-mono">
                    <span className="text-rose-400">
                      -${Math.abs(row.rebalanceCost).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono font-semibold">
                    {fmtCell(row.netReturn * investment)}
                    <span className="text-slate-500 ml-1 font-normal">
                      ({row.netReturn >= 0 ? "+" : ""}{(row.netReturn * 100).toFixed(1)}%)
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="shrink-0 px-6 py-3 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-lg text-sm font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
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
  const [ethPrice, setEthPrice] = useState(2000);
  const [feeAPR, setFeeAPR] = useState(25); // percentage (user-facing)
  const [hedgeRatio, setHedgeRatio] = useState(100); // percentage (user-facing)
  const [rangePreset, setRangePreset] = useState<RangePreset>("medium");
  const [customLower, setCustomLower] = useState(1700);
  const [customUpper, setCustomUpper] = useState(2300);
  const [marketPreset, setMarketPreset] = useState<MarketPreset>("normal");
  const [durationPreset, setDurationPreset] = useState<DurationPreset>("1m");
  const [priceMode, setPriceMode] = useState<"simulated" | "fixed">("simulated");
  const [fixedEndPrice, setFixedEndPrice] = useState(ethPrice);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [pnlDetailLayer, setPnlDetailLayer] = useState<string | null>(null);
  const [showScenarioTable, setShowScenarioTable] = useState(false);

  // Derive full SimulationParams from inputs + presets
  const params = useMemo((): SimulationParams => {
    const market = MARKET_PRESETS[marketPreset];
    const duration = DURATION_PRESETS[durationPreset];

    let lowerPrice: number;
    let upperPrice: number;
    if (rangePreset === "custom") {
      lowerPrice = customLower;
      upperPrice = customUpper;
    } else {
      const range = RANGE_PRESETS[rangePreset];
      lowerPrice = ethPrice * (1 - range.factor);
      upperPrice = ethPrice * (1 + range.factor);
    }

    return {
      initialInvestment: investment,
      entryPrice: ethPrice,
      lowerPrice,
      upperPrice,
      volatility: market.volatility,
      feeAPR: feeAPR / 100, // convert from percentage
      fundingRate: market.fundingRate,
      hedgeRatio: hedgeRatio / 100, // convert from percentage
      durationDays: duration.days,
      numPaths: priceMode === "fixed" ? 1 : FIXED_PARAMS.numPaths,
      rebalanceThreshold: FIXED_PARAMS.rebalanceThreshold,
      ...(priceMode === "fixed" ? { targetEndPrice: fixedEndPrice } : {}),
    };
  }, [investment, ethPrice, feeAPR, hedgeRatio, rangePreset, customLower, customUpper, marketPreset, durationPreset, priceMode, fixedEndPrice]);

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

          {/* Row 2: Fee APR & Hedge Size */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <NumberInput
              label="Fee APR (Yield)"
              value={feeAPR}
              onChange={setFeeAPR}
              suffix="%"
              min={0}
              max={500}
              step={1}
              hint="Annual fee yield from the LP pool. Check your pool's current APR."
            />
            <NumberInput
              label="Short Hedge Size"
              value={hedgeRatio}
              onChange={setHedgeRatio}
              suffix="%"
              min={0}
              max={200}
              step={5}
              hint="100% = fully hedged. 50% = half the delta is hedged. 0% = no hedge."
            />
          </div>

          {/* Row 3: Range Width */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">
              Price Range Width
            </label>
            <div className="grid grid-cols-4 gap-2">
              {Object.entries(RANGE_PRESETS).map(([key, val]) => (
                <button
                  key={key}
                  onClick={() => setRangePreset(key as RangePresetKey)}
                  className={`px-3 py-2.5 rounded-lg text-sm border transition-all text-left ${
                    rangePreset === key
                      ? "bg-blue-600/20 border-blue-500 text-blue-300"
                      : "bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600"
                  }`}
                >
                  <p className="font-medium text-xs">{val.label}</p>
                  <p className="text-[10px] opacity-60 mt-0.5">{val.description}</p>
                </button>
              ))}
              <button
                onClick={() => setRangePreset("custom")}
                className={`px-3 py-2.5 rounded-lg text-sm border transition-all text-left ${
                  rangePreset === "custom"
                    ? "bg-blue-600/20 border-blue-500 text-blue-300"
                    : "bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600"
                }`}
              >
                <p className="font-medium text-xs">Custom</p>
                <p className="text-[10px] opacity-60 mt-0.5">Set your own min/max</p>
              </button>
            </div>
            {rangePreset === "custom" && (
              <div className="grid grid-cols-2 gap-3 mt-2">
                <NumberInput
                  label="Min Price"
                  value={customLower}
                  onChange={setCustomLower}
                  prefix="$"
                  min={1}
                  max={ethPrice - 1}
                  step={10}
                  hint={`${(((ethPrice - customLower) / ethPrice) * 100).toFixed(0)}% below entry`}
                />
                <NumberInput
                  label="Max Price"
                  value={customUpper}
                  onChange={setCustomUpper}
                  prefix="$"
                  min={ethPrice + 1}
                  step={10}
                  hint={`${(((customUpper - ethPrice) / ethPrice) * 100).toFixed(0)}% above entry`}
                />
              </div>
            )}
          </div>

          {/* Row 4: Market Conditions */}
          <div className="space-y-1.5">
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
            <p className="text-[10px] text-slate-500 leading-relaxed px-0.5">
              {MARKET_PRESETS[marketPreset].detail}
            </p>
          </div>

          {/* Row 5: Duration */}
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

          {/* Row 6: Price Scenario */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">
              Ending Price
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setPriceMode("simulated")}
                className={`px-3 py-2.5 rounded-lg text-sm border transition-all text-left ${
                  priceMode === "simulated"
                    ? "bg-blue-600/20 border-blue-500 text-blue-300"
                    : "bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600"
                }`}
              >
                <p className="font-medium text-xs">Simulated</p>
                <p className="text-[10px] opacity-60 mt-0.5">200 random price paths</p>
              </button>
              <button
                onClick={() => setPriceMode("fixed")}
                className={`px-3 py-2.5 rounded-lg text-sm border transition-all text-left ${
                  priceMode === "fixed"
                    ? "bg-blue-600/20 border-blue-500 text-blue-300"
                    : "bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600"
                }`}
              >
                <p className="font-medium text-xs">Fixed Price</p>
                <p className="text-[10px] opacity-60 mt-0.5">
                  &quot;What if ETH ends at $X?&quot;
                </p>
              </button>
            </div>
            {priceMode === "fixed" && (
              <div className="mt-2">
                <NumberInput
                  label="ETH Ending Price"
                  value={fixedEndPrice}
                  onChange={setFixedEndPrice}
                  prefix="$"
                  min={1}
                  step={10}
                  hint={(() => {
                    const change = ((fixedEndPrice - ethPrice) / ethPrice) * 100;
                    return `${change >= 0 ? "+" : ""}${change.toFixed(0)}% from entry ($${ethPrice.toLocaleString()})`;
                  })()}
                />
              </div>
            )}
            {priceMode === "simulated" && (
              <p className="text-[10px] text-slate-500 leading-relaxed px-0.5">
                Runs 200 random price scenarios to show expected outcomes and risk distribution.
              </p>
            )}
            {priceMode === "fixed" && (
              <p className="text-[10px] text-slate-500 leading-relaxed px-0.5">
                Shows exactly what happens to your position if ETH ends at this price — useful for stress-testing specific scenarios.
              </p>
            )}
          </div>

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
            {priceMode === "simulated" ? (
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
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <MetricCard
                  label="Net Return"
                  value={`${result.paths[0].finalReturn >= 0 ? "+" : ""}${fmtPct(result.paths[0].finalReturn)}`}
                  sub={`${result.paths[0].finalReturn >= 0 ? "+" : "-"}${fmtDollars(Math.abs(result.paths[0].finalReturn * investment))} on ${fmtDollars(investment)}`}
                  color={result.paths[0].finalReturn >= 0 ? "green" : "red"}
                />
                <MetricCard
                  label="Fee Income"
                  value={fmtDollars(result.paths[0].totalFees)}
                  sub={`${fmtPct(result.paths[0].totalFees / investment)} of capital`}
                  color="green"
                />
                <MetricCard
                  label="Hedge P&L"
                  value={`${result.paths[0].totalHedgePnL >= 0 ? "+" : "-"}${fmtDollars(Math.abs(result.paths[0].totalHedgePnL))}`}
                  sub="Short position gain/loss"
                  color={result.paths[0].totalHedgePnL >= 0 ? "green" : "red"}
                />
              </div>
            )}

            {/* Beginner explanation */}
            <div className="bg-slate-900/40 border border-slate-800/50 rounded-lg px-5 py-4">
              <p className="text-sm text-slate-300 leading-relaxed">
                {priceMode === "simulated"
                  ? getResultExplanation(result, investment)
                  : (() => {
                      const p = result.paths[0];
                      const endPrice = p.steps[p.steps.length - 1].price;
                      const changePct = ((endPrice - ethPrice) / ethPrice * 100).toFixed(1);
                      const dir = endPrice >= ethPrice ? "rises" : "drops";
                      return (
                        `If ETH ${dir} from $${ethPrice.toLocaleString()} to $${Math.round(endPrice).toLocaleString()} ` +
                        `(${endPrice >= ethPrice ? "+" : ""}${changePct}%) over ${DURATION_PRESETS[durationPreset].days} days, ` +
                        `your $${investment.toLocaleString()} position would ${p.finalReturn >= 0 ? "earn" : "lose"} ` +
                        `$${Math.abs(Math.round(p.finalReturn * investment)).toLocaleString()} ` +
                        `(${p.finalReturn >= 0 ? "+" : ""}${(p.finalReturn * 100).toFixed(1)}%). ` +
                        `Fee income of $${Math.round(p.totalFees).toLocaleString()} ` +
                        `${p.totalHedgePnL >= 0 ? "plus" : "minus"} $${Math.abs(Math.round(p.totalHedgePnL)).toLocaleString()} from the hedge.`
                      );
                    })()
                }
              </p>
            </div>

            {/* P&L Breakdown — median path */}
            {(() => {
              const medianPath = result.paths[result.medianPathIndex];
              const lastStep = medianPath.steps[medianPath.steps.length - 1];
              const endingPrice = lastStep.price;
              const priceChange = endingPrice - ethPrice;
              const priceChangePct = priceChange / ethPrice;
              const endedInRange = lastStep.inRange;

              // Use median path values so everything is consistent
              const mp = medianPath;
              const netReturn = mp.finalReturn * investment;
              const layers: {
                label: string;
                description: string;
                value: number;
                isSubtraction?: boolean;
              }[] = [
                {
                  label: "LP Value Change (IL)",
                  description: "Change in LP position value vs initial deposit",
                  value: mp.totalIL,
                },
                {
                  label: "LP Fee Income",
                  description: "Swap fees earned while price stayed in range",
                  value: mp.totalFees,
                },
                {
                  label: "Short Hedge P&L",
                  description: `P&L from the ${hedgeRatio}% short perp position`,
                  value: mp.totalHedgePnL,
                },
                {
                  label: "Funding Income",
                  description: "Payments received (or paid) on the perp position",
                  value: mp.totalFundingPnL,
                },
                {
                  label: "Rebalance Costs",
                  description: `Trading costs from ${mp.numRebalances} hedge adjustments`,
                  value: -mp.totalRebalanceCosts,
                  isSubtraction: true,
                },
              ];

              // LP range bounds from params
              const lpLower = params.lowerPrice;
              const lpUpper = params.upperPrice;

              return (
                <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5">
                  <div className="flex items-start justify-between mb-4">
                    <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">
                      P&L Breakdown {priceMode === "fixed" ? "(Fixed Price Scenario)" : "(Median Scenario)"}
                    </h3>
                  </div>

                  {/* Scenario price context */}
                  <div className="bg-slate-800/60 border border-slate-700/50 rounded-lg px-4 py-3 mb-4 space-y-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-4">
                        <div>
                          <p className="text-[10px] text-slate-500 uppercase">Entry Price</p>
                          <p className="text-sm font-mono font-semibold text-slate-200">
                            ${ethPrice.toLocaleString()}
                          </p>
                        </div>
                        <div className="text-slate-600 text-lg">&rarr;</div>
                        <div>
                          <p className="text-[10px] text-slate-500 uppercase">Ending Price</p>
                          <p className="text-sm font-mono font-semibold text-slate-200">
                            ${Math.round(endingPrice).toLocaleString()}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span
                          className={`text-sm font-mono font-semibold ${
                            priceChange >= 0 ? "text-emerald-400" : "text-rose-400"
                          }`}
                        >
                          {priceChange >= 0 ? "+" : "-"}$
                          {Math.abs(Math.round(priceChange)).toLocaleString()}
                        </span>
                        <span className="text-[10px] text-slate-500 ml-1.5">
                          ({priceChangePct >= 0 ? "+" : ""}
                          {(priceChangePct * 100).toFixed(1)}%)
                        </span>
                      </div>
                    </div>
                    {/* LP Range indicator */}
                    <div className="flex items-center gap-2 text-[10px]">
                      <span className="text-slate-500 uppercase">LP Range:</span>
                      <span className="font-mono text-slate-400">
                        ${Math.round(lpLower).toLocaleString()} – ${Math.round(lpUpper).toLocaleString()}
                      </span>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase ${
                          endedInRange
                            ? "bg-emerald-600/20 text-emerald-400"
                            : "bg-rose-600/20 text-rose-400"
                        }`}
                      >
                        {endedInRange ? "In Range" : "Out of Range"}
                      </span>
                    </div>
                  </div>
                  <div className="space-y-2.5">
                    {layers.map((layer) => {
                      const pct = layer.value / investment;
                      const isPositive = layer.value >= 0;
                      const maxAbsVal = Math.max(
                        ...layers.map((l) => Math.abs(l.value))
                      );
                      const barWidth =
                        maxAbsVal > 0
                          ? Math.min(
                              100,
                              (Math.abs(layer.value) / maxAbsVal) * 100
                            )
                          : 0;
                      const hasDetail = layer.label in PNL_DETAILS;

                      return (
                        <div
                          key={layer.label}
                          className={hasDetail ? "cursor-pointer rounded-lg px-2 py-1.5 -mx-2 hover:bg-slate-800/60 transition-colors group" : ""}
                          onClick={hasDetail ? () => setPnlDetailLayer(layer.label) : undefined}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-slate-300 inline-flex items-center gap-1.5">
                                {layer.label}
                                {hasDetail && (
                                  <svg className="w-3 h-3 text-slate-600 group-hover:text-blue-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                  </svg>
                                )}
                              </p>
                              <p className="text-[10px] text-slate-500 truncate">
                                {layer.description}
                              </p>
                            </div>
                            <div className="text-right ml-4 shrink-0">
                              <span
                                className={`text-sm font-mono font-semibold ${
                                  isPositive
                                    ? "text-emerald-400"
                                    : "text-rose-400"
                                }`}
                              >
                                {isPositive ? "+" : "-"}$
                                {Math.abs(layer.value).toLocaleString(
                                  undefined,
                                  { maximumFractionDigits: 0 }
                                )}
                              </span>
                              <span className="text-[10px] text-slate-500 ml-1.5">
                                {isPositive ? "+" : ""}
                                {(pct * 100).toFixed(1)}%
                              </span>
                            </div>
                          </div>
                          {/* Visual bar */}
                          <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                isPositive ? "bg-emerald-500/60" : "bg-rose-500/60"
                              }`}
                              style={{ width: `${barWidth}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {/* Net total divider */}
                  <div className="border-t border-slate-700 mt-4 pt-3 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold text-slate-300 uppercase tracking-wide">
                        Net Return
                      </p>
                      <p className="text-[10px] text-slate-500 mt-0.5">
                        {(() => {
                          const days = params.durationDays;
                          const apr = (mp.finalReturn / days) * 365;
                          return `${apr >= 0 ? "+" : ""}${(apr * 100).toFixed(1)}% APR (annualized)`;
                        })()}
                      </p>
                    </div>
                    <div className="text-right">
                      <span
                        className={`text-base font-mono font-bold ${
                          netReturn >= 0 ? "text-emerald-400" : "text-rose-400"
                        }`}
                      >
                        {netReturn >= 0 ? "+" : "-"}$
                        {Math.abs(netReturn).toLocaleString(undefined, {
                          maximumFractionDigits: 0,
                        })}
                      </span>
                      <span className="text-xs text-slate-500 ml-2">
                        {mp.finalReturn >= 0 ? "+" : ""}
                        {(mp.finalReturn * 100).toFixed(1)}%
                      </span>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Charts */}
            <div className={`grid gap-5 ${priceMode === "fixed" ? "grid-cols-1" : "grid-cols-1 lg:grid-cols-2"}`}>
              {/* Chart 1: Strategy Returns Over Time */}
              <ChartCard title={priceMode === "fixed" ? "Strategy Returns Over Time" : "Strategy Returns Over Time (Median Path)"}>
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

              {/* Chart 2: Return Distribution (only in simulated mode) */}
              {priceMode === "simulated" && (
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
              )}
            </div>

            {/* View All Scenarios (simulated mode only) */}
            {priceMode === "simulated" && (
              <button
                onClick={() => setShowScenarioTable(true)}
                className="w-full px-4 py-3 rounded-lg text-sm font-medium transition-all
                  bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-600 text-slate-300
                  flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                View All {result.paths.length} Scenarios
              </button>
            )}

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

            {/* P&L Detail Modal */}
            {pnlDetailLayer && (
              <PnlDetailModal
                layerLabel={pnlDetailLayer}
                onClose={() => setPnlDetailLayer(null)}
              />
            )}

            {/* Scenario Table Modal */}
            {showScenarioTable && (
              <ScenarioTableModal
                result={result}
                investment={investment}
                entryPrice={ethPrice}
                onClose={() => setShowScenarioTable(false)}
              />
            )}
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
