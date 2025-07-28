// File: lib/api.ts

import { Timeframe } from '../utils/calculations'; // Assuming Timeframe is defined here now, as it's a utility type

// This interface defines what this `fetchRawCryptoSignals` function will return.
// It should contain *all* the raw data necessary for your analysis functions.
export interface RawCandleSignalData {
  symbol: string;
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

/**
 * Fetches raw crypto signal data (klines and 24hr ticker) from Binance Futures API.
 * Batches requests to stay within API limits.
 *
 * @param timeframe The desired candlestick interval (e.g., '15m', '4h', '1d').
 * @returns An object containing an array of RawCandleSignalData and a map of last update timestamps.
 */
export async function fetchRawCryptoSignals(timeframe: Timeframe = '1d'): Promise<{ signals: RawCandleSignalData[]; lastUpdatedMap: { [symbol: string]: number; } }> {
  // Constants for API behavior and limits
  const BATCH_SIZE = 15; // Increased slightly from 10, common practice. Adjust based on observed limits.
  const API_DELAY_MS = 600; // Delay between batches (was 500ms). Aim for ~1 second per 20 requests to be safe.
  const KLINE_LIMIT = 500; // Number of historical candles to fetch (Binance default is 500, max is 1000)
  const MAX_SYMBOLS_TO_PROCESS = 300; // Reduced from 500 to potentially lessen overall load for initial testing

  console.log(`[lib/api.ts] fetchRawCryptoSignals called for timeframe: ${timeframe}`);
  console.log(`[lib/api.ts] Configuration: BATCH_SIZE=${BATCH_SIZE}, API_DELAY_MS=${API_DELAY_MS}, KLINE_LIMIT=${KLINE_LIMIT}, MAX_SYMBOLS_TO_PROCESS=${MAX_SYMBOLS_TO_PROCESS}`);

  const fetchedSignals: RawCandleSignalData[] = [];
  const lastUpdated: { [symbol: string]: number } = {};
  let totalSymbolsFound = 0;

  try {
    // 1. Fetch the list of symbols from Exchange Info
    console.log("[lib/api.ts] Fetching exchange info from Binance...");
    const infoRes = await fetch("https://fapi.binance.com/fapi/v1/exchangeInfo");

    if (!infoRes.ok) {
        const errorText = await infoRes.text(); // Get more detail on error
        throw new Error(`Failed to fetch exchange info: ${infoRes.status} ${infoRes.statusText} - ${errorText}`);
    }
    const exchangeInfo = await infoRes.json();

    const allSymbols = exchangeInfo.symbols
      .filter((s: any) => s.contractType === "PERPETUAL" && s.quoteAsset === "USDT" && s.status === "TRADING") // Added s.status === "TRADING"
      .slice(0, MAX_SYMBOLS_TO_PROCESS)
      .map((s: any) => s.symbol);

    totalSymbolsFound = allSymbols.length;
    console.log(`[lib/api.ts] Identified ${totalSymbolsFound} perpetual USDT symbols in TRADING status.`);

    if (totalSymbolsFound === 0) {
      console.warn("[lib/api.ts] No TRADING perpetual USDT symbols found. Returning empty data.");
      return { signals: [], lastUpdatedMap: {} };
    }

    // 2. Process symbols in batches
    for (let i = 0; i < totalSymbolsFound; i += BATCH_SIZE) {
      const batch = allSymbols.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(totalSymbolsFound / BATCH_SIZE);

      console.log(`[lib/api.ts] Processing batch ${batchNum}/${totalBatches} for ${batch.length} symbols.`);

      // Use Promise.allSettled to ensure all promises in a batch are attempted,
      // and we can log individual failures without stopping the whole batch.
      const batchResults = await Promise.allSettled(
        batch.map(async (symbol) => {
          try {
            // Fetch Klines (historical candle data)
            const klinesRes = await fetch(
              `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${timeframe}&limit=${KLINE_LIMIT}`
            );
            if (!klinesRes.ok) {
                const errorText = await klinesRes.text();
                throw new Error(`Failed klines for ${symbol}: ${klinesRes.status} ${klinesRes.statusText} - ${errorText}`);
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

            // Crucial check: Ensure we have enough data points for RSI (14 periods) and other indicators
            // RSI (14) needs at least 14 candles to produce its first non-NaN value (i.e., index 13)
            // To ensure 14 *valid* RSI values are available for getRecentRSIDiff(rsiArray, 14)
            // you might need more than 14 raw candles depending on how calculateRSI handles NaNs.
            // A safer bet is to have significantly more candles than the RSI period.
            const MIN_CANDLES_REQUIRED = 30; // Sufficient for RSI14 and potentially other lookbacks
            if (candles.length < MIN_CANDLES_REQUIRED) {
                console.warn(`[lib/api.ts] Skipping ${symbol}: Insufficient candle data (${candles.length} < ${MIN_CANDLES_REQUIRED}).`);
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
                const errorText = await ticker24hRes.text();
                throw new Error(`Failed 24hr ticker for ${symbol}: ${ticker24hRes.status} ${ticker24hRes.statusText} - ${errorText}`);
            }
            const ticker24h = await ticker24hRes.json();

            const currentPrice = parseFloat(ticker24h.lastPrice);
            const price24hAgo = parseFloat(ticker24h.openPrice);
            const priceChangePercent = parseFloat(ticker24h.priceChangePercent);

            lastUpdated[symbol] = Date.now(); // Mark as updated
            // console.log(`[lib/api.ts] Successfully processed data for ${symbol}`); // Log only successes for brevity

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
            console.error(`[lib/api.ts] Detailed error for ${symbol}: ${fetchError.message}`);
            return null; // Return null for failed fetches
          }
        })
      );

      // Process results from Promise.allSettled
      batchResults.forEach(result => {
        if (result.status === 'fulfilled' && result.value !== null) {
          fetchedSignals.push(result.value);
        } else if (result.status === 'rejected') {
          // This case should ideally be caught by the individual try/catch inside map
          // But good to have a fallback
          console.error(`[lib/api.ts] Uncaught rejection in batch: ${result.reason}`);
        }
      });


      // IMPORTANT: Add a delay between batches to avoid hitting API rate limits
      if (i + BATCH_SIZE < totalSymbolsFound) { // Only delay if more batches are coming
        await new Promise(resolve => setTimeout(resolve, API_DELAY_MS));
      }
    }

    console.log(`[lib/api.ts] Finished fetching. Total VALID signals fetched: ${fetchedSignals.length}/${totalSymbolsFound}`);
    return {
      signals: fetchedSignals,
      lastUpdatedMap: lastUpdated,
    };
  } catch (overallError: any) {
    console.error(`[lib/api.ts] CRITICAL overall error in fetchRawCryptoSignals: ${overallError.message}`);
    // Return empty arrays on any critical error, which will lead to "No data found"
    return { signals: [], lastUpdatedMap: {} };
  }
}
