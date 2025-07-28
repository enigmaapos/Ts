// File: hooks/useCryptoSignals.ts

import { useState, useEffect, useCallback, useRef } from "react";

export type Timeframe = '15m' | '4h' | '1d';

// SignalData type must EXACTLY match what your /api/data endpoint returns
export type SignalData = {
  symbol: string;
  bullishMainTrendCount?: number;
  bearishMainTrendCount?: number;
  bullishBreakoutCount?: number;
  bearishBreakoutCount?: number;
  testedPrevHighCount?: number;
  testedPrevLowCount?: number;
  mainTrend: any; // Using 'any' as ReturnType<typeof getMainTrend> isn't available here
  breakout: boolean;
  bullishBreakout: boolean;
  bearishBreakout: boolean;
  prevClosedGreen: boolean | null;
  prevClosedRed: boolean | null;
  bullishReversalCount?: number;
  bearishReversalCount?: number;
  bullishReversal: any; // Using 'any'
  bearishReversal: any; // Using 'any'
  bullishSpike: any; // Using 'any'
  bearishCollapse: any; // Using 'any'
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
  ema14InsideResults: any; // Using 'any'
  ema14InsideResultsCount?: number;
  gap: number | null;
  gap1: number | null;
  ema14Bounce: boolean;
  ema70Bounce: boolean;
  ema200Bounce: boolean;
  touchedEMA200Today: boolean;
  bearishDivergence: any; // Using 'any'
  bullishDivergence: any; // Using 'any'
  bearishVolumeDivergence: any; // Using 'any'
  bullishVolumeDivergence: any; // Using 'any'
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
  // *** ADD THIS NEW FIELD ***
  primarySignalText: string;
};

export const useCryptoSignals = (timeframe: Timeframe) => {
  const [signals, setSignals] = useState<SignalData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedMap, setLastUpdatedMap] = useState<{ [symbol: string]: number }>({});
  const timeframesList = ['15m', '4h', '1d'] as const;

  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchDataFromAPI = useCallback(async (tf: Timeframe) => {
    setLoading(true);
    setError(null);
    try {
      console.log(`[useCryptoSignals] Fetching processed signals from your API for timeframe: ${tf}`);
      const response = await fetch(`/api/data?timeframe=${tf}`);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API response error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const data: SignalData[] = await response.json();

      setSignals(data);
      const newLastUpdatedMap: { [symbol: string]: number } = {};
      data.forEach(s => {
        newLastUpdatedMap[s.symbol] = Date.now();
      });
      setLastUpdatedMap(newLastUpdatedMap);
      console.log(`[useCryptoSignals] Successfully loaded ${data.length} processed signals.`);

    } catch (err: any) {
      console.error("[useCryptoSignals] Error fetching signals from your API:", err);
      setError(err.message || "Failed to load signals from server.");
      setSignals([]);
      setLastUpdatedMap({});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    fetchDataFromAPI(timeframe);

    const pollingInterval = timeframe === '15m' ? 60 * 1000 : 5 * 60 * 1000;
    intervalRef.current = setInterval(() => fetchDataFromAPI(timeframe), pollingInterval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [timeframe, fetchDataFromAPI]);

  return { signals, loading, error, lastUpdatedMap, timeframes: timeframesList };
};
