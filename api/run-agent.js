export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { niche, claudeKey, firecrawlKey, serperKey } = req.body;

  if (!serperKey) return res.status(400).json({ success: false, error: "Serper API key missing. Add it in Settings." });

  // Domains to skip — aggregators, not real businesses
  const SKIP_DOMAINS = ["justdial", "sulekha", "indiamart", "shiksha", "collegedunia",
    "wikipedia", "facebook", "linkedin", "instagram", "youtube", "twitter",
    "quora", "reddit", "glassdoor", "ambitionbox", "naukri", "indeed"];

  try {
    // ── Step 1: Search via Serper ──────────────────────────────
    const searchRes = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "X-API-KEY": serperKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        q: `${niche} official website contact`,
        num: 10,
        gl: "in",
        hl: "en",
      }),
    });

    const searchData = await searchRes.json();
    const results = searchData.organic || [];

    if (!results.length) {
      return res.status(200).json({ success: false, error: "No search results returned from Serper" });
    }

    // ── Step 2: Parse prospects directly from Serper results ───
    const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

    const prospects = results
      .filter((r) => {
        const url = (r.link || "").toLowerCase();
        return !SKIP_DOMAINS.some((d) => url.includes(d));
      })
      .slice(0, 4)
      .map((r) => {
        const emailMatch = (r.snippet || "").match(EMAIL_REGEX);
        return {
          business_name: r.title?.replace(/\s*[-|].*$/, "").trim() || "Unknown",
          url: r.link || null,
          contact_email: emailMatch ? emailMatch[0] : null,
          niche,
          websiteContent: null,
        };
      });

    if (!prospects.length) {
      return res.status(200).json({ success: false, error: "No valid prospects after filtering aggregator sites" });
    }

    // ── Step 3: Scrape each prospect via Firecrawl ─────────────
    const enriched = await Promise.all(
      prospects.map(async (p) => {
        if (!p.url) return p;
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

          // Try to extract email from scraped content if not found in snippet
          let email = p.contact_email;
          if (!email && content) {
            const emailMatch = content.match(EMAIL_REGEX);
            if (emailMatch) email = emailMatch[0];
          }

          return { ...p, contact_email: email, websiteContent: content };
        } catch {
          return p;
        }
      })
    );

    return res.status(200).json({ success: true, prospects: enriched });

  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
