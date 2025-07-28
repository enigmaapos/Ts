// File: pages/api/data.ts (in Site A)

import { fetchRawCryptoSignals, RawCandleSignalData } from '../../lib/api';
import {
  calculateRSI,
  getRecentRSIDiff,
} from '../../utils/calculations';
import { Timeframe } from '../../hooks/useCryptoSignals';

interface SiteAFormattedSignal {
  symbol: string;
  signal: string;
  latestRSI: number | null;
}

// ✅ Standardized CORS Headers
const setCORSHeaders = (res: any) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
};

export default async function handler(req: any, res: any) {
  setCORSHeaders(res);

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  try {
    const requestedTimeframe: Timeframe = (req.query.timeframe as Timeframe) || '1d';
    const { signals: rawSignalsData } = await fetchRawCryptoSignals(requestedTimeframe);

    if (!rawSignalsData || rawSignalsData.length === 0) {
      console.warn("No signal data returned from fetchRawCryptoSignals");
      return res.status(200).json([]);
    }

    const formatted: SiteAFormattedSignal[] = rawSignalsData.map((s) => {
      const rsiArray = s.closes ? calculateRSI(s.closes, 14) : [];
      const latestRSI =
        rsiArray.length > 0 && !isNaN(rsiArray[rsiArray.length - 1])
          ? rsiArray[rsiArray.length - 1]
          : null;

      let signalText = 'NO SIGNAL';

      if (latestRSI !== null) {
        const pumpDump = getRecentRSIDiff(rsiArray, 14);
        if (pumpDump) {
          const { direction, pumpStrength: pump, dumpStrength: dump } = pumpDump;

          const inRange = (val: number | undefined, min: number, max: number) =>
            val !== undefined && val >= min && val <= max;
          const isAbove30 = (val: number | undefined) =>
            val !== undefined && val >= 30;

          if (direction === 'pump' && isAbove30(pump)) signalText = 'MAX ZONE PUMP';
          else if (direction === 'dump' && isAbove30(dump)) signalText = 'MAX ZONE DUMP';
          else if (direction === 'pump' && inRange(pump, 21, 26)) signalText = 'BALANCE ZONE PUMP';
          else if (direction === 'dump' && inRange(dump, 21, 26)) signalText = 'BALANCE ZONE DUMP';
          else if (direction === 'pump' && inRange(pump, 1, 10)) signalText = 'LOWEST ZONE PUMP';
          else if (direction === 'dump' && inRange(dump, 1, 10)) signalText = 'LOWEST ZONE DUMP';
        }
      }

      return {
        symbol: s.symbol,
        signal: signalText,
        latestRSI: latestRSI,
      };
    });

    res.status(200).json(formatted);
  } catch (error: any) {
    console.error("Signal API error:", error.message);
    res.status(500).json({ error: "Failed to generate signal data." });
  }
}
