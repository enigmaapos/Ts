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

export default function Home() {
  const [signals, setSignals] = useState<any[]>([]);

  useEffect(() => {
    const fetchSignals = async () => {
      try {
        const exchangeInfo = await fetch("https://fapi.binance.com/fapi/v1/exchangeInfo").then(res => res.json());
        const usdtSymbols = exchangeInfo.symbols
          .filter((s: any) => s.contractType === "PERPETUAL" && s.quoteAsset === "USDT")
          .slice(0, 100)
          .map((s: any) => s.symbol);

        const now = new Date();
        const getUTCMillis = (y: number, m: number, d: number, hPH: number, min: number) =>
          Date.UTC(y, m, d, hPH - 8, min);

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

        const fetchAndAnalyze = async (symbol: string) => {
          const raw = await fetch(`https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=15m&limit=500`)
            .then(res => res.json());

          const candles = raw.map((c: any) => ({
            timestamp: c[0],
            open: +c[1],
            high: +c[2],
            low: +c[3],
            close: +c[4],
            volume: +c[5],
          }));

          const closes = candles.map(c => c.close);
          const highs = candles.map(c => c.high);
          const lows = candles.map(c => c.low);
          const ema14 = calculateEMA(closes, 14);
          const ema70 = calculateEMA(closes, 70);
          const rsi14 = calculateRSI(closes);

          const lastClose = closes.at(-1)!;
          const lastEMA14 = ema14.at(-1)!;
          const lastEMA70 = ema70.at(-1)!;
          const trend = lastEMA14 > lastEMA70 ? 'bullish' : 'bearish';

          const candlesToday = candles.filter(c => c.timestamp >= sessionStart && c.timestamp <= sessionEnd);
          const candlesPrev = candles.filter(c => c.timestamp >= prevSessionStart && c.timestamp <= prevSessionEnd);

          const todaysLowestLow = candlesToday.length > 0 ? Math.min(...candlesToday.map(c => c.low)) : null;
          const todaysHighestHigh = candlesToday.length > 0 ? Math.max(...candlesToday.map(c => c.high)) : null;
          const prevSessionLow = candlesPrev.length > 0 ? Math.min(...candlesPrev.map(c => c.low)) : null;
          const prevSessionHigh = candlesPrev.length > 0 ? Math.max(...candlesPrev.map(c => c.high)) : null;

          const currentRSI = rsi14.at(-1);
          const prevHighIdx = highs.lastIndexOf(prevSessionHigh!);
          const prevLowIdx = lows.lastIndexOf(prevSessionLow!);
          const prevHighRSI = rsi14[prevHighIdx] ?? null;
          const prevLowRSI = rsi14[prevLowIdx] ?? null;

          let divergenceType: 'bullish' | 'bearish' | null = null;
          if (lows.at(-1)! < prevSessionLow! && prevLowIdx !== -1 && currentRSI! > prevLowRSI!) {
            divergenceType = 'bullish';
          } else if (highs.at(-1)! > prevSessionHigh! && prevHighIdx !== -1 && currentRSI! < prevHighRSI!) {
            divergenceType = 'bearish';
          }

          const divergence = divergenceType !== null;
          const nearEMA14 = closes.slice(-3).some(c => Math.abs(c - lastEMA14) / c < 0.002);
          const nearEMA70 = closes.slice(-3).some(c => Math.abs(c - lastEMA70) / c < 0.002);
          const ema14Bounce = nearEMA14 && lastClose > lastEMA14;
          const ema70Bounce = nearEMA70 && lastClose > lastEMA70;
          const nearOrAtEMA70Divergence = divergence && (Math.abs(lastClose - lastEMA70) / lastClose < 0.002);

          const highestHigh = Math.max(...highs);
          const lowestLow = Math.min(...lows);
          const inferredLevel = trend === 'bullish' ? highestHigh : lowestLow;
          const inferredLevelType = trend === 'bullish' ? 'resistance' : 'support';
          const inferredLevelWithinRange = inferredLevel <= todaysHighestHigh! && inferredLevel >= todaysLowestLow!;
          const differenceVsEMA70 = ((inferredLevel - lastEMA70) / lastEMA70) * 100;

          const level = lastEMA70;
          const type = inferredLevelType;

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

          return {
            symbol,
            trend,
            divergence,
            divergenceType,
            ema14Bounce,
            ema70Bounce,
            nearOrAtEMA70Divergence,
            touchedEMA70Today,
            inferredLevel,
            inferredLevelType,
            inferredLevelWithinRange,
            differenceVsEMA70,
            divergenceFromLevel,
            divergenceFromLevelType,
            lastClose,
          };
        };

        const results = await Promise.all(usdtSymbols.map(fetchAndAnalyze));
        setSignals(results);
      } catch (err) {
        console.error("Signal fetch error:", err);
      }
    };

    fetchSignals();
  }, []);

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4 overflow-x-auto">
      <h1 className="text-3xl font-bold text-yellow-400 mb-4">Binance 15m Signal Analysis</h1>
      <table className="min-w-[1600px] text-xs border-collapse">
        <thead className="bg-gray-800 text-yellow-300">
          <tr>
            <th className="p-2">Symbol</th>
            <th className="p-2">Trend</th>
            <th className="p-2">Divergence</th>
            <th className="p-2">Diverge Type</th>
            <th className="p-2">EMA14 Bounce</th>
            <th className="p-2">EMA70 Bounce</th>
            <th className="p-2">Near EMA70 Diverge</th>
            <th className="p-2">Touched EMA70</th>
            <th className="p-2">Inferred Level</th>
            <th className="p-2">Level Type</th>
            <th className="p-2">Level In Range</th>
            <th className="p-2">%Diff vs EMA70</th>
            <th className="p-2">Level Divergence</th>
            <th className="p-2">Level Div Type</th>
            <th className="p-2">Last Close</th>
          </tr>
        </thead>
        <tbody>
          {signals.map((s) => (
            <tr key={s.symbol} className="border-b border-gray-700">
              <td className="p-2 font-bold">{s.symbol}</td>
              <td className="p-2">{s.trend}</td>
              <td className="p-2">{s.divergence ? "Yes" : "No"}</td>
              <td className="p-2">{s.divergenceType || "None"}</td>
              <td className="p-2">{s.ema14Bounce ? "Yes" : "No"}</td>
              <td className="p-2">{s.ema70Bounce ? "Yes" : "No"}</td>
              <td className="p-2">{s.nearOrAtEMA70Divergence ? "Yes" : "No"}</td>
              <td className="p-2">{s.touchedEMA70Today ? "Yes" : "No"}</td>
              <td className="p-2">{s.inferredLevel.toFixed(2)}</td>
              <td className="p-2">{s.inferredLevelType}</td>
              <td className="p-2">{s.inferredLevelWithinRange ? "Yes" : "No"}</td>
              <td className="p-2">{s.differenceVsEMA70.toFixed(2)}%</td>
              <td className="p-2">{s.divergenceFromLevel ? "Yes" : "No"}</td>
              <td className="p-2">{s.divergenceFromLevelType || "None"}</td>
              <td className="p-2">{s.lastClose.toFixed(4)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
