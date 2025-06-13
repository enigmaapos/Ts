import { useEffect, useState } from "react";

function calculateEMA(data, period) {
  const k = 2 / (period + 1);
  const ema = [];
  let previousEma = null;

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

function calculateRSI(closes, period = 14) {
  const rsi = [];
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
  const [candles15m, setCandles15m] = useState([]);
  const [signal, setSignal] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch("https://fapi.binance.com/fapi/v1/klines?symbol=BTCUSDT&interval=15m&limit=500");
        const raw = await res.json();
        const candles = raw.map(c => ({
          timestamp: c[0],
          open: +c[1],
          high: +c[2],
          low: +c[3],
          close: +c[4],
          volume: +c[5]
        }));

        const closes = candles.map(c => c.close);
        const highs = candles.map(c => c.high);
        const lows = candles.map(c => c.low);

        const ema14 = calculateEMA(closes, 14);
        const ema70 = calculateEMA(closes, 70);
        const rsi14 = calculateRSI(closes);

        const lastClose = closes.at(-1);
        const lastEMA14 = ema14.at(-1);
        const lastEMA70 = ema70.at(-1);

        const trend = lastEMA14 > lastEMA70 ? 'bullish' : 'bearish';

        const now = new Date();
        const getUTCMillis = (y, m, d, hPH, min) => Date.UTC(y, m, d, hPH - 8, min);
        const year = now.getUTCFullYear();
        const month = now.getUTCMonth();
        const date = now.getUTCDate();

        const today8AM = getUTCMillis(year, month, date, 8, 0);
        const tomorrow745AM = getUTCMillis(year, month, date + 1, 7, 45);
        const yesterday8AM = getUTCMillis(year, month, date - 1, 8, 0);
        const today745AM = getUTCMillis(year, month, date, 7, 45);

        const sessionStart = now.getTime() >= today8AM ? today8AM : yesterday8AM;
        const sessionEnd = now.getTime() >= today8AM ? tomorrow745AM : today745AM;

        const prevSessionStart = getUTCMillis(year, month, date - 1, 8, 0);
        const prevSessionEnd = getUTCMillis(year, month, date, 7, 45);

        const candlesToday = candles.filter(c => c.timestamp >= sessionStart && c.timestamp <= sessionEnd);
        const candlesPrev = candles.filter(c => c.timestamp >= prevSessionStart && c.timestamp <= prevSessionEnd);

        const todaysHigh = Math.max(...candlesToday.map(c => c.high));
        const todaysLow = Math.min(...candlesToday.map(c => c.low));
        const prevHigh = Math.max(...candlesPrev.map(c => c.high));
        const prevLow = Math.min(...candlesPrev.map(c => c.low));

        const breakout = todaysHigh > prevHigh || todaysLow < prevLow;

        const currentRSI = rsi14.at(-1);
        const prevHighIdx = highs.lastIndexOf(prevHigh);
        const prevLowIdx = lows.lastIndexOf(prevLow);
        const prevHighRSI = rsi14[prevHighIdx] ?? null;
        const prevLowRSI = rsi14[prevLowIdx] ?? null;

        let divergence = null;
        if (todaysLow < prevLow && currentRSI > prevLowRSI) divergence = 'bullish';
        if (todaysHigh > prevHigh && currentRSI < prevHighRSI) divergence = 'bearish';

        setCandles15m(candles);
        setSignal({ trend, breakout, divergence });

      } catch (err) {
        console.error("Error fetching data:", err);
      }
    };

    fetchData();
  }, []);

  return (
    <div className="bg-gray-900 text-white p-8 rounded-xl shadow-xl max-w-3xl mx-auto mt-10">
      <h1 className="text-3xl font-bold text-yellow-400 mb-4">Bitcoin Signal Analyzer</h1>
      {signal ? (
        <div>
          <p>Trend: <span className="font-semibold">{signal.trend}</span></p>
          <p>Breakout: <span className="font-semibold">{signal.breakout ? 'Yes' : 'No'}</span></p>
          <p>Divergence: <span className="font-semibold">{signal.divergence || 'None'}</span></p>
        </div>
      ) : (
        <p>Loading signals...</p>

      <div className="mt-6">
  <h2 className="text-xl font-bold text-green-400">Signal Summary</h2>
  <p>Trend: {trend}</p>
  <p>Breakout: {breakout ? (bullishBreakout ? 'Bullish' : 'Bearish') : 'None'}</p>
  <p>Divergence: {divergenceType || 'None'}</p>
  <p>EMA70: {latestEMA70?.toFixed(9)}</p>
</div>
      )}
    </div>
  );
}
