// File: lib/api.ts

import { Timeframe } from '../hooks/useCryptoSignals'; // Or from '../utils/calculations' if it's truly a utility type.

// This interface defines what this `fetchRawCryptoSignals` function will return.
// It should contain *all* the raw data necessary for your analysis functions.
export interface RawCandleSignalData {
  symbol: string;
  // Based on your `useCryptoSignals` hook, you'll need these:
  candles: {
    timestamp: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }[];
  closes: number[];
  highs: number[];
  lows: number[];
  opens: number[];
  volumes: number[];
  currentPrice: number; // From 24hr ticker
  price24hAgo: number;  // From 24hr ticker
  priceChangePercent: number; // From 24hr ticker
}

export async function fetchRawCryptoSignals(timeframe: Timeframe = '1d'): Promise<{ signals: RawCandleSignalData[]; lastUpdatedMap: { [symbol: string]: number; } }> {
  const symbolsToFetch: string[] = [];
  const BATCH_SIZE = 10; // Adjust based on your Vercel function's memory/time limits and Binance rate limits
  const MAX_SYMBOLS = 500; // Limit to 500 as in your hook

  console.log(`[lib/api.ts] fetchRawCryptoSignals called for timeframe: ${timeframe}`);

  try {
    // 1. Fetch the list of symbols
    console.log("[lib/api.ts] Fetching exchange info from Binance...");
    const info = await fetch("https://fapi.binance.com/fapi/v1/exchangeInfo");
    if (!info.ok) {
        throw new Error(`Failed to fetch exchange info: ${info.status} ${info.statusText}`);
    }
    const exchangeInfo = await info.json();

    const allSymbols = exchangeInfo.symbols
      .filter((s: any) => s.contractType === "PERPETUAL" && s.quoteAsset === "USDT")
      .slice(0, MAX_SYMBOLS)
      .map((s: any) => s.symbol);

    symbolsToFetch.push(...allSymbols);
    console.log(`[lib/api.ts] Found ${allSymbols.length} perpetual USDT symbols.`);

    const fetchedSignals: RawCandleSignalData[] = [];
    const lastUpdated: { [symbol: string]: number } = {};

    // 2. Process symbols in batches
    for (let i = 0; i < symbolsToFetch.length; i += BATCH_SIZE) {
      const batch = symbolsToFetch.slice(i, i + BATCH_SIZE);
      console.log(`[lib/api.ts] Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(symbolsToFetch.length / BATCH_SIZE)} for symbols: ${batch.join(', ')}`);

      const batchResults = await Promise.all(
        batch.map(async (symbol) => {
          try {
            // Fetch Klines (historical candle data)
            const klinesRes = await fetch(
              `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${timeframe}&limit=500`
            );
            if (!klinesRes.ok) {
                throw new Error(`Failed to fetch klines for ${symbol}: ${klinesRes.status} ${klinesRes.statusText}`);
            }
            const rawCandles = await klinesRes.json();

            const candles = rawCandles.map((c: any) => ({
              timestamp: +c[0],
              open: +c[1],
              high: +c[2],
              low: +c[3],
              close: +c[4],
              volume: +c[5],
            }));

            // Ensure we have enough data points, especially for RSI (14 periods)
            if (candles.length < 14) {
                console.warn(`[lib/api.ts] Not enough candle data for ${symbol} (${candles.length} < 14). Skipping for now.`);
                return null;
            }

            const closes = candles.map((c) => c.close);
            const highs = candles.map((c) => c.high);
            const lows = candles.map((c) => c.low);
            const opens = candles.map((c) => c.open);
            const volumes = candles.map((c) => c.volume);

            // Fetch 24hr Ticker Info
            const ticker24hRes = await fetch(
              `https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=${symbol}`
            );
            if (!ticker24hRes.ok) {
                throw new Error(`Failed to fetch 24hr ticker for ${symbol}: ${ticker24hRes.status} ${ticker24hRes.statusText}`);
            }
            const ticker24h = await ticker24hRes.json();

            const currentPrice = parseFloat(ticker24h.lastPrice);
            const price24hAgo = parseFloat(ticker24h.openPrice);
            const priceChangePercent = parseFloat(ticker24h.priceChangePercent);

            lastUpdated[symbol] = Date.now(); // Mark as updated
            console.log(`[lib/api.ts] Successfully fetched data for ${symbol}`);

            return {
              symbol,
              candles,
              closes,
              highs,
              lows,
              opens,
              volumes,
              currentPrice,
              price24hAgo,
              priceChangePercent,
            } as RawCandleSignalData;
          } catch (fetchError: any) {
            console.error(`[lib/api.ts] Error fetching data for ${symbol}:`, fetchError.message);
            return null; // Return null for failed fetches
          }
        })
      );

      // Filter out any null results from failed fetches
      fetchedSignals.push(...batchResults.filter((r): r is RawCandleSignalData => r !== null));

      // IMPORTANT: Add a small delay between batches to avoid hitting API rate limits
      // Binance FAPI has a REQUEST_WEIGHT limit of 2400 per minute.
      // Each klines request with limit=500 is weight 2. Ticker is weight 1.
      // 10 symbols * (2 + 1) = 30 weight per batch.
      // So, ~80 batches per minute, or 1 batch every ~0.75 seconds.
      // Adjust this based on your actual usage and observations.
      await new Promise(resolve => setTimeout(resolve, 500)); // 500ms delay between batches
    }

    console.log(`[lib/api.ts] Total signals fetched: ${fetchedSignals.length}`);
    return {
      signals: fetchedSignals,
      lastUpdatedMap: lastUpdated,
    };
  } catch (overallError: any) {
    console.error("[lib/api.ts] Overall error in fetchRawCryptoSignals:", overallError.message);
    // Return empty arrays on error, which will lead to "No data found"
    return { signals: [], lastUpdatedMap: {} };
  }
}
