export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { niche, claudeKey, firecrawlKey, serperKey } = req.body;

  if (!serperKey) return res.status(400).json({ success: false, error: "Serper API key missing. Add it in Settings." });

  try {
    // ── Step 1: Search via Serper ──────────────────────────────
    const searchRes = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "X-API-KEY": serperKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        q: `${niche} contact email India`,
        num: 10,
        gl: "in",
        hl: "en",
      }),
    });

    const searchData = await searchRes.json();
    const results = searchData.organic || [];

    if (!results.length) {
      return res.status(200).json({ success: false, error: "No search results from Serper" });
    }

    // ── Step 2: Extract prospects from search results ──────────
    // Use Claude to parse the search results into structured prospects
    const searchSummary = results
      .slice(0, 8)
      .map((r, i) => `${i + 1}. Title: ${r.title}\n   URL: ${r.link}\n   Snippet: ${r.snippet}`)
      .join("\n\n");

    const parseRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": claudeKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        messages: [
          {
            role: "user",
            content: `From these search results for "${niche}", extract up to 3 real businesses.
            
${searchSummary}

Return ONLY a JSON array, no markdown, no explanation:
[
  {"business_name": "...", "url": "...", "contact_email": "...or null if not visible in snippet"},
  ...
]

Rules:
- Only include actual businesses, not directories or aggregator sites (no justdial, sulekha, indiamart)
- Extract email from snippet if visible, otherwise null
- URL must be their actual website, not a listing page`,
          },
        ],
      }),
    });

    const parseData = await parseRes.json();
    const textBlock = parseData.content?.find((b) => b.type === "text");

    if (!textBlock?.text) {
      return res.status(500).json({ success: false, error: "Could not parse search results" });
    }

    let prospects = [];
    try {
      const clean = textBlock.text.replace(/```json|```/g, "").trim();
      prospects = JSON.parse(clean);
    } catch {
      return res.status(500).json({ success: false, error: "JSON parse failed on prospects" });
    }

    if (!prospects.length) {
      return res.status(200).json({ success: false, error: "No valid prospects extracted" });
    }

    // ── Step 3: Scrape each prospect via Firecrawl ─────────────
    const enriched = await Promise.all(
      prospects.map(async (p) => {
        if (!p.url) return { ...p, niche, websiteContent: null };
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
          const content = scrapeData?.data?.markdown?.slice(0, 1500) || null;

          // Try to extract email from scraped content if not found earlier
          let email = p.contact_email;
          if (!email && content) {
            const emailMatch = content.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
            if (emailMatch) email = emailMatch[0];
          }

          return { ...p, niche, contact_email: email, websiteContent: content };
        } catch {
          return { ...p, niche, websiteContent: null };
        }
      })
    );

    return res.status(200).json({ success: true, prospects: enriched });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
