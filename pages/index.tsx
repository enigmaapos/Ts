import { useEffect, useState } from "react";

export default function Home() {
  const [ath, setAth] = useState(null);
  const [atl, setAtl] = useState(null);
  const [ema70, setEma70] = useState('');
  const [loading, setLoading] = useState(true);
  const [candles15m, setCandles15m] = useState([]);

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

      const ema14 = calculateEMA(formatted, 14);
      const ema70 = calculateEMA(formatted, 70);

      const candlesWithEma = formatted.map((candle, idx) => ({
        ...candle,
        ema14: ema14[idx] || 0,
        ema70: ema70[idx] || 0,
      }));

      setCandles15m(candlesWithEma);
    } catch (err) {
      console.error("Error loading 15m futures candles:", err);
    } finally {
      setLoading(false);
    }
  };

  fetchBTC15mCandles();
}, []);



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

        const getPreviousATL = (candles) => {
                if (candles.length < 2) return null;
                const candlesExcludingLast = candles.slice(0, -1);
                const prevAtlCandle = candlesExcludingLast.reduce((min, curr) =>
                        curr.low < min.low ? curr : min
                );
                return {
                        price: prevAtlCandle.low,
                        time: new Date(prevAtlCandle.time).toLocaleDateString(),
                };
        };

        const findRecentATL = (data) => {
                if (!data || data.length < 100) return null;

                const last100 = data.slice(-100);
                const latestCandle = data[data.length - 1];

                // Ensure current trend is bearish
                if (latestCandle.ema14 >= latestCandle.ema70) return null;

                let atlCandle = last100[0];
                last100.forEach(candle => {
                        if (candle.low < atlCandle.low) {
                                atlCandle = candle;
                        }
                });

                const atlPrice = atlCandle.low;
                const atlEMA70 = atlCandle.ema70;
                const gapPercent = ((atlEMA70 - atlPrice) / atlEMA70) * 100;

                return {
                        atl: atlPrice,
                        ema70: atlEMA70,
                        gapPercent: gapPercent.toFixed(2),
                };
        };
        const getPreviousATH = (candles) => {
                if (candles.length < 2) return null;
                const candlesExcludingLast = candles.slice(0, -1);
                const prevAthCandle = candlesExcludingLast.reduce((max, curr) =>
                        curr.high > max.high ? curr : max
                );
                return {
                        price: prevAthCandle.high,
                        time: new Date(prevAthCandle.time).toLocaleDateString(),
                };
        };


        const findRecentATH = (data) => {
                if (!data || data.length < 100) return null;

                const last100 = data.slice(-100);
                const latestCandle = data[data.length - 1];

                // Ensure current trend is bullish
                if (latestCandle.ema14 <= latestCandle.ema70) return null;

                let athCandle = last100[0];
                last100.forEach(candle => {
                        if (candle.high > athCandle.high) {
                                athCandle = candle;
                        }
                });

                const athPrice = athCandle.high;
                const athEMA70 = athCandle.ema70;
                const gapPercent = ((athPrice - athEMA70) / athEMA70) * 100;

                return {
                        ath: athPrice,
                        ema70: athEMA70,
                        gapPercent: gapPercent.toFixed(2),
                };
        };

        useEffect(() => {
  async function fetchFuturesAthAtl() {
    try {
      const res = await fetch("https://fapi.binance.com/fapi/v1/klines?symbol=BTCUSDT&interval=15m&limit=1500");
      if (!res.ok) throw new Error("Failed to fetch futures data");

      const data = await res.json();
      const highs = data.map(candle => parseFloat(candle[2]));
      const lows = data.map(candle => parseFloat(candle[3]));

      const ath = Math.max(...highs);
      const atl = Math.min(...lows);

      setAth(ath);
      setAtl(atl);
    } catch (error) {
      console.error("Failed to fetch ATH/ATL from futures:", error);
    } finally {
      setLoading(false);
    }
  }

  fetchFuturesAthAtl();
}, []);

        const athNum = parseFloat(ath);
        const atlNum = parseFloat(atl);
        const emaNum = parseFloat(ema70);
        const isValid = !isNaN(emaNum) && emaNum > 0;

        const previousATLInfo = getPreviousATL(candles15m);
        const previousATHInfo = getPreviousATH(candles15m);
        const atlInfo = findRecentATL(candles15m);
        const athInfo = findRecentATH(candles15m);

        if (atlInfo) {
                console.log("Recent ATL:", atlInfo.atl);
                console.log("EMA70 from ATL:", atlInfo.ema70);
                console.log("Gap to EMA70 (%):", atlInfo.gapPercent);
        }

        if (athInfo) {
                console.log("Recent ATH:", athInfo.ath);
                console.log("EMA70 from ATH:", athInfo.ema70);
                console.log("Gap to EMA70 (%):", athInfo.gapPercent);
        }

        if (previousATLInfo) {
                console.log("Previous ATL:", previousATLInfo.price, "on", previousATLInfo.time);
        }
        if (previousATHInfo) {
                console.log("Previous ATH:", previousATHInfo.price, "on", previousATHInfo.time);
        }


        const atl15mNum = atlInfo ? atlInfo.atl : null;
const ath15mNum = athInfo ? athInfo.ath : null;

const isValidAtl = atl15mNum !== null;
const isValidAth = ath15mNum !== null;

const athGap = isValid && isValidAth ? ((athNum - emaNum) / emaNum) * 100 : 0;
const atlGap = isValid && isValidAtl ? ((emaNum - atl15mNum) / atl15mNum) * 100 : 0;

        const getAthSignal = () => (athGap > 100 ? 'Bullish Continuation' : 'Possible Reversal');
        const getAtlSignal = () => (atlGap > 100 ? 'Bearish Continuation' : 'Possible Reversal');


        const computeBullishLevels = () => {
                const ema = parseFloat(ema70);
                const athNum = parseFloat(ath);
                if (isNaN(ema) || isNaN(athNum)) return {};
                return {
                        entry: ema * 1.02,
                        stopLoss: ema * 0.97,
                        takeProfit1: athNum * 0.98,
                        takeProfit2: athNum * 1.05,
                };
        };

        const computeBearishLevels = () => {
                const ema = parseFloat(ema70);
                const atlNum = parseFloat(atl);
                if (isNaN(ema) || isNaN(atlNum)) return {};
                return {
                        entry: ema * 0.98,
                        stopLoss: ema * 1.03,
                        takeProfit1: atlNum * 1.02,
                        takeProfit2: atlNum * 0.95,
                };
        };
        const computeBullishReversalFromAtl = () => {
                const atlNum = parseFloat(atl);
                const ema = parseFloat(ema70);
                if (isNaN(atlNum) || isNaN(ema)) return {};
                return {
                        entry: atlNum * 1.02,       // Entry just above ATL
                        stopLoss: atlNum * 0.97,    // SL below ATL
                        takeProfit1: atlNum * 1.10, // TP1: 10% above ATL
                        takeProfit2: atlNum * 1.20, // TP2: 20% above ATL
                };
        };


        const computeBearishReversalFromAth = () => {
                const athNum = parseFloat(ath);
                const ema = parseFloat(ema70);
                if (isNaN(athNum) || isNaN(ema)) return {};
                return {
                        entry: athNum * 0.98,         // Entry just below ATH
                        stopLoss: athNum * 1.03,      // SL above ATH
                        takeProfit1: athNum * 0.90,   // TP1 10% below ATH
                        takeProfit2: athNum * 0.80,   // TP2 20% below ATH
                };
        };


        const bullishReversal = computeBullishReversalFromAtl();
        const bearishReversal = computeBearishReversalFromAth();

        const bullish = computeBullishLevels();
        const bearish = computeBearishLevels();

        return (
  <div className="bg-gradient-to-r from-gray-900 via-black to-gray-900 text-white p-8 rounded-2xl shadow-2xl max-w-4xl mx-auto mt-10">
    <h1 className="text-4xl font-extrabold mb-4 text-yellow-400">
      Bitcoin Signal Analyzer
    </h1>
    <p className="text-lg mb-6 text-gray-300">
      <span className="font-semibold text-white">Smart Bitcoin Trading Starts Here.</span> Instantly analyze Bitcoin's market status using ATH, ATL, and EMA70 trends. This tool gives you actionable trade setups, identifies market zones (Buy or Sell), and provides real-time insights—all in one simple interface.
    </p>
    <div className="border-l-4 border-yellow-400 pl-4 text-sm text-yellow-100 italic">
      Plan smarter. Trade better.
    </div>

    <div className="space-y-6 bg-gray-950 p-6 rounded-xl text-white mt-6">
      <div className="bg-gray-900 p-4 rounded-lg border border-blue-600">
        <h2 className="text-lg font-semibold text-blue-400 mb-2">EMA70 (Live)</h2>
        <input
          type="text"
          placeholder="EMA70"
          className="bg-gray-800 text-white placeholder-gray-500 border border-blue-700 rounded px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 w-full"
          value={ema70 || ''}
          readOnly
        />
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

          <p>ATH: ${athNum.toFixed(2)}</p>
          <p>Gap: {athGap.toFixed(2)}%</p>
          <p>
            Market Zone:{' '}
            <span className={getAthSignal() === 'Bullish Continuation' ? 'text-green-500 font-bold' : 'text-yellow-500 font-bold'}>
              {getAthSignal() === 'Bullish Continuation' ? '🔥 Still in the Buy Zone' : '⚠️ Caution: Sell Zone'}
            </span>
          </p>

          <div className="text-sm bg-gray-700 p-3 rounded-lg border border-gray-600 space-y-1">
            <p className="font-semibold">Trade Setup:</p>
            <p>Entry: ${getAthSignal() === 'Bullish Continuation' ? bullish.entry.toFixed(2) : bearishReversal.entry.toFixed(2)}</p>
            <p>SL: ${getAthSignal() === 'Bullish Continuation' ? bullish.stopLoss.toFixed(2) : bearishReversal.stopLoss.toFixed(2)}</p>
            <p>TP: ${getAthSignal() === 'Bullish Continuation' ? bullish.takeProfit1.toFixed(2) : bearishReversal.takeProfit2.toFixed(2)} to ${getAthSignal() === 'Bullish Continuation' ? bullish.takeProfit2.toFixed(2) : bearishReversal.takeProfit1.toFixed(2)}</p>
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

          <p>ATL: ${atlNum.toFixed(2)}</p>
          <p>EMA70: ${ema70}</p>
          <p>Gap to EMA70: {atlGap.toFixed(2)}%</p>

          <p>
            Market Zone:{' '}
            <span className={getAtlSignal() === 'Bearish Continuation' ? 'text-red-500 font-bold' : 'text-green-500 font-bold'}>
              {getAtlSignal() === 'Bearish Continuation' ? '🔻 Still in the Sell Zone' : '🟢 Opportunity: Buy Zone'}
            </span>
          </p>

          <div className="text-sm bg-gray-700 p-3 rounded-lg border border-gray-600 space-y-1">
            <p className="font-semibold">Trade Setup:</p>
            <p>Entry: ${getAtlSignal() === 'Bearish Continuation' ? bearish.entry.toFixed(2) : bullishReversal.entry.toFixed(2)}</p>
            <p>SL: ${getAtlSignal() === 'Bearish Continuation' ? bearish.stopLoss.toFixed(2) : bullishReversal.stopLoss.toFixed(2)}</p>
            <p>TP: ${getAtlSignal() === 'Bearish Continuation' ? bearish.takeProfit2.toFixed(2) : bullishReversal.takeProfit1.toFixed(2)} to ${getAtlSignal() === 'Bearish Continuation' ? bearish.takeProfit1.toFixed(2) : bullishReversal.takeProfit2.toFixed(2)}</p>
          </div>
        </div>
      </>
    )}
  </div>
);
