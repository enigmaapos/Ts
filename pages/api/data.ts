// File: pages/api/data.ts (in Site A)

import { getCryptoSignals, SignalData as RawSignalData } from '../../hooks/useCryptoSignals';
import { calculateRSI, getRecentRSIDiff } from '../../utils/calculations';

// Define the structure of the data you will send back from this API
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
    // THIS IS THE CRUCIAL CHANGE AGAIN:
    // Destructure the 'signals' property from the object returned by useCryptoSignals()
    const { signals: rawSignalsData } = await getCryptoSignals();

    // Now 'rawSignalsData' is the SignalData[] you expect to map over
    const formatted: SiteAFormattedSignal[] = rawSignalsData.map((s) => {
      // Calculate RSI here if not already present in rawSignalsData
      // You'll need `s.closes` for this. Assuming closes are available.
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
