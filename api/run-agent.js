export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { niche, firecrawlKey } = req.body;

  if (!firecrawlKey) return res.status(400).json({ error: 'Firecrawl API key required' });

  // Blocked domains
  const BLOCKED_DOMAINS = ['terratern', 'hirenudge', 'talentbuddy'];

  // Role-targeted search queries — finds people, not just businesses
  const searchQueries = [
    `CEO founder "${niche}" company email contact`,
    `"head of marketing" OR "marketing director" "${niche}" email`,
    `"founder" "${niche}" startup contact us`,
    `"CMO" OR "Chief Marketing Officer" "${niche}" company`,
    `"co-founder" "${niche}" business email`,
  ];

  const prospects = [];
  const seen = new Set();

  for (const query of searchQueries) {
    if (prospects.length >= 8) break;

    try {
      const searchRes = await fetch('https://api.firecrawl.dev/v1/search', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${firecrawlKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          limit: 5,
          scrapeOptions: {
            formats: ['markdown'],
            onlyMainContent: true,
          }
        }),
      });

      const data = await searchRes.json();
      if (!data.success || !data.data) continue;

      for (const result of data.data) {
        const url = result.url || result.metadata?.sourceURL || '';
        const domain = extractDomain(url);

        // Skip blocked, already seen, aggregators, social media
        if (!domain) continue;
        if (seen.has(domain)) continue;
        if (BLOCKED_DOMAINS.some(b => domain.includes(b))) continue;
        if (isAggregator(url, result.metadata?.title || '')) continue;

        seen.add(domain);

        // Extract email from markdown content or metadata
        const content = result.markdown || '';
        const email = extractEmail(content, domain) || extractEmail(result.metadata?.description || '', domain);

        // Extract person name/role if visible
        const personInfo = extractPersonInfo(content, result.metadata?.title || '');

        prospects.push({
          url,
          domain,
          title: result.metadata?.title || domain,
          description: result.metadata?.description || '',
          email: email || null,
          personName: personInfo.name,
          personRole: personInfo.role,
          content: content.slice(0, 1500), // Cap content for generate step
        });

        if (prospects.length >= 8) break;
      }
    } catch (err) {
      console.error('Search error:', err.message);
    }
  }

  if (prospects.length === 0) {
    return res.status(404).json({ error: 'No valid prospects found' });
  }

  return res.status(200).json({ prospects });
}

function extractDomain(url) {
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return null;
  }
}

function isAggregator(url, title) {
  const skipKeywords = [
    'linkedin.com', 'twitter.com', 'facebook.com', 'instagram.com',
    'youtube.com', 'wikipedia.org', 'reddit.com', 'quora.com',
    'glassdoor.com', 'indeed.com', 'crunchbase.com', 'angel.co',
    'blog', 'template', 'guide', 'tips', 'how-to', 'examples',
    'top 10', 'best practices', 'directory', 'listing'
  ];
  const combined = (url + ' ' + title).toLowerCase();
  return skipKeywords.some(k => combined.includes(k));
}

function extractEmail(text, domain) {
  if (!text) return null;
  // Try direct email match first
  const emailRegex = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
  const matches = text.match(emailRegex) || [];

  // Prefer emails matching the domain
  const domainBase = domain.split('.')[0];
  const domainMatch = matches.find(e => e.includes(domainBase) || e.includes(domain));
  if (domainMatch) return domainMatch;

  // Filter out obvious non-business emails
  const filtered = matches.filter(e =>
    !e.includes('example.com') &&
    !e.includes('sentry.io') &&
    !e.includes('wixpress') &&
    !e.includes('.png') &&
    !e.includes('.jpg')
  );

  return filtered[0] || null;
}

function extractPersonInfo(content, title) {
  const rolePatterns = [
    /CEO|Chief Executive Officer/i,
    /Founder|Co-Founder|Co founder/i,
    /CMO|Chief Marketing Officer/i,
    /Head of Marketing|Marketing Director|VP Marketing/i,
    /Managing Director|MD/i,
  ];

  // Try to find role in content
  let role = null;
  for (const pattern of rolePatterns) {
    if (pattern.test(content) || pattern.test(title)) {
      role = content.match(pattern)?.[0] || title.match(pattern)?.[0];
      break;
    }
  }

  // Try to find a name near the role
  const namePattern = /([A-Z][a-z]+ [A-Z][a-z]+)(?:\s*[-–|,]\s*(?:CEO|Founder|CMO|Director|Head))/;
  const nameMatch = content.match(namePattern) || title.match(namePattern);
  const name = nameMatch?.[1] || null;

  return { name, role };
}
