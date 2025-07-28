import { useState, useEffect, useCallback } from "react";
import {
  calculateEMA,
  calculateRSI,
  getCurrentEMAGapPercentage,
  isEMA14InsideRange,
  getMainTrend,
  getRecentRSIDiff,
  detectBearishDivergence,
  detectBullishDivergence,
  detectBearishVolumeDivergence,
  detectBullishVolumeDivergence,
  get24hChangePercent, // Unused in provided code, but kept for completeness
  getSessions,
  getLastNSessionStartTimes,
  getRecentSessionHighs,
  getRecentSessionLows,
  detectTopPatterns,
  detectBottomPatterns,
  detectBullishToBearish,
  detectBearishToBullish,
  detectBullishSpike,
  detectBearishCollapse,
  getTestThreshold,
  CandleData,
  Timeframe as CalculationTimeframe, // Renamed to avoid conflict with exported Timeframe
} from "../utils/calculations"; // Adjust path as needed

const BATCH_SIZE = 10;
const INTERVAL_MS = 1000;
const timeframes = ['15m', '4h', '1d'] as const;

// EXPORT THE TIMEFRAME TYPE
export type Timeframe = '15m' | '4h' | '1d'; // Added 'export'

export type SignalData = {
  symbol: string;
  bullishMainTrendCount?: number;
  bearishMainTrendCount?: number;
  bullishBreakoutCount?: number;
  bearishBreakoutCount?: number;
  testedPrevHighCount?: number;
  testedPrevLowCount?: number;
  mainTrend: ReturnType<typeof getMainTrend>;
  breakout: boolean;
  bullishBreakout: boolean;
  bearishBreakout: boolean;
  prevClosedGreen: boolean | null;
  prevClosedRed: boolean | null;
  bullishReversalCount?: number;
  bearishReversalCount?: number;
  bullishReversal: ReturnType<typeof detectBullishToBearish>;
  bearishReversal: ReturnType<typeof detectBearishToBullish>;
  bullishSpike: ReturnType<typeof detectBullishSpike>;
  bearishCollapse: ReturnType<typeof detectBearishCollapse>;
  rsi14: number[];
  latestRSI: number | undefined;
  testedPrevHigh: boolean;
  testedPrevLow: boolean;
  isDoubleTop: boolean;
  isDescendingTop: boolean;
  isDoubleTopFailure: boolean;
  isDoubleBottom: boolean;
  isAscendingBottom: boolean;
  isDoubleBottomFailure: boolean;
  breakoutTestSignal: string;
  breakoutFailure: boolean;
  failedBearishBreak: boolean;
  failedBullishBreak: boolean;
  ema14InsideResults: ReturnType<typeof isEMA14InsideRange>;
  ema14InsideResultsCount?: number;
  gap: number | null;
  gap1: number | null;
  ema14Bounce: boolean;
  ema70Bounce: boolean;
  ema200Bounce: boolean;
  touchedEMA200Today: boolean;
  bearishDivergence: ReturnType<typeof detectBearishDivergence>;
  bullishDivergence: ReturnType<typeof detectBullishDivergence>;
  bearishVolumeDivergence: ReturnType<typeof detectBearishVolumeDivergence>;
  bullishVolumeDivergence: ReturnType<typeof detectBullishVolumeDivergence>;
  highestVolumeColorPrev: 'green' | 'red' | 'neutral';
  greenVolumeCount?: number;
  redVolumeCount?: number;
  isVolumeSpike: boolean;
  hasBullishEngulfing: boolean;
  hasBearishEngulfing: boolean;
  currentPrice: number;
  price24hAgo: number;
  priceChangePercent: number;
  isUp: boolean;
  greenPriceChangeCount?: number;
  redPriceChangeCount?: number;
  gapFromLowToEMA200: number | null;
  gapFromHighToEMA200: number | null;
  closes?: number[]; // ADD THIS if `fetchRawCryptoSignals` adds it for RSI calculation
};

export const useCryptoSignals = (timeframe: Timeframe) => {
  const [signals, setSignals] = useState<SignalData[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdatedMap, setLastUpdatedMap] = useState<{ [symbol: string]: number }>({});

  const fetchAndAnalyze = useCallback(
    async (symbol: string, interval: Timeframe) => {
      try {
        const raw = await fetch(
          `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=500`
        ).then((res) => res.json());

        const candles: CandleData[] = raw.map((c: any) => ({
          timestamp: c[0],
          open: +c[1],
          high: +c[2],
          low: +c[3],
          close: +c[4],
          volume: +c[5],
        }));

        const closes = candles.map((c) => c.close);
        const highs = candles.map((c) => c.high);
        const lows = candles.map((c) => c.low);
        const volumes = candles.map((c) => c.volume);
        const opens = candles.map((c) => c.open);

        const ema14 = calculateEMA(closes, 14);
        const ema70 = calculateEMA(closes, 70);
        const ema200 = calculateEMA(closes, 200);
        const rsi14 = calculateRSI(closes, 14);

        candles.forEach((c, i) => {
          c.rsi = rsi14[i];
          c.volumeColor = c.close > c.open ? 'green' : c.close < c.open ? 'red' : 'neutral';
        });

        const ticker24h = await fetch(
          `https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=${symbol}`
        ).then((res) => res.json());

        const currentPrice = parseFloat(ticker24h.lastPrice);
        const price24hAgo = parseFloat(ticker24h.openPrice);
        const priceChangePercent = parseFloat(ticker24h.priceChangePercent);
        const isUp = priceChangePercent > 0;

        const lastOpen = candles.at(-1)?.open!;
        const lastClose = candles.at(-1)?.close!;
        const lastEMA14 = ema14.at(-1)!;
        const lastEMA70 = ema70.at(-1)!;
        const lastEMA200 = ema200.at(-1)!;

        const mainTrend = getMainTrend(ema70, ema200, closes, opens, highs, lows);

        const { sessionStart, sessionEnd, prevSessionStart, prevSessionEnd } = getSessions(interval);

        const candlesToday = candles.filter((c) => c.timestamp >= sessionStart && c.timestamp <= sessionEnd);
        const candlesPrev = candles.filter((c) => c.timestamp >= prevSessionStart && c.timestamp <= prevSessionEnd);

        const todaysLowestLow = candlesToday.length > 0 ? Math.min(...candlesToday.map((c) => c.low)) : null;
        const todaysHighestHigh = candlesToday.length > 0 ? Math.max(...candlesToday.map((c) => c.high)) : null;
        const prevSessionLow = candlesPrev.length > 0 ? Math.min(...candlesPrev.map((c) => c.low)) : null;
        const prevSessionHigh = candlesPrev.length > 0 ? Math.max(...candlesPrev.map((c) => c.high)) : null;

        const prevSessionCandles = candles.filter((candle) => {
          return candle.timestamp >= prevSessionStart && candle.timestamp <= prevSessionEnd;
        });

        let prevClosedGreen: boolean | null = null;
        let prevClosedRed: boolean | null = null;

        if (prevSessionCandles.length >= 2) {
          const firstCandle = prevSessionCandles[0];
          const lastCandle = prevSessionCandles[prevSessionCandles.length - 1];
          prevClosedGreen = lastCandle.close > firstCandle.open;
          prevClosedRed = lastCandle.close < firstCandle.open;
        }

        const bullishBreakout = todaysHighestHigh !== null && prevSessionHigh !== null && todaysHighestHigh > prevSessionHigh;
        const bearishBreakout = todaysLowestLow !== null && prevSessionLow !== null && todaysLowestLow < prevSessionLow;
        const breakout = bullishBreakout || bearishBreakout;

        const failedBullishBreak = todaysHighestHigh !== null && prevSessionHigh !== null && todaysHighestHigh <= prevSessionHigh;
        const failedBearishBreak = todaysLowestLow !== null && prevSessionLow !== null && todaysLowestLow >= prevSessionLow;
        const breakoutFailure = failedBullishBreak && failedBearishBreak;

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

        const sessionStartTimes = getLastNSessionStartTimes(2);
        const sessionHighs = getRecentSessionHighs(candles, sessionStartTimes);
        const sessionLows = getRecentSessionLows(candles, sessionStartTimes);

        const { isDoubleTop, isDescendingTop, isDoubleTopFailure } = detectTopPatterns(sessionHighs);
        const { isDoubleBottom, isAscendingBottom, isDoubleBottomFailure } = detectBottomPatterns(sessionLows);

        const ema14InsideResults = isEMA14InsideRange(ema14, ema70, ema200, 5);

        const gap = getCurrentEMAGapPercentage(closes, 14, 70);
        const gap1 = getCurrentEMAGapPercentage(closes, 70, 200);

        const nearEMA14 = closes.slice(-3).some(c => Math.abs(c - lastEMA14) / c < 0.002);
        const nearEMA70 = closes.slice(-3).some(c => Math.abs(c - lastEMA70) / c < 0.002);
        const nearEMA200 = closes.slice(-3).some(c => Math.abs(c - lastEMA200) / c < 0.002);

        const ema14Bounce = nearEMA14 && lastClose > lastEMA14;
        const ema70Bounce = nearEMA70 && lastClose > lastEMA70;
        const ema200Bounce = nearEMA200 && lastClose > lastEMA200;
        const touchedEMA200Today =
          todaysHighestHigh! >= lastEMA200 &&
          todaysLowestLow! <= lastEMA200 &&
          candlesToday.some(c => Math.abs(c.close - lastEMA200) / c.close < 0.002);

        const highsPrev = candlesPrev.map(c => c.high);
        const highsToday = candlesToday.map(c => c.high);
        const lowsPrev = candlesPrev.map(c => c.low);
        const lowsToday = candlesToday.map(c => c.low);

        const prevHigh = Math.max(...highsPrev);
        const currHigh = Math.max(...highsToday);

        const prevLow = Math.min(...lowsPrev);
        const currLow = Math.min(...lowsToday);

        const rsiPrev = rsi14[rsi14.length - candlesToday.length - 1];
        const rsiCurr = rsi14[rsi14.length - 1];

        const bearishDivergence = detectBearishDivergence(prevHigh, currHigh, rsiPrev, rsiCurr);
        const bullishDivergence = detectBullishDivergence(prevLow, currLow, rsiPrev, rsiCurr);

        const volumesPrev = candlesPrev.map(c => c.volume);
        const volumesToday = candlesToday.map(c => c.volume);

        const volumePrev = Math.max(...volumesPrev);
        const volumeCurr = Math.max(...volumesToday);

        const bearishVolumeDivergence = detectBearishVolumeDivergence(prevHigh, currHigh, volumePrev, volumeCurr);
        const bullishVolumeDivergence = detectBullishVolumeDivergence(prevLow, currLow, volumePrev, volumeCurr);

        const prevVolumesWithColor = candlesPrev.map(candle => ({
          ...candle,
          volumeColor: candle.close > candle.open ? 'green' : candle.close < candle.open ? 'red' : 'neutral',
        }));

        const highestVolumeCandlePrev = prevVolumesWithColor.reduce((max, curr) =>
          curr.volume > max.volume ? curr : max, prevVolumesWithColor[0]);

        const highestVolumeColorPrev = highestVolumeCandlePrev?.volumeColor ?? 'neutral';

        const avgPrevVolume = candlesPrev.reduce((sum, c) => sum + c.volume, 0) / candlesPrev.length;
        const latestCandle = candles[candles.length - 1];
        const recentVolume = latestCandle?.volume ?? 0;
        const isVolumeSpike = recentVolume > avgPrevVolume * 1.5;

        const engulfingPatterns = [];
        let sessionHigh = -Infinity;
        let sessionLow = Infinity;
        let sessionHighIndex = -1;
        let sessionLowIndex = -1;

        candlesToday.forEach((candle, idx) => {
          if (candle.high > sessionHigh) {
            sessionHigh = candle.high;
            sessionHighIndex = idx;
          }
          if (candle.low < sessionLow) {
            sessionLow = candle.low;
            sessionLowIndex = idx;
          }
        });

        for (let i = 1; i < candlesToday.length - 1; i++) {
          const prev = candlesToday[i - 1];
          const curr = candlesToday[i];
          const next = candlesToday[i + 1];

          const isPrevBearish = prev.close < prev.open;
          const isCurrBullish = curr.close > curr.open;
          const isNextBullish = next.close > next.open;

          const isPrevBullish = prev.close > prev.open;
          const isCurrBearish = curr.close < curr.open;
          const isNextBearish = next.close < curr.open; // Corrected: next.close < curr.open, not next.close < prev.open

          const bullishEngulfing =
            isPrevBearish &&
            isCurrBullish &&
            curr.open < prev.close &&
            curr.close > prev.open;

          const bearishEngulfing =
            isPrevBullish &&
            isCurrBearish &&
            curr.open > prev.close &&
            curr.close < prev.open;

          const bullishConfirmed =
            bullishEngulfing &&
            isNextBullish &&
            next.close > curr.close &&
            i > sessionHighIndex;

          const bearishConfirmed =
            bearishEngulfing &&
            isNextBearish &&
            next.close < curr.close &&
            i > sessionLowIndex;

          if (bullishConfirmed) {
            engulfingPatterns.push({ index: i, type: 'bullishConfirmed', candle: curr, confirm: next });
          } else if (bearishConfirmed) {
            engulfingPatterns.push({ index: i, type: 'bearishConfirmed', candle: curr, confirm: next });
          }
        }

        const hasBullishEngulfing = engulfingPatterns.some(p => p.type === 'bullishConfirmed');
        const hasBearishEngulfing = engulfingPatterns.some(p => p.type === 'bearishConfirmed');

        const latestRSI = rsi14.at(-1);

        const ema200Value = ema200[ema200.length - 1];

        let gapFromLowToEMA200 = null;
        let gapFromHighToEMA200 = null;

        if (todaysLowestLow !== null && ema200Value > 0) {
          gapFromLowToEMA200 = ((ema200Value - todaysLowestLow) / ema200Value) * 100;
        }

        if (todaysHighestHigh !== null && ema200Value > 0) {
          gapFromHighToEMA200 = ((todaysHighestHigh - ema200Value) / ema200Value) * 100;
        }

        const bullishReversal = detectBullishToBearish(
          ema14, ema70, ema200, rsi14, lows, highs, closes, opens
        );
        const bearishReversal = detectBearishToBullish(
          ema14, ema70, ema200, rsi14, highs, lows, closes, opens
        );
        const bullishSpike = detectBullishSpike(
          ema14, ema70, ema200, rsi14, lows, highs, closes, opens, bullishBreakout, bearishBreakout
        );
        const bearishCollapse = detectBearishCollapse(
          ema14, ema70, ema200, rsi14, lows, highs, closes, opens, bullishBreakout, bearishBreakout
        );

        return {
          symbol,
          mainTrend,
          breakout,
          bullishBreakout,
          bearishBreakout,
          prevClosedGreen,
          prevClosedRed,
          bullishReversal,
          bearishReversal,
          bullishSpike,
          bearishCollapse,
          rsi14,
          latestRSI,
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
          ema14InsideResults,
          gap,
          gap1,
          ema14Bounce,
          ema70Bounce,
          ema200Bounce,
          touchedEMA200Today,
          bearishDivergence,
          bullishDivergence,
          bearishVolumeDivergence,
          bullishVolumeDivergence,
          highestVolumeColorPrev,
          isVolumeSpike,
          hasBullishEngulfing,
          hasBearishEngulfing,
          currentPrice,
          price24hAgo,
          priceChangePercent,
          isUp,
          gapFromLowToEMA200,
          gapFromHighToEMA200,
          closes: closes // Added 'closes' to SignalData being returned by the hook's fetchAndAnalyze
        } as SignalData; // Cast to SignalData
      } catch (err) {
        console.error("Error processing", symbol, err);
        return null;
      }
    },
    [timeframe] // Re-create if timeframe changes
  );

  useEffect(() => {
    let isMounted = true;
    let currentIndex = 0;
    let symbols: string[] = [];

    const fetchSymbols = async () => {
      const info = await fetch("https://fapi.binance.com/fapi/v1/exchangeInfo").then(res => res.json());
      symbols = info.symbols
        .filter((s: any) => s.contractType === "PERPETUAL" && s.quoteAsset === "USDT")
        .slice(0, 500)
        .map((s: any) => s.symbol);
    };

    const fetchBatch = async () => {
      if (!symbols.length) return;

      const batch = symbols.slice(currentIndex, currentIndex + BATCH_SIZE);
      currentIndex = (currentIndex + BATCH_SIZE) % symbols.length;

      const results = await Promise.all(
        batch.map((symbol) => fetchAndAnalyze(symbol, timeframe))
      );
      const cleanedResults = results.filter((r) => r !== null);

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
        setLoading(false);
      }
    };

    const runBatches = async () => {
      setLoading(true);
      setSignals([]); // Clear previous signals when timeframe changes
      await fetchSymbols();
      await fetchBatch(); // Initial fetch
      const intervalId = setInterval(fetchBatch, INTERVAL_MS);
      return () => clearInterval(intervalId);
    };

    let cleanupPromise: Promise<() => void>;
    cleanupPromise = runBatches();

    return () => {
      isMounted = false;
      cleanupPromise.then(cleanup => cleanup());
    };
  }, [timeframe, fetchAndAnalyze]);

  return { signals, loading, lastUpdatedMap, timeframes };
};
