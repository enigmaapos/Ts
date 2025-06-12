import axios from 'axios';

const getStartEndTimestamps = () => {
  const now = new Date();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 11, 45));
  const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
  return [start.getTime(), end.getTime()];
};

export default async function handler(req, res) {
  try {
    const { data: exchangeInfo } = await axios.get('https://fapi.binance.com/fapi/v1/exchangeInfo');
    const usdtPairs = exchangeInfo.symbols
      .filter(s => s.contractType === 'PERPETUAL' && s.symbol.endsWith('USDT'))
      .slice(0, 100);

    const [startTime, endTime] = getStartEndTimestamps();

    const results = await Promise.all(usdtPairs.map(async ({ symbol }) => {
      try {
        const { data: klines } = await axios.get('https://fapi.binance.com/fapi/v1/klines', {
          params: {
            symbol,
            interval: '15m',
            startTime,
            endTime,
          }
        });

        const highs = klines.map(k => parseFloat(k[2]));
        const lows = klines.map(k => parseFloat(k[3]));
        const prevHigh = Math.max(...highs);
        const prevLow = Math.min(...lows);

        const { data: ticker } = await axios.get('https://fapi.binance.com/fapi/v1/ticker/price', {
          params: { symbol }
        });

        const currentPrice = parseFloat(ticker.price);
        const breakout = currentPrice > prevHigh ? "HIGH" : currentPrice < prevLow ? "LOW" : "";

        return { symbol, breakout, prevHigh, prevLow, currentPrice };
      } catch (err) {
        return { symbol, error: true };
      }
    }));

    res.status(200).json(results.filter(r => !r.error));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
