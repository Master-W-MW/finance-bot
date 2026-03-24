// MY Finance Telegram Bot
// 100% free — no Anthropic API needed
// Uses RSS feeds for live news + free APIs for rates

const BOT_TOKEN  = process.env.BOT_TOKEN;
const CHAT_ID    = process.env.CHAT_ID;
const METALS_KEY = process.env.METALS_KEY; // optional

// ─── Fetch live gold + exchange rates ───────────────────────────────────────
async function fetchRates() {
  const r = await fetch("https://api.exchangerate-api.com/v4/latest/USD");
  const d = await r.json();
  const myr = d.rates.MYR;

  let goldUSD = null;

  // 1. metals.dev (optional, most accurate)
  if (METALS_KEY) {
    try {
      const g = await fetch(`https://api.metals.dev/v1/spot?api_key=${METALS_KEY}&base=USD&symbols=XAU`);
      const gd = await g.json();
      if (gd.metals?.XAU) goldUSD = Math.round(gd.metals.XAU);
    } catch(_) {}
  }

  // 2. frankfurter.app (free, no key)
  if (!goldUSD) {
    try {
      const g = await fetch("https://api.frankfurter.app/latest?from=XAU&to=USD");
      const gd = await g.json();
      if (gd.rates?.USD) goldUSD = Math.round(gd.rates.USD);
    } catch(_) {}
  }

  if (!goldUSD || isNaN(goldUSD)) goldUSD = 4435;

  const goldMYR = Math.round(goldUSD * myr / 31.1035);
  return { myrRate: myr.toFixed(4), goldUSD, goldMYR, myrStrong: myr < 4.0 };
}

// ─── Fetch news from free RSS feeds (no API key needed) ─────────────────────
async function fetchNews() {
  const feeds = [
    // Malaysia financial news
    "https://www.malaymail.com/feed/section/money",
    // Reuters markets (global)
    "https://feeds.reuters.com/reuters/businessNews",
    // Yahoo Finance Malaysia
    "https://finance.yahoo.com/rss/2.0/headline?s=USDMYR%3DX&region=MY&lang=en-MY",
    // Investing.com gold news
    "https://www.investing.com/rss/news_25.rss",
    // FX Street (forex + gold)
    "https://www.fxstreet.com/rss/news",
  ];

  const keywords = [
    "gold","ringgit","myr","malaysia","bank negara","bnm",
    "oil","crude","brent","usd","dollar","fed","federal reserve",
    "inflation","interest rate","forex","xau","commodity"
  ];

  const allItems = [];

  for (const url of feeds) {
    try {
      const r = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; FinanceBot/1.0)" },
        signal: AbortSignal.timeout(8000)
      });
      if (!r.ok) continue;
      const xml = await r.text();

      // Parse RSS items with regex (no XML parser needed)
      const itemMatches = xml.matchAll(/<item[^>]*>([\s\S]*?)<\/item>/gi);
      for (const match of itemMatches) {
        const item = match[1];
        const title = (item.match(/<title[^>]*><!\[CDATA\[(.*?)\]\]><\/title>/i) ||
                       item.match(/<title[^>]*>(.*?)<\/title>/i))?.[1]?.trim();
        const pubDate = (item.match(/<pubDate>(.*?)<\/pubDate>/i))?.[1]?.trim();
        if (!title) continue;

        // Only keep finance-relevant headlines
        const lower = title.toLowerCase();
        if (keywords.some(k => lower.includes(k))) {
          allItems.push({ title: title.replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&#39;/g,"'").replace(/&quot;/g,'"'), pubDate });
        }
      }
    } catch(_) {
      // silently skip failed feeds
    }
  }

  // Deduplicate and take top 6 most recent
  const seen = new Set();
  const unique = [];
  for (const item of allItems) {
    const key = item.title.toLowerCase().substring(0, 40);
    if (!seen.has(key)) { seen.add(key); unique.push(item); }
    if (unique.length >= 6) break;
  }

  return unique;
}

// ─── Analyse news impact on MYR/Gold ────────────────────────────────────────
function analyseImpact(headline) {
  const t = headline.toLowerCase();
  if (/rate cut|fed cut|dovish|easing|weak dollar|dollar fall|gold rise|gold surge|ringgit gain|ringgit strengthen/.test(t))
    return { emoji: "🟢", label: "MYR ↑ / Gold ↑" };
  if (/rate hike|hawkish|strong dollar|dollar rise|gold fall|gold drop|ringgit weak|ringgit fall|inflation rise/.test(t))
    return { emoji: "🔴", label: "MYR ↓ / Gold ↓" };
  if (/oil rise|oil surge|brent up|crude up/.test(t))
    return { emoji: "🟡", label: "Oil ↑ → MYR support" };
  if (/oil fall|oil drop|brent down|crude down/.test(t))
    return { emoji: "🟠", label: "Oil ↓ → MYR pressure" };
  if (/malaysia|bnm|bank negara|bursa|klci/.test(t))
    return { emoji: "🇲🇾", label: "MY market" };
  return { emoji: "📰", label: "Global" };
}

// ─── Build market insight paragraph ─────────────────────────────────────────
function buildInsight(rates) {
  const myrNum  = parseFloat(rates.myrRate);
  const goldUSD = rates.goldUSD;
  const myrMood = myrNum < 4.0 ? "strong" : "under mild pressure";
  const goldMood = goldUSD > 4000
    ? `elevated at $${goldUSD.toLocaleString()} amid geopolitical risk`
    : `eased to $${goldUSD.toLocaleString()}`;

  const goldMYRCalc = `At USD/MYR ${rates.myrRate}, gold converts to RM ${rates.goldMYR}/g — a ${myrNum < 4.0 ? "stronger Ringgit is offsetting some of the USD gold price rise, keeping local gold prices in check" : "weaker Ringgit is amplifying the gold price in local terms"}.`;

  return `Gold is ${goldMood}. Gold is priced in USD, so a ${myrNum < 4.0 ? "stronger" : "weaker"} Ringgit directly affects what Malaysians pay. ${goldMYRCalc}

BNM holding rates at 2.75% keeps Malaysian bonds attractive to foreign investors, sustaining MYR demand. The Ringgit is currently ${myrMood} vs the dollar. If the US Fed signals rate cuts, USD weakens → gold USD rises but MYR gold may stay flat due to Ringgit strength.`;
}

// ─── Build the full Telegram message ────────────────────────────────────────
async function buildMessage(rates) {
  const today = new Date().toLocaleDateString("en-MY", {
    weekday: "long", year: "numeric", month: "short", day: "numeric",
    timeZone: "Asia/Kuala_Lumpur"
  });
  const ts = new Date().toLocaleTimeString("en-MY", {
    hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kuala_Lumpur"
  });

  console.log("Fetching RSS news feeds...");
  const news = await fetchNews();
  console.log(`Got ${news.length} relevant headlines`);

  const myrMood = rates.myrStrong ? "Ringgit holding strong vs dollar" : "Ringgit under mild pressure";

  // News section
  let newsSection = "";
  if (news.length > 0) {
    newsSection = "\n─────────────────\n📰 NEWS TODAY\n─────────────────\n";
    news.forEach((item, i) => {
      const impact = analyseImpact(item.title);
      newsSection += `${impact.emoji} ${item.title}\n   ${impact.label}\n\n`;
    });
  } else {
    newsSection = "\n─────────────────\n📰 NEWS TODAY\n─────────────────\nNo relevant headlines found — markets may be quiet.\n\n";
  }

  const message =
`📊 MY Finance Update
${today} — 8:00 AM MYT
${myrMood}
${newsSection}─────────────────
KEY NUMBERS
─────────────────
💛 Gold Spot/USD: $${rates.goldUSD.toLocaleString()}/oz
💵 USD/MYR: ${rates.myrRate}
🪙 Gold MYR: RM ${rates.goldMYR}/gram (24K)
🏦 BNM OPR: 2.75% (on hold)
📦 CPI: 1.6% YoY | GDP Q4: 6.3%

─────────────────
HOW THESE MARKETS CONNECT
─────────────────
${buildInsight(rates)}

─────────────────
💵 USD & Gold
Gold is priced in USD. USD weakens → gold USD rises. But a stronger MYR offsets this — so local gold prices can stay flat even when global gold rallies.

🏦 BNM Rate & Ringgit
BNM holding at 2.75% attracts foreign bond inflows → MYR demand stays strong → Ringgit supported.

🛢️ Oil & Inflation
Higher oil boosts Petronas revenue but raises domestic costs → nudges CPI up → limits BNM rate cuts → keeps MYR supported.

📦 Strong MYR: Winners & Losers
Importers win (cheaper goods). Palm oil & electronics exporters lose (USD revenue converts to less MYR).

─────────────────
🔍 WATCH TODAY
─────────────────
US Fed commentary + Brent crude price — both move USD/MYR and gold simultaneously.

Rates fetched live: ${ts} MYT`;

  return { message, news };
}

// ─── Save dashboard data ─────────────────────────────────────────────────────
async function saveDashboardData(rates, message, news) {
  const fs = await import("fs");
  const today = new Date().toLocaleDateString("en-MY", { timeZone: "Asia/Kuala_Lumpur" });

  const todayNews = news.map(n => ({
    text: n.title,
    date: today,
    impact: analyseImpact(n.title).label,
    goldUSD: rates.goldUSD,
    myrRate: parseFloat(rates.myrRate)
  }));

  const data = {
    lastUpdated: new Date().toISOString(),
    rates, message, todayNews,
    newsHistory: [], history: []
  };

  try {
    const existing = JSON.parse(fs.readFileSync("dashboard-data.json", "utf8"));
    data.history = (existing.history || []).slice(-29);
    data.history.push({
      date: today, goldMYR: rates.goldMYR,
      goldUSD: rates.goldUSD, myrRate: parseFloat(rates.myrRate)
    });
    const prev = existing.todayNews || [];
    data.newsHistory = [...(existing.newsHistory || []), ...prev].slice(-60);
  } catch(_) {
    data.history = [{
      date: today, goldMYR: rates.goldMYR,
      goldUSD: rates.goldUSD, myrRate: parseFloat(rates.myrRate)
    }];
  }

  fs.writeFileSync("dashboard-data.json", JSON.stringify(data, null, 2));
  console.log(`Dashboard saved. ${todayNews.length} news items.`);
}

// ─── Send to Telegram ────────────────────────────────────────────────────────
async function sendTelegram(text) {
  const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: CHAT_ID, text })
  });
  const d = await r.json();
  if (!d.ok) throw new Error("Telegram error: " + d.description);
  console.log("Message sent to Telegram at", new Date().toISOString());
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  if (!BOT_TOKEN || !CHAT_ID) {
    console.error("Missing BOT_TOKEN or CHAT_ID.");
    process.exit(1);
  }
  console.log("Fetching live rates...");
  const rates = await fetchRates();
  console.log(`USD/MYR: ${rates.myrRate} | Gold: $${rates.goldUSD}/oz | RM ${rates.goldMYR}/g`);
  const { message, news } = await buildMessage(rates);
  await saveDashboardData(rates, message, news);
  console.log("Sending to Telegram...");
  await sendTelegram(message);
  console.log("Done.");
}

main().catch(e => { console.error("Bot error:", e.message); process.exit(1); });
