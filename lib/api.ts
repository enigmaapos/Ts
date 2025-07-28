// File: lib/api.ts

import { Timeframe, SignalData } from '../hooks/useCryptoSignals'; // Import Timeframe and SignalData
import { CandleData, calculateEMA, calculateRSI, getSessions, getLastNSessionStartTimes, getRecentSessionHighs, getRecentSessionLows, getTestThreshold } from '../utils/calculations'; // Import necessary types and functions

// This interface defines what this `fetchRawCryptoSignals` function will return.
// It should contain *all* the raw data necessary for your analysis functions.
// Based on your `useCryptoSignals` hook, you'll need:
export interface RawCandleSignalData {
  symbol: string;
  candles: CandleData[]; // Array of raw candle data including open, high, low, close, volume, timestamp
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
  const BATCH_SIZE = 10; // Or whatever batch size you prefer for the server
  const MAX_SYMBOLS = 500; // Limit to 500 as in your hook

  try {
    // 1. Fetch the list of symbols
    const info = await fetch("https://fapi.binance.com/fapi/v1/exchangeInfo").then(res => res.json());
    const allSymbols = info.symbols
      .filter((s: any) => s.contractType === "PERPETUAL" && s.quoteAsset === "USDT")
      .slice(0, MAX_SYMBOLS)
      .map((s: any) => s.symbol);

    symbolsToFetch.push(...allSymbols);

    const fetchedSignals: RawCandleSignalData[] = [];
    const lastUpdated: { [symbol: string]: number } = {};

    // 2. Process symbols in batches (similar to your useCryptoSignals hook)
    for (let i = 0; i < symbolsToFetch.length; i += BATCH_SIZE) {
      const batch = symbolsToFetch.slice(i, i + BATCH_SIZE);

      const batchResults = await Promise.all(
        batch.map(async (symbol) => {
          try {
            // Fetch Klines (historical candle data)
            const rawCandles = await fetch(
              `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${timeframe}&limit=500`
            ).then((res) => res.json());

            const candles: CandleData[] = rawCandles.map((c: any) => ({
              timestamp: c[0],
              open: +c[1],
              high: +c[2],
              low: +c[3],
              close: +c[4],
              volume: +c[5],
            }));

            const closes = candles.map((c) => c.close);
            const highs = candles.map((c) => c.high);
            const lows = candles.map((c) => c.low);
            const opens = candles.map((c) => c.open);
            const volumes = candles.map((c) => c.volume);

            // Fetch 24hr Ticker Info
            const ticker24h = await fetch(
              `https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=${symbol}`
            ).then((res) => res.json());

            const currentPrice = parseFloat(ticker24h.lastPrice);
            const price24hAgo = parseFloat(ticker24h.openPrice);
            const priceChangePercent = parseFloat(ticker24h.priceChangePercent);

            lastUpdated[symbol] = Date.now(); // Mark as updated

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
            } as RawCandleSignalData; // Cast to RawCandleSignalData
          } catch (fetchError: any) {
            console.error(`Error fetching data for ${symbol}:`, fetchError.message);
            return null; // Return null for failed fetches
          }
        })
      );

      // Filter out any null results from failed fetches
      fetchedSignals.push(...batchResults.filter((r): r is RawCandleSignalData => r !== null));

      // Add a small delay between batches to avoid hitting API rate limits too aggressively
      // This is crucial for server-side fetches. Adjust as needed.
      // await new Promise(resolve => setTimeout(resolve, 500));
    }

    return {
      signals: fetchedSignals,
      lastUpdatedMap: lastUpdated,
    };
  } catch (overallError: any) {
    console.error("Overall error in fetchRawCryptoSignals:", overallError.message);
    // Return empty arrays on error, or re-throw if you want the API route to handle it
    return { signals: [], lastUpdatedMap: {} };
  }
}
