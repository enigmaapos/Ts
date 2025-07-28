// File: pages/api/data.ts (in Site A)

import { useCryptoSignals, SignalData } from '../../hooks/useCryptoSignals'; // Assuming SignalData structure comes from here
import { calculateRSI, getRecentRSIDiff } from '../../utils/calculations'; // Assuming these functions exist and are correct

// Define the structure of the data you will send back from this API
// This should match the SignalItem interface in your frontend's SiteADataLoader
interface SiteAFormattedSignal {
  symbol: string;
  signal: string;
  latestRSI: number | null;
}

export default async function handler(req: any, res: any) { // Use 'any' for req/res in Next.js API route for simplicity if not setting up full types
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  try {
    // 1. Fetch raw signals data.
    // IMPORTANT: Modify getCryptoSignals() or ensure the data it returns includes
    // a 'closes' array for RSI calculation if 'latestRSI' is not directly provided.
    // For this example, let's assume `RawSignalData` has a `closes: number[]` property.
    const rawSignals: RawSignalData[] = await useCryptoSignals();

    // 2. Process and format signals for the Site A DataLoader
    const formatted: SiteAFormattedSignal[] = rawSignals.map((s) => {
      // Calculate RSI here if not already present in rawSignals
      // You'll need `s.closes` for this. Assuming closes are available.
      const rsiArray = s.closes ? calculateRSI(s.closes, 14) : []; // Use period 14 for RSI
      const latestRSI = rsiArray.length > 0 && !isNaN(rsiArray[rsiArray.length - 1])
        ? rsiArray[rsiArray.length - 1]
        : null;

      // Determine the signal string based on your logic (using getRecentRSIDiff or other)
      // This is a simplified version of your getSignal function from the frontend,
      // adapted to just produce the string for the API.
      let signalText = 'NO SIGNAL';
      if (latestRSI !== null) {
        const pumpDump = getRecentRSIDiff(rsiArray, 14); // Use the calculated rsiArray
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
          // You had 'BUY SIGNAL'/'SELL SIGNAL' in your SiteADataLoader's getSignalColor,
          // but not in getSignal() from the previous prompt. Re-add if needed.
        }
      }

      return {
        symbol: s.symbol,
        signal: signalText, // This now reflects the logic
        latestRSI: latestRSI,
      };
    });

    res.status(200).json(formatted);
  } catch (error: any) { // Use 'any' for error type if not specific
    console.error("Signal API error:", error.message);
    res.status(500).json({ error: "Failed to generate signal data." });
  }
}
