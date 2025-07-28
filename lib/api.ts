import { fetchRawCryptoSignals } from '../../lib/api';

...

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  try {
    const requestedTimeframe = (req.query.timeframe as Timeframe) || '1d';
    console.log(`[API] Request received for timeframe: ${requestedTimeframe}`);

    const { signals: rawSignalsData, lastUpdatedMap } = await fetchRawCryptoSignals(requestedTimeframe);

    console.log(`[API] Raw signals received: ${rawSignalsData.length}`);
    if (rawSignalsData.length === 0) {
      console.warn("[API] Empty signal list — likely Binance fetch failed or returned no data.");
    }

    const formatted = rawSignalsData.map((s) => {
      const rsiArray = s.closes ? calculateRSI(s.closes, 14) : [];
      const latestRSI = rsiArray.length > 0 && !isNaN(rsiArray[rsiArray.length - 1])
        ? rsiArray[rsiArray.length - 1]
        : null;

      let signalText = 'NO SIGNAL';
      const pumpDump = getRecentRSIDiff(rsiArray, 14);
      if (pumpDump) {
        const { direction, pumpStrength, dumpStrength } = pumpDump;

        const inRange = (val: number | undefined, min: number, max: number) =>
          val !== undefined && val >= min && val <= max;

        if (direction === 'pump' && pumpStrength! >= 30) signalText = 'MAX ZONE PUMP';
        else if (direction === 'dump' && dumpStrength! >= 30) signalText = 'MAX ZONE DUMP';
        else if (inRange(pumpStrength, 21, 26) && direction === 'pump') signalText = 'BALANCE ZONE PUMP';
        else if (inRange(dumpStrength, 21, 26) && direction === 'dump') signalText = 'BALANCE ZONE DUMP';
        else if (inRange(pumpStrength, 1, 10) && direction === 'pump') signalText = 'LOWEST ZONE PUMP';
        else if (inRange(dumpStrength, 1, 10) && direction === 'dump') signalText = 'LOWEST ZONE DUMP';
      }

      return {
        symbol: s.symbol,
        signal: signalText,
        latestRSI,
      };
    });

    console.log(`[API] Formatted signal count: ${formatted.length}`);
    res.status(200).json(formatted);
  } catch (error: any) {
    console.error(`[API] ERROR: ${error.message}`);
    res.status(500).json({ error: "Failed to fetch signal data." });
  }
}
