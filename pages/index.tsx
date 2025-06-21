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

function getMainTrend(
  ema70: number[],
  ema200: number[],
  closes: number[]
): 'bullish' | 'bearish' {
  const len = ema70.length;

  // Look for EMA70/EMA200 crossover
  for (let i = len - 2; i >= 1; i--) {
    if (ema70[i] <= ema200[i] && ema70[i + 1] > ema200[i + 1]) {
      return 'bullish'; // Bullish crossover
    }

    if (ema70[i] >= ema200[i] && ema70[i + 1] < ema200[i + 1]) {
      return 'bearish'; // Bearish crossover
    }
  }

  // Fallback: use last close vs EMA200 if no crossover found
  const lastClose = closes[closes.length - 1];
  const lastEMA200 = ema200[ema200.length - 1];

  return lastClose >= lastEMA200 ? 'bullish' : 'bearish';
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

  const isAbove35 = (val: number | undefined) =>
    val !== undefined && val >= 35;

  const pumpOrDumpInRange_23_26 = inRange(pump, 23, 26) || inRange(dump, 23, 26);
  const pumpOrDumpAbove35 = isAbove35(pump) || isAbove35(dump);

  const {
    mainTrend,
    breakout,
    testedPrevHigh,
    testedPrevLow,
    failedBullishBreak,
    failedBearishBreak,
    bullishReversal,
    bearishReversal,
    bullishBreakout,
    bearishBreakout,
    bullishSpike,
    bearishCollapse,
  } = s;

  // 🔥 New: no breakout + trend + test + failure = impulse signal
  if (
    !breakout &&
    mainTrend === 'bearish' &&
    testedPrevLow &&
    failedBearishBreak 
  ) {
    return 'IMPULSE SIGNAL / BUY';
  }

  if (
    !breakout &&
    mainTrend === 'bullish' &&
    testedPrevHigh &&
    failedBullishBreak 
  ) {
    return 'IMPULSE SIGNAL / SELL';
  }

  // 🔥 Impulse strength zone
  if (pumpOrDumpInRange_23_26) {
    return 'IMPULSE SIGNAL';
  }

  // Overextended: Possible reversals
  if (pumpOrDumpAbove35 && (bullishSpike || bearishCollapse)) {
    return 'POSSIBLE REVERSE';
  }

  if (pumpOrDumpAbove35 && (bullishReversal || bearishReversal)) {
    return 'POSSIBLE REVERSE';
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

const breakoutFailureCount = filteredSignals.filter(s => s.breakoutFailure === true).length;
  
const testedPrevHighCount = filteredSignals.filter(s => s.testedPrevHigh === true).length;
const testedPrevLowCount = filteredSignals.filter(s => s.testedPrevLow === true).length;
  
const bullishReversalCount = filteredSignals.filter(s => s.bullishReversal).length;
const bearishReversalCount = filteredSignals.filter(s => s.bearishReversal).length;

const bullishSpikeCount = filteredSignals.filter(s => s.bullishSpike).length;
const bearishCollapseCount = filteredSignals.filter(s => s.bearishCollapse).length;

const signalCounts = useMemo(() => {
  const counts = {
    possibleReverse: 0,
    impulseSignal: 0,
    impulseBuy: 0,
    impulseSell: 0,
  };

  signals.forEach((s: any) => {
    const signal = getSignal(s)?.trim().toUpperCase(); // ✅ make sure signal is defined here

    switch (signal) {
      case 'POSSIBLE REVERSE':
        counts.possibleReverse++;
        break;
      case 'IMPULSE SIGNAL':
        counts.impulseSignal++;
        break;
      case 'IMPULSE SIGNAL / BUY':
        counts.impulseBuy++;
        break;
      case 'IMPULSE SIGNAL / SELL':
        counts.impulseSell++;
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


// Main trend
const mainTrend = getMainTrend(ema70, ema200, closes);
console.log("Main Trend:", mainTrend);
     
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

          const failedBullishBreak =
    todaysHighestHigh !== null &&
    prevSessionHigh !== null &&
    todaysHighestHigh <= prevSessionHigh;

  const failedBearishBreak =
    todaysLowestLow !== null &&
    prevSessionLow !== null &&
    todaysLowestLow >= prevSessionLow;

  const breakoutFailure = failedBullishBreak && failedBearishBreak;

  // Optional: Add test failure signal
  const getTestThreshold = (price: number): number => {
  if (price > 10000) return price * 0.00005;     // 0.005% for BTC/ETH
  if (price > 1000) return price * 0.0001;       // 0.01%
  if (price > 1) return price * 0.001;           // 0.1%
  return price * 0.01;                           // 1% for sub-$1 coins
};
        
  const testedPrevHigh =
  todaysHighestHigh !== null &&
  prevSessionHigh !== null &&
  Math.abs(todaysHighestHigh - prevSessionHigh) <= getTestThreshold(prevSessionHigh) &&
  todaysHighestHigh <= prevSessionHigh;

const testedPrevLow =
  todaysLowestLow !== null &&
  prevSessionLow !== null &&
  Math.abs(todaysLowestLow - prevSessionLow) <= getTestThreshold(prevSessionLow) &&
  todaysLowestLow >= prevSessionLow;

  let breakoutTestSignal = '';
  if (testedPrevHigh) breakoutTestSignal = '🟡 Tested & Failed to Break Previous High';
  else if (testedPrevLow) breakoutTestSignal = '🟡 Tested & Failed to Break Previous Low';


// Get the start times for the last N sessions at 8AM UTC
const getLastNSessionStartTimes = (n: number): number[] => {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const date = now.getUTCDate();

  const today8AM_UTC = getUTCMillis(year, month, date, 8, 0);
  const isAfter8AM = now.getTime() >= today8AM_UTC;

  const baseDate = isAfter8AM ? date : date - 1;

  const sessionStarts: number[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const sessionDate = baseDate - i;
    sessionStarts.push(getUTCMillis(year, month, sessionDate, 8, 0));
  }

  return sessionStarts;
};

// Extract session highs from your candle data
const getRecentSessionHighs = (
  ohlcvData: { timestamp: number; high: number }[],
  sessionStartTimes: number[]
): number[] => {
  return sessionStartTimes.map((start, i) => {
    const end = i < sessionStartTimes.length - 1 ? sessionStartTimes[i + 1] : Infinity;
    const candles = ohlcvData.filter(c => c.timestamp >= start && c.timestamp < end);
    return candles.length ? Math.max(...candles.map(c => c.high)) : 0;
  });
};

// Detect pattern types based on highs
const detectTopPatterns = (highs: number[]) => {
  const recentTop = highs.at(-1);
  const previousTops = highs.slice(0, -1).filter(h => h > 0);

  if (!recentTop || previousTops.length === 0) {
    return { isDoubleTop: false, isDescendingTop: false, isDoubleTopFailure: false };
  }

  const lastTop = previousTops.at(-1);
  const isDoubleTop =
    Math.abs(recentTop - lastTop!) / lastTop! < 0.003 &&
    recentTop < Math.max(...previousTops);

  const isDescendingTop = previousTops
    .slice(-3)
    .every((h, i, arr) => i === 0 || h < arr[i - 1]);

  const isDoubleTopFailure = recentTop > Math.max(...previousTops);

  return { isDoubleTop, isDescendingTop, isDoubleTopFailure };
};

// Detect top patterns from last N sessions
const sessionStartTimes = getLastNSessionStartTimes(10);
const sessionHighs = getRecentSessionHighs(candles, sessionStartTimes);       
const sessionLows = getRecentSessionLows(candles, sessionStartTimes);


const getRecentSessionLows = (
  ohlcvData: { timestamp: number; low: number }[],
  sessionStartTimes: number[]
): number[] => {
  return sessionStartTimes.map((start, i) => {
    const end = i < sessionStartTimes.length - 1 ? sessionStartTimes[i + 1] : Infinity;
    const candles = ohlcvData.filter(c => c.timestamp >= start && c.timestamp < end);
    return candles.length ? Math.min(...candles.map(c => c.low)) : Infinity;
  });
};

        // Detect bottom pattern types
const detectBottomPatterns = (lows: number[]) => {
  const recentLow = lows.at(-1);
  const previousLows = lows.slice(0, -1).filter(l => l < Infinity);

  if (!recentLow || previousLows.length === 0) {
    return { isDoubleBottom: false, isAscendingBottom: false, isDoubleBottomFailure: false };
  }

  const lastLow = previousLows.at(-1);
  const isDoubleBottom =
    Math.abs(recentLow - lastLow!) / lastLow! < 0.003 &&
    recentLow > Math.min(...previousLows);

  const isAscendingBottom = previousLows
    .slice(-3)
    .every((l, i, arr) => i === 0 || l > arr[i - 1]);

  const isDoubleBottomFailure = recentLow < Math.min(...previousLows);

  return { isDoubleBottom, isAscendingBottom, isDoubleBottomFailure };
};
        
const { isDoubleTop, isDescendingTop, isDoubleTopFailure } = detectTopPatterns(sessionHighs);
const { isDoubleBottom, isAscendingBottom, isDoubleBottomFailure } = detectBottomPatterns(sessionLows);
        

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
  closes: number[]
): boolean => {
  const len = closes.length;
  if (len < 5) return false;


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
  closes: number[]
): boolean => {
  const len = closes.length;
  if (len < 5) return false;

  

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
  testedPrevHighCount,   // ✅ New
  testedPrevLowCount,    // ✅ New
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
  testedPrevHigh,
  testedPrevLow,
     isDoubleTop,
  isDescendingTop,
  isDoubleTopFailure,
  isDoubleBottom,
  isAscendingBottom,
  isDoubleBottomFailure,       
  breakoutTestSignal,
  breakoutFailure,
  failedBearishBreak,
  failedBullishBreak,
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
    { label: 'Breakout Failure', key: 'breakoutFailure' },
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
  {[
    'IMPULSE SIGNAL',
    'IMPULSE SIGNAL / BUY',
    'IMPULSE SIGNAL / SELL',
    'POSSIBLE REVERSE',
  ].map((type) => (
    <button
      key={type}
      onClick={() => setSignalFilter(signalFilter === type ? null : type)}
      className={`px-3 py-1 rounded-full ${
        signalFilter === type ? 'bg-green-500 text-black' : 'bg-gray-700 text-white'
      }`}
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
        <span className="text-gray-300">🚀 Bull Breakout:</span>
        <span className="text-yellow-300 font-bold">{bullishBreakoutCount}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-gray-300">📉 Bear Breakout:</span>
        <span className="text-yellow-400 font-bold">{bearishBreakoutCount}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-gray-300">📈 Breakout Failure:</span>
        <span className="text-green-400 font-bold">{breakoutFailureCount}</span>
      </div>
    </div>

    {/* ✅ Signal Summary */}
      <div className="flex items-center gap-2">
        <span className="text-yellow-300 font-semibold">⚠️ POSSIBLE REVERSE:</span>
        <span>{signalCounts.possibleReverse}</span>
      </div>
       {/* 🔥 New IMPULSE SIGNAL block */}
  <div className="flex items-center gap-2">
    <span className="text-purple-400 font-semibold">⚡ IMPULSE SIGNAL:</span>
    <span>{signalCounts.impulseSignal}</span>
  </div>
       <div className="flex items-center gap-2">
    <span className="text-green-500 font-semibold">⚡ IMPULSE BUY:</span>
    <span>{signalCounts.impulseBuy}</span>
  </div>
  <div className="flex items-center gap-2">
    <span className="text-red-500 font-semibold">⚡ IMPULSE SELL:</span>
    <span>{signalCounts.impulseSell}</span>
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
      <th className="px-1 py-0.5 text-center">Bull BO</th>
      <th className="px-1 py-0.5 text-center">Bear BO</th>
      <th className="px-1 py-0.5 text-center">Trend (200)</th>
      <th className="px-1 py-0.5 text-center">Bear Rev</th>
      <th className="px-1 py-0.5 text-center">Bull Rev</th>
        <th className="px-1 py-0.5 text-center">Tested High</th>
    <th className="px-1 py-0.5 text-center">Tested Low</th>
      <th className="px-1 py-0.5 text-center">Breakout Fail</th>
      <th className="px-1 py-0.5 text-center">Top Pattern</th>
<th className="px-1 py-0.5 text-center">Bottom Pattern</th>
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
      <th className="px-1 py-0.5 text-center">Collapse</th>
      <th className="px-1 py-0.5 text-center">Spike</th>
       <th className="px-1 py-0.5 min-w-[60px] text-center">Signal</th>
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

    const isAbove35 = (val: number | undefined) => val !== undefined && val >= 35;
    

    const validPump = pump !== undefined && pump !== 0;
    const validDump = dump !== undefined && dump !== 0;
    const pumpOrDumpImpulse = inRange(pump, 23, 26) || inRange(dump, 23, 26);
    const pumpOrDumpAbove35 = isAbove35(pump) || isAbove35(dump);

    let signal = '';

    // Custom breakout + reversal signal logic
    if (
  !s.breakout &&
  s.mainTrend === 'bearish' &&
  s.testedPrevLow &&
  s.failedBearishBreak &&
  validPump &&
  validDump
) {
  signal = 'IMPULSE SIGNAL / BUY';
} else if (
  !s.breakout &&
  s.mainTrend === 'bullish' &&
  s.testedPrevHigh &&
  s.failedBullishBreak &&
  validPump &&
  validDump
) {
  signal = 'IMPULSE SIGNAL / SELL';
} else if (pumpOrDumpImpulse) {
  signal = 'IMPULSE SIGNAL';
} else if (
  pumpOrDumpAbove35 &&
  (s.bullishSpike || s.bearishCollapse || s.bearishReversal || s.bullishReversal)
) {
  signal = 'POSSIBLE REVERSE';
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
        <td className={`px-1 py-0.5 text-center ${s.bullishBreakout ? 'text-green-400' : 'text-gray-500'}`}>
          {s.bullishBreakout ? 'Yes' : 'No'}
        </td>
        <td className={`px-1 py-0.5 text-center ${s.bearishBreakout ? 'text-red-400' : 'text-gray-500'}`}>
          {s.bearishBreakout ? 'Yes' : 'No'}
        </td>
        <td className={`px-1 py-0.5 text-center ${s.mainTrend === 'bullish' ? 'text-green-500' : 'text-red-500'}`}>
          {s.mainTrend}
        </td>
        <td className={`px-1 py-0.5 text-center ${s.bearishReversal ? 'bg-green-900 text-white' : 'text-gray-500'}`}>
          {s.bearishReversal ? 'Yes' : 'No'}
        </td>
        <td className={`px-1 py-0.5 text-center ${s.bullishReversal ? 'bg-red-900 text-white' : 'text-gray-500'}`}>
          {s.bullishReversal ? 'Yes' : 'No'}
        </td>
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
  {
    s.isDoubleTopFailure ? 'Top Fail' :
    s.isDoubleTop ? 'Double Top' :
    s.isDescendingTop ? 'Descending Top' : '-'
  }
</td>

<td className="px-1 py-0.5 text-center text-green-400 font-semibold">
  {
    s.isDoubleBottomFailure ? 'Bottom Fail' :
    s.isDoubleBottom ? 'Double Bottom' :
    s.isAscendingBottom ? 'Ascending Bottom' : '-'
  }
</td>
        <td
          className={`text-center ${
            pump !== undefined
              ? pump > 35
                ? 'text-green-400'
                : inRange(pump, 19, 23)
                ? 'text-blue-400'
                : 'text-white'
              : 'text-gray-500'
          }`}
        >
          {pump?.toFixed(2) ?? 'N/A'}
        </td>
        <td
          className={`text-center ${
            dump !== undefined
              ? dump > 35
                ? 'text-red-400'
                : inRange(dump, 19, 23)
                ? 'text-blue-400'
                : 'text-white'
              : 'text-gray-500'
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
          className={`px-1 py-0.5 min-w-[40px] text-center font-semibold ${
            signal === 'POSSIBLE REVERSE'
              ? 'text-yellow-300'
              : signal === 'IMPULSE SIGNAL / BUY'
              ? 'text-green-500 font-bold'
              : signal === 'IMPULSE SIGNAL / SELL'
              ? 'text-red-500 font-bold'
              : signal === 'IMPULSE SIGNAL'
              ? 'text-purple-400 font-bold'
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
  
