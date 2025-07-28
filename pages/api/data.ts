// File: pages/api/data.ts (in Site A)

import { fetchRawCryptoSignals, RawCandleSignalData } from '../../lib/api'; // <--- Import the new data fetching function and its type
import { calculateRSI, getRecentRSIDiff, CandleData, getMainTrend, getSessions, getLastNSessionStartTimes, getRecentSessionHighs, getRecentSessionLows, detectTopPatterns, detectBottomPatterns, isEMA14InsideRange, getCurrentEMAGapPercentage, detectBearishDivergence, detectBullishDivergence, detectBearishVolumeDivergence, detectBullishVolumeDivergence, getTestThreshold, calculateEMA, detectBullishToBearish, detectBearishToBullish, detectBullishSpike, detectBearishCollapse } from '../../utils/calculations'; // Ensure all needed calculation functions are imported
import { SignalData as FullSignalData, Timeframe } from '../../hooks/useCryptoSignals'; // Use a different alias for the full SignalData

interface SiteAFormattedSignal {
  symbol: string;
  signal: string;
  latestRSI: number | null;
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
    // Get timeframe from query parameter, default to '1d' if not provided
    const requestedTimeframe: Timeframe = (req.query.timeframe as Timeframe) || '1d';

    // Now 'rawSignalsData' will be of type RawCandleSignalData[]
    const { signals: rawSignalsData } = await fetchRawCryptoSignals(requestedTimeframe);

    const formatted: SiteAFormattedSignal[] = rawSignalsData.map((s) => {
      // You need more raw data than just `closes` to perform ALL the calculations
      // that `useCryptoSignals` does.
      // This API route currently only assumes `closes` is available from `RawCandleSignalData`.
      // If you want to compute all SignalData properties, `fetchRawCryptoSignals`
      // will need to return `opens`, `highs`, `lows`, `volumes` arrays as well.

      // For the purpose of this API (Site A DataLoader), we only care about
      // `symbol`, `signal`, and `latestRSI`. The `signal` itself is derived
      // from RSI, so `closes` is sufficient for that.

      const rsiArray = s.closes ? calculateRSI(s.closes, 14) : [];
      const latestRSI = rsiArray.length > 0 && !isNaN(rsiArray[rsiArray.length - 1])
        ? rsiArray[rsiArray.length - 1]
        : null;

      let signalText = 'NO SIGNAL';
      if (latestRSI !== null) {
        const pumpDump = getRecentRSIDiff(rsiArray, 14);
        if (pumpDump) {
          const direction = pumpDump.direction;
          const pump = pumpDump.pumpStrength;
          const dump = pumpDump.dumpStrength;

          const inRange = (val: number | undefined, min: number, max: number) =>
            val !== undefined && val >= min && val <= max;
          const isAbove30 = (val: number | undefined) =>
            val !== undefined && val >= 30;

          const pumpAbove30 = isAbove30(pump);
          const dumpAbove30 = isAbove30(dump);
          const pumpInRange_21_26 = inRange(pump, 21, 26);
          const dumpInRange_21_26 = inRange(dump, 21, 26);
          const pumpInRange_1_10 = inRange(pump, 1, 10);
          const dumpInRange_1_10 = inRange(dump, 1, 10);

          if (direction === 'pump' && pumpAbove30) signalText = 'MAX ZONE PUMP';
          else if (direction === 'dump' && dumpAbove30) signalText = 'MAX ZONE DUMP';
          else if (pumpInRange_21_26 && direction === 'pump') signalText = 'BALANCE ZONE PUMP';
          else if (dumpInRange_21_26 && direction === 'dump') signalText = 'BALANCE ZONE DUMP';
          else if (pumpInRange_1_10 && direction === 'pump') signalText = 'LOWEST ZONE PUMP';
          else if (dumpInRange_1_10 && direction === 'dump') signalText = 'LOWEST ZONE DUMP';
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
