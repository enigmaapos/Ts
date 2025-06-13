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

  const computeLevels = (type) => {
    const ema = parseFloat(ema70);
    if (type === 'bullish') {
      return {
        entry: ema * 1.02,
        stopLoss: ema * 0.97,
        takeProfit1: ath * 0.98,
        takeProfit2: ath * 1.05,
      };
    } else if (type === 'bearish') {
      return {
        entry: ema * 0.98,
        stopLoss: ema * 1.03,
        takeProfit1: atl * 1.02,
        takeProfit2: atl * 0.95,
      };
    }
    return {};
  };

  const computeReversal = (from) => {
    if (from === 'atl') {
      return {
        entry: atl * 1.02,
        stopLoss: atl * 0.97,
        takeProfit1: atl * 1.10,
        takeProfit2: atl * 1.20,
      };
    } else if (from === 'ath') {
      return {
        entry: ath * 0.98,
        stopLoss: ath * 1.03,
        takeProfit1: ath * 0.90,
        takeProfit2: ath * 0.80,
      };
    }
    return {};
  };

  const bullish = computeLevels('bullish');
  const bearish = computeLevels('bearish');
  const bullishReversal = computeReversal('atl');
  const bearishReversal = computeReversal('ath');

  return (
    <div className="bg-gradient-to-r from-gray-900 via-black to-gray-900 text-white p-8 rounded-2xl shadow-2xl max-w-4xl mx-auto mt-10">
      <h1 className="text-4xl font-extrabold mb-4 text-yellow-400">Bitcoin Signal Analyzer</h1>
      <p className="text-lg mb-6 text-gray-300">
        <span className="font-semibold text-white">Smart Bitcoin Trading Starts Here.</span> Instantly analyze Bitcoin's market status using ATH, ATL, and EMA70 trends. This tool gives you actionable trade setups, identifies market zones (Buy or Sell), and provides real-time insights—all in one simple interface.
      </p>
      <div className="border-l-4 border-yellow-400 pl-4 text-sm text-yellow-100 italic">Plan smarter. Trade better.</div>
      <div className="space-y-6 bg-gray-950 p-6 rounded-xl text-white mt-6">
        <div className="bg-gray-900 p-4 rounded-lg border border-blue-600">
          <h2 className="text-lg font-semibold text-blue-400 mb-2">EMA70 (Live)</h2>
          <input type="text" value={ema70 || ''} readOnly className="bg-gray-800 text-white placeholder-gray-500 border border-blue-700 rounded px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 w-full" />
        </div>
      </div>

      {!loading && isValid && (
        <>
          {/* ATH Section */}
          <div className="space-y-2 text-gray-300 mt-6">
            <h2 className="text-xl font-semibold text-yellow-400">ATH Heat Check</h2>
            {previousATHInfo && (
              <div className="bg-gray-800 p-4 rounded-xl shadow-inner border border-gray-700 mt-4">
                <h3 className="text-lg font-bold text-yellow-300 mb-2">Previous ATH Reference</h3>
                <p className="text-sm">Price: ${previousATHInfo.price.toFixed(2)}</p>
                <p className="text-sm">Occurred on: {previousATHInfo.time}</p>
              </div>
            )}
            <p>ATH: ${ath?.toFixed(2)}</p>
            <p>Gap: {athGap.toFixed(2)}%</p>
            <p>Market Zone: <span className={getAthSignal() === 'Bullish Continuation' ? 'text-green-500 font-bold' : 'text-yellow-500 font-bold'}>{getAthSignal() === 'Bullish Continuation' ? '🔥 Still in the Buy Zone' : '⚠️ Caution: Sell Zone'}</span></p>
            <div className="text-sm bg-gray-700 p-3 rounded-lg border border-gray-600 space-y-1">
              <p className="font-semibold">Trade Setup:</p>
              <p>Entry: ${(getAthSignal() === 'Bullish Continuation' ? bullish.entry : bearishReversal.entry).toFixed(2)}</p>
              <p>SL: ${(getAthSignal() === 'Bullish Continuation' ? bullish.stopLoss : bearishReversal.stopLoss).toFixed(2)}</p>
              <p>TP: ${(getAthSignal() === 'Bullish Continuation' ? bullish.takeProfit1 : bearishReversal.takeProfit2).toFixed(2)} to ${(getAthSignal() === 'Bullish Continuation' ? bullish.takeProfit2 : bearishReversal.takeProfit1).toFixed(2)}</p>
            </div>
          </div>

          {/* ATL Section */}
          <div className="space-y-2 text-gray-300 mt-6">
            <h2 className="text-xl font-semibold text-red-400">ATL Heat Check</h2>
            {previousATLInfo && (
              <div className="text-sm bg-gray-800 p-3 rounded-lg border border-gray-700 text-gray-300 space-y-1">
                <p className="font-semibold text-white">Previous ATL (Historical):</p>
                <p>Price: ${previousATLInfo.price.toFixed(2)}</p>
                <p>Date: {previousATLInfo.time}</p>
              </div>
            )}
            <p>ATL: ${atl?.toFixed(2)}</p>
            <p>EMA70: ${ema70}</p>
            <p>Gap to EMA70: {atlGap.toFixed(2)}%</p>
            <p>Market Zone: <span className={getAtlSignal() === 'Bearish Continuation' ? 'text-red-500 font-bold' : 'text-green-500 font-bold'}>{getAtlSignal() === 'Bearish Continuation' ? '🔻 Still in the Sell Zone' : '🟢 Opportunity: Buy Zone'}</span></p>
            <div className="text-sm bg-gray-700 p-3 rounded-lg border border-gray-600 space-y-1">
              <p className="font-semibold">Trade Setup:</p>
              <p>Entry: ${(getAtlSignal() === 'Bearish Continuation' ? bearish.entry : bullishReversal.entry).toFixed(2)}</p>
              <p>SL: ${(getAtlSignal() === 'Bearish Continuation' ? bearish.stopLoss : bullishReversal.stopLoss).toFixed(2)}</p>
              <p>TP: ${(getAtlSignal() === 'Bearish Continuation' ? bearish.takeProfit2 : bullishReversal.takeProfit1).toFixed(2)} to ${(getAtlSignal() === 'Bearish Continuation' ? bearish.takeProfit1 : bullishReversal.takeProfit2).toFixed(2)}</p>
            </div>
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
        </>
      )}
    </div>
  );
}
