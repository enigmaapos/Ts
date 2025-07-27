// pages/api/data.ts in ts-five-umber

export default function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*"); // or restrict to 'https://bbb-nine-umber.vercel.app'
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(200).end(); // Handle preflight
    return;
  }

  // Your actual data response
  res.status(200).json({
    message: "Hello from Site A!",
    timestamp: new Date().toISOString(),
  });
}
