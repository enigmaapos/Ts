// pages/api/data.ts (Site A)
export default function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  // Replace with your real logic
  const data = [
    {
      symbol: "BTC/USDT",
      signal: "MAX ZONE DUMP",
      latestRSI: 48.7
    },
    {
      symbol: "ETH/USDT",
      signal: "NEUTRAL",
      latestRSI: 55.2
    },
    {
      symbol: "XRP/USDT",
      signal: "BUY SIGNAL",
      latestRSI: 62.1
    }
  ];

  res.status(200).json(data);
}
