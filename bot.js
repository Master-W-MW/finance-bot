// MY Finance Telegram Bot — with live news + dashboard data
// Runs daily at 00:00 UTC (8:00 AM MYT) via Railway cron

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID   = process.env.CHAT_ID;
const ANTH_KEY  = process.env.ANTH_KEY;

// ─── Fetch live exchange rate ───────────────────────────────────────────────
async function fetchRates() {
  const r = await fetch("https://api.exchangerate-api.com/v4/latest/USD");
  const d = await r.json();
  const myr = d.rates.MYR;
  let goldUSD = null;
  // metals.dev — LBMA-sourced gold price (same benchmark Bloomberg uses)
  const METALS_KEY = process.env.METALS_KEY;
  if (METALS_KEY) {
    try {
      const g = await fetch(`https://api.metals.dev/v1/spot?api_key=${METALS_KEY}&base=USD&symbols=XAU`);
      const gd = await g.json();
      if (gd.metals?.XAU) goldUSD = Math.round(gd.metals.XAU);
    } catch(_) {}
  }

  // Fallback: frankfurter.app (no key needed)
  if (!goldUSD) {
    try {
      const g = await fetch("https://api.frankfurter.app/latest?from=XAU&to=USD");
      const gd = await g.json();
      if (gd.rates?.USD) goldUSD = Math.round(gd.rates.USD);
    } catch(_) {}
  }

  if (!goldUSD || isNaN(goldUSD)) goldUSD = 4435; // last-resort hardcoded fallback

  const goldMYR = Math.round(goldUSD * myr / 31.1035);
  return {
    myrRate:  myr.toFixed(4),
    goldUSD:  Math.round(goldUSD),
    goldMYR,
    myrStrong: myr < 4.0
  };
}

// ─── Fetch live news + build full AI message ────────────────────────────────
async function buildMessage(rates) {
  const today = new Date().toLocaleDateString("en-MY", {
    weekday: "long", year: "numeric", month: "short", day: "numeric",
    timeZone: "Asia/Kuala_Lumpur"
  });
  const ts = new Date().toLocaleTimeString("en-MY", {
    hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kuala_Lumpur"
  });

  if (!ANTH_KEY) return buildFallback(rates, today, ts);

  // Use Claude with web search to get today's news AND write the brief
  const prompt = `Today is ${today}. You have access to the web_search tool.

Live market data (already fetched):
- Gold spot: USD ${rates.goldUSD}/oz
- USD/MYR rate: ${rates.myrRate}
- Gold in MYR: ~RM ${rates.goldMYR}/gram (24K)
- BNM OPR: 2.75% (unchanged)
- Malaysia CPI: 1.6% YoY | GDP Q4 2025: 6.3% YoY
- MYR: Asia top performer, +10.9% YoY vs USD

TASK:
1. First use web_search to find TODAY's top 3-5 financial news headlines relevant to Malaysia, gold price, USD/MYR, oil price, or global markets. Search for: "Malaysia finance news today" and "gold price USD MYR today"
2. Then write a Telegram daily brief with these exact sections:

📰 NEWS TODAY
[3-5 bullet points of actual headlines from your search, each starting with •]

─────────────────
KEY NUMBERS
─────────────────
[5 numbers: gold MYR/g, USD/MYR, gold USD/oz, BNM OPR, CPI]

─────────────────
HOW THESE MARKETS CONNECT
─────────────────
💵 USD & Gold
[2-3 sentences: how USD weakness/strength flows into gold USD price and then MYR gold price via exchange rate]

🏦 BNM Rate & Ringgit
[2-3 sentences: how BNM rate hold attracts bond inflows, strengthens MYR, lowers local gold price]

🛢️ Oil & Inflation
[2-3 sentences: how today's oil news affects Malaysia's CPI and BNM rate decision room]

📦 MYR Impact: Winners & Losers
[2 sentences: who benefits and who loses from current MYR strength]

─────────────────
🔍 WATCH TODAY
─────────────────
[One sharp sentence: what specific event or data release to watch and why]

Rates fetched live: ${ts} MYT

Plain text only. No markdown (* _ # etc). Max 6 emoji (section headers only). Be specific to today's actual news.`;

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTH_KEY,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1500,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      messages: [{ role: "user", content: prompt }]
    })
  });

  if (!resp.ok) {
    console.error("Claude API error:", resp.status, await resp.text());
    return buildFallback(rates, today, ts);
  }

  const data = await resp.json();
  // Extract final text response (after tool use)
  const text = data.content
    ?.filter(b => b.type === "text")
    .map(b => b.text)
    .join("") || "";

  if (!text) return buildFallback(rates, today, ts);
  return text;
}

// ─── Fallback message (no API key or error) ─────────────────────────────────
function buildFallback(rates, today, ts) {
  const myrMood = rates.myrStrong ? "Ringgit holding strong vs dollar" : "Ringgit under mild pressure";
  const goldTrend = rates.goldMYR < 600 ? "eased from recent highs" : "elevated near recent highs";

  return `📊 MY Finance Update
${today} — 8:00 AM MYT
${myrMood}

─────────────────
KEY NUMBERS
─────────────────
💛 Gold (24K): RM ${rates.goldMYR}/g
💵 USD/MYR: ${rates.myrRate}
📈 Gold (oz): USD ${rates.goldUSD}
🏦 BNM OPR: 2.75% (on hold)
📦 CPI: 1.6% YoY | GDP Q4: 6.3%

─────────────────
HOW THESE MARKETS CONNECT
─────────────────
💵 USD & Gold
Gold is priced in USD globally. When USD weakens, non-USD buyers find gold cheaper, lifting demand and its USD price. But what Malaysians pay depends on BOTH the USD gold price AND the USD/MYR rate. At ${rates.myrRate} today, gold has ${goldTrend} in MYR terms — the Ringgit acts as a natural hedge.

🏦 BNM Rate & Ringgit
BNM holding at 2.75% while the Fed weighs cuts narrows the rate gap in Malaysia's favour. Foreign bond investors pour into Malaysian assets for yield, driving MYR demand. More MYR demand means stronger Ringgit — which lowers local gold prices and makes imports cheaper.

🛢️ Oil & Inflation
Malaysia exports oil via Petronas, so higher oil prices boost export revenue but also raise domestic fuel costs, nudging CPI up. Rising inflation reduces BNM's room to cut rates, keeping rates elevated and continuing to attract foreign capital.

📦 MYR Impact: Winners & Losers
A strong Ringgit helps importers (cheaper electronics, machinery, food) and data centre FDI. But it squeezes palm oil and semiconductor exporters who earn in USD.

─────────────────
🔍 WATCH TODAY
─────────────────
US Fed commentary + Brent crude price — both move USD/MYR and gold simultaneously.

Rates fetched live: ${ts} MYT`;
}

// --- Save dashboard data to a JSON file -------------------------------------
async function saveDashboardData(rates, message) {
  const fs = await import("fs");
  const today = new Date().toLocaleDateString("en-MY", { timeZone: "Asia/Kuala_Lumpur" });

  // Parse news bullets from message
  const newsMatch = message.match(/NEWS TODAY\n([\s\S]*?)\n/);
  const todayNews = newsMatch
    ? newsMatch[1].split("\n")
        .filter(l => l.trim().startsWith("\u2022"))
        .map(l => ({
          text: l.replace(/^\u2022\s*/, "").trim(),
          date: today,
          impact: guessImpact(l),
          goldUSD: rates.goldUSD,
          myrRate: parseFloat(rates.myrRate)
        }))
    : [];

  const data = {
    lastUpdated: new Date().toISOString(),
    rates, message, todayNews,
    newsHistory: [], history: []
  };

  try {
    const existing = JSON.parse(fs.readFileSync("dashboard-data.json", "utf8"));
    data.history = (existing.history || []).slice(-29);
    data.history.push({ date: today, goldMYR: rates.goldMYR, goldUSD: rates.goldUSD, myrRate: parseFloat(rates.myrRate) });

    const prevNews = existing.newsHistory || [];
    const prevToday = existing.todayNews || [];
    const archived = prevToday.map(n => {
      const goldDelta = rates.goldUSD - (n.goldUSD || rates.goldUSD);
      const myrDelta = parseFloat(rates.myrRate) - (n.myrRate || parseFloat(rates.myrRate));
      return { ...n, goldDelta: Math.round(goldDelta), myrDelta: parseFloat(myrDelta.toFixed(4)) };
    });
    data.newsHistory = [...prevNews, ...archived].slice(-60);
  } catch(_) {
    data.history = [{ date: today, goldMYR: rates.goldMYR, goldUSD: rates.goldUSD, myrRate: parseFloat(rates.myrRate) }];
  }

  fs.writeFileSync("dashboard-data.json", JSON.stringify(data, null, 2));
  console.log("Dashboard saved.", todayNews.length, "news items.");
}

// --- Guess impact from news text --------------------------------------------
function guessImpact(text) {
  const t = text.toLowerCase();
  if (/strengthen|rally|surge|gain|rise|high|inflow|growth|strong|boost/.test(t)) return "pos";
  if (/weaken|fall|drop|decline|risk|tension|war|inflation|concern/.test(t)) return "neg";
  return "neu";
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
  console.log(`USD/MYR: ${rates.myrRate} | Gold: USD ${rates.goldUSD}/oz | RM ${rates.goldMYR}/g`);

  console.log("Building message with live news...");
  const message = await buildMessage(rates);

  console.log("Saving dashboard data...");
  await saveDashboardData(rates, message);

  console.log("Sending to Telegram...");
  await sendTelegram(message);
  console.log("Done.");
}

main().catch(e => {
  console.error("Bot error:", e.message);
  process.exit(1);
});
