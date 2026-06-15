export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { provider, apiKey, prospect, firecrawlKey } = req.body;

  // ── Step 1: Scrape website for context (single call, fast) ──
  let websiteContext = prospect.snippet || "";
  let scrapedEmail = prospect.contact_email || null;

  if (firecrawlKey && prospect.url) {
    try {
      const scrapeRes = await fetch("https://api.firecrawl.dev/v1/scrape", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${firecrawlKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url: prospect.url, formats: ["markdown"] }),
      });
      const scrapeData = await scrapeRes.json();
      const content = scrapeData?.data?.markdown?.slice(0, 1500) || "";
      if (content) {
        websiteContext = content;
        // Extract email from scraped content if not already found
        if (!scrapedEmail) {
          const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
          const emails = content.match(EMAIL_REGEX);
          scrapedEmail = emails?.find(
            (e) => !e.includes("noreply") && !e.includes("privacy") && !e.includes("unsubscribe")
          ) || null;
        }
      }
    } catch { /* use snippet as fallback */ }
  }

  // ── Step 2: Generate personalised email ─────────────────────
  const prompt = `You are Aswin Raaju, a performance marketing consultant from Bangalore.

You've built a WhatsApp + Email drip automation tool (Railway + Node.js + Supabase).
It auto-follows up with leads via WhatsApp and email on a schedule. Fully customisable. Costs ~$5/month to run.

Write a cold email to this business:
Business: ${prospect.business_name}
Website/context: ${websiteContext || "No context available"}
Niche: ${prospect.niche}

Rules:
- Subject must reference something specific about their business
- Max 120 words body
- Sound human, not salesy
- Mention the pain: leads going cold, manual follow-up, missing conversions
- End with CTA: self-host for $19 OR done-for-you setup for $99
- Book a call: https://cal.com/aswinraaju
- Sign off as Aswin Raaju

Return ONLY valid JSON (no markdown, no backticks):
{"subject": "...", "body": "..."}`;

  try {
    let text = "";

    if (provider === "claude") {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 1000,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      const d = await r.json();
      text = d.content?.find((b) => b.type === "text")?.text || "";

    } else if (provider === "openai") {
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: "gpt-4o",
          messages: [{ role: "user", content: prompt }],
          max_tokens: 1000,
        }),
      });
      const d = await r.json();
      text = d.choices?.[0]?.message?.content || "";

    } else if (provider === "gemini") {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        }
      );
      const d = await r.json();
      text = d.candidates?.[0]?.content?.parts?.[0]?.text || "";
    }

    if (!text) return res.status(500).json({ success: false, error: "AI returned empty response" });

    const clean = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);

    return res.status(200).json({
      success: true,
      email: parsed,
      contact_email: scrapedEmail, // return scraped email if found
    });

  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
