// File: pages/api/data.ts

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  try {
    // Site A fetch
    const siteARes = await fetch("https://sitea.com/api/data");
    if (!siteARes.ok) throw new Error(`Site A fetch failed: ${siteARes.status}`);
    const siteAData = await siteARes.json();

    // Site B fetch
    const siteBRes = await fetch("https://siteb.com/api/data");
    if (!siteBRes.ok) throw new Error(`Site B fetch failed: ${siteBRes.status}`);
    const siteBData = await siteBRes.json();

    // Combine and filter data
    const combinedData = [...siteAData, ...siteBData].filter((item) => item.symbol);

    res.status(200).json(combinedData);
  } catch (error) {
    console.error("API error:", error.message);
    res.status(500).json({ error: "Failed to fetch data from source APIs." });
  }
}
