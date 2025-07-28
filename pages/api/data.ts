// File: pages/api/data.ts

import { fetchRawCryptoSignals, RawCandleSignalData } from '../../lib/api';
import {
  calculateEMA, calculateRSI, getCurrentEMAGapPercentage, isEMA14InsideRange, getMainTrend,
  getRecentRSIDiff,
  detectBearishDivergence, detectBullishDivergence, detectBearishVolumeDivergence,
  detectBullishVolumeDivergence, get24hChangePercent,
  getSessions, getLastNSessionStartTimes, getRecentSessionHighs, getRecentSessionLows,
  detectTopPatterns, detectBottomPatterns, detectBullishToBearish, detectBearishToBullish,
  detectBullishSpike, detectBearishCollapse, getTestThreshold,
  CandleData, Timeframe as CalculationTimeframe,
} from '../../utils/calculations';

export type SignalData = {
  symbol: string;
  primarySignalText: string;
  latestRSI: number | undefined;
  priceChangePercent: number;
  isUp: boolean;
};

type Timeframe = CalculationTimeframe;

function getSignal(s: { rsi14: number[] }) {
  const pumpDump = s.rsi14 ? getRecentRSIDiff(s.rsi14, 14) : null;
  if (!pumpDump) return 'NO DATA';

  const { direction, strength, pumpStrength, dumpStrength } = pumpDump;

  if (direction === 'pump' && pumpStrength >= 30 && strength >= 15) {
    return 'MAX ZONE PUMP';
  }

  if (direction === 'dump' && dumpStrength >= 30 && strength >= 15) {
    return 'MAX ZONE DUMP';
  }

  if (direction === 'pump') return 'MILD PUMP';
  if (direction === 'dump') return 'MILD DUMP';

  return 'NO MOVEMENT';
}

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
      console.warn("[pages/api/data.ts] No raw signals data received. Returning empty array.");
      res.status(200).json([]);
      return;
    }

    const processedSignals: SignalData[] = rawSignalsData.map((s) => {
      try {
        const { symbol, closes, priceChangePercent } = s;
        const rsi14 = calculateRSI(closes, 14);
        const latestRSI = rsi14.at(-1);
        const isUp = priceChangePercent > 0;

        const primarySignalText = getSignal({ rsi14 });

        return {
          symbol,
          primarySignalText,
          latestRSI,
          priceChangePercent,
          isUp,
        };
      } catch (err) {
        console.error(`[data.ts] Error processing ${s.symbol}:`, err.message);
        return null;
      }
    }).filter((s): s is SignalData => s !== null);

    // ✅ Filter only "MAX ZONE" signals
    const maxZoneSignals = processedSignals.filter(
      (s) =>
        s.primarySignalText === 'MAX ZONE PUMP' ||
        s.primarySignalText === 'MAX ZONE DUMP'
    );

    console.log(`[pages/api/data.ts] Returning ${maxZoneSignals.length} MAX ZONE signals.`);
    res.status(200).json(maxZoneSignals);
  } catch (error: any) {
    console.error("[pages/api/data.ts] Signal API error:", error.message);
    res.status(500).json({ error: "Failed to generate signal data." });
  }
}
