// File: hooks/useCryptoSignals.ts

import { useState, useEffect, useCallback, useRef } from "react";
// Remove all calculation imports, as the server will handle them
// import { calculateEMA, calculateRSI, ... } from "../utils/calculations";

// Re-export Timeframe type if it's strictly defined here and used elsewhere
export type Timeframe = '15m' | '4h' | '1d';

// SignalData type must EXACTLY match what your /api/data endpoint returns
// This is critical for type safety and ensuring your frontend receives what it expects.
// Copied directly from the pages/api/data.ts version above
export type SignalData = {
  symbol: string;
  bullishMainTrendCount?: number;
  bearishMainTrendCount?: number;
  bullishBreakoutCount?: number;
  bearishBreakoutCount?: number;
  testedPrevHighCount?: number;
  testedPrevLowCount?: number;
  mainTrend: any; // ReturnType<typeof getMainTrend> won't be available here, use 'any' or define type literally
  breakout: boolean;
  bullishBreakout: boolean;
  bearishBreakout: boolean;
  prevClosedGreen: boolean | null;
  prevClosedRed: boolean | null;
  bullishReversalCount?: number;
  bearishReversalCount?: number;
  bullishReversal: any; // ReturnType<typeof detectBullishToBearish>
  bearishReversal: any; // ReturnType<typeof detectBearishToBullish>
  bullishSpike: any; // ReturnType<typeof detectBullishSpike>
  bearishCollapse: any; // ReturnType<typeof detectBearishCollapse>
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
  ema14InsideResults: any; // ReturnType<typeof isEMA14InsideRange>
  ema14InsideResultsCount?: number;
  gap: number | null;
  gap1: number | null;
  ema14Bounce: boolean;
  ema70Bounce: boolean;
  ema200Bounce: boolean;
  touchedEMA200Today: boolean;
  bearishDivergence: any; // ReturnType<typeof detectBearishDivergence>
  bullishDivergence: any; // ReturnType<typeof detectBullishDivergence>
  bearishVolumeDivergence: any; // ReturnType<typeof detectBearishVolumeDivergence>
  bullishVolumeDivergence: any; // ReturnType<typeof detectBullishVolumeDivergence>
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
  closes?: number[];
};

export const useCryptoSignals = (timeframe: Timeframe) => {
  const [signals, setSignals] = useState<SignalData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedMap, setLastUpdatedMap] = useState<{ [symbol: string]: number }>({});
  const timeframesList = ['15m', '4h', '1d'] as const; // Still hardcode or fetch from API if dynamic

  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchDataFromAPI = useCallback(async (tf: Timeframe) => {
    setLoading(true);
    setError(null); // Clear any previous errors
    try {
      console.log(`[useCryptoSignals] Fetching processed signals from your API for timeframe: ${tf}`);
      // THIS IS THE ONLY API CALL NOW
      const response = await fetch(`/api/data?timeframe=${tf}`);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API response error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const data: SignalData[] = await response.json();

      setSignals(data);
      // Update lastUpdatedMap based on when the API call completed
      const newLastUpdatedMap: { [symbol: string]: number } = {};
      data.forEach(s => {
        newLastUpdatedMap[s.symbol] = Date.now();
      });
      setLastUpdatedMap(newLastUpdatedMap);
      console.log(`[useCryptoSignals] Successfully loaded ${data.length} processed signals.`);

    } catch (err: any) {
      console.error("[useCryptoSignals] Error fetching signals from your API:", err);
      setError(err.message || "Failed to load signals from server.");
      setSignals([]); // Clear signals on error
      setLastUpdatedMap({});
    } finally {
      setLoading(false);
    }
  }, []); // No dependencies as it always fetches from /api/data

  useEffect(() => {
    // Clear any existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    // Fetch data initially
    fetchDataFromAPI(timeframe);

    // Set up polling (adjust interval based on how often you want to refresh from your API)
    // Be mindful of Vercel function invocation limits and execution time if too frequent.
    const pollingInterval = timeframe === '15m' ? 60 * 1000 : 5 * 60 * 1000; // 1 min for 15m, 5 min for others
    intervalRef.current = setInterval(() => fetchDataFromAPI(timeframe), pollingInterval);

    // Cleanup on unmount or timeframe change
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [timeframe, fetchDataFromAPI]); // Re-run effect when timeframe changes or fetchDataFromAPI changes (though it's useCallback'd)

  return { signals, loading, error, lastUpdatedMap, timeframes: timeframesList };
};
