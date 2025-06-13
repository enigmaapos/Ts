import { useEffect, useState } from "react";

export default function Home() {
  const [candles15m, setCandles15m] = useState([]);
  const [ema70, setEma70] = useState(null);
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

        

  useEffect(() => {
    const fetchFuturesPairs = async () => {
      try {
        const res = await fetch("https://fapi.binance.com/fapi/v1/klines?symbol=BTCUSDT&interval=15m&limit=1500");
        if (!res.ok) throw new Error("Failed to fetch futures data");

        const data = await res.json();
        const highs = data.map(candle => parseFloat(candle[2]));
        const lows = data.map(candle => parseFloat(candle[3]));

        
      } catch (error) {
        console.error("Failed to fetch ATH/ATL from futures:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchFuturesPairs();
  }, []);

  


  return (
    <div className="bg-gradient-to-r from-gray-900 via-black to-gray-900 text-white p-8 rounded-2xl shadow-2xl max-w-4xl mx-auto mt-10">
      <h1 className="text-4xl font-extrabold mb-4 text-yellow-400">Bitcoin Signal Analyzer</h1>
      <p className="text-lg mb-6 text-gray-300">
        <span className="font-semibold text-white">Smart Bitcoin Trading Starts Here.</span> Instantly analyze Bitcoin's market status using ATH, ATL, and EMA70 trends. This tool gives you actionable trade setups, identifies market zones (Buy or Sell), and provides real-time insights—all in one simple interface.
      </p>
      <div className="border-l-4 border-yellow-400 pl-4 text-sm text-yellow-100 italic">Plan smarter. Trade better.</div>
 
            
          </div>
      )}
    }}
            }
