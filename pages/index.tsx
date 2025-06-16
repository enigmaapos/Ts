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

function calculateRSI(closes: number[], period = 14) {
  const rsi: number[] = [];
  let gains = 0;
  let losses = 0;

  for (let i = 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (i <= period) {
      if (diff > 0) gains += diff;
      else losses -= diff;

      if (i === period) {
        const avgGain = gains / period;
        const avgLoss = losses / period;
        const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
        rsi.push(100 - 100 / (1 + rs));
      } else {
        rsi.push(NaN);
      }
    } else {
      const gain = diff > 0 ? diff : 0;
      const loss = diff < 0 ? -diff : 0;
      gains = (gains * (period - 1) + gain) / period;
      losses = (losses * (period - 1) + loss) / period;
      const rs = losses === 0 ? 100 : gains / losses;
      rsi.push(100 - 100 / (1 + rs));
    }
  }

  rsi.unshift(...Array(closes.length - rsi.length).fill(NaN));
  return rsi;
}

function detectRSIDivergenceRelativeToEMA200(
  closes: number[],
  rsi14: number[],
  ema200: number[]
): {
  descendingAboveEMA200: boolean;
  ascendingBelowEMA200: boolean;
} {
  const len = closes.length;
  if (len < 3) {
    return { descendingAboveEMA200: false, ascendingBelowEMA200: false };
  }

  // Check last 3 bars
  const rsi1 = rsi14[len - 3];
  const rsi2 = rsi14[len - 2];
  const rsi3 = rsi14[len - 1];

  const close1 = closes[len - 3];
  const close2 = closes[len - 2];
  const close3 = closes[len - 1];

  const ema1 = ema200[len - 3];
  const ema2 = ema200[len - 2];
  const ema3 = ema200[len - 1];

  // RSI descending + all closes above EMA200
  const descendingAboveEMA200 =
    rsi1 > rsi2 && rsi2 > rsi3 &&
    close1 > ema1 && close2 > ema2 && close3 > ema3;

  // RSI ascending + all closes below EMA200
  const ascendingBelowEMA200 =
    rsi1 < rsi2 && rsi2 < rsi3 &&
    close1 < ema1 && close2 < ema2 && close3 < ema3;

  return {
    descendingAboveEMA200,
    ascendingBelowEMA200,
  };
}

function getMainTrend(close: number, ema200: number): 'bullish' | 'bearish' {
  return close >= ema200 ? 'bullish' : 'bearish';
}

function findRelevantLevel(
  ema14: number[],
  ema70: number[],
  closes: number[],
  highs: number[],
  lows: number[],
  trend: 'bullish' | 'bearish'
): { level: number | null; type: 'support' | 'resistance' | null } {
  for (let i = ema14.length - 2; i >= 1; i--) {
    const prev14 = ema14[i - 1];
    const prev70 = ema70[i - 1];
    const curr14 = ema14[i];
    const curr70 = ema70[i];

    if (trend === 'bullish' && prev14 < prev70 && curr14 > curr70) {
      return { level: closes[i], type: 'support' };
    }

    if (trend === 'bearish' && prev14 > prev70 && curr14 < curr70) {
      return { level: closes[i], type: 'resistance' };
    }
  }

  const level = trend === 'bullish' ? Math.max(...highs) : Math.min(...lows);
  const type = trend === 'bullish' ? 'resistance' : 'support';
  return { level, type };
       }


export default function Home() {
  const [signals, setSignals] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [lastUpdatedMap, setLastUpdatedMap] = useState<{ [symbol: string]: number }>({});
  const [loading, setLoading] = useState(true);
  


  const filteredSignals = signals.filter((s) =>
    s.symbol.toLowerCase().includes(search.toLowerCase())
  );

    // ✅ Declare counts here (inside the component, after filteredSignals)
const bullishMainTrendCount = filteredSignals.filter(s => s.mainTrend === 'bullish').length;
const bearishMainTrendCount = filteredSignals.filter(s => s.mainTrend === 'bearish').length;
const bullishPullBackCount = filteredSignals.filter(s => s.bullishContinuation).length;
const bearishPullBackCount = filteredSignals.filter(s => s.bearishContinuation).length;
const bullishSpikeCount = filteredSignals.filter(s => s.bullishContinuation).length;
const bearishSpikeCount = filteredSignals.filter(s => s.bearishContinuation).length;

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

// Trend from EMA14 vs EMA70 (short-term trend)
const trend = lastEMA14 > lastEMA70 ? "bullish" : "bearish";

// Main trend from candle vs EMA200 (long-term trend)
const mainTrend = lastClose >= lastEMA200 ? "bullish" : "bearish";

console.log('Short-term trend (EMA14/70):', trend);
console.log('Main trend (Close vs EMA200):', mainTrend);
        


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

    // ✅ Updated divergence logic
          const currentRSI = rsi14.at(-1);
          const prevHighIdx = highs.lastIndexOf(prevSessionHigh!);
          const prevLowIdx = lows.lastIndexOf(prevSessionLow!);
          const prevHighRSI = prevHighIdx !== -1 ? rsi14[prevHighIdx] : null;
          const prevLowRSI = prevLowIdx !== -1 ? rsi14[prevLowIdx] : null;

          let divergenceType: 'bullish' | 'bearish' | null = null;
          if (
            lows.at(-1)! < prevSessionLow! &&
            prevLowRSI !== null &&
            currentRSI !== undefined &&
            currentRSI > prevLowRSI
          ) {
            divergenceType = 'bullish';
          } else if (
            highs.at(-1)! > prevSessionHigh! &&
            prevHighRSI !== null &&
            currentRSI !== undefined &&
            currentRSI < prevHighRSI
          ) {
            divergenceType = 'bearish';
          }

          const divergence = divergenceType !== null;
          const nearOrAtEMA70Divergence = divergence && (Math.abs(lastClose - lastEMA70) / lastClose < 0.002);

          const nearEMA14 = closes.slice(-3).some(c => Math.abs(c - lastEMA14) / c < 0.002);
          const nearEMA70 = closes.slice(-3).some(c => Math.abs(c - lastEMA70) / c < 0.002);
        	const nearEMA200 = closes.slice(-3).some(c => Math.abs(c - lastEMA200) / c < 0.002);
          const ema14Bounce = nearEMA14 && lastClose > lastEMA14;
          const ema70Bounce = nearEMA70 && lastClose > lastEMA70;
        	const ema200Bounce = nearEMA200 && lastClose > lastEMA200;

          const { level, type } = findRelevantLevel(ema14, ema70, closes, highs, lows, trend);
          const highestHigh = Math.max(...highs);
          const lowestLow = Math.min(...lows);
          const inferredLevel = trend === 'bullish' ? highestHigh : lowestLow;
          const inferredLevelType = trend === 'bullish' ? 'resistance' : 'support';

           let divergenceFromLevel = false;
          let divergenceFromLevelType: 'bullish' | 'bearish' | null = null;

          if (type && level !== null) {
            const levelIdx = closes.findIndex(c => Math.abs(c - level) / c < 0.002);
            if (levelIdx !== -1) {
              const pastRSI = rsi14[levelIdx];
              if (type === 'resistance' && lastClose > level && currentRSI! < pastRSI) {
                divergenceFromLevel = true;
                divergenceFromLevelType = 'bearish';
              } else if (type === 'support' && lastClose < level && currentRSI! > pastRSI) {
                divergenceFromLevel = true;
                divergenceFromLevelType = 'bullish';
              }
            }
          }
        
        
          const touchedEMA70Today =
            prevSessionHigh! >= lastEMA70 &&
            prevSessionLow! <= lastEMA70 &&
            candlesToday.some(c => Math.abs(c.close - lastEMA70) / c.close < 0.002);

        const touchedEMA200Today =
  prevSessionHigh! >= lastEMA200 &&
  prevSessionLow! <= lastEMA200 &&
  candlesToday.some(c => Math.abs(c.close - lastEMA200) / c.close < 0.002);

          const differenceVsEMA70 = ((level! - lastEMA70) / lastEMA70) * 100;

const detectBullishPullBack = (
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
  if (len < 3) return false;

  // ✅ Proceed only if there's a breakout (bullish or bearish)
  if (!bullishBreakout && !bearishBreakout) return false;

  // 1. Confirm bullish trend
  if (ema14[len - 1] <= ema70[len - 1]) return false;

  // 2. Find EMA14 crossing above EMA70
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

  let lastLow: number | null = null;

  for (let i = crossoverIndex + 1; i < len; i++) {
    const nearEMA = Math.abs(closes[i] - ema70[i]) / closes[i] < 0.005;
    const fallingRSI = rsi14[i] < crossoverRSI;
    const higherThanCrossover = closes[i] > crossoverLow;

    const currentLow = lows[i];
    const isAscendingLow = lastLow !== null && currentLow > lastLow;

    if (nearEMA) {
      if (lastLow === null || currentLow > lastLow) {
        lastLow = currentLow;
      }

      if (isAscendingLow && fallingRSI && higherThanCrossover) {
        return true;
      }
    }
  }

  return false;
};

const detectBearishPullBack = (
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
  if (len < 3) return false;

  // ✅ Proceed only if there's a breakout (bullish or bearish)
  if (!bullishBreakout && !bearishBreakout) return false;

  // 1. Confirm bearish trend
  if (ema14[len - 1] >= ema70[len - 1]) return false;

  // 2. Find EMA14 crossing below EMA70
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

  let lastHigh: number | null = null;

  for (let i = crossoverIndex + 1; i < len; i++) {
    const nearEMA = Math.abs(closes[i] - ema70[i]) / closes[i] < 0.005;
    const risingRSI = rsi14[i] > crossoverRSI;
    const lowerThanCrossover = closes[i] < crossoverHigh;

    const currentHigh = highs[i];
    const isLowerHigh = lastHigh !== null && currentHigh < lastHigh;

    if (nearEMA) {
      if (lastHigh === null || currentHigh < lastHigh) {
        lastHigh = currentHigh;
      }

      if (isLowerHigh && risingRSI && lowerThanCrossover) {
        return true;
      }
    }
  }

  return false;
};        


    
// Usage
const bullishPullBack = detectBullishPullBack(ema14, ema70, rsi14, lows, highs, closes, bullishBreakout, bearishBreakout);
const bearishPullBack = detectBearishPullBack(ema14, ema70, rsi14, highs, lows, closes, bullishBreakout, bearishBreakout);


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
  let lowestLowAfterCrossover = crossoverLow;

  for (let i = crossoverIndex + 1; i < len; i++) {
    const currentLow = lows[i];
    const close = closes[i];
    const high = highs[i];
    const ema70Value = ema70[i];
    const ema200Value = ema200[i];
    const rsi = rsi14[i];

    if (currentLow < lowestLowAfterCrossover) {
      lowestLowAfterCrossover = currentLow;
    }

    const nearEMA = high >= ema70Value && currentLow <= ema70Value;
    const aboveEMA = close > ema70Value;
    const nearOrAboveEMA = nearEMA || aboveEMA;

    const aboveEMA200 = close > ema200Value;
    const ascendingLow = currentLow > lowestLowAfterCrossover;
    const fallingRSI = rsi < crossoverRSI;
    const higherThanCrossover = close > crossoverLow;

    if (
      nearOrAboveEMA &&
      aboveEMA200 &&
      ascendingLow &&
      fallingRSI &&
      higherThanCrossover
    ) {
      return true;
    }
  }

  return false;
};
        
const detectBearishSpike = (
  ema14: number[],
  ema70: number[],
  ema200: number[],
  rsi14: number[],
  highs: number[],
  lows: number[],
  closes: number[],
  bullishBreakout: boolean,
  bearishBreakout: boolean
): boolean => {
  const breakout = bullishBreakout || bearishBreakout;
  if (!breakout || !bearishBreakout) return false;

  const len = closes.length;
  if (len < 3) return false;

  if (ema14[len - 1] >= ema70[len - 1]) return false;

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
  let highestHighAfterCrossover = crossoverHigh;

  for (let i = crossoverIndex + 1; i < len; i++) {
    const currentHigh = highs[i];
    const close = closes[i];
    const low = lows[i];
    const ema70Value = ema70[i];
    const ema200Value = ema200[i];
    const rsi = rsi14[i];

    if (currentHigh > highestHighAfterCrossover) {
      highestHighAfterCrossover = currentHigh;
    }

    const nearEMA = currentHigh >= ema70Value && low <= ema70Value;
    const belowEMA = close < ema70Value;
    const nearOrBelowEMA = nearEMA || belowEMA;

    const belowEMA200 = close < ema200Value;
    const descendingHigh = currentHigh < highestHighAfterCrossover;
    const risingRSI = rsi > crossoverRSI;
    const lowerThanCrossover = close < crossoverHigh;

    if (
      nearOrBelowEMA &&
      belowEMA200 &&
      descendingHigh &&
      risingRSI &&
      lowerThanCrossover
    ) {
      return true;
    }
  }

  return false;
};
      const bullishSpike = detectBullishSpike(ema14, ema70, ema200, rsi14, lows, highs, closes, bullishBreakout, bearishBreakout);
const bearishSpike = detectBearishSpike(ema14, ema70, ema200, rsi14, highs, lows, closes, bullishBreakout, bearishBreakout);  

        const rsiDivergence = detectRSIDivergenceRelativeToEMA200(closes, rsi14, ema200);

if (rsiDivergence.descendingAboveEMA200) {
  console.log("RSI is falling while price is above EMA200");
}

if (rsiDivergence.ascendingBelowEMA200) {
  console.log("RSI is rising while price is below EMA200");
}

        
        return {
  symbol,
  bullishMainTrendCount,
  bearishMainTrendCount,
  bullishPullBackCount,
  bearishPullBackCount,
  bullishSpikeCount,
  bearishSpikeCount,
  bullishBreakoutCount,
  bearishBreakoutCount,
  rsiDivergence,
  mainTrend,
  trend,
  breakout,
  bullishBreakout,
  bearishBreakout,
  divergence,
  divergenceType,
  ema14Bounce,
  ema70Bounce,
  ema200Bounce,
  nearOrAtEMA70Divergence,
  touchedEMA70Today,
  touchedEMA200Today,
  inferredLevel: level!,
  inferredLevelType: type!,
  inferredLevelWithinRange: level! <= todaysHighestHigh! && level! >= todaysLowestLow!,
  differenceVsEMA70,
  divergenceFromLevel,
  divergenceFromLevelType,
  lastOpen,
  lastClose,
  bearishPullBack,
  bullishPullBack,
  bearishSpike,
  bullishSpike,
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

      <div className="mb-4">
        <input
          type="text"
          placeholder="Search symbol..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="p-2 rounded bg-gray-800 text-white border border-gray-600 focus:outline-none focus:ring-2 focus:ring-yellow-400"
        />     
  <div className="sticky left-0 top-0 bg-gray-900 p-4 z-30 text-white text-sm md:text-base border-r border-gray-700">
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
      <span>Bullish Pull Back:</span>
      <span className="text-green-300 font-semibold">{bullishContinuationCount}</span>
    </div>
    <div className="flex items-center gap-1">
      <span>Bearish Pull Back:</span>
      <span className="text-red-300 font-semibold">{bearishContinuationCount}</span>
    </div>
    <div className="flex items-center gap-1">
      <span>Bullish Spike:</span>
      <span className="text-green-300 font-semibold">{bullishContinuationCount}</span>
    </div>
    <div className="flex items-center gap-1">
      <span>Bearish Spike:</span>
      <span className="text-red-300 font-semibold">{bearishContinuationCount}</span>
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
      </div>      
      <div className="overflow-auto max-h-[80vh] border border-gray-700 rounded">
  <table className="min-w-[1600px] text-xs border-collapse">
    <thead className="bg-gray-800 text-yellow-300 sticky top-0 z-20">
      <tr>
        <th className="p-2 bg-gray-800 sticky left-0 z-30 text-left align-middle">Symbol</th>
        <th className="p-2 text-center align-middle">Trend</th>
        <th className="p-2 text-center align-middle">Inferred Level Type</th>
        <th className="p-2 text-center align-middle">Touched EMA70</th>
        <th className="p-2 text-center align-middle">Touched EMA200</th>
        <th className="p-2 text-center align-middle">Breakout</th>
        <th className="p-2 text-center align-middle">Bullish Break</th>
        <th className="p-2 text-center align-middle">Bearish Break</th>
        <th className="p-2 text-center align-middle">Main Trend (ema200)</th>
        <th className="p-2 text-center align-middle">Bearish Pull Back.</th>
        <th className="p-2 text-center align-middle">Bullish Pull Back.</th>
        <th className="p-2 text-center align-middle">Bearish Spike</th>
        <th className="p-2 text-center align-middle">Bullish Spike</th>
        <th className="p-2 text-center align-middle">RSI Divergence</th>
      </tr>
    </thead>
    <tbody>
      {filteredSignals.map((s) => {
        const updatedRecently = Date.now() - (lastUpdatedMap[s.symbol] || 0) < 5000;
        return (
          <tr
            key={s.symbol}
            className={`border-b border-gray-700 transition-all duration-300 hover:bg-yellow-800/20 ${
              updatedRecently ? 'bg-yellow-900/30' : ''
            }`}
          >
            <td className="p-2 font-bold bg-gray-900 sticky left-0 z-10 hover:cursor-pointer text-left align-middle">
              {s.symbol}
            </td>
            <td className="p-2 text-center align-middle">{s.trend}</td>
            <td className="p-2 text-center align-middle">{s.inferredLevelType}</td>
            <td className="p-2 text-center align-middle">{s.touchedEMA70Today ? 'Yes' : 'No'}</td>
            <td
              className={`p-2 text-center align-middle ${
                s.touchedEMA200Today ? 'text-yellow-400 font-semibold' : 'text-gray-500'
              }`}
            >
              {s.touchedEMA200Today ? 'Yes' : 'No'}
            </td>
            <td className="p-2 text-center align-middle">{s.breakout ? 'Yes' : 'No'}</td>
            <td
              className={`p-2 text-center align-middle ${
                s.bullishBreakout ? 'text-green-400 font-semibold' : 'text-gray-500'
              }`}
            >
              {s.bullishBreakout ? 'Yes' : 'No'}
            </td>
            <td
              className={`p-2 text-center align-middle ${
                s.bearishBreakout ? 'text-red-400 font-semibold' : 'text-gray-500'
              }`}
            >
              {s.bearishBreakout ? 'Yes' : 'No'}
            </td>
            <td
              className={`p-2 text-center align-middle font-semibold ${
                s.mainTrend === 'bullish' ? 'text-green-500' : 'text-red-500'
              }`}
            >
              {s.mainTrend}
            </td>
            <td
              className={`p-2 text-center align-middle ${
                s.bearishPullback
                  ? 'bg-red-900 text-white'
                  : 'bg-gray-800 text-gray-500'
              }`}
            >
              {s.bearishPullback ? 'Yes' : 'No'}
            </td>
            <td
              className={`p-2 text-center align-middle ${
                s.bullishPullBack
                  ? 'bg-green-900 text-white'
                  : 'bg-gray-800 text-gray-500'
              }`}
            >
              {s.bullishPullBack ? 'Yes' : 'No'}
            </td>
            
            <td
              className={`p-2 text-center align-middle ${
                s.bearishSpike
                  ? 'bg-red-900 text-white'
                  : 'bg-gray-800 text-gray-500'
              }`}
            >
              {s.bearishSpike ? 'Yes' : 'No'}
            </td>
            <td
              className={`p-2 text-center align-middle ${
                s.bullishSpike
                  ? 'bg-green-900 text-white'
                  : 'bg-gray-800 text-gray-500'
              }`}
            >
              {s.bullishSpike ? 'Yes' : 'No'}
            </td>   <td
        className={`p-2 text-center align-middle ${
          s.rsiDivergence.descendingAboveEMA200
            ? 'bg-yellow-900 text-yellow-300'
            : s.rsiDivergence.ascendingBelowEMA200
            ? 'bg-blue-900 text-blue-300'
            : 'bg-gray-800 text-gray-500'
        }`}
      >
        {s.rsiDivergence.descendingAboveEMA200
          ? '↓ RSI is falling'
          : s.rsiDivergence.ascendingBelowEMA200
          ? '↑ RSI is rising'
          : '–'}
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
  
