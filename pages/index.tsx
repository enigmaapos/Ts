import { useEffect, useState } from "react";

export default function Home() {
  const [candles15m, setCandles15m] = useState([]);
  const [ema70, setEma70] = useState(null);
  const [ath, setAth] = useState(null);
  const [atl, setAtl] = useState(null);
  const [recentATH, setRecentATH] = useState(null);
  const [recentATL, setRecentATL] = useState(null);
  const [previousATHInfo, setPreviousATHInfo] = useState(null);
  const [previousATLInfo, setPreviousATLInfo] = useState(null);
  const [loading, setLoading] = useState(true);

  const calculateEMA = (data, period) => {
    const k = 2 / (period + 1);
    let emaArray = [];
    let ema = data.slice(0, period).reduce((sum, val) => sum + val.close, 0) / period;
    emaArray[period - 1] = ema;

    for (let i = period; i < data.length; i++) {
      ema = data[i].close * k + ema * (1 - k);
      emaArray[i] = ema;
    }

    return emaArray;
  };

  useEffect(() => {
    const fetchBTC15mCandles = async () => {
      try {
        const res = await fetch("https://fapi.binance.com/fapi/v1/klines?symbol=BTCUSDT&interval=15m&limit=500");
        if (!res.ok) throw new Error("Failed to fetch 15m futures candles");

        const data = await res.json();
        const formatted = data.map((candle) => ({
          time: Number(candle[0]),
          open: parseFloat(candle[1]),
          high: parseFloat(candle[2]),
          low: parseFloat(candle[3]),
          close: parseFloat(candle[4]),
          volume: parseFloat(candle[5]),
        }));

        const ema70Data = calculateEMA(formatted, 70);
        setEma70(ema70Data[ema70Data.length - 1]);

        const candlesWithEma = formatted.map((candle, idx) => ({
          ...candle,
          ema70: ema70Data[idx] || 0,
        }));

        setCandles15m(candlesWithEma);

        const lowestCandle = candlesWithEma.reduce((min, c) => (c.low < min.low ? c : min), candlesWithEma[0]);
        const highestCandle = candlesWithEma.reduce((max, c) => (c.high > max.high ? c : max), candlesWithEma[0]);

        setRecentATL({
          price: lowestCandle.low,
          time: new Date(lowestCandle.time).toLocaleDateString(),
          ema70: lowestCandle.ema70,
          gap: ((lowestCandle.ema70 - lowestCandle.low) / lowestCandle.low) * 100,
        });

        setRecentATH({
          price: highestCandle.high,
          time: new Date(highestCandle.time).toLocaleDateString(),
          ema70: highestCandle.ema70,
          gap: ((highestCandle.high - highestCandle.ema70) / highestCandle.high) * 100,
        });

        setPreviousATLInfo({
          price: lowestCandle.low,
          time: new Date(lowestCandle.time).toLocaleDateString(),
        });

        setPreviousATHInfo({
          price: highestCandle.high,
          time: new Date(highestCandle.time).toLocaleDateString(),
        });
      } catch (err) {
        console.error("Error loading 15m futures candles:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchBTC15mCandles();
  }, []);

  useEffect(() => {
    const fetchFuturesAthAtl = async () => {
      try {
        const res = await fetch("https://fapi.binance.com/fapi/v1/klines?symbol=BTCUSDT&interval=15m&limit=1500");
        if (!res.ok) throw new Error("Failed to fetch futures data");

        const data = await res.json();
        const highs = data.map(candle => parseFloat(candle[2]));
        const lows = data.map(candle => parseFloat(candle[3]));

        setAth(Math.max(...highs));
        setAtl(Math.min(...lows));
      } catch (error) {
        console.error("Failed to fetch ATH/ATL from futures:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchFuturesAthAtl();
  }, []);

  const isValid = !isNaN(parseFloat(ema70)) && parseFloat(ema70) > 0;
  const athGap = isValid && ath ? ((ath - ema70) / ema70) * 100 : 0;
  const atlGap = isValid && atl ? ((ema70 - atl) / atl) * 100 : 0;

  const getAthSignal = () => (athGap > 100 ? 'Bullish Continuation' : 'Possible Reversal');
  const getAtlSignal = () => (atlGap > 100 ? 'Bearish Continuation' : 'Possible Reversal');



  return (
    <div className="bg-gradient-to-r from-gray-900 via-black to-gray-900 text-white p-8 rounded-2xl shadow-2xl max-w-4xl mx-auto mt-10">
      <h1 className="text-4xl font-extrabold mb-4 text-yellow-400">Bitcoin Signal Analyzer</h1>
      <p className="text-lg mb-6 text-gray-300">
        <span className="font-semibold text-white">Smart Bitcoin Trading Starts Here.</span> Instantly analyze Bitcoin's market status using ATH, ATL, and EMA70 trends. This tool gives you actionable trade setups, identifies market zones (Buy or Sell), and provides real-time insights—all in one simple interface.
      </p>
      <div className="border-l-4 border-yellow-400 pl-4 text-sm text-yellow-100 italic">Plan smarter. Trade better.</div>
 
            {recentATL && (
              <div className="bg-gray-900 p-4 mt-6 rounded-lg border border-red-600">
                <h2 className="text-xl font-bold text-red-400 mb-2">🔻 Recent ATL Snapshot</h2>
                <p>Price: ${recentATL.price.toFixed(2)}</p>
                <p>Date: {recentATL.time}</p>
                <p>EMA70 at ATL: ${recentATL.ema70.toFixed(2)}</p>
                <p className="text-yellow-300 font-semibold">Gap to EMA70: {recentATL.gap.toFixed(2)}%</p>
              </div>
            )}
            {recentATH && (
              <div className="bg-gray-900 p-4 mt-6 rounded-lg border border-green-600">
                <h2 className="text-xl font-bold text-green-400 mb-2">🚀 Recent ATH Snapshot</h2>
                <p>Price: ${recentATH.price.toFixed(2)}</p>
                <p>Date: {recentATH.time}</p>
                <p>EMA70 at ATH: ${recentATH.ema70.toFixed(2)}</p>
                <p className="text-yellow-300 font-semibold">Gap to EMA70: {recentATH.gap.toFixed(2)}%</p>
              </div>
            )}
          </div>
      )}
    </div>
  );
}
