export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { niche, claudeKey, firecrawlKey, serperKey } = req.body;
  if (!serperKey) return res.status(400).json({ success: false, error: "Serper API key missing." });

  const SKIP_DOMAINS = [
    "justdial","sulekha","indiamart","shiksha","collegedunia",
    "wikipedia","facebook","linkedin","instagram","youtube","twitter",
    "quora","reddit","glassdoor","ambitionbox","naukri","indeed",
    "softwareadvice","capterra","g2.com","getapp","techradar",
    "mailchimp","hubspot","klaviyo","blog","medium","substack"
  ];

  const SKIP_TITLE_KEYWORDS = [
    "template","guide","how to","tips","best practices","software",
    "tool","platform","saas","top 10","list of","email marketing guide",
    "boost","raise revenue","management software"
  ];

  // Niche-specific search queries that find ACTUAL businesses
  const NICHE_QUERY_MAP = {
    "fitness studio gym India member retention email":
      '"gym" OR "fitness studio" India "contact us" "email" -software -blog -template',
    "D2C brand India email marketing":
      'D2C brand India "contact@" OR "hello@" OR "info@" site:.in -blog -template',
    "EdTech coaching institute India lead nurturing":
      'coaching institute India "enquire now" "contact" email -justdial -sulekha',
    "immigration consultancy India WhatsApp automation":
      'immigration consultancy India "contact us" "email" -justdial -blog',
    "real estate developer India CRM follow-up":
      'real estate developer India "contact" "email us" -99acres -magicbricks -housing',
    "healthcare clinic India patient follow-up automation":
      'clinic hospital India "appointment" "contact" "email" -practo -lybrate',
  };

  const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

  try {
    // ── Step 1: Search with niche-specific query ───────────────
    const query = NICHE_QUERY_MAP[niche] || `${niche} India "contact us" email -blog -template`;

    const searchRes = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: { "X-API-KEY": serperKey, "Content-Type": "application/json" },
      body: JSON.stringify({ q: query, num: 10, gl: "in", hl: "en" }),
    });

    const searchData = await searchRes.json();
    const results = searchData.organic || [];

    if (!results.length) {
      return res.status(200).json({ success: false, error: "No search results from Serper" });
    }

    // ── Step 2: Filter to real business pages only ─────────────
    const filtered = results.filter((r) => {
      const url = (r.link || "").toLowerCase();
      const title = (r.title || "").toLowerCase();
      const skipDomain = SKIP_DOMAINS.some((d) => url.includes(d));
      const skipTitle = SKIP_TITLE_KEYWORDS.some((k) => title.includes(k));
      return !skipDomain && !skipTitle;
    }).slice(0, 5);

    if (!filtered.length) {
      return res.status(200).json({ success: false, error: "All results filtered out — try a different niche" });
    }

    // ── Step 3: Scrape contact page for each prospect ──────────
    const enriched = await Promise.all(
      filtered.map(async (r) => {
        const baseUrl = r.link || "";
        const businessName = r.title?.replace(/\s*[-|].*$/, "").trim() || "Unknown";

        // Try scraping /contact page first, then homepage
        const urlsToTry = [
          baseUrl.replace(/\/$/, "") + "/contact",
          baseUrl.replace(/\/$/, "") + "/contact-us",
          baseUrl,
        ];

        let email = null;
        let websiteContent = null;

        // Check snippet first
        const snippetEmails = (r.snippet || "").match(EMAIL_REGEX);
        if (snippetEmails) email = snippetEmails[0];

        // Scrape if no email found yet
        if (!email && firecrawlKey) {
          for (const url of urlsToTry) {
            try {
              const scrapeRes = await fetch("https://api.firecrawl.dev/v1/scrape", {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${firecrawlKey}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({ url, formats: ["markdown"] }),
              });
              const scrapeData = await scrapeRes.json();
              const content = scrapeData?.data?.markdown?.slice(0, 2000) || null;
              if (content) {
                websiteContent = content;
                const emails = content.match(EMAIL_REGEX);
                // Filter out noreply, support@, privacy@ etc
                const validEmail = emails?.find(e =>
                  !e.includes("noreply") && !e.includes("privacy") &&
                  !e.includes("legal") && !e.includes("unsubscribe")
                );
                if (validEmail) { email = validEmail; break; }
              }
            } catch { continue; }
          }
        }

        return {
          business_name: businessName,
          url: baseUrl,
          contact_email: email,
          niche,
          websiteContent: websiteContent?.slice(0, 1500) || null,
        };
      })
    );

    return res.status(200).json({ success: true, prospects: enriched });

  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
