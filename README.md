# 🤖 Drip Outreach Agent
**WhatsApp + Email Drip Automation — Autonomous Prospect Finder & Outreach Tool**
*by storiesbyachu*

---

## What This Does

Finds cold prospects in your target niche → scrapes their website → writes a personalised cold email → sends it automatically via Gmail → logs everything.

Runs on Vercel. Opens in any browser. Works on phone and laptop.

---

## Deploy in 5 Minutes

### Step 1 — Get the code on GitHub

1. Go to [github.com](https://github.com) → New Repository
2. Name it `drip-agent` → Create
3. Upload all files from this folder

### Step 2 — Deploy to Vercel

```bash
# Option A: Via terminal (one time only)
npm install -g vercel
vercel login
vercel --prod
```

**Or Option B (no terminal):**
1. Go to [vercel.com](https://vercel.com) → New Project
2. Import your GitHub repo `drip-agent`
3. Click Deploy

### Step 3 — Open your Vercel URL

Vercel gives you a URL like: `https://drip-agent-xyz.vercel.app`

Open it in any browser.

### Step 4 — Enter your keys in Settings

Go to ⚙ Settings tab and enter:

| Key | Where to get it |
|---|---|
| AI API Key | anthropic.com/console OR platform.openai.com OR aistudio.google.com |
| Firecrawl API Key | firecrawl.dev (free tier available) |
| Gmail Address | your Gmail |
| Gmail App Password | myaccount.google.com/apppasswords → 2FA → App Passwords |
| Supabase URL + Key | supabase.com → your project → Settings → API (optional) |

Keys save automatically in your browser. Never leave the device.

### Step 5 — Run the Agent

1. Go to ▶ RUN tab
2. Pick a niche (D2C / EdTech / Immigration / Real Estate / Fitness / Healthcare)
3. Click **RUN AGENT**
4. Watch it work in ◈ LOGS tab

---

## Pricing (What You're Selling)

| Plan | Price | Includes |
|---|---|---|
| Self-Host | ~~$99~~ **$19** | Full source code + this README |
| Done For You | ~~$299~~ **$99** | We deploy + configure + 30 days support |

**Book DFY call:** https://cal.com/aswinraaju

---

## Supabase Table Setup (Optional)

If you want prospect logging, run this once in your Supabase SQL editor:

```sql
CREATE TABLE IF NOT EXISTS prospects (
  id SERIAL PRIMARY KEY,
  url TEXT,
  business_name TEXT,
  contact_email TEXT,
  niche TEXT,
  email_sent BOOLEAN DEFAULT FALSE,
  email_subject TEXT,
  sent_at TIMESTAMPTZ,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Stack

- **Frontend:** Vanilla HTML/JS (single file)
- **Backend:** Vercel Serverless Functions (Node.js)
- **AI:** Claude / OpenAI / Gemini (your choice)
- **Prospect Research:** Claude web search + Firecrawl
- **Email:** Gmail via Nodemailer
- **Database:** Supabase (optional)

---

## Support

- v.aswinraaju@gmail.com
- WhatsApp: +917094956963
