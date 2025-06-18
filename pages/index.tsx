import { useEffect, useState } from "react";

function calculateEMA(data: number[], period: number) {
  const k = 2 / (period + 1);
  const ema: number[] = [];
  let previousEma: number | null = null;

  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      ema.push(NaN);
      continue;
    }
    if (i === period - 1) {
      const sma = data.slice(0, period).reduce((sum, val) => sum + val, 0) / period;
      previousEma = sma;
    }
    if (previousEma !== null) {
      const currentEma = data[i] * k + previousEma * (1 - k);
      ema.push(currentEma);
      previousEma = currentEma;
    }
  }
  return ema;
}

function calculateRSI(closes: number[], period = 14): number[] {
  if (!Array.isArray(closes) || closes.length <= period) return [];

  const rsi: number[] = [];
  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff;
    else losses -= diff;
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;
  let rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  rsi[period] = 100 - 100 / (1 + rs);

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    rsi[i] = 100 - 100 / (1 + rs);
  }

  // Fill initial NaNs
  for (let i = 0; i < period; i++) {
    rsi[i] = NaN;
  }

  return rsi;
}

function getMainTrend(close: number, ema200: number): 'bullish' | 'bearish' {
  return close >= ema200 ? 'bullish' : 'bearish';
}

function getRecentRSIDiff(rsi: number[], lookback = 14) {
  if (rsi.length < lookback) return null;

  const recentRSI = rsi.slice(-lookback);
  let recentHigh = -Infinity;
  let recentLow = Infinity;

  for (const value of recentRSI) {
    if (!isNaN(value)) {
      if (value > recentHigh) recentHigh = value;
      if (value < recentLow) recentLow = value;
    }
  }

  const pumpStrength = recentHigh - recentLow;
  const dumpStrength = recentLow - recentHigh;

  return {
    recentHigh,
    recentLow,
    pumpStrength,
    dumpStrength: Math.abs(dumpStrength)
  };
}

export default function Home() {
  const [signals, setSignals] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [lastUpdatedMap, setLastUpdatedMap] = useState<{ [symbol: string]: number }>({});
  const [loading, setLoading] = useState(true);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
const [showOnlyFavorites, setShowOnlyFavorites] = useState(false);
  const [sortField, setSortField] = useState<string>('symbol');
const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
const [trendFilter, setTrendFilter] = useState<string | null>(null);
  


useEffect(() => {
  const stored = localStorage.getItem("favorites");
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        setFavorites(new Set(parsed)); // Convert array back to Set
      }
    } catch (err) {
      console.error("Failed to parse favorites:", err);
    }
  }
}, []);

useEffect(() => {
  localStorage.setItem("favorites", JSON.stringify(Array.from(favorites))); // Convert Set to array before storing
}, [favorites]);

const toggleFavorite = (symbol: string) => {
  setFavorites((prev) => {
    const newSet = new Set(prev);
    if (newSet.has(symbol)) {
      newSet.delete(symbol);
    } else {
      newSet.add(symbol);
    }
    return newSet;
  });
};

const filteredSignals = signals.filter((s) =>
  s.symbol.toLowerCase().includes(search.toLowerCase()) &&
  (!showOnlyFavorites || favorites.has(s.symbol))
);

const sortedSignals = [...filteredSignals].sort((a, b) => {
  let valA: any = a[sortField];
  let valB: any = b[sortField];

  if (sortField === 'pumpStrength' || sortField === 'dumpStrength') {
    const pumpDumpA = a.rsi14 ? getRecentRSIDiff(a.rsi14, 14) : null;
    const pumpDumpB = b.rsi14 ? getRecentRSIDiff(b.rsi14, 14) : null;

    valA = sortField === 'pumpStrength' ? pumpDumpA?.pumpStrength : pumpDumpA?.dumpStrength;
    valB = sortField === 'pumpStrength' ? pumpDumpB?.pumpStrength : pumpDumpB?.dumpStrength;
  }

  if (valA == null) return 1;
  if (valB == null) return -1;

  if (typeof valA === 'string' && typeof valB === 'string') {
    return sortOrder === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
  }

  if (typeof valA === 'number' && typeof valB === 'number') {
    return sortOrder === 'asc' ? valA - valB : valB - valA;
  }

  return 0;
});

const filteredAndSortedSignals = sortedSignals.filter((s) => {
  if (!trendFilter) return true;
  return s[trendFilter];
});
  
  
  
    // ✅ Declare counts here (inside the component, after filteredSignals)
const bullishMainTrendCount = filteredSignals.filter(s => s.mainTrend === 'bullish').length;
const bearishMainTrendCount = filteredSignals.filter(s => s.mainTrend === 'bearish').length;


// ✅ Add these to count 'yes' (true) for breakouts
const bullishBreakoutCount = filteredSignals.filter(s => s.bullishBreakout === true).length;
const bearishBreakoutCount = filteredSignals.filter(s => s.bearishBreakout === true).length;

  useEffect(() => {
    let isMounted = true;

    const BATCH_SIZE = 10;
    const INTERVAL_MS = 1000;
    let currentIndex = 0;
    let symbols: string[] = [];

    const getUTCMillis = (y: number, m: number, d: number, hPH: number, min: number) =>
      Date.UTC(y, m, d, hPH - 8, min);

    const getSessions = () => {
      const now = new Date();
      const year = now.getUTCFullYear();
      const month = now.getUTCMonth();
      const date = now.getUTCDate();

      const today8AM_UTC = getUTCMillis(year, month, date, 8, 0);
      const tomorrow745AM_UTC = getUTCMillis(year, month, date + 1, 7, 45);

      let sessionStart: number, sessionEnd: number;
      if (now.getTime() >= today8AM_UTC) {
        sessionStart = today8AM_UTC;
        sessionEnd = tomorrow745AM_UTC;
      } else {
        const yesterday8AM_UTC = getUTCMillis(year, month, date - 1, 8, 0);
        const today745AM_UTC = getUTCMillis(year, month, date, 7, 45);
        sessionStart = yesterday8AM_UTC;
        sessionEnd = today745AM_UTC;
      }

      const prevSessionStart = getUTCMillis(year, month, date - 1, 8, 0);
      const prevSessionEnd = getUTCMillis(year, month, date, 7, 45);

      return { sessionStart, sessionEnd, prevSessionStart, prevSessionEnd };
    };

    const fetchAndAnalyze = async (symbol: string) => {
      try {
        const raw = await fetch(
          `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=15m&limit=500`
        ).then((res) => res.json());

        const candles = raw.map((c: any) => ({
          timestamp: c[0],
          open: +c[1],
          high: +c[2],
          low: +c[3],
          close: +c[4],
          volume: +c[5],
        }));

        const closes = candles.map((c) => c.close);
const highs = candles.map(c => c.high);
const lows = candles.map(c => c.low);

const ema14 = calculateEMA(closes, 14);
const ema70 = calculateEMA(closes, 70);
const ema200 = calculateEMA(closes, 200);
const rsi14 = calculateRSI(closes);

const lastOpen = candles.at(-1)?.open!;
const lastClose = candles.at(-1)?.close!;
const lastEMA14 = ema14.at(-1)!;
const lastEMA70 = ema70.at(-1)!;
const lastEMA200 = ema200.at(-1)!;


// Main trend from candle vs EMA200 (long-term trend)
const mainTrend = lastClose >= lastEMA200 ? "bullish" : "bearish";

        


        const { sessionStart, sessionEnd, prevSessionStart, prevSessionEnd } = getSessions();

        const candlesToday = candles.filter(c => c.timestamp >= sessionStart && c.timestamp <= sessionEnd);
        const candlesPrev = candles.filter(c => c.timestamp >= prevSessionStart && c.timestamp <= prevSessionEnd);

        const todaysLowestLow = candlesToday.length > 0 ? Math.min(...candlesToday.map(c => c.low)) : null;
        const todaysHighestHigh = candlesToday.length > 0 ? Math.max(...candlesToday.map(c => c.high)) : null;
        const prevSessionLow = candlesPrev.length > 0 ? Math.min(...candlesPrev.map(c => c.low)) : null;
        const prevSessionHigh = candlesPrev.length > 0 ? Math.max(...candlesPrev.map(c => c.high)) : null;

        const bullishBreakout = todaysHighestHigh !== null && prevSessionHigh !== null && todaysHighestHigh > prevSessionHigh;
        const bearishBreakout = todaysLowestLow !== null && prevSessionLow !== null && todaysLowestLow < prevSessionLow;
        const breakout = bullishBreakout || bearishBreakout;
  
        
        
        return {
  symbol,
  bullishMainTrendCount,
  bearishMainTrendCount,
  bullishBreakoutCount,
  bearishBreakoutCount,
  mainTrend,
  breakout,
  bullishBreakout,
  bearishBreakout,
          rsi14,
};
      } catch (err) {
        console.error("Error processing", symbol, err);
        return null;
      }
    };
 

    const fetchSymbols = async () => {
      const info = await fetch("https://fapi.binance.com/fapi/v1/exchangeInfo").then(res => res.json());
      symbols = info.symbols
        .filter((s: any) => s.contractType === "PERPETUAL" && s.quoteAsset === "USDT")
        .slice(0, 500)
        .map((s: any) => s.symbol);
    };

    const runBatches = async () => {
      await fetchSymbols();
      await fetchBatch(); // fetch first batch before showing UI
setLoading(false);  // stop showing loading spinner
      
      const interval = setInterval(fetchBatch, INTERVAL_MS);
      return () => clearInterval(interval);
    };

    const fetchBatch = async () => {
      if (!symbols.length) return;

      const batch = symbols.slice(currentIndex, currentIndex + BATCH_SIZE);
      currentIndex = (currentIndex + BATCH_SIZE) % symbols.length;

      const results = await Promise.all(batch.map(fetchAndAnalyze));
      const cleanedResults = results.filter(r => r !== null);
      
      if (isMounted) {
        setSignals((prev) => {
          const updated = [...prev];
          const updatedMap: { [symbol: string]: number } = { ...lastUpdatedMap };
          for (const result of cleanedResults) {
            const index = updated.findIndex((r) => r.symbol === result.symbol);
            if (index >= 0) {
              updated[index] = result;
            } else {
              updated.push(result);
            }
            updatedMap[result.symbol] = Date.now();
          }
          setLastUpdatedMap(updatedMap);
          return updated;
        });
      }
    };

    const stop = runBatches();
    return () => {
      isMounted = false;
      stop.then((clear) => clear && clear());
    };
  }, []);

if (loading) {
  return (
    <div className="h-screen w-screen flex items-center justify-center bg-gray-900 text-white">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-yellow-400 border-opacity-50 mx-auto mb-4"></div>
        <p className="text-lg">Loading data...</p>
      </div>
    </div>
  );
}

    return (
        <div className="min-h-screen bg-gray-900 text-white p-4 overflow-auto">
      <h1 className="text-3xl font-bold text-yellow-400 mb-4">
        Binance 15m Signal Analysis (UTC)
      </h1>

      <div className="flex flex-wrap gap-4 mb-4 items-center">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={showOnlyFavorites}
            onChange={() => setShowOnlyFavorites((prev: boolean) => !prev)}
          />
          Show only favorites
        </label>

        <input
          type="text"
          placeholder="Search symbol..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="p-2 rounded bg-gray-800 text-white border border-gray-600 focus:outline-none focus:ring-2 focus:ring-yellow-400"
        />

        <button
          onClick={() => setSearch('')}
          className="text-xs px-3 py-1 bg-red-500 hover:bg-red-600 rounded text-white"
        >
          Clear
        </button>
   
      </div>

      <div className="flex flex-wrap gap-2 mb-4 text-sm">
        {[    
    { label: 'Bullish Breakout', key: 'bullishBreakout' },
    { label: 'Bearish Breakout', key: 'bearishBreakout' },
  ].map(({ label, key }) => (
    <button
      key={key}
      onClick={() => setTrendFilter(trendFilter === key ? null : key)}
      className={`px-3 py-1 rounded-full ${
        trendFilter === key
          ? 'bg-yellow-500 text-black'
          : 'bg-gray-700 text-white'
      }`}
    >
      {label}
    </button>
  ))}

  {/* ✅ Clear Button */}
  <button
    onClick={() => {
      setSearch('');
      setTrendFilter(null);
      setShowOnlyFavorites(false);
    }}
    className="px-3 py-1 rounded-full bg-red-500 text-white hover:bg-red-600"
  >
    Clear All Filters
  </button>
</div>
          
      <div className="sticky left-0 top-0 bg-gray-900 p-4 z-30 text-white text-sm md:text-base border-r border-gray-700 mb-4">
        <div className="flex flex-wrap gap-4">
          <div className="flex items-center gap-1">
            <span>Bullish Main Trend:</span>
            <span className="text-green-400 font-semibold">{bullishMainTrendCount}</span>
          </div>
          <div className="flex items-center gap-1">
            <span>Bearish Main Trend:</span>
            <span className="text-red-400 font-semibold">{bearishMainTrendCount}</span>
          </div>
          <div className="flex items-center gap-1">
            <span>Bullish Breakout:</span>
            <span className="text-yellow-300 font-semibold">{bullishBreakoutCount}</span>
          </div>
          <div className="flex items-center gap-1">
            <span>Bearish Breakout:</span>
            <span className="text-yellow-400 font-semibold">{bearishBreakoutCount}</span>
          </div>
        </div>
      </div>

      <div className="overflow-auto max-h-[80vh] border border-gray-700 rounded">
        <table className="w-full text-[11px] border-collapse">
  <thead className="bg-gray-800 text-yellow-300 sticky top-0 z-20">
    <tr>
      <th
        onClick={() => {
          setSortField('symbol');
          setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
        }}
        className="px-1 py-0.5 bg-gray-800 sticky left-0 z-30 text-left align-middle cursor-pointer"
      >
        Symbol {sortField === 'symbol' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
      </th>
      <th className="px-1 py-0.5 text-center">BO</th>
      <th className="px-1 py-0.5 text-center">Bull BO</th>
      <th className="px-1 py-0.5 text-center">Bear BO</th>
      <th className="px-1 py-0.5 text-center">Trend (200)</th>
      <th
  onClick={() => {
    setSortField('pumpStrength');
    setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
  }}
  className="px-1 py-0.5 bg-gray-800 text-center cursor-pointer"
>
  RSI Pump {sortField === 'pumpStrength' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
</th>

<th
  onClick={() => {
    setSortField('dumpStrength');
    setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
  }}
  className="px-1 py-0.5 bg-gray-800 text-center cursor-pointer"
>
  RSI Dump {sortField === 'dumpStrength' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
</th>
    </tr>
  </thead>
  <tbody>
  {filteredAndSortedSignals.map((s: any) => {
    const updatedRecently = Date.now() - (lastUpdatedMap[s.symbol] || 0) < 5000;
    const pumpDump = s.rsi14 ? getRecentRSIDiff(s.rsi14, 14) : null;

    return (
      <tr
        key={s.symbol}
        className={`border-b border-gray-700 transition-all duration-300 hover:bg-yellow-800/20 ${
          updatedRecently ? 'bg-yellow-900/30' : ''
        }`}
      >
        <td className="px-1 py-0.5 font-bold bg-gray-900 sticky left-0 z-10 text-left">
          <div className="flex items-center justify-between">
            <span>{s.symbol}</span>
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
        <td className="px-1 py-0.5 text-center">{s.breakout ? 'Yes' : 'No'}</td>
        <td className={`px-1 py-0.5 text-center ${s.bullishBreakout ? 'text-green-400 font-semibold' : 'text-gray-500'}`}>
          {s.bullishBreakout ? 'Yes' : 'No'}
        </td>
        <td className={`px-1 py-0.5 text-center ${s.bearishBreakout ? 'text-red-400 font-semibold' : 'text-gray-500'}`}>
          {s.bearishBreakout ? 'Yes' : 'No'}
        </td>
        <td className={`px-1 py-0.5 text-center font-semibold ${s.mainTrend === 'bullish' ? 'text-green-500' : 'text-red-500'}`}>
          {s.mainTrend}
        </td>
                 {/* RSI Pump Column */}
        {pumpDump?.pumpStrength > 0 ? (
          <td className={`text-center ${pumpDump.pumpStrength > 30 ? 'text-green-400' : 'text-white'}`}>
            {pumpDump.pumpStrength.toFixed(2)}
          </td>
        ) : (
          <td className="text-center text-gray-500">–</td>
        )}

        {/* RSI Dump Column */}
        {pumpDump?.dumpStrength > 0 ? (
          <td className={`text-center ${pumpDump.dumpStrength > 30 ? 'text-red-400' : 'text-white'}`}>
            {pumpDump.dumpStrength.toFixed(2)}
          </td>
        ) : (
          <td className="text-center text-gray-500">–</td>
        )}
      </tr>
    );
  })}
</tbody>
</table>
      </div>
    </div>                    
  );
}
  
