import { useEffect, useState, useMemo } from "react";


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

const getSignal = (s: any): string => {
  const pumpDump = s.rsi14 ? getRecentRSIDiff(s.rsi14, 14) : null;
  const pump = pumpDump?.pumpStrength;
  const dump = pumpDump?.dumpStrength;

  const inRange = (val: number | undefined, min: number, max: number) =>
    val !== undefined && val >= min && val <= max;

  const isAbove27 = (val: number | undefined) =>
    val !== undefined && val >= 27;

  const pumpOrDumpInRange_19_23 = inRange(pump, 19, 23) || inRange(dump, 19, 23);
  const pumpOrDumpInRange_8_12 = inRange(pump, 8, 12) || inRange(dump, 8, 12);
  const pumpOrDumpAbove27 = isAbove27(pump) || isAbove27(dump);

  // Trend flipped compared to yesterday with a strong impulse
  if (
    (s.bullishReversal && s.bullishBreakout && pumpOrDumpInRange_19_23) ||
    (s.bearishReversal && s.bearishBreakout && pumpOrDumpInRange_19_23)
  ) {
    return "YESTERDAY'S TREND REVERSE";
  }

  // Selling signals
  if (pumpOrDumpInRange_8_12 && s.bearishCollapse) {
    return 'START SELLING';
  }

  if (pumpOrDumpInRange_19_23 && s.bearishCollapse) {
    return 'PULLBACK SELL';
  }

  // Buying signals
  if (pumpOrDumpInRange_8_12 && s.bullishSpike) {
    return 'START BUYING';
  }

  if (pumpOrDumpInRange_19_23 && s.bullishSpike) {
    return 'PULLBACK BUY';
  }

  // Overextended moves may suggest exhaustion/reversal
  if (pumpOrDumpAbove27 && (s.bullishSpike || s.bearishCollapse)) {
    return 'POSSIBLE REVERSE';
  }

  // Entry: moderate pump/dump + clear reversal
  if (pumpOrDumpInRange_8_12 && s.bearishReversal) {
    return 'BUY';
  }

  if (pumpOrDumpInRange_8_12 && s.bullishReversal) {
    return 'SELL';
  }

  // Overextended + reversal = caution
  if (pumpOrDumpAbove27 && s.bearishReversal) {
    return 'POSSIBLE REVERSE';
  }

  if (pumpOrDumpAbove27 && s.bullishReversal) {
    return 'POSSIBLE REVERSE';
  }

  // Special case: 19–23 + reversal = INDECISION/weak confirmation
  if (pumpOrDumpInRange_19_23 && s.bearishReversal) {
    return 'INDECISION / BUY';
  }

  if (pumpOrDumpInRange_19_23 && s.bullishReversal) {
    return 'INDECISION / SELL';
  }

  return '';
};

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
  const [signalFilter, setSignalFilter] = useState<string | null>(null);
  
  


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
    if (trendFilter && !s[trendFilter]) return false;
    if (signalFilter && getSignal(s) !== signalFilter) return false;
    return true;
  });
  
  
  
    // ✅ Declare counts here (inside the component, after filteredSignals)
const bullishMainTrendCount = filteredSignals.filter(s => s.mainTrend === 'bullish').length;
const bearishMainTrendCount = filteredSignals.filter(s => s.mainTrend === 'bearish').length;


// ✅ Add these to count 'yes' (true) for breakouts
const bullishBreakoutCount = filteredSignals.filter(s => s.bullishBreakout === true).length;
const bearishBreakoutCount = filteredSignals.filter(s => s.bearishBreakout === true).length;

const bullishReversalCount = filteredSignals.filter(s => s.bullishReversal).length;
const bearishReversalCount = filteredSignals.filter(s => s.bearishReversal).length;

const bullishSpikeCount = filteredSignals.filter(s => s.bullishSpike).length;
const bearishCollapseCount = filteredSignals.filter(s => s.bearishCollapse).length;

const signalCounts = useMemo(() => {
  const counts = {
    buy: 0,
    sell: 0,
    indecision: 0,
    startBuying: 0,
    continueBuying: 0, // Now refers to "PULLBACK BUY"
    startSelling: 0,
    continueSelling: 0, // Now refers to "PULLBACK SELL"
    possibleReverse: 0,
    yesterdayReverse: 0,
  };

  signals.forEach((s: any) => {
    const signal = getSignal(s)?.trim().toUpperCase();

    switch (signal) {
      case 'BUY':
        counts.buy++;
        break;
      case 'SELL':
        counts.sell++;
        break;
      case 'INDECISION / BUY':
      case 'INDECISION / SELL':
        counts.indecision++;
        break;
      case 'START BUYING':
        counts.startBuying++;
        break;
      case 'PULLBACK BUY':
        counts.continueBuying++;
        break;
      case 'START SELLING':
        counts.startSelling++;
        break;
      case 'PULLBACK SELL':
        counts.continueSelling++;
        break;
      case 'POSSIBLE REVERSE':
        counts.possibleReverse++;
        break;
      case "YESTERDAY'S TREND REVERSE":
        counts.yesterdayReverse++;
        break;
    }
  });

  return counts;
}, [signals]);
  
  
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

const isDescendingRSI = (rsi: number[], window = 3): boolean => {
  const len = rsi.length;
  if (len < window) return false;

  for (let i = len - window; i < len - 1; i++) {
    if (rsi[i] <= rsi[i + 1]) {
      return false;
    }
  }
  return true;
};

const isAscendingRSI = (rsi: number[], window = 3): boolean => {
  const len = rsi.length;
  if (len < window) return false;

  for (let i = len - window; i < len - 1; i++) {
    if (rsi[i] >= rsi[i + 1]) {
      return false;
    }
  }
  return true;
};

const detectBullishToBearish = (
  ema14: number[],
  ema70: number[],
  rsi14: number[],
  lows: number[],
  highs: number[],
  closes: number[],
  bullishBreakout: boolean,
  bearishBreakout: boolean
): boolean => {
  const len = closes.length;
  if (len < 5) return false;

  if (!bullishBreakout && !bearishBreakout) return false;

  // Confirm bullish trend
  if (ema14[len - 1] <= ema70[len - 1]) return false;

  // 🛑 New: End early if RSI is ascending
  if (isAscendingRSI(rsi14, 3)) return false;

  // Find crossover: EMA14 crossing above EMA70
  let crossoverIndex = -1;
  for (let i = len - 2; i >= 1; i--) {
    if (ema14[i] <= ema70[i] && ema14[i + 1] > ema70[i + 1]) {
      crossoverIndex = i + 1;
      break;
    }
  }
  if (crossoverIndex === -1) return false;

  const crossoverLow = lows[crossoverIndex];
  const crossoverRSI = rsi14[crossoverIndex];

  let lastHigh: number | null = null;

  for (let i = crossoverIndex + 1; i < len - 1; i++) {
    const nearEMA = highs[i] >= ema70[i] && lows[i] <= ema70[i];
    const underEMA = closes[i] > ema70[i];
    const nearOrUnderEMA = nearEMA || underEMA;

    const fallingRSI = rsi14[i] < crossoverRSI;
    const lowerThanCrossover = closes[i] < crossoverLow;

    const currentHigh = highs[i];
    const isDescendingHigh = lastHigh !== null && currentHigh < lastHigh;

    if (nearOrUnderEMA) {
      if (lastHigh === null || currentHigh < lastHigh) {
        lastHigh = currentHigh;
      }

      // ✅ Final confirmation: most recent candle closes above EMA14
      const lastClose = closes[len - 1];
      const lastEMA14 = ema14[len - 1];

      const descendingCloseBelowEMA = lastClose < lastEMA14;

      // ✅ New: Check descending RSI over last 3 candles
      const descendingCurrentRSI = isDescendingRSI(rsi14, 3);

      if (
        isDescendingHigh &&
        fallingRSI &&
        lowerThanCrossover &&
        descendingCloseBelowEMA &&
        descendingCurrentRSI
      ) {
        return true;
      }
    }
  }

  return false;
};
        


const detectBearishToBullish = (
  ema14: number[],
  ema70: number[],
  rsi14: number[],
  lows: number[],
  highs: number[],
  closes: number[],
  bullishBreakout: boolean,
  bearishBreakout: boolean
): boolean => {
  const len = closes.length;
  if (len < 5) return false;

  if (!bullishBreakout && !bearishBreakout) return false;

  // Confirm bearish trend
  if (ema14[len - 1] >= ema70[len - 1]) return false;

  // 🛑 New: End early if RSI is descending (trend shift to bullish is weakening)
  if (isDescendingRSI(rsi14, 3)) return false;

  // Find crossover: EMA14 crossing below EMA70
  let crossoverIndex = -1;
  for (let i = len - 2; i >= 1; i--) {
    if (ema14[i] >= ema70[i] && ema14[i + 1] < ema70[i + 1]) {
      crossoverIndex = i + 1;
      break;
    }
  }
  if (crossoverIndex === -1) return false;

  const crossoverHigh = highs[crossoverIndex];
  const crossoverRSI = rsi14[crossoverIndex];

  let lastLow: number | null = null;

  for (let i = crossoverIndex + 1; i < len - 1; i++) {
    const nearEMA = highs[i] >= ema70[i] && lows[i] <= ema70[i];
    const aboveEMA = closes[i] < ema70[i];
    const nearOrAboveEMA = nearEMA || aboveEMA;

    const risingRSI = rsi14[i] > crossoverRSI;
    const higherThanCrossover = closes[i] > crossoverHigh;

    const currentLow = lows[i];
    const isAscendingLow = lastLow !== null && currentLow > lastLow;

    if (nearOrAboveEMA) {
      if (lastLow === null || currentLow > lastLow) {
        lastLow = currentLow;
      }

      // ✅ Final confirmation: most recent candle closes above EMA14
      const lastClose = closes[len - 1];
      const lastEMA14 = ema14[len - 1];

      const ascendingCloseAboveEMA = lastClose > lastEMA14;

      // ✅ Check RSI is currently ascending
      const ascendingCurrentRSI = isAscendingRSI(rsi14, 3);

      if (
        isAscendingLow &&
        risingRSI &&
        higherThanCrossover &&
        ascendingCloseAboveEMA &&
        ascendingCurrentRSI
      ) {
        return true;
      }
    }
  }

  return false;
};
    
// Usage
  const bullishReversal = detectBullishToBearish(
  ema14,
  ema70,
  rsi14,
  lows,
  highs,
  closes,
  bullishBreakout,
  bearishBreakout
);

if (bullishReversal) {
  console.log(`[Bullish Reversal Detected]`);
  console.log(`→ EMA14: ${ema14.at(-1)}, EMA70: ${ema70.at(-1)}`);
  console.log(`→ RSI14: ${rsi14.at(-1)}`);
  console.log(`→ Last Close: ${closes.at(-1)}, Last High: ${highs.at(-1)}, Last Low: ${lows.at(-1)}`);
}

const bearishReversal = detectBearishToBullish(
  ema14,
  ema70,
  rsi14,
  highs,
  lows,
  closes,
  bullishBreakout,
  bearishBreakout
);

if (bearishReversal) {
  console.log(`[Bearish Reversal Detected]`);
  console.log(`→ EMA14: ${ema14.at(-1)}, EMA70: ${ema70.at(-1)}`);
  console.log(`→ RSI14: ${rsi14.at(-1)}`);
  console.log(`→ Last Close: ${closes.at(-1)}, Last High: ${highs.at(-1)}, Last Low: ${lows.at(-1)}`);
}      


      const detectBullishSpike = (
  ema14: number[],
  ema70: number[],
  ema200: number[],
  rsi14: number[],
  lows: number[],
  highs: number[],
  closes: number[],
  bullishBreakout: boolean,
  bearishBreakout: boolean
): boolean => {
  const breakout = bullishBreakout || bearishBreakout;
  if (!breakout || !bullishBreakout) return false;

  const len = closes.length;
  if (len < 3) return false;

  if (ema14[len - 1] <= ema70[len - 1]) return false;

  // 🔁 Detect EMA14 > EMA70 crossover
  let crossoverIndex70 = -1;
  for (let i = len - 2; i >= 1; i--) {
    if (ema14[i] <= ema70[i] && ema14[i + 1] > ema70[i + 1]) {
      crossoverIndex70 = i + 1;
      break;
    }
  }
  if (crossoverIndex70 === -1) return false;

  // 🔁 Detect EMA14 > EMA200 crossover
  let crossoverIndex200 = -1;
  for (let i = len - 2; i >= 1; i--) {
    if (ema14[i] <= ema200[i] && ema14[i + 1] > ema200[i + 1]) {
      crossoverIndex200 = i + 1;
      break;
    }
  }
  if (crossoverIndex200 === -1) return false;

  // ✅ Choose the later crossover as starting point
  const crossoverIndex = Math.max(crossoverIndex70, crossoverIndex200);
  const crossoverLow = lows[crossoverIndex];
  const crossoverRSI = rsi14[crossoverIndex];
  let lowestLowAfterCrossover = crossoverLow;

  // 🔍 Track lowest low after crossover
  for (let i = crossoverIndex + 1; i < len; i++) {
    const currentLow = lows[i];
    if (currentLow < lowestLowAfterCrossover) {
      lowestLowAfterCrossover = currentLow;
    }
  }

  // 🧪 Final candle checks
  const i = len - 1;
  const currentLow = lows[i];
  const currentHigh = highs[i];
  const close = closes[i];
  const rsi = rsi14[i];
  const ema14Value = ema14[i];
  const ema70Value = ema70[i];
  const ema200Value = ema200[i];

  // ❌ Invalidate if the most recent candle touches EMA70
  const touchedEMA70 = currentLow <= ema70Value && currentHigh >= ema70Value;
  if (touchedEMA70) return false;

  // ✅ Spike conditions
  const aboveEMA70 = close > ema70Value;
  const aboveEMA200 = close > ema200Value;
  const aboveEMA14 = close > ema14Value;
  const ascendingLow = currentLow > lowestLowAfterCrossover;
  const risingRSI = rsi > crossoverRSI;
  const higherThanCrossover = close > crossoverLow;

  // ✅ Check ascending current RSI
  const ascendingCurrentRSI = isAscendingRSI(rsi14, 3);

  return (
    aboveEMA70 &&
    aboveEMA200 &&
    aboveEMA14 &&
    ascendingLow &&
    risingRSI &&
    higherThanCrossover &&
    ascendingCurrentRSI
  );
};  
        



        const detectBearishCollapse = (
  ema14: number[],
  ema70: number[],
  ema200: number[],
  rsi14: number[],
  lows: number[],
  highs: number[],
  closes: number[],
  bullishBreakout: boolean,
  bearishBreakout: boolean
): boolean => {
  const breakout = bullishBreakout || bearishBreakout;
  if (!breakout || !bearishBreakout) return false;

  const len = closes.length;
  if (len < 3) return false;

  if (ema14[len - 1] >= ema70[len - 1]) return false;

  // 🔁 Detect EMA14 < EMA70 crossover
  let crossoverIndex70 = -1;
  for (let i = len - 2; i >= 1; i--) {
    if (ema14[i] >= ema70[i] && ema14[i + 1] < ema70[i + 1]) {
      crossoverIndex70 = i + 1;
      break;
    }
  }
  if (crossoverIndex70 === -1) return false;

  // 🔁 Detect EMA14 < EMA200 crossover
  let crossoverIndex200 = -1;
  for (let i = len - 2; i >= 1; i--) {
    if (ema14[i] >= ema200[i] && ema14[i + 1] < ema200[i + 1]) {
      crossoverIndex200 = i + 1;
      break;
    }
  }
  if (crossoverIndex200 === -1) return false;

  // ✅ Choose the later crossover as starting point
  const crossoverIndex = Math.max(crossoverIndex70, crossoverIndex200);
  const crossoverHigh = highs[crossoverIndex];
  const crossoverRSI = rsi14[crossoverIndex];
  let highestHighAfterCrossover = crossoverHigh;

  // 🔍 Track highest high after crossover
  for (let i = crossoverIndex + 1; i < len; i++) {
    const currentHigh = highs[i];
    if (currentHigh > highestHighAfterCrossover) {
      highestHighAfterCrossover = currentHigh;
    }
  }

  // 🧪 Final candle checks
  const i = len - 1;
  const currentLow = lows[i];
  const currentHigh = highs[i];
  const close = closes[i];
  const rsi = rsi14[i];
  const ema14Value = ema14[i];
  const ema70Value = ema70[i];
  const ema200Value = ema200[i];

  // ❌ Invalidate if the most recent candle touches EMA70
  const touchedEMA70 = currentLow <= ema70Value && currentHigh >= ema70Value;
  if (touchedEMA70) return false;

  // ✅ Collapse conditions
  const belowEMA70 = close < ema70Value;
  const belowEMA200 = close < ema200Value;
  const belowEMA14 = close < ema14Value;
  const descendingHigh = currentHigh < highestHighAfterCrossover;
  const fallingRSI = rsi < crossoverRSI;
  const lowerThanCrossover = close < crossoverHigh;

  // ✅ Add descending RSI14 check
  const descendingCurrentRSI = isDescendingRSI(rsi14, 3);

  return (
    belowEMA70 &&
    belowEMA200 &&
    belowEMA14 &&
    descendingHigh &&
    fallingRSI &&
    lowerThanCrossover &&
    descendingCurrentRSI
  );
};

        
      const bullishSpike = detectBullishSpike(ema14, ema70, ema200, rsi14, lows, highs, closes, bullishBreakout, bearishBreakout);
const bearishCollapse = detectBearishCollapse(ema14, ema70, ema200, rsi14, highs, lows, closes, bullishBreakout, bearishBreakout);  
        
        
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
  bullishReversalCount,
  bearishReversalCount,
  bullishReversal,
  bearishReversal,
   bullishSpike,
   bearishCollapse,       
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
             { label: 'Bullish Reversal', key: 'bullishReversal' },
    { label: 'Bearish Reversal', key: 'bearishReversal' },
    { label: 'Bullish Breakout', key: 'bullishBreakout' },
    { label: 'Bearish Breakout', key: 'bearishBreakout' },
             { label: 'Bullish Spike', key: 'bullishSpike' },
    { label: 'Bearish Collapse', key: 'bearishCollapse' },
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
        
 {['BUY', 'SELL', 'INDECISION'].map((type) => (
          <button
            key={type}
            onClick={() => setSignalFilter(signalFilter === type ? null : type)}
            className={`px-3 py-1 rounded-full ${signalFilter === type ? 'bg-green-500 text-black' : 'bg-gray-700 text-white'}`}
          >
            {type}
          </button>
        ))}
  {/* ✅ Clear Button */}
  <button
    onClick={() => {
      setSearch('');
      setTrendFilter(null);
      setSignalFilter(null);
      setShowOnlyFavorites(false);
    }}
    className="px-3 py-1 rounded-full bg-red-500 text-white hover:bg-red-600"
  >
    Clear All Filters
  </button>
</div>
          
    <div className="sticky left-0 top-0 z-30 bg-gray-900 border-r border-gray-700 p-4 mb-4 text-white text-sm md:text-base shadow-md">
  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

    {/* 🔷 Trend Overview */}
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      <div className="flex items-center gap-2">
        <span className="text-gray-300">📈 Bull Trend:</span>
        <span className="text-green-400 font-bold">{bullishMainTrendCount}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-gray-300">📉 Bear Trend:</span>
        <span className="text-red-400 font-bold">{bearishMainTrendCount}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-gray-300">🔄 Bull Reversal:</span>
        <span className="text-purple-300 font-bold">{bullishReversalCount}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-gray-300">🔃 Bear Reversal:</span>
        <span className="text-purple-300 font-bold">{bearishReversalCount}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-gray-300">🚀 Bull Breakout:</span>
        <span className="text-yellow-300 font-bold">{bullishBreakoutCount}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-gray-300">📉 Bear Breakout:</span>
        <span className="text-yellow-400 font-bold">{bearishBreakoutCount}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-gray-300">⚡ Bull Spike:</span>
        <span className="text-green-300 font-bold">{bullishSpikeCount}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-gray-300">💥 Bear Collapse:</span>
        <span className="text-red-300 font-bold">{bearishCollapseCount}</span>
      </div>
    </div>

    {/* ✅ Signal Summary */}
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      <div className="flex items-center gap-2">
        <span className="text-green-400 font-semibold">🟢 BUY:</span>
        <span>{signalCounts.buy}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-red-400 font-semibold">🔴 SELL:</span>
        <span>{signalCounts.sell}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-blue-400 font-semibold">🔵 INDECISION:</span>
        <span>{signalCounts.indecision}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-green-300 font-semibold">🟢 START BUY:</span>
        <span>{signalCounts.startBuying}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-green-300 font-semibold">🔁 PULLBACK BUY:</span>
        <span>{signalCounts.continueBuying}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-red-300 font-semibold">🟥 START SELL:</span>
        <span>{signalCounts.startSelling}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-red-300 font-semibold">🔁 PULLBACK SELL:</span>
        <span>{signalCounts.continueSelling}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-yellow-300 font-semibold">⚠️ POSSIBLE REVERSE:</span>
        <span>{signalCounts.possibleReverse}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-yellow-500 font-semibold">🕒 YESTERDAY'S REVERSE:</span>
        <span>{signalCounts.yesterdayReverse}</span>
      </div>
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
          className="px-1 py-0.5 w-[90px] sticky left-0 z-30 bg-gray-800 text-left cursor-pointer whitespace-nowrap"
        >
          Symbol {sortField === 'symbol' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
        </th>
        <th className="px-1 py-0.5 w-[40px] text-center">BO</th>
        <th className="px-1 py-0.5 w-[60px] text-center">Bull</th>
        <th className="px-1 py-0.5 w-[60px] text-center">Bear</th>
        <th className="px-1 py-0.5 w-[80px] text-center">Trend</th>
        <th className="px-1 py-0.5 w-[60px] text-center">BearRev</th>
        <th className="px-1 py-0.5 w-[60px] text-center">BullRev</th>
        <th
          onClick={() => {
            setSortField('pumpStrength');
            setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
          }}
          className="px-1 py-0.5 w-[70px] text-center cursor-pointer"
        >
          Pump {sortField === 'pumpStrength' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
        </th>
        <th
          onClick={() => {
            setSortField('dumpStrength');
            setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
          }}
          className="px-1 py-0.5 w-[70px] text-center cursor-pointer"
        >
          Dump {sortField === 'dumpStrength' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
        </th>
        <th className="px-1 py-0.5 w-[60px] text-center">Collapse</th>
        <th className="px-1 py-0.5 w-[60px] text-center">Spike</th>
        <th className="px-1 py-0.5 min-w-[90px] text-center">Signal</th>
      </tr>
    </thead>

    <tbody>
      {filteredAndSortedSignals.map((s: any) => {
        const updatedRecently = Date.now() - (lastUpdatedMap[s.symbol] || 0) < 5000;
        const pumpDump = s.rsi14 ? getRecentRSIDiff(s.rsi14, 14) : null;
        const pump = pumpDump?.pumpStrength;
        const dump = pumpDump?.dumpStrength;

        const inRange = (val: number | undefined, min: number, max: number) =>
          val !== undefined && val >= min && val <= max;

        const isAbove27 = (val: number | undefined) => val !== undefined && val >= 27;

        let signal = '';

        const pumpOrDumpInRange = inRange(pump, 19, 23) || inRange(dump, 19, 23);
        const pumpOrDumpInRangeEntry = inRange(pump, 8, 12) || inRange(dump, 8, 12);
        const pumpOrDumpAbove27 = isAbove27(pump) || isAbove27(dump);

        if (
          (s.bullishReversal && s.bullishBreakout && pumpOrDumpInRange) ||
          (s.bearishReversal && s.bearishBreakout && pumpOrDumpInRange)
        ) {
          signal = "YESTERDAY'S TREND REVERSE";
        } else if (pumpOrDumpInRangeEntry && s.bearishCollapse) {
          signal = 'START SELLING';
        } else if (pumpOrDumpInRange && s.bearishCollapse) {
          signal = 'PULLBACK SELL';
        } else if (pumpOrDumpInRangeEntry && s.bullishSpike) {
          signal = 'START BUYING';
        } else if (pumpOrDumpInRange && s.bullishSpike) {
          signal = 'PULLBACK BUY';
        } else if (pumpOrDumpAbove27 && (s.bullishSpike || s.bearishCollapse)) {
          signal = 'POSSIBLE REVERSE';
        } else if (pumpOrDumpInRangeEntry && s.bearishReversal) {
          signal = 'BUY';
        } else if (pumpOrDumpInRangeEntry && s.bullishReversal) {
          signal = 'SELL';
        } else if (pumpOrDumpAbove27 && (s.bearishReversal || s.bullishReversal)) {
          signal = 'POSSIBLE REVERSE';
        } else if (pumpOrDumpInRange && s.bearishReversal) {
          signal = 'INDECISION / BUY';
        } else if (pumpOrDumpInRange && s.bullishReversal) {
          signal = 'INDECISION / SELL';
        }

        return (
          <tr
            key={s.symbol}
            className={`border-b border-gray-700 transition-all duration-300 hover:bg-blue-800/20 ${
              updatedRecently ? 'bg-yellow-900/30' : ''
            }`}
          >
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
            <td className="px-1 py-0.5 text-center">{s.breakout ? 'Yes' : 'No'}</td>
            <td className={`px-1 py-0.5 text-center ${s.bullishBreakout ? 'text-green-400' : 'text-gray-500'}`}>
              {s.bullishBreakout ? 'Yes' : 'No'}
            </td>
            <td className={`px-1 py-0.5 text-center ${s.bearishBreakout ? 'text-red-400' : 'text-gray-500'}`}>
              {s.bearishBreakout ? 'Yes' : 'No'}
            </td>
            <td className={`px-1 py-0.5 text-center ${s.mainTrend === 'bullish' ? 'text-green-500' : 'text-red-500'}`}>
              {s.mainTrend}
            </td>
            <td className={`px-1 py-0.5 text-center ${s.bearishReversal ? 'bg-purple-900 text-white' : 'text-gray-500'}`}>
              {s.bearishReversal ? 'Yes' : 'No'}
            </td>
            <td className={`px-1 py-0.5 text-center ${s.bullishReversal ? 'bg-purple-900 text-white' : 'text-gray-500'}`}>
              {s.bullishReversal ? 'Yes' : 'No'}
            </td>
            <td
              className={`text-center ${
                pump > 27
                  ? 'text-green-400'
                  : inRange(pump, 19, 23)
                  ? 'text-blue-400'
                  : inRange(pump, 8, 12)
                  ? 'text-yellow-400'
                  : 'text-white'
              }`}
            >
              {pump?.toFixed(2) ?? 'N/A'}
            </td>
            <td
              className={`text-center ${
                dump > 27
                  ? 'text-red-400'
                  : inRange(dump, 19, 23)
                  ? 'text-blue-400'
                  : inRange(dump, 8, 12)
                  ? 'text-yellow-400'
                  : 'text-white'
              }`}
            >
              {dump?.toFixed(2) ?? 'N/A'}
            </td>
            <td className={`px-1 py-0.5 text-center ${s.bearishCollapse ? 'bg-red-900 text-white' : 'text-gray-500'}`}>
              {s.bearishCollapse ? 'Yes' : 'No'}
            </td>
            <td className={`px-1 py-0.5 text-center ${s.bullishSpike ? 'bg-green-900 text-white' : 'text-gray-500'}`}>
              {s.bullishSpike ? 'Yes' : 'No'}
            </td>
            <td
              className={`px-1 py-0.5 text-center font-semibold ${
                signal === 'SELL'
                  ? 'text-red-400'
                  : signal === 'BUY'
                  ? 'text-green-400'
                  : signal === 'INDECISION / BUY' || signal === 'INDECISION / SELL'
                  ? 'text-blue-400'
                  : signal === 'START BUYING' || signal === 'PULLBACK BUY'
                  ? 'text-green-300'
                  : signal === 'START SELLING' || signal === 'PULLBACK SELL'
                  ? 'text-red-300'
                  : signal === 'POSSIBLE REVERSE'
                  ? 'text-yellow-300'
                  : signal === "YESTERDAY'S TREND REVERSE"
                  ? 'text-yellow-500 font-bold'
                  : 'text-gray-500'
              }`}
            >
              {signal}
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
  
