// Site A: pages/api/data.ts
export default function handler(req, res) {
  res.status(200).json({
    message: "Hello from Site A!",
    timestamp: new Date().toISOString(),
  });
}
