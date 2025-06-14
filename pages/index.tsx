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
    const curr14 = ema14[i];
    const prev70 = ema70[i - 1];
    const curr70 = ema70[i];

    // Bullish crossover
    if (trend === 'bullish' && prev14 < prev70 && curr14 > curr70) {
      const diffPrev = prev14 - prev70;
      const diffCurr = curr14 - curr70;
      const t = diffPrev / (diffPrev - diffCurr);
      const crossoverPrice = closes[i - 1] + t * (closes[i] - closes[i - 1]);

      return { level: crossoverPrice, type: 'support' };
    }

    // Bearish crossover
    if (trend === 'bearish' && prev14 > prev70 && curr14 < curr70) {
      const diffPrev = prev14 - prev70;
      const diffCurr = curr14 - curr70;
      const t = diffPrev / (diffPrev - diffCurr);
      const crossoverPrice = closes[i - 1] + t * (closes[i] - closes[i - 1]);

      return { level: crossoverPrice, type: 'resistance' };
    }
  }

  // Fallback: if no crossover detected
  const level = trend === 'bullish' ? Math.max(...highs) : Math.min(...lows);
  const type = trend === 'bullish' ? 'resistance' : 'support';
  return { level, type };
}


export default function Home() {
  const [signals, setSignals] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [lastUpdatedMap, setLastUpdatedMap] = useState<{ [symbol: string]: number }>({});

  const filteredSignals = signals.filter((s) =>
    s.symbol.toLowerCase().includes(search.toLowerCase())
  );

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
        const rsi14 = calculateRSI(closes);

        const lastOpen = candles.at(-1)?.open!;
const lastClose = candles.at(-1)?.close!;
        const lastEMA14 = ema14.at(-1)!;
        const lastEMA70 = ema70.at(-1)!;
        const trend = lastEMA14 > lastEMA70 ? "bullish" : "bearish";


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
          const ema14Bounce = nearEMA14 && lastClose > lastEMA14;
          const ema70Bounce = nearEMA70 && lastClose > lastEMA70;

          const { level, type } = findRelevantLevel(ema14, ema70, closes, highs, lows, trend);
          const highestHigh = Math.max(...highs);
          const lowestLow = Math.min(...lows);
          const inferredLevel = trend === 'bullish' ? highestHigh : lowestLow;
          const inferredLevelType = trend === 'bullish' ? 'resistance' : 'support';

        let divergenceFromLevel = false;
let divergenceFromLevelType: 'bullish' | 'bearish' | null = null;
let divergenceFromLevelDistance: number | null = null;
let divergenceProximity: 'near' | 'far' | null = null;
let minutesAgo: number | null = null;
        let crossoverPrice: number | null = null;

        

if (type && level !== null) {
  const levelIdx = closes.findIndex(c => Math.abs(c - level) / c < 0.002);

  if (levelIdx !== -1) {
    const pastRSI = rsi14[levelIdx];

    if (type === 'resistance' && lastClose > level && currentRSI! < pastRSI) {
      divergenceFromLevel = true;
      divergenceFromLevelType = 'bearish';
      divergenceFromLevelDistance = closes.length - 1 - levelIdx;
    } else if (type === 'support' && lastClose < level && currentRSI! > pastRSI) {
      divergenceFromLevel = true;
      divergenceFromLevelType = 'bullish';
      divergenceFromLevelDistance = closes.length - 1 - levelIdx;
    }
  }
}

if (divergenceFromLevelDistance !== null) {
  divergenceProximity = divergenceFromLevelDistance <= 5 ? 'near' : 'far';
  minutesAgo = divergenceFromLevelDistance * 15; // assuming 15-minute candles
}
          

        
        
          const touchedEMA70Today =
            prevSessionHigh! >= lastEMA70 &&
            prevSessionLow! <= lastEMA70 &&
            candlesToday.some(c => Math.abs(c.close - lastEMA70) / c.close < 0.002);

          const differenceVsEMA70 = ((level! - lastEMA70) / lastEMA70) * 100;

const detectBullishContinuation = (
  ema14: number[],
  ema70: number[],
  rsi14: number[],
  lows: number[],
  closes: number[]
): boolean => {
  const len = closes.length;
  if (len < 3) return false;

  // 1. Confirm bullish trend
  if (ema14[len - 1] <= ema70[len - 1]) return false;

  // 2. Find recent crossover (EMA14 crosses above EMA70)
  let crossoverIndex = -1;
  for (let i = len - 2; i >= 1; i--) {
    if (ema14[i] <= ema70[i] && ema14[i + 1] > ema70[i + 1]) {
      crossoverIndex = i + 1;
      break;
    }
  }
  if (crossoverIndex === -1) return false;

  // 3. Save crossover low and RSI
  const crossoverLow = lows[crossoverIndex];
  const crossoverRSI = rsi14[crossoverIndex];

  // 4–6. Confirm continuation structure
  for (let i = crossoverIndex + 1; i < len; i++) {
    const nearEMA = highs[i] >= ema70[i] && lows[i] <= ema70[i];
    const risingRSI = rsi14[i] > crossoverRSI;
    const higherThanCrossover = closes[i] > crossoverLow;

    if (nearEMA && risingRSI && higherThanCrossover) {
      return true;
    }
  }

  return false;
};

const detectBearishContinuation = (
  ema14: number[],
  ema70: number[],
  rsi14: number[],
  highs: number[],
  closes: number[]
): boolean => {
  const len = closes.length;
  if (len < 3) return false;

  // 1. Confirm bearish trend
  if (ema14[len - 1] >= ema70[len - 1]) return false;

  // 2. Find recent crossover (EMA14 crosses below EMA70)
  let crossoverIndex = -1;
  for (let i = len - 2; i >= 1; i--) {
    if (ema14[i] >= ema70[i] && ema14[i + 1] < ema70[i + 1]) {
      crossoverIndex = i + 1;
      break;
    }
  }
  if (crossoverIndex === -1) return false;

  // 3. Save crossover high and RSI
  const crossoverHigh = highs[crossoverIndex];
  const crossoverRSI = rsi14[crossoverIndex];

  // 4–6. Confirm continuation structure
  for (let i = crossoverIndex + 1; i < len; i++) {
    const nearEMA = highs[i] >= ema70[i] && lows[i] <= ema70[i];
    const risingRSI = rsi14[i] > crossoverRSI;
    const lowerThanCrossover = closes[i] < crossoverHigh;

    if (nearEMA && risingRSI && lowerThanCrossover) {
      return true;
    }
  }

  return false;
};

// Usage
const bearishContinuation = detectBearishContinuation(ema14, ema70, rsi14, highs, closes);
const bullishContinuation = detectBullishContinuation(ema14, ema70, rsi14, lows, closes);
        
        return {
  symbol,
  trend,
          crossoverPrice,
  breakout,
  bullishBreakout,
  bearishBreakout,
  divergence,
  divergenceType,
  ema14Bounce,
  ema70Bounce,
  nearOrAtEMA70Divergence,
  touchedEMA70Today,
  inferredLevel: level!,
  inferredLevelType: type!,
  inferredLevelWithinRange: level! <= todaysHighestHigh! && level! >= todaysLowestLow!,
  differenceVsEMA70,
  divergenceFromLevel,
  divergenceFromLevelType,
  divergenceFromLevelDistance,
  divergenceProximity,
  minutesAgo,
  lastOpen,
  lastClose,
  bearishContinuation,
  bullishContinuation,
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
      fetchBatch();
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
      </div>

      <div className="overflow-auto max-h-[80vh] border border-gray-700 rounded">
        <table className="min-w-[1600px] text-xs border-collapse">
          <thead className="bg-gray-800 text-yellow-300 sticky top-0 z-20">
            <tr>
              <th className="p-2 bg-gray-800 sticky left-0 z-30">Symbol</th>
  <th className="p-2">Trend</th>
  <th className="p-2">Crossover Price</th>
              <th className="p-2">Breakout</th>
              <th className="p-2">Bullish Break</th>
              <th className="p-2">Bearish Break</th>
                   <th className="p-2">Divergence</th>
          <th className="p-2">Diverge Type</th>
          <th className="p-2">EMA14 Bounce</th>
          <th className="p-2">EMA70 Bounce</th>
          <th className="p-2">Near EMA70 Diverge</th>
          <th className="p-2">Touched EMA70</th>
          <th className="p-2">Bearish Cont.</th>
          <th className="p-2">Bullish Cont.</th>
          <th className="p-2">Inferred Level</th>
          <th className="p-2">Level Type</th>
          <th className="p-2">Level In Range</th>
          <th className="p-2">%Diff vs EMA70</th>
          <th className="p-2">Level Divergence</th>
          <th className="p-2">Level Div Type</th>
<th className="p-2">Div Distance</th>
<th className="p-2">Proximity</th>
<th className="p-2">Minutes Ago</th>
          <th className="p-2">Last Close</th>
            </tr>
          </thead>
          <tbody>
            {filteredSignals.map((s) => {
              const updatedRecently = Date.now() - (lastUpdatedMap[s.symbol] || 0) < 5000;
              return (
                <tr
                  key={s.symbol}
                  className={`border-b border-gray-700 transition-all duration-300 ${
                    updatedRecently ? "bg-yellow-900/30" : ""
                  }`}
                >
                  <td className="p-2 font-bold bg-gray-900 sticky left-0 z-10">{s.symbol}</td>
                  <td
  className={`p-2 font-semibold ${
    s.trend === "bullish"
      ? "bg-green-800 text-green-200"
      : s.trend === "bearish"
      ? "bg-red-800 text-red-200"
      : "bg-gray-800 text-gray-400"
  }`}
>
  {s.trend}
</td>

<td className="p-2 text-sm text-yellow-200">
  {s.crossoverPrice ? s.crossoverPrice.toFixed(2) : "-"}
</td>

<td
  className={`p-2 font-semibold ${
    s.breakout ? "bg-yellow-600 text-white" : "bg-gray-800 text-gray-500"
  }`}
>
  {s.breakout ? "Yes" : "No"}
</td>

<td
  className={`p-2 font-semibold ${
    s.bullishBreakout ? "bg-green-700 text-white" : "bg-gray-800 text-gray-500"
  }`}
>
  {s.bullishBreakout ? "Yes" : "No"}
</td>

<td
  className={`p-2 font-semibold ${
    s.bearishBreakout ? "bg-red-700 text-white" : "bg-gray-800 text-gray-500"
  }`}
>
  {s.bearishBreakout ? "Yes" : "No"}
</td>

<td
  className={`p-2 font-semibold ${
    s.divergence ? "bg-indigo-600 text-white" : "bg-gray-800 text-gray-500"
  }`}
>
  {s.divergence ? "Yes" : "No"}
</td>

<td className="p-2">{s.divergenceType || "None"}</td>

<td
  className={`p-2 ${s.ema14Bounce ? "bg-blue-700 text-white" : "bg-gray-800 text-gray-500"}`}
>
  {s.ema14Bounce ? "Yes" : "No"}
</td>

<td
  className={`p-2 ${s.ema70Bounce ? "bg-blue-900 text-white" : "bg-gray-800 text-gray-500"}`}
>
  {s.ema70Bounce ? "Yes" : "No"}
</td>

<td
  className={`p-2 ${s.nearOrAtEMA70Divergence ? "bg-pink-800 text-white" : "bg-gray-800 text-gray-500"}`}
>
  {s.nearOrAtEMA70Divergence ? "Yes" : "No"}
</td>

<td
  className={`p-2 ${s.touchedEMA70Today ? "bg-yellow-500 text-black" : "bg-gray-800 text-gray-500"}`}
>
  {s.touchedEMA70Today ? "Yes" : "No"}
</td>

<td
  className={`p-2 ${s.bearishContinuation ? "bg-red-900 text-white" : "bg-gray-800 text-gray-500"}`}
>
  {s.bearishContinuation ? "Yes" : "No"}
</td>

<td
  className={`p-2 ${s.bullishContinuation ? "bg-green-900 text-white" : "bg-gray-800 text-gray-500"}`}
>
  {s.bullishContinuation ? "Yes" : "No"}
</td>

<td className="p-2">{s.inferredLevel.toFixed(9)}</td>
<td className="p-2">{s.inferredLevelType}</td>

<td
  className={`p-2 ${s.inferredLevelWithinRange ? "bg-teal-700 text-white" : "bg-gray-800 text-gray-500"}`}
>
  {s.inferredLevelWithinRange ? "Yes" : "No"}
</td>

<td className="p-2">{s.differenceVsEMA70.toFixed(2)}%</td>

<td
  className={`p-2 ${s.divergenceFromLevel ? "bg-indigo-700 text-white" : "bg-gray-800 text-gray-500"}`}
>
  {s.divergenceFromLevel ? "Yes" : "No"}
</td>

<td className="p-2">{s.divergenceFromLevelType || "None"}</td>
                 <td className="p-2">
  {s.divergenceFromLevelDistance !== null ? s.divergenceFromLevelDistance : "—"}
</td>
                  
<td className={`p-2 ${s.divergenceProximity === "near" ? "text-green-400" : "text-yellow-400"}`}>
  {s.divergenceProximity || "—"}
</td>

<td className="p-2">
  {s.minutesAgo !== null ? `${s.minutesAgo} min` : "—"}
</td> 
<td
  className={`p-2 font-semibold ${
    s.lastClose > s.lastOpen
      ? "text-green-400"
      : s.lastClose < s.lastOpen
      ? "text-red-400"
      : "text-gray-400"
  }`}
>
  {s.lastClose.toFixed(9)}
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
