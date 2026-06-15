export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { niche, serperKey } = req.body;
  if (!serperKey) return res.status(400).json({ success: false, error: "Serper API key missing." });

  const SKIP_DOMAINS = [
    "justdial","sulekha","indiamart","shiksha","collegedunia",
    "wikipedia","facebook","linkedin","instagram","youtube","twitter",
    "quora","reddit","glassdoor","ambitionbox","naukri","indeed",
    "softwareadvice","capterra","g2.com","getapp","techradar",
    "mailchimp","hubspot","klaviyo","medium","substack"
  ];

  const SKIP_TITLE_KEYWORDS = [
    "template","guide","how to","tips","best practices","software",
    "tool","platform","saas","top 10","list of","email marketing",
    "boost","raise revenue","management software","automation tool"
  ];

  const NICHE_QUERY_MAP = {
    "fitness studio gym India member retention email":
      'gym fitness studio Bangalore OR Mumbai OR Delhi "contact" "email" -software -blog -template',
    "D2C brand India email marketing":
      'D2C brand India "contact@" OR "hello@" OR "info@" -blog -template',
    "EdTech coaching institute India lead nurturing":
      'coaching institute India "enquire now" "contact" email -justdial -sulekha -shiksha',
    "immigration consultancy India WhatsApp automation":
      'immigration consultancy India "contact us" "email" -justdial -blog -sulekha',
    "real estate developer India CRM follow-up":
      'real estate developer India "contact" "email us" -99acres -magicbricks -housing',
    "healthcare clinic India patient follow-up automation":
      'clinic hospital India "appointment" "contact" "email" -practo -lybrate',
  };

  const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

  try {
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

    // Filter and extract prospects purely from Serper data — no scraping here
    const prospects = results
      .filter((r) => {
        const url = (r.link || "").toLowerCase();
        const title = (r.title || "").toLowerCase();
        return (
          !SKIP_DOMAINS.some((d) => url.includes(d)) &&
          !SKIP_TITLE_KEYWORDS.some((k) => title.includes(k))
        );
      })
      .slice(0, 4)
      .map((r) => {
        const allText = `${r.snippet || ""} ${r.title || ""}`;
        const emails = allText.match(EMAIL_REGEX);
        const validEmail = emails?.find(
          (e) => !e.includes("noreply") && !e.includes("privacy") && !e.includes("unsubscribe")
        ) || null;

        return {
          business_name: r.title?.replace(/\s*[-|].*$/, "").trim() || "Unknown",
          url: r.link || null,
          contact_email: validEmail,
          snippet: r.snippet || "",
          niche,
        };
      });

    if (!prospects.length) {
      return res.status(200).json({ success: false, error: "No valid prospects after filtering" });
    }

    return res.status(200).json({ success: true, prospects });

  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
