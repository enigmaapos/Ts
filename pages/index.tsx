import { useEffect, useMemo, useState } from "react";
import PriceChangePercent from "../components/PriceChangePercent";
import { didDropFromPeak, didRecoverFromLow, getRecentRSIDiff, getSignal } from "../utils/calculations";
import { SignalData, TIMEFRAMES, useCryptoSignals } from "../hooks/useCryptoSignals";

export default function Home() {
  const [search, setSearch] = useState("");
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [showOnlyFavorites, setShowOnlyFavorites] = useState(false);
  const [sortField, setSortField] = useState<string>("symbol");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [trendFilter, setTrendFilter] = useState<string | null>(null);
  const [signalFilter, setSignalFilter] = useState<string | null>(null);
  const [timeframe, setTimeframe] = useState<"15m" | "4h" | "1d">("15m");

  const { signals, loading, lastUpdatedMap, scanStatus, scannedCount, totalSymbols } = useCryptoSignals(timeframe);

  useEffect(() => {
    const stored = localStorage.getItem("favorites");
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) setFavorites(new Set(parsed));
    } catch (err) {
      console.error("Failed to parse favorites", err);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("favorites", JSON.stringify(Array.from(favorites)));
  }, [favorites]);

  const toggleFavorite = (symbol: string) => {
    setFavorites(prev => {
      const next = new Set(prev);
      next.has(symbol) ? next.delete(symbol) : next.add(symbol);
      return next;
    });
  };

  const searchTerm = search.trim().toLowerCase();
  const filteredSignals = useMemo(() => signals.filter(s => {
    const matchesSearch = !searchTerm || s.symbol.toLowerCase().includes(searchTerm);
    return matchesSearch && (!showOnlyFavorites || favorites.has(s.symbol));
  }), [signals, searchTerm, showOnlyFavorites, favorites]);

  const trendKeyToMainTrendValue: Record<string, "bullish" | "bearish"> = {
    bullishMainTrend: "bullish",
    bearishMainTrend: "bearish",
  };
  const trendKeyToBooleanField: Record<string, keyof SignalData> = {
    bullishBreakout: "bullishBreakout",
    bearishBreakout: "bearishBreakout",
    breakoutFailure: "breakoutFailure",
    testedPrevHigh: "testedPrevHigh",
    testedPrevLow: "testedPrevLow",
    bullishReversal: "bullishReversal",
    bearishReversal: "bearishReversal",
    bullishSpike: "bullishSpike",
    bearishCollapse: "bearishCollapse",
    ema14InsideResults: "ema14InsideResults",
    divergenceFromLevel: "divergenceFromLevel",
  };

  const filteredAndSortedSignals = useMemo(() => {
    const filtered = filteredSignals.filter(s => {
      if (trendFilter && trendKeyToMainTrendValue[trendFilter] && s.mainTrend?.trend !== trendKeyToMainTrendValue[trendFilter]) return false;
      if (trendFilter && trendKeyToBooleanField[trendFilter]) {
        const value: any = s[trendKeyToBooleanField[trendFilter]];
        const active = trendFilter === "ema14InsideResults" ? value?.some((r: any) => r.inside) : trendFilter === "bullishReversal" || trendFilter === "bearishReversal" || trendFilter === "bullishSpike" || trendFilter === "bearishCollapse" ? value?.signal === true : value === true;
        if (!active) return false;
      }
      if (signalFilter && getSignal(s) !== signalFilter) return false;
      return true;
    });

    const valueFor = (s: SignalData): any => {
      if (sortField === "touchedEMA200Today" || sortField === "ema70Bounce" || sortField === "ema200Bounce" || sortField === "divergenceFromLevel" || sortField === "isVolumeSpike") return s[sortField as keyof SignalData] ? 1 : 0;
      if (sortField === "ema14InsideResults") return s.ema14InsideResults?.some(r => r.inside) ? 1 : 0;
      if (sortField === "bearishDivergence" || sortField === "bullishDivergence") return (s[sortField] as any)?.divergence ? 1 : 0;
      if (sortField === "pumpStrength" || sortField === "dumpStrength") {
        const pd = getRecentRSIDiff(s.rsi14, 14);
        return sortField === "pumpStrength" ? pd?.pumpStrength ?? -Infinity : pd?.dumpStrength ?? -Infinity;
      }
      if (sortField === "priceChangePercent") return Number(s.priceChangePercent);
      if (sortField === "latestRSI") return Number.isFinite(s.latestRSI as number) ? s.latestRSI : -Infinity;
      if (sortField === "prevClose") return s.prevClosedGreen ? 1 : s.prevClosedRed ? -1 : 0;
      return s[sortField as keyof SignalData];
    };

    return [...filtered].sort((a, b) => {
      const av = valueFor(a), bv = valueFor(b);
      if (av == null && bv == null) return a.symbol.localeCompare(b.symbol);
      if (av == null) return 1;
      if (bv == null) return -1;
      let cmp: number;
      if (typeof av === "string" && typeof bv === "string") cmp = av.localeCompare(bv);
      else cmp = Number(av) - Number(bv);
      if (!Number.isFinite(cmp)) cmp = String(av).localeCompare(String(bv));
      if (cmp === 0) cmp = a.symbol.localeCompare(b.symbol);
      return sortOrder === "asc" ? cmp : -cmp;
    });
  }, [filteredSignals, trendFilter, signalFilter, sortField, sortOrder]);

  const bullishMainTrendCount = filteredSignals.filter(s => s.mainTrend?.trend === "bullish").length;
  const bearishMainTrendCount = filteredSignals.filter(s => s.mainTrend?.trend === "bearish").length;
  const bullishBreakoutCount = filteredSignals.filter(s => s.bullishBreakout).length;
  const bearishBreakoutCount = filteredSignals.filter(s => s.bearishBreakout).length;
  const breakoutFailureCount = filteredSignals.filter(s => s.breakoutFailure).length;
  const testedPrevHighCount = filteredSignals.filter(s => s.testedPrevHigh).length;
  const testedPrevLowCount = filteredSignals.filter(s => s.testedPrevLow).length;
  const bullishReversalCount = filteredSignals.filter(s => s.bullishReversal?.signal).length;
  const bearishReversalCount = filteredSignals.filter(s => s.bearishReversal?.signal).length;
  const bullishSpikeCount = filteredSignals.filter(s => s.bullishSpike?.signal).length;
  const bearishCollapseCount = filteredSignals.filter(s => s.bearishCollapse?.signal).length;
  const ema14InsideResultsCount = filteredSignals.filter(s => s.ema14InsideResults?.some(r => r.inside)).length;
  const greenPriceChangeCount = filteredSignals.filter(s => s.priceChangePercent > 0).length;
  const redPriceChangeCount = filteredSignals.filter(s => s.priceChangePercent < 0).length;
  const greenVolumeCount = filteredSignals.filter(s => s.highestVolumeColorPrev === "green").length;
  const redVolumeCount = filteredSignals.filter(s => s.highestVolumeColorPrev === "red").length;
  const divergenceFromLevelCount = filteredSignals.filter(s => s.divergenceFromLevel).length;

  const signalCounts = useMemo(() => {
    const counts = { maxZonePump: 0, maxZoneDump: 0, balanceZonePump: 0, balanceZoneDump: 0, lowestZonePump: 0, lowestZoneDump: 0 };
    filteredSignals.forEach(s => {
      switch (getSignal(s).toUpperCase()) {
        case "MAX ZONE PUMP": counts.maxZonePump++; break;
        case "MAX ZONE DUMP": counts.maxZoneDump++; break;
        case "BALANCE ZONE PUMP": counts.balanceZonePump++; break;
        case "BALANCE ZONE DUMP": counts.balanceZoneDump++; break;
        case "LOWEST ZONE PUMP": counts.lowestZonePump++; break;
        case "LOWEST ZONE DUMP": counts.lowestZoneDump++; break;
      }
    });
    return counts;
  }, [filteredSignals]);

  const handleTimeframeSwitch = (tf: string) => {
    if (tf !== "15m" && tf !== "4h" && tf !== "1d") return;
    setTimeframe(tf);
    setSearch("");
    setTrendFilter(null);
    setSignalFilter(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const scanProgress = totalSymbols ? `${scannedCount}/${totalSymbols}` : "0/0";

  if (loading && !signals.length) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-gray-900 text-white">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-yellow-400 border-opacity-50 mx-auto mb-4"></div>
          <p className="text-lg">Loading data...</p>
          <p className="text-xs text-gray-400 mt-2">{scanStatus}</p>
        </div>
      </div>
    );
  }

    return (
	    
  <div className="min-h-screen bg-gray-900 text-white p-4 overflow-auto">
    <h2 className="text-2xl font-bold text-yellow-400 mb-4 tracking-wide">
  ⏱ Current Timeframe: <span className="text-white">{timeframe.toUpperCase()}</span>
</h2>

    <div className="flex space-x-4 my-4">
    {TIMEFRAMES.map((tf) => (
       <button
            key={tf}
            onClick={() => handleTimeframeSwitch(tf)}
            className={`px-4 py-2 rounded-lg font-semibold transition-all duration-200 shadow-md 
              ${timeframe === tf
                ? 'bg-yellow-400 text-black scale-105'
                : 'bg-gray-800 text-white hover:bg-gray-700'}`}
          >
            {tf.toUpperCase()}
          </button>
  ))}
</div>

<div className="mb-4 rounded-lg border border-gray-700 bg-gray-800/70 px-3 py-2 text-xs text-gray-300 flex flex-wrap items-center gap-x-4 gap-y-1">
  <span className="text-green-300 font-semibold">● SCANNER ACTIVE</span>
  <span>{scanStatus}</span>
  <span>Progress: {scanProgress}</span>
  <span>Signals: {signals.length}</span>
</div>

<div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4 mb-4">
  {/* 🟢 Filter Controls Section */}
  <div className="flex flex-col gap-4 text-sm">

    {/* 🔷 Trend Filters Section */}
<div>
  <p className="text-gray-400 mb-2 font-semibold">
    📊 Trend Filters — Tap to filter data based on trend-related patterns (e.g. breakouts, reversals):
  </p>
  <div className="flex flex-wrap gap-2">
    {[
      {
        label: 'Bullish Trend',
        key: 'bullishMainTrend',
        count: bullishMainTrendCount,
        color: 'text-green-300',
      },
      {
        label: 'Bearish Trend',
        key: 'bearishMainTrend',
        count: bearishMainTrendCount,
        color: 'text-red-300',
      },
      {
        label: 'Bullish Reversal',
        key: 'bullishReversal',
        count: bullishReversalCount,
        color: 'text-green-300',
      },
      {
        label: 'Bearish Reversal',
        key: 'bearishReversal',
        count: bearishReversalCount,
        color: 'text-red-300',
      },
      {
        label: 'Bullish Spike',
        key: 'bullishSpike',
        count: bullishSpikeCount,
        color: 'text-green-300',
      },
      {
        label: 'Bearish Collapse',
        key: 'bearishCollapse',
        count: bearishCollapseCount,
        color: 'text-red-300',
      },
      {
        label: 'Breakout Failure',
        key: 'breakoutFailure',
        count: breakoutFailureCount,
        color: 'text-yellow-300',
      },
      {
        label: 'Bullish Breakout',
        key: 'bullishBreakout',
        count: bullishBreakoutCount,
        color: 'text-yellow-400',
      },
      {
        label: 'Bearish Breakout',
        key: 'bearishBreakout',
        count: bearishBreakoutCount,
        color: 'text-yellow-400',
      },
      {
        label: 'Tested Prev High',
        key: 'testedPrevHigh',
        count: testedPrevHighCount,
        color: 'text-blue-300',
      },
      {
        label: 'Tested Prev Low',
        key: 'testedPrevLow',
        count: testedPrevLowCount,
        color: 'text-blue-300',
      },
	{
        label: 'Div from lev',
        key: 'divergenceFromLevel',
        count: divergenceFromLevelCount,
        color: 'text-blue-300',
      },
    ].map(({ label, key, count, color }) => (
      <button
        key={key}
        onClick={() => setTrendFilter(trendFilter === key ? null : key)}
        className={`px-3 py-1 rounded-full flex items-center gap-1 ${
          trendFilter === key ? 'bg-yellow-500 text-black' : 'bg-gray-700 text-white'
        }`}
      >
        <span>{label}</span>
        <span className={`text-xs font-bold ${color}`}>{count}</span>
      </button>
    ))}
  </div>
</div>

    {/* ✅ Signal Filters Section */}
    <div>
      <p className="text-gray-400 mb-2 font-semibold">📈 Signal Filters — Tap to show signals based on technical zones or momentum shifts:</p>
      <div className="flex flex-wrap gap-2">
        {[
  {
    label: 'MAX ZONE PUMP',
    key: 'MAX ZONE PUMP',
    count: signalCounts.maxZonePump,
    color: 'text-yellow-300',
  },
  {
    label: 'MAX ZONE DUMP',
    key: 'MAX ZONE DUMP',
    count: signalCounts.maxZoneDump,
    color: 'text-yellow-400',
  },
  {
    label: 'BALANCE ZONE PUMP',
    key: 'BALANCE ZONE PUMP',
    count: signalCounts.balanceZonePump,
    color: 'text-purple-300',
  },
  {
    label: 'BALANCE ZONE DUMP',
    key: 'BALANCE ZONE DUMP',
    count: signalCounts.balanceZoneDump,
    color: 'text-purple-400',
  },
  {
    label: 'LOWEST ZONE PUMP',
    key: 'LOWEST ZONE PUMP',
    count: signalCounts.lowestZonePump,
    color: 'text-yellow-500',
  },
  {
    label: 'LOWEST ZONE DUMP',
    key: 'LOWEST ZONE DUMP',
    count: signalCounts.lowestZoneDump,
    color: 'text-yellow-600',
  },
	
        ].map(({ label, key, count, color }) => (
          <button
            key={key}
            onClick={() => setSignalFilter(signalFilter === key ? null : key)}
            className={`px-3 py-1 rounded-full flex items-center gap-1 ${
              signalFilter === key
                ? 'bg-green-500 text-black'
                : 'bg-gray-700 text-white'
            }`}
          >
            <span>{label}</span>
            <span className={`text-xs font-bold ${color}`}>{count}</span>
          </button>
        ))}
      </div>
    </div>

    {/* 🔴 Clear Button */}
    <div>
      <button
        onClick={() => {
          setSearch('');
          setTrendFilter(null);
          setSignalFilter(null);
          setShowOnlyFavorites(false);
        }}
        className="px-4 py-1.5 rounded-full bg-red-500 text-white hover:bg-red-600"
      >
        Clear All Filters
      </button>
    </div>
  </div>

{/* 📊 Summary Panel */}
<div className="sticky top-0 z-30 bg-gray-900 border border-gray-700 rounded-xl p-4 text-white text-sm shadow-md">
  <div className="flex flex-col gap-3">

    {/* 📈 Trend Counts */}
	<div className="border border-gray-700 rounded-lg p-3 bg-gray-900 shadow-sm">  
    <div className="flex items-center gap-2">
      <span>📈 Bull Trend:</span>
      <span className="text-green-400 font-bold">{bullishMainTrendCount}</span>
    </div>
    <div className="flex items-center gap-2">
      <span>📉 Bear Trend:</span>
      <span className="text-red-400 font-bold">{bearishMainTrendCount}</span>
    </div>
	</div>	

	{/* 📍 EMA14 Inside Range */}
	<div className="border border-gray-700 rounded-lg p-3 bg-gray-900 shadow-sm">  
    <div className="flex items-center gap-1">
      <span className="flex flex-col leading-tight">
        <span className="text-sm">📍 EMA14 Inside</span>
        <span className="text-sm">EMA70–200:</span>
      </span>
      <span className="text-yellow-400 font-bold text-lg">{ema14InsideResultsCount}</span>
    </div>
</div>
		
    {/* 🔹 24h Price Change Summary */}
    <div className="border border-gray-700 rounded-lg p-3 bg-gray-900 shadow-sm">
      <div className="text-white text-sm mb-2 font-semibold">🔹 24h Price Change Summary</div>
      <div className="flex items-center gap-4 text-sm">
        <span className="text-green-500 font-semibold">📈 Green: {greenPriceChangeCount}</span>
        <span className="text-red-500 font-semibold">📉 Red: {redPriceChangeCount}</span>     
      </div>
	</div>    

{/* 🔸 Volume Color Summary */}
<div className="border border-gray-700 rounded-lg p-3 bg-gray-900 shadow-sm">
  <div className="text-white text-sm mb-2 font-semibold">🔸 Volume Color Summary</div>
  <div className="flex items-center gap-4 text-sm">
    <span className="text-green-400 font-semibold">🟢 Green Volume: {greenVolumeCount}</span>
    <span className="text-red-400 font-semibold">🔴 Red Volume: {redVolumeCount}</span>
  </div>
</div>
	  
{/* 📝 Strategy Note */}
<div className="border border-gray-700 rounded-lg p-4 bg-gray-900 shadow-sm">
  <div className="text-yellow-300 font-bold mb-2">⚠️ Strategy Note:</div>
  <ul className="list-disc list-inside text-yellow-200 space-y-2">
    
    <li>
  <span className="text-white">If the current day has a Max Zone Pump,</span> it often leads to a 
  <span className="text-red-400 font-semibold"> Bearish candle</span> the next day. 
  <span className="text-white"> This Bearish candle forms when volume is </span>
  <span className="text-yellow-400 font-semibold">divergent</span>
  <span className="text-white"> and tends to continue if the </span>
  <span className="text-green-400 font-semibold">volume keeps increasing.</span>
</li>

	<li>
  <span className="text-yellow-400 font-semibold">15-minute timeframe:</span>
  <span className="text-white"> If there’s a </span>
  <span className="text-red-400 font-semibold">Lowest Zone Dump</span>
  <span className="text-white"> combined with a </span>
  <span className="text-green-400 font-semibold">high 24-hour price change,</span>
  <span className="text-white"> it often indicates a </span>
  <span className="text-green-400 font-semibold">slow but strong bullish trend.</span>
</li>

<li>
  <span className="text-yellow-400 font-semibold">15-minute timeframe with 1-minute confirmation:</span>
  <span className="text-white"> If a </span>
  <span className="text-green-400 font-semibold">Max Zone Pump</span>
  <span className="text-white"> forms on the 15-minute chart and the </span>
  <span className="text-blue-400 font-semibold">1-minute timeframe</span>
  <span className="text-white"> touches the </span>
  <span className="text-purple-400 font-semibold">EMA70</span>
  <span className="text-white"> for the first time, that’s an early </span>
  <span className="text-red-400 font-semibold">signal for a potential drop.</span>
  <span className="text-white"> You can either sell near the top, or wait for a </span>
  <span className="text-purple-400 font-semibold">second touch of EMA70</span>
  <span className="text-white"> — this area often becomes the </span>
  <span className="text-red-400 font-semibold">optimal selling zone</span>
  <span className="text-white"> with a target around the </span>
  <span className="text-purple-400 font-semibold">EMA200 in 1m time frame.</span>
  <span className="text-white"> If the 15-minute candle continues dropping afterward, the </span>
  <span className="text-purple-400 font-semibold">next target</span>
  <span className="text-white"> is usually the </span>
  <span className="text-purple-400 font-semibold">EMA200</span>
  <span className="text-white"> in the same 15-minute timeframe.</span>
</li>

<li>
  <span className="text-white">If a </span>
  <span className="text-yellow-400 font-semibold">breakout fails today,</span>
  <span className="text-white"> watch for a new breakout attempt the next day. It’s possible the </span>
  <span className="text-green-400 font-semibold">trend continues</span>
  <span className="text-white"> if the breakout succeeds, but if it </span>
  <span className="text-red-400 font-semibold">fails again,</span>
  <span className="text-white"> it often forms a </span>
  <span className="text-purple-400 font-semibold">reversal candle.</span>
  <span className="text-white"> For example, a </span>
  <span className="text-green-400 font-semibold">green breakout failure</span>
  <span className="text-white"> today may continue upward if resistance breaks tomorrow, but a </span>
  <span className="text-red-400 font-semibold">red breakout failure</span>
  <span className="text-white"> followed by another failure at support the next day often signals a </span>
  <span className="text-purple-400 font-semibold">trend reversal.</span>
</li>
  </ul>
</div>
 </div>
  </div>
</div>

	
<div className="flex flex-wrap gap-4 mb-4 items-center">
  {/* 🔸 Favorites Toggle */}
  <label className="flex items-center gap-2 text-sm text-white">
    <input
      type="checkbox"
      checked={showOnlyFavorites}
      onChange={() => setShowOnlyFavorites(prev => !prev)}
      className="accent-yellow-400"
    />
    Show only favorites
  </label>

  {/* 🔸 Search Input */}
  <div className="relative">
    <input
      type="text"
      placeholder="Search symbol..."
      value={search}
      onChange={(e) => setSearch(e.target.value)}
      className="p-2 pr-20 rounded bg-gray-800 text-white border border-gray-600 focus:outline-none focus:ring-2 focus:ring-yellow-400"
    />
    
    {/* 🔸 Clear Button (only shows if there's input) */}
    {search && (
      <button
        onClick={() => setSearch('')}
        className="absolute right-1 top-1/2 -translate-y-1/2 text-xs px-2 py-1 bg-red-500 hover:bg-red-600 rounded text-white"
      >
        Clear
      </button>
    )}
  </div>
</div>	
	  

<div className="overflow-auto max-h-[80vh] border border-gray-700 rounded">
  <table className="w-full text-[11px] border-collapse">
    <thead className="bg-gray-800 text-yellow-300 sticky top-0 z-20">
  <tr>
    {/* Symbol */}
    <th
      onClick={() => {
        setSortField('symbol');
        setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      }}
      className="px-1 py-0.5 bg-gray-800 sticky left-0 z-30 text-left align-middle cursor-pointer"
    >
      Symbol {sortField === 'symbol' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
    </th>

	    <th className="px-2 py-1 border border-gray-700 text-right">Current Price</th>
	   <th
  onClick={() => {
    setSortField('priceChangePercent');
    setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
  }}
  className="px-1 py-0.5 bg-gray-800 text-center cursor-pointer"
>
  24h Change (%) {sortField === 'priceChangePercent' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
</th>

{/* RSI Pump | Dump */}
    <th
      onClick={() => {
        setSortField('pumpStrength');
        setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      }}
      className="px-1 py-0.5 bg-gray-800 text-center cursor-pointer"
    >
      RSI Pump | Dump {sortField === 'pumpStrength' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
    </th>
	    <th
  onClick={() => {
    setSortField('latestRSI');
    setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
  }}
  className="px-2 py-1 bg-gray-800 border border-gray-700 text-center cursor-pointer"
>
  RSI14 {sortField === 'latestRSI' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
</th>	  
	  
<th className="px-1 py-0.5 bg-gray-800 text-center">
  Drop 🚨
</th>
<th className="px-1 py-0.5 bg-gray-800 text-center">
  Recovery 🟢
</th>	  

    {/* Static Columns */}
    <th className="px-1 py-0.5 text-center">Bull BO</th>
    <th className="px-1 py-0.5 text-center">Bear BO</th>
	<th
  onClick={() => {
    setSortField('prevClose');
    setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
  }}
  className="px-1 py-0.5 bg-gray-800 text-center cursor-pointer"
>
  Prev Close {sortField === 'prevClose' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
</th>
	  
      <th className="px-1 py-0.5 text-center">Trend (200)</th>
	  
<th className="px-1 py-0.5 text-center">Collapse</th>
    <th className="px-1 py-0.5 text-center">Spike</th>
<th className="px-1 py-0.5 text-center">Bear Rev</th>
    <th className="px-1 py-0.5 text-center">Bull Rev</th>	

<th
  onClick={() => {
    setSortField('divergenceFromLevel');
    setSortOrder((prev) =>
      sortField === 'divergenceFromLevel' && prev === 'asc' ? 'desc' : 'asc'
    );
  }}
  className="px-2 py-1 bg-gray-800 border border-gray-700 text-center cursor-pointer"
>
  Div From Lev {sortField === 'divergenceFromLevel' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
</th> 
	  
	<th className="px-1 py-0.5 min-w-[60px] text-center">Signal</th>    	    

{/* Bearish Divergence */}
    <th
      onClick={() => {
        setSortField('bearishDivergence');
        setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      }}
      className="px-1 py-0.5 bg-gray-800 text-center cursor-pointer"
    >
      Bearish Divergence {sortField === 'bearishDivergence' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
    </th>

    {/* Bullish Divergence */}
    <th
      onClick={() => {
        setSortField('bullishDivergence');
        setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      }}
      className="px-1 py-0.5 bg-gray-800 text-center cursor-pointer"
    >
      Bullish Divergence {sortField === 'bullishDivergence' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
    </th>

{/* Volume */}
    <th className="p-2 text-center">Volume</th>
	<th className="px-1 py-0.5 bg-gray-800 text-center">
  Volume Divergence
</th> 
	 <th
  onClick={() => {
    setSortField('isVolumeSpike');
    setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
  }}
  className="px-1 py-0.5 bg-gray-800 text-center cursor-pointer"
>
  Volume Spike {sortField === 'isVolumeSpike' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
</th>	  
	  
<th
  onClick={() => {
    setSortField('ema14InsideResults');
    setSortOrder((prev) =>
      sortField === 'ema14InsideResults' && prev === 'asc' ? 'desc' : 'asc'
    );
  }}
  className="px-2 py-1 bg-gray-800 border border-gray-700 text-center cursor-pointer"
>
  EMA14 Inside<br />EMA70–200 {sortField === 'ema14InsideResults' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
</th> 

	  
 <th className="px-4 py-2 border border-gray-700">Ema14&70 Gap %</th>	  
<th className="px-4 py-2 border border-gray-700">Ema70&200 Gap %</th>
	  
<th className="px-1 py-0.5 text-center">Low→EMA200 (%)</th>
<th className="px-1 py-0.5 text-center">High→EMA200 (%)</th>	  
	  	  
<th
  onClick={() => {
    setSortField('ema200Bounce');
    setSortOrder((prev) =>
      sortField === 'ema200Bounce' && prev === 'asc' ? 'desc' : 'asc'
    );
  }}
  className="px-2 py-1 bg-gray-800 border border-gray-700 text-center cursor-pointer"
>
  EMA200 Bounce {sortField === 'ema200Bounce' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
</th> 
	  
{/* Touched EMA200 Today */}
    <th
      onClick={() => {
        setSortField('touchedEMA200Today');
        setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      }}
      className="px-1 py-0.5 bg-gray-800 text-center cursor-pointer"
    >
      Touched EMA200 Today {sortField === 'touchedEMA200Today' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
    </th>	  
	  
   {/* More Static Columns */}
    <th className="p-2 text-center">EMA14 Bounce</th>
    <th
      onClick={() => {
        setSortField('ema70Bounce');
        setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      }}
      className="px-1 py-0.5 bg-gray-800 text-center cursor-pointer"
    >
      EMA70 Bounce {sortField === 'ema70Bounce' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
    </th>
	  
<th className="p-2 text-green-400">Bullish Engulfing</th>
<th className="p-2 text-red-400">Bearish Engulfing</th>	  

	  	  
    <th className="px-1 py-0.5 text-center">Tested High</th>
    <th className="px-1 py-0.5 text-center">Tested Low</th>
    <th className="px-1 py-0.5 text-center">Breakout Fail</th>
    <th className="px-1 py-0.5 text-center">Top Pattern</th>
    <th className="px-1 py-0.5 text-center">Bottom Pattern</th>
 
  </tr>
</thead>
    
    <tbody>
      {filteredAndSortedSignals.map((s) => {
  const updatedRecently = Date.now() - (lastUpdatedMap[s.symbol] || 0) < 5000;
  const pumpDump = s.rsi14 ? getRecentRSIDiff(s.rsi14, 14) : null;
const pump = pumpDump?.pumpStrength;
const dump = pumpDump?.dumpStrength;
const direction = pumpDump?.direction;
	
const inRange = (val: number | undefined, min: number, max: number) =>
  val !== undefined && val >= min && val <= max;

const isAbove30 = (val: number | undefined) => val !== undefined && val >= 30;
const validPump = pump !== undefined && pump !== 0;
const validDump = dump !== undefined && dump !== 0;

// ✅ Early return: skip rendering if both are invalid or 0
if (!validPump && !validDump) return null;

const pumpInRange_21_26 = inRange(pump, 21, 26);
const dumpInRange_21_26 = inRange(dump, 21, 26);
const pumpAbove30 = isAbove30(pump);
const dumpAbove30 = isAbove30(dump);

const pumpInRange_1_10 = inRange(pump, 1, 10);
const dumpInRange_1_10 = inRange(dump, 1, 10);

const pumpInRange_17_19 = inRange(pump, 17, 19);
const dumpInRange_17_19 = inRange(dump, 17, 19);

let signal = '';

// ✅ MAX ZONE
if (direction === 'pump' && pumpAbove30) {
  signal = 'MAX ZONE PUMP';
} else if (direction === 'dump' && dumpAbove30) {
  signal = 'MAX ZONE DUMP';
}

// ✅ BALANCE ZONE
else if (direction === 'pump' && pumpInRange_21_26) {
  signal = 'BALANCE ZONE PUMP';
} else if (direction === 'dump' && dumpInRange_21_26) {
  signal = 'BALANCE ZONE DUMP';
}

// ✅ LOWEST ZONE
else if (direction === 'pump' && pumpInRange_1_10) {
  signal = 'LOWEST ZONE PUMP';
} else if (direction === 'dump' && dumpInRange_1_10) {
  signal = 'LOWEST ZONE DUMP';
}

	

        return (
           <tr
  key={s.symbol}
  className={`border-b border-gray-700 transition-all duration-300 hover:bg-blue-800/20 ${
    updatedRecently ? 'bg-yellow-900/30' : ''
  }`}
>
  {/* Symbol + Favorite */}
  <td className="px-1 py-0.5 bg-gray-900 sticky left-0 z-10 text-left truncate max-w-[90px]">
    <div className="flex items-center justify-between">
      <span className="truncate">{s.symbol}</span>
      <button
        className="ml-1 text-yellow-400 hover:text-yellow-300"
        onClick={() => {
          setFavorites((prev: Set<string>) => {
            const newSet = new Set(prev);
            newSet.has(s.symbol) ? newSet.delete(s.symbol) : newSet.add(s.symbol);
            return newSet;
          });
        }}
      >
        {favorites.has(s.symbol) ? '★' : '☆'}
      </button>
    </div>
  </td>

  <td className="px-2 py-1 border-b border-gray-700 text-right">
  ${Number(s.currentPrice).toFixed(7)}
</td>
              <td className="px-2 py-1 border-b border-gray-700 text-center">
                <PriceChangePercent percent={s.priceChangePercent} />
              </td>

			   <td
  className={`px-1 py-0.5 min-w-[40px] text-center font-semibold ${
    signal.trim() === 'MAX ZONE PUMP'
      ? 'text-yellow-300'
      : signal.trim() === 'MAX ZONE DUMP'
      ? 'text-yellow-400'
      : signal.trim() === 'BALANCE ZONE PUMP'
      ? 'text-purple-300 font-bold'
      : signal.trim() === 'BALANCE ZONE DUMP'
      ? 'text-purple-400 font-bold'
      : signal.trim() === 'LOWEST ZONE PUMP'
      ? 'text-green-400 font-bold'
      : signal.trim() === 'LOWEST ZONE DUMP'
      ? 'text-green-500 font-bold'
      : 'text-gray-500'
  }`}
>
  {signal.trim()}
</td>			   

  {/* Pump / Dump */}
  <td
  className={`text-center font-bold ${
    direction === 'pump' && pump !== undefined && pump > 30
      ? 'text-green-400'
      : direction === 'dump' && dump !== undefined && dump > 30
      ? 'text-red-400'
      : direction === 'pump' && inRange(pump, 21, 26)
      ? 'text-blue-400'
      : direction === 'dump' && inRange(dump, 21, 26)
      ? 'text-blue-400'
      : direction === 'pump' && inRange(pump, 1, 10)
      ? 'text-yellow-400'
      : direction === 'dump' && inRange(dump, 1, 10)
      ? 'text-yellow-400'
      : 'text-gray-500'
  }`}
>
  {direction === 'pump' && pump !== undefined ? `Pump: ${pump.toFixed(2)}` : ''}
  {direction === 'dump' && dump !== undefined ? `Dump: ${dump.toFixed(2)}` : ''}
  {(!direction || (direction === 'pump' && !pump) || (direction === 'dump' && !dump)) && 'N/A'}
</td>

	<td className="px-2 py-1 border-b border-gray-700 text-center text-sm">
  {s.mainTrend?.trend === 'bullish' && didDropFromPeak(10, s.priceChangePercent, 5) ? (
    <span className="text-yellow-400 font-semibold animate-pulse">🚨 Dropped</span>
  ) : (
    <span className="text-gray-500">–</span>
  )}
</td>

<td className="px-2 py-1 border-b border-gray-700 text-center text-sm">
  {s.mainTrend?.trend === 'bearish' && didRecoverFromLow(-40, s.priceChangePercent, 10) ? (
    <span className="text-green-400 font-semibold animate-pulse">🟢 Recovery</span>
  ) : (
    <span className="text-gray-500">–</span>
  )}
</td>	   
		   
  <td className={`px-1 py-0.5 text-center ${s.bullishBreakout ? 'text-green-400' : 'text-gray-500'}`}>
    {s.bullishBreakout ? 'Yes' : 'No'}
  </td>	   

  <td className={`px-1 py-0.5 text-center ${s.bearishBreakout ? 'text-red-400' : 'text-gray-500'}`}>
    {s.bearishBreakout ? 'Yes' : 'No'}
  </td>		   
		   
<td
  className={`px-1 py-0.5 text-center font-semibold ${
    s.prevClosedGreen ? 'text-green-400' : s.prevClosedRed ? 'text-red-400' : 'text-gray-500'
  }`}
>
  {s.prevClosedGreen ? 'Green' : s.prevClosedRed ? 'Red' : 'N/A'}
</td>
		   
<td
  className={`px-1 py-0.5 text-center ${
    s.mainTrend?.trend === 'bullish'
      ? 'text-green-500'
      : s.mainTrend?.trend === 'bearish'
      ? 'text-red-500'
      : 'text-gray-400'
  }`}
>
  {s.mainTrend ? (
    <>
      {`${s.mainTrend.trend.toUpperCase()} (${s.mainTrend.type}) @ ${s.mainTrend.crossoverPrice.toFixed(7)} `}
      {s.mainTrend.breakout === true ? (
        s.mainTrend.trend === 'bullish' ? '🚀 Breakup price' : '🔻 Breakdown price'
      ) : s.mainTrend.breakout === false ? (
        s.mainTrend.trend === 'bullish' ? '🔻 Breakdown price' : '🚀 Breakup price'
      ) : (
        ''
      )}
      {s.mainTrend.isNear && (
        <span className="ml-1 text-yellow-400 font-semibold">
          ⏳ Near {s.mainTrend.type}
        </span>
      )}
      {s.mainTrend.isDojiAfterBreakout && (
        <span className="ml-1 text-purple-400 font-bold">
          🕯️ Doji After Breakout
        </span>
      )}
    </>
  ) : (
    'N/A'
  )}
</td>
		   
<td className="px-2 py-1 text-sm text-left leading-snug text-white">
  <div className={`font-semibold mb-1 ${
    s.bearishCollapse?.signal ? 'text-red-400' : 'text-gray-500'
  }`}>
    {s.bearishCollapse?.signal ? 'Yes 🚨' : 'No Signal'}
  </div>

  {s.bearishCollapse?.signal && (
    <>
      <div>
        <span className="text-red-400 font-semibold">Entry:</span>{' '}
        ${s.bearishCollapse.entry.toFixed(7)}
      </div>
      <div>
        <span className="text-yellow-400 font-semibold">SL:</span>{' '}
        ${s.bearishCollapse.stopLoss.toFixed(7)}
      </div>
      <div>
        <span className="text-green-300 font-semibold">TP1:</span>{' '}
        ${s.bearishCollapse.tp1.toFixed(7)}
      </div>
      <div>
        <span className="text-green-500 font-semibold">TP2:</span>{' '}
        ${s.bearishCollapse.tp2.toFixed(7)}
      </div>
    </>
  )}
</td>

<td className="px-2 py-1 text-sm text-left leading-snug text-white">
  <div className={`font-semibold mb-1 ${
    s.bullishSpike?.signal ? 'text-green-400' : 'text-gray-500'
  }`}>
    {s.bullishSpike?.signal ? 'Yes ✅' : 'No Signal'}
  </div>

  {s.bullishSpike?.signal && (
    <>
      <div>
        <span className="text-green-400 font-semibold">Entry:</span>{' '}
        ${s.bullishSpike.entry.toFixed(7)}
      </div>
      <div>
        <span className="text-yellow-400 font-semibold">SL:</span>{' '}
        ${s.bullishSpike.stopLoss.toFixed(7)}
      </div>
      <div>
        <span className="text-green-300 font-semibold">TP1:</span>{' '}
        ${s.bullishSpike.tp1.toFixed(7)}
      </div>
      <div>
        <span className="text-green-500 font-semibold">TP2:</span>{' '}
        ${s.bullishSpike.tp2.toFixed(7)}
      </div>
    </>
  )}
</td>

<td className="px-2 py-1 text-sm text-left leading-snug text-white">
  <div className={`font-semibold mb-1 ${
    s.bearishReversal?.signal ? 'text-green-400' : 'text-gray-500'
  }`}>
    {s.bearishReversal?.signal ? 'Yes ✅' : 'No Signal'}
  </div>

  {s.bearishReversal?.signal && (
    <>
      <div>
        <span className="text-green-400 font-semibold">Entry:</span>{' '}
        ${s.bearishReversal.entry?.toFixed(7)}
      </div>
      <div>
        <span className="text-red-400 font-semibold">SL:</span>{' '}
        ${s.bearishReversal.stopLoss?.toFixed(7)}
      </div>
      <div>
        <span className="text-green-300 font-semibold">TP1:</span>{' '}
        ${s.bearishReversal.tp1?.toFixed(7)}
      </div>
      <div>
        <span className="text-green-500 font-semibold">TP2:</span>{' '}
        ${s.bearishReversal.tp2?.toFixed(7)}
      </div>
    </>
  )}
</td>

  <td className="px-2 py-1 text-sm text-left leading-snug text-white">
  <div
    className={`font-semibold mb-1 ${
      s.bullishReversal?.signal ? 'text-red-400' : 'text-gray-500'
    }`}
  >
    {s.bullishReversal?.signal ? 'Yes ❌' : 'No Signal'}
  </div>

  {s.bullishReversal?.signal && (
    <>
      <div>
        <span className="text-red-400 font-semibold">Entry:</span>{' '}
        ${s.bullishReversal.entry?.toFixed(7)}
      </div>
      <div>
        <span className="text-yellow-400 font-semibold">SL:</span>{' '}
        ${s.bullishReversal.stopLoss?.toFixed(7)}
      </div>
      <div>
        <span className="text-green-300 font-semibold">TP1:</span>{' '}
        ${s.bullishReversal.tp1?.toFixed(7)}
      </div>
      <div>
        <span className="text-green-500 font-semibold">TP2:</span>{' '}
        ${s.bullishReversal.tp2?.toFixed(7)}
      </div>
    </>
  )}
</td>

		   <td
                    className={`p-2 ${
                      s.divergenceFromLevel
                        ? 'bg-indigo-700 text-white'
                        : 'bg-gray-800 text-gray-500'
                    }`}
                  >
                    {s.divergenceFromLevel ? 'Yes' : 'No'}
                  </td>
		   

	       <td
  className={`px-2 py-1 text-center font-semibold ${
    typeof s.latestRSI !== 'number'
      ? 'text-gray-400'
      : s.latestRSI > 50
      ? 'text-green-400'
      : 'text-red-400'
  }`}
>
  {typeof s.latestRSI !== 'number'
    ? 'N/A'
    : s.latestRSI > 50
    ? 'Above 50 (Bullish)'
    : 'Below 50 (Bearish)'}
</td>		   

{/* Divergences */}
{/* Bearish Divergence */}
<td className={`p-2 font-semibold ${s.bearishDivergence?.divergence ? 'text-red-500' : 'text-gray-400'}`}>
 {s.bearishDivergence?.divergence ? 'Yes' : '-'}
</td>

{/* Bullish Divergence */}
<td className={`p-2 font-semibold ${s.bullishDivergence?.divergence ? 'text-green-500' : 'text-gray-400'}`}>
{s.bullishDivergence?.divergence ? 'Yes' : '-'}
</td>	

  {/* Volume */}
  <td
    className={`p-2 font-semibold ${
      s.highestVolumeColorPrev === 'green'
        ? 'text-green-400'
        : s.highestVolumeColorPrev === 'red'
        ? 'text-red-400'
        : 'text-gray-400'
    }`}
  >
    {typeof s.highestVolumeColorPrev === 'string'
      ? s.highestVolumeColorPrev.charAt(0).toUpperCase() + s.highestVolumeColorPrev.slice(1)
      : '—'}
  </td>	

 <td
  className={`px-1 py-0.5 text-center font-semibold ${
    s.bullishVolumeDivergence?.divergence
      ? s.bullishVolumeDivergence.type === 'bullish-volume'
        ? 'text-green-400'
        : 'text-red-400'
      : 'text-gray-400'
  }`}
>
  {s.bullishVolumeDivergence?.divergence
    ? s.bullishVolumeDivergence.type === 'bullish-volume'
      ? 'Bullish'
      : 'Bearish'
    : '—'}
</td>
	 <td
  className={`p-2 font-semibold ${
    s.isVolumeSpike ? 'text-yellow-400' : 'text-gray-400'
  }`}
>
  {s.isVolumeSpike ? 'Spike' : '—'}
</td>	    	  
		   
<td className="px-1 py-0.5 text-center text-[10px]">
  {s.ema14InsideResults.some(r => r.inside)
    ? <span className="text-green-400 font-semibold">YES</span>
    : <span className="text-red-400">NO</span>}
</td>	

<td className={`px-4 py-2 border border-gray-700 ${s.gap > 0 ? 'text-green-400' : 'text-red-400'}`}>
  {typeof s.gap === 'number' && !isNaN(s.gap) ? `${s.gap.toFixed(2)}%` : 'N/A'}
</td>

<td className={`px-4 py-2 border border-gray-700 ${s.gap1 > 0 ? 'text-green-400' : 'text-red-400'}`}>
  {typeof s.gap1 === 'number' && !isNaN(s.gap1) ? `${s.gap1.toFixed(2)}%` : 'N/A'}
</td>
		   
{/* Low → EMA200: Only for bearish trend */}
<td className="px-1 py-0.5 text-center">
  {s.mainTrend?.trend === 'bearish' && s.gapFromLowToEMA200 !== null ? (
    <span className={s.gapFromLowToEMA200 < 1 ? 'text-red-400' : 'text-yellow-400'}>
      {s.gapFromLowToEMA200.toFixed(2)}%
    </span>
  ) : '—'}
</td>

{/* High → EMA200: Only for bullish trend */}
<td className="px-1 py-0.5 text-center">
  {s.mainTrend?.trend === 'bullish' && s.gapFromHighToEMA200 !== null ? (
    <span className={s.gapFromHighToEMA200 > 5 ? 'text-green-400' : 'text-gray-300'}>
      {s.gapFromHighToEMA200.toFixed(2)}%
    </span>
  ) : '—'}
</td>
		   
		  <td className={`p-2 ${s.ema200Bounce ? 'text-yellow-400 font-semibold' : 'text-gray-500'}`}>
    {s.ema200Bounce ? 'Yes' : 'No'}
  </td> 
		   
  {/* Touched EMA200 */}
  <td className={`p-2 ${s.touchedEMA200Today ? 'text-yellow-400 font-semibold' : 'text-gray-500'}`}>
    {s.touchedEMA200Today ? 'Yes' : 'No'}
  </td>	   			   

{/* EMA Bounces */}
  <td className={`p-2 ${s.ema14Bounce ? 'text-green-400 font-semibold' : 'text-gray-500'}`}>
    {s.ema14Bounce ? 'Yes' : 'No'}
  </td>

  <td className={`p-2 ${s.ema70Bounce ? 'text-pink-400 font-semibold' : 'text-gray-500'}`}>
    {s.ema70Bounce ? 'Yes' : 'No'}
  </td>	   
		   		   
<td className="p-2 text-center text-green-400 font-semibold">
  {s.mainTrend?.trend === 'bearish' && s.hasBullishEngulfing ? 'Yes' : '-'}
</td>
<td className="p-2 text-center text-red-400 font-semibold">
  {s.mainTrend?.trend === 'bullish' && s.hasBearishEngulfing ? 'Yes' : '-'}
</td>		   	   
		   	
		   
  {/* Support/Breakout Detection */}
  <td className="px-1 py-0.5 text-center text-blue-300 font-semibold">
    {s.testedPrevHigh ? 'Yes' : '-'}
  </td>

  <td className="px-1 py-0.5 text-center text-blue-300 font-semibold">
    {s.testedPrevLow ? 'Yes' : '-'}
  </td>

  <td className="px-1 py-0.5 text-center text-red-400 font-semibold">
    {s.breakoutFailure ? 'Yes' : '-'}
  </td>

  <td className="px-1 py-0.5 text-center text-yellow-400 font-semibold">
    {s.mainTrend?.trend === 'bullish'
      ? s.isDoubleTopFailure
        ? 'Top Fail'
        : s.isDoubleTop
        ? 'Double Top'
        : s.isDescendingTop
        ? 'Descending Top'
        : '-'
      : '-'}
  </td>

  <td className="px-1 py-0.5 text-center text-green-400 font-semibold">
    {s.mainTrend?.trend === 'bearish'
      ? s.isDoubleBottomFailure
        ? 'Bottom Fail'
        : s.isDoubleBottom
        ? 'Double Bottom'
        : s.isAscendingBottom
        ? 'Ascending Bottom'
        : '-'
      : '-'}
  </td>
  
</tr>
        );
      })}
    </tbody>
  </table>
</div>

            
    </div>                    
  );
}
  
