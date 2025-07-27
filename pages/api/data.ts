// File: pages/api/data.ts (in Site A)

import { getCryptoSignals } from '../../hooks/useCryptoSignals';
import { calculateRSI } from '../../utils/calculations'; // Assuming this exists

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  try {
    // Fetch or compute your signals data
    const rawSignals = await getCryptoSignals(); // You might adjust this depending on how signals are gathered

    // Format signals with styles and RSI logic
    const formatted = rawSignals.map((s) => {
      const rsi = s.latestRSI ?? null;
      const rsiLabel =
        rsi == null ? 'N/A' : rsi > 50 ? 'Above 50 (Bullish)' : 'Below 50 (Bearish)';
      const rsiColor =
        rsi == null ? 'text-gray-400' : rsi > 50 ? 'text-green-400' : 'text-red-400';

      const signalColor =
        s.signal?.trim() === 'MAX ZONE PUMP'
          ? 'text-yellow-300'
          : s.signal?.trim() === 'MAX ZONE DUMP'
          ? 'text-pink-400'
          : 'text-white';

      return {
        symbol: s.symbol,
        signal: s.signal,
        signalColor,
        latestRSI: rsi,
        rsiLabel,
        rsiColor,
      };
    });

    res.status(200).json(formatted);
  } catch (error) {
    console.error("Signal API error:", error.message);
    res.status(500).json({ error: "Failed to generate signal data." });
  }
}
