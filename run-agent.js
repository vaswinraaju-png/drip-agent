export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { niche, claudeKey, firecrawlKey } = req.body;

  try {
    // Step 1: Find prospects via Claude web search
    const searchRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": claudeKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
        messages: [
          {
            role: "user",
            content: `Search for 3 real small businesses in India matching: "${niche}".
Return ONLY a JSON array, no markdown:
[{"business_name":"...","url":"...","contact_email":"...or null"},...]
Focus on businesses likely lacking proper email/WhatsApp drip automation.`,
          },
        ],
      }),
    });

    const searchData = await searchRes.json();
    const textBlock = searchData.content?.find((b) => b.type === "text");
    if (!textBlock) return res.status(500).json({ success: false, error: "No prospects found" });

    const clean = textBlock.text.replace(/```json|```/g, "").trim();
    let prospects = [];
    try { prospects = JSON.parse(clean); } catch { return res.status(500).json({ success: false, error: "Could not parse prospects" }); }

    // Step 2: Scrape each prospect's website
    const enriched = await Promise.all(
      prospects.map(async (p) => {
        if (!p.url) return { ...p, websiteContent: null };
        try {
          const scrapeRes = await fetch("https://api.firecrawl.dev/v1/scrape", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${firecrawlKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ url: p.url, formats: ["markdown"] }),
          });
          const scrapeData = await scrapeRes.json();
          return { ...p, websiteContent: scrapeData?.data?.markdown?.slice(0, 1500) || null };
        } catch {
          return { ...p, websiteContent: null };
        }
      })
    );

    return res.status(200).json({ success: true, prospects: enriched });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
