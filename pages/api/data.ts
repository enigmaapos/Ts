// File: pages/api/data.ts (in Site A)

// Import RawCandleSignalData if it's still needed internally for type definitions
import { fetchRawCryptoSignals, RawCandleSignalData } from '../../lib/api'; // This now gives you the raw data
import {
  calculateEMA, calculateRSI, getCurrentEMAGapPercentage, isEMA14InsideRange, getMainTrend,
  getRecentRSIDiff, // <-- Still needed here if getSignal uses it
  detectBearishDivergence, detectBullishDivergence, detectBearishVolumeDivergence,
  detectBullishVolumeDivergence, get24hChangePercent,
  getSessions, getLastNSessionStartTimes, getRecentSessionHighs, getRecentSessionLows,
  detectTopPatterns, detectBottomPatterns, detectBullishToBearish, detectBearishToBullish,
  detectBullishSpike, detectBearishCollapse, getTestThreshold,
  CandleData, // Need CandleData type here for internal processing
  Timeframe as CalculationTimeframe, // Use alias to avoid conflict if you export a Timeframe here
  getSignal // <-- IMPORT getSignal here
} from '../../utils/calculations';

// Define the exact structure of the signal data you want to send to the frontend.
// This MUST match the `SignalData` type in your `useCryptoSignals.ts` hook.
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
  closes?: number[]; // Only include if frontend needs the raw closes for something
  // *** ADD THIS NEW FIELD ***
  primarySignalText: string;
};

// This type should match Timeframe from `utils/calculations`
type Timeframe = CalculationTimeframe;

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  try {
    const requestedTimeframe: Timeframe = (req.query.timeframe as Timeframe) || '1d';

    console.log(`[pages/api/data.ts] Received request for timeframe: ${requestedTimeframe}`);

    const { signals: rawSignalsData } = await fetchRawCryptoSignals(requestedTimeframe);

    if (!rawSignalsData || rawSignalsData.length === 0) {
      console.warn("[pages/api/data.ts] No raw signals data received from fetchRawCryptoSignals. Returning empty array.");
      res.status(200).json([]);
      return;
    }

    const processedSignals: SignalData[] = rawSignalsData.map((s) => {
      try {
        const symbol = s.symbol;
        const candles = s.candles;
        const closes = s.closes;
        const highs = s.highs;
        const lows = s.lows;
        const volumes = s.volumes;
        const opens = s.opens;
        const currentPrice = s.currentPrice;
        const price24hAgo = s.price24hAgo;
        const priceChangePercent = s.priceChangePercent;
        const isUp = priceChangePercent > 0;

        const ema14 = calculateEMA(closes, 14);
        const ema70 = calculateEMA(closes, 70);
        const ema200 = calculateEMA(closes, 200);
        const rsi14 = calculateRSI(closes, 14);

        const processedCandles: CandleData[] = candles.map((c, i) => ({
          ...c,
          rsi: rsi14[i],
          volumeColor: c.close > c.open ? 'green' : c.close < c.open ? 'red' : 'neutral',
        }));

        const lastOpen = processedCandles.at(-1)?.open!;
        const lastClose = processedCandles.at(-1)?.close!;
        const lastEMA14 = ema14.at(-1)!;
        const lastEMA70 = ema70.at(-1)!;
        const lastEMA200 = ema200.at(-1)!;

        const mainTrend = getMainTrend(ema70, ema200, closes, opens, highs, lows);

        const { sessionStart, sessionEnd, prevSessionStart, prevSessionEnd } = getSessions(requestedTimeframe);

        const candlesToday = processedCandles.filter((c) => c.timestamp >= sessionStart && c.timestamp <= sessionEnd);
        const candlesPrev = processedCandles.filter((c) => c.timestamp >= prevSessionStart && c.timestamp <= prevSessionEnd);

        const todaysLowestLow = candlesToday.length > 0 ? Math.min(...candlesToday.map((c) => c.low)) : null;
        const todaysHighestHigh = candlesToday.length > 0 ? Math.max(...candlesToday.map((c) => c.high)) : null;
        const prevSessionLow = candlesPrev.length > 0 ? Math.min(...candlesPrev.map((c) => c.low)) : null;
        const prevSessionHigh = candlesPrev.length > 0 ? Math.max(...candlesPrev.map((c) => c.high)) : null;

        const prevSessionCandles = processedCandles.filter((candle) => {
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
        const sessionHighs = getRecentSessionHighs(processedCandles, sessionStartTimes);
        const sessionLows = getRecentSessionLows(processedCandles, sessionStartTimes);

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

        const rsiPrev = rsi14.length > candlesToday.length ? rsi14[rsi14.length - candlesToday.length - 1] : undefined;
        const rsiCurr = rsi14.at(-1);

        const bearishDivergence = detectBearishDivergence(prevHigh, currHigh, rsiPrev, rsiCurr);
        const bullishDivergence = detectBullishDivergence(prevLow, currLow, rsiPrev, rsiCurr);

        const volumesPrev = candlesPrev.map(c => c.volume);
        const volumesToday = candlesToday.map(c => c.volume);

        const volumePrev = volumesPrev.length > 0 ? Math.max(...volumesPrev) : 0;
        const volumeCurr = volumesToday.length > 0 ? Math.max(...volumesToday) : 0;

        const bearishVolumeDivergence = detectBearishVolumeDivergence(prevHigh, currHigh, volumePrev, volumeCurr);
        const bullishVolumeDivergence = detectBullishVolumeDivergence(prevLow, currLow, volumePrev, volumeCurr);

        const prevVolumesWithColor = prevSessionCandles.map(candle => ({
          ...candle,
          volumeColor: candle.close > candle.open ? 'green' : candle.close < candle.open ? 'red' : 'neutral',
        }));

        const highestVolumeCandlePrev = prevVolumesWithColor.length > 0 ? prevVolumesWithColor.reduce((max, curr) =>
          curr.volume > max.volume ? curr : max, prevVolumesWithColor[0]) : null;

        const highestVolumeColorPrev = highestVolumeCandlePrev?.volumeColor ?? 'neutral';

        const avgPrevVolume = volumesPrev.length > 0 ? volumesPrev.reduce((sum, v) => sum + v, 0) / volumesPrev.length : 0;
        const latestCandle = processedCandles[processedCandles.length - 1];
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
          const isNextBearish = next.close < curr.close;

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

        // *** CALCULATE THE PRIMARY SIGNAL TEXT HERE ***
        // You'll need to define this `getSignal` function based on your `utils/calculations`.
        // If it takes (rsi: number[], period: number) as before, then:
        const primarySignalText = getSignal(rsi14, 14);

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
          closes: closes,
          // *** ADD THE NEWLY CALCULATED FIELD ***
          primarySignalText,
        } as SignalData;
      } catch (processingError: any) {
        console.error(`[pages/api/data.ts] Error processing signal data for ${s.symbol}:`, processingError.message);
        return null;
      }
    }).filter((s): s is SignalData => s !== null);

    console.log(`[pages/api/data.ts] Successfully processed ${processedSignals.length} signals.`);
    res.status(200).json(processedSignals);
  } catch (error: any) {
    console.error("[pages/api/data.ts] Signal API overall error:", error.message);
    res.status(500).json({ error: "Failed to generate signal data." });
  }
}
