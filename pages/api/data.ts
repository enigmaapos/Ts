// File: pages/api/data.ts

export default function handler(req, res) {
  try {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.status(200).end();
      return;
    }

    // 🔐 Dummy data
    const data = [
      {
        symbol: "BTC/USDT",
        signal: "MAX ZONE DUMP",
        latestRSI: 48.7,
      },
      {
        symbol: "ETH/USDT",
        signal: "NEUTRAL",
        latestRSI: 55.2,
      },
      {
        symbol: "XRP/USDT",
        signal: "BUY SIGNAL",
        latestRSI: 62.1,
      },
    ];

    res.status(200).json(data);
  } catch (err) {
    console.error("Internal API error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
}
