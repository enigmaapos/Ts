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

function calculateDifferenceVsEMA70(level: number, ema70: number): number {
  return ((level - ema70) / level) * 100;
}

export default function Home() {
  const [signal, setSignal] = useState<any>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch("https://fapi.binance.com/fapi/v1/klines?symbol=BTCUSDT&interval=15m&limit=500");
        const raw = await res.json();
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

        const now = new Date();
        const getUTCMillis = (y: number, m: number, d: number, hPH: number, min: number) =>
          Date.UTC(y, m, d, hPH - 8, min);
        const year = now.getUTCFullYear();
        const month = now.getUTCMonth();
        const date = now.getUTCDate();

        const today8AM = getUTCMillis(year, month, date, 8, 0);
        const tomorrow745AM = getUTCMillis(year, month, date + 1, 7, 45);
        const yesterday8AM = getUTCMillis(year, month, date - 1, 8, 0);
        const today745AM = getUTCMillis(year, month, date, 7, 45);

        const sessionStart = now.getTime() >= today8AM ? today8AM : yesterday8AM;
        const sessionEnd = now.getTime() >= today8AM ? tomorrow745AM : today745AM;

        const candlesToday = candles.filter(c => c.timestamp >= sessionStart && c.timestamp <= sessionEnd);
        const candlesPrev = candles.filter(c => c.timestamp >= yesterday8AM && c.timestamp < today8AM);

        const todaysHighestHigh = Math.max(...candlesToday.map(c => c.high));
        const todaysLowestLow = Math.min(...candlesToday.map(c => c.low));
        const prevSessionHigh = Math.max(...candlesPrev.map(c => c.high));
        const prevSessionLow = Math.min(...candlesPrev.map(c => c.low));

        const bullishBreakout = highs.at(-1)! > prevSessionHigh;
        const bearishBreakout = lows.at(-1)! < prevSessionLow;
        const breakout = bullishBreakout || bearishBreakout;

        const currentRSI = rsi14.at(-1);
        const prevHighIdx = highs.lastIndexOf(prevSessionHigh);
        const prevLowIdx = lows.lastIndexOf(prevSessionLow);
        const prevHighRSI = rsi14[prevHighIdx] ?? null;
        const prevLowRSI = rsi14[prevLowIdx] ?? null;

        let divergenceType: 'bullish' | 'bearish' | null = null;
        if (lows.at(-1)! < prevSessionLow && prevLowIdx !== -1 && currentRSI! > prevLowRSI!) {
          divergenceType = 'bullish';
        } else if (highs.at(-1)! > prevSessionHigh && prevHighIdx !== -1 && currentRSI! < prevHighRSI!) {
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
        const inferredLevelWithinRange =
          inferredLevel <= todaysHighestHigh && inferredLevel >= todaysLowestLow;

        const latestEMA70 = ema70[ema70.length - 1];
        const differenceVsEMA70 = calculateDifferenceVsEMA70(inferredLevel, latestEMA70);

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

        setSignal({
          trend,
          breakout,
          divergence,
          divergenceType,
          nearOrAtEMA70Divergence,
          ema14Bounce,
          ema70Bounce,
          level,
          type,
          inferredLevel,
          inferredLevelType,
          inferredLevelWithinRange,
          differenceVsEMA70,
          divergenceFromLevel,
          divergenceFromLevelType,
          lastClose,
        });
      } catch (err) {
        console.error("Error fetching data:", err);
      }
    };

    fetchData();
  }, []);

  return (
    <div className="bg-gray-900 text-white p-8 rounded-xl shadow-xl max-w-3xl mx-auto mt-10">
      <h1 className="text-3xl font-bold text-yellow-400 mb-6">Bitcoin Signal Analyzer</h1>
      {signal ? (
        <div className="space-y-2 text-sm leading-relaxed">
          <p>Trend: <b>{signal.trend}</b></p>
          <p>Breakout: <b>{signal.breakout ? "Yes" : "No"}</b></p>
          <p>Divergence: <b>{signal.divergenceType || "None"}</b></p>
          <p>Near EMA70 Divergence: <b>{signal.nearOrAtEMA70Divergence ? "Yes" : "No"}</b></p>
          <p>EMA14 Bounce: <b>{signal.ema14Bounce ? "Yes" : "No"}</b></p>
          <p>EMA70 Bounce: <b>{signal.ema70Bounce ? "Yes" : "No"}</b></p>
          <p>Relevant Level: <b>{signal.level?.toFixed(2)} ({signal.type})</b></p>
          <p>Inferred Level: <b>{signal.inferredLevel?.toFixed(2)} ({signal.inferredLevelType})</b></p>
          <p>Inferred Within Today Range: <b>{signal.inferredLevelWithinRange ? "Yes" : "No"}</b></p>
          <p>Diff vs EMA70: <b>{signal.differenceVsEMA70.toFixed(2)}%</b></p>
          <p>Divergence from Level: <b>{signal.divergenceFromLevel ? signal.divergenceFromLevelType : "None"}</b></p>
          <p>Last Close: <b>{signal.lastClose.toFixed(2)}</b></p>
        </div>
      ) : (
        <p className="text-gray-400">Loading signals...</p>
      )}
    </div>
  );
}
