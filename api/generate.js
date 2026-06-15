export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const {
    prospect,
    aiProvider,
    anthropicKey,
    openaiKey,
    geminiKey,
    firecrawlKey,
  } = req.body;

  if (!prospect) return res.status(400).json({ error: 'Prospect required' });

  // If we don't have enough content, scrape the contact page
  let pageContent = prospect.content || '';
  let contactEmail = prospect.email || null;

  if (pageContent.length < 200 && firecrawlKey) {
    try {
      const scrapeRes = await fetch('https://api.firecrawl.dev/v1/scrape', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${firecrawlKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: prospect.url,
          formats: ['markdown'],
          onlyMainContent: true,
        }),
      });
      const scrapeData = await scrapeRes.json();
      if (scrapeData.success && scrapeData.data?.markdown) {
        pageContent = scrapeData.data.markdown.slice(0, 2000);
        // Try extracting email from fresh scrape
        if (!contactEmail) {
          const emailMatch = pageContent.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
          contactEmail = emailMatch?.[0] || null;
        }
      }
    } catch (err) {
      console.error('Scrape error:', err.message);
    }
  }

  // Build persona-aware prompt
  const personLine = prospect.personName
    ? `The person's name is ${prospect.personName}${prospect.personRole ? `, their role is ${prospect.personRole}` : ''}.`
    : prospect.personRole
    ? `Target role at this company: ${prospect.personRole}.`
    : `Target decision-maker: CEO, Founder, or Head of Marketing.`;

  const prompt = `You are an expert cold email copywriter specializing in outreach to C-suite executives and founders.

PROSPECT DETAILS:
Company: ${prospect.title}
Website: ${prospect.url}
${personLine}
Website content:
${pageContent || 'No content available — use company name and domain to infer their business.'}

PRODUCT BEING PITCHED:
A WhatsApp + Email drip automation tool that nurtures cold leads automatically.
- Self-host: $19 (they set it up themselves)
- Done-for-you setup: $99 (we set it up for them in 48 hours)
- Built on Node.js + Supabase, fully customizable
- Sends follow-up sequences so no lead goes cold

YOUR TASK:
Write a cold email targeting the decision-maker at this company.

RULES:
1. Subject line: max 8 words, curiosity-driven, no spammy words (FREE, GUARANTEED, URGENT)
2. Opening line: reference something SPECIFIC about their business from the website content — not generic
3. Pain point: leads going cold / no follow-up system / money left on the table
4. Pitch: one sentence max. Don't oversell.
5. CTA: one soft ask — "worth a 10-minute call?" or "want me to send a quick demo?"
6. Tone: peer-to-peer, NOT salesy. Like a founder talking to another founder.
7. Length: max 120 words total
8. If you found a person's name, address them by first name. Otherwise use "Hi there,"
9. Sign off as: Ash | Vortex Labs

Return ONLY valid JSON, no markdown, no explanation:
{
  "subject": "...",
  "body": "...",
  "toEmail": "${contactEmail || 'NOT_FOUND'}",
  "personName": "${prospect.personName || ''}",
  "companyName": "${prospect.title}"
}`;

  try {
    let emailText = '';

    if (aiProvider === 'anthropic' && anthropicKey) {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 500,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      const d = await r.json();
      emailText = d.content?.[0]?.text || '';

    } else if (aiProvider === 'openai' && openaiKey) {
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          max_tokens: 500,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      const d = await r.json();
      emailText = d.choices?.[0]?.message?.content || '';

    } else if (aiProvider === 'gemini' && geminiKey) {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 500 },
        }),
      });
      const d = await r.json();
      emailText = d.candidates?.[0]?.content?.parts?.[0]?.text || '';
    }

    // Parse JSON from response
    const clean = emailText.replace(/```json|```/g, '').trim();
    const jsonMatch = clean.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');

    const result = JSON.parse(jsonMatch[0]);
    return res.status(200).json(result);

  } catch (err) {
    return res.status(500).json({ error: `Generation failed: ${err.message}` });
  }
}
