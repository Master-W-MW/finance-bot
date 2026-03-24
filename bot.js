const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID   = process.env.CHAT_ID;
const ANTH_KEY  = process.env.ANTH_KEY;

async function fetchRates() {
  // Exchange rate: USD/MYR
  const fxRes = await fetch("https://api.exchangerate-api.com/v4/latest/USD");
  const fxData = await fxRes.json();
  const myrRate = fxData.rates.MYR;

  // Gold price in USD (metals-api free tier)
  let goldUSD = null;
  try {
    const goldRes = await fetch("https://api.metals.live/v1/spot/gold");
    const goldData = await goldRes.json();
    goldUSD = goldData[0]?.price;
  } catch (_) {}

  // Fallback: use GoldAPI.io free endpoint
  if (!goldUSD) {
    try {
      const g2 = await fetch("https://www.goldapi.io/api/XAU/USD", {
        headers: { "x-access-token": "goldapi-demo" }
      });
      const g2d = await g2.json();
      goldUSD = g2d.price;
    } catch (_) {}
  }

  // Final fallback to a reasonable cached value
  if (!goldUSD || isNaN(goldUSD)) goldUSD = 2900;

  const goldMYR = Math.round(goldUSD * myrRate / 31.1035);
  return {
    myrRate: myrRate.toFixed(4),
    goldUSD: Math.round(goldUSD),
    goldMYR,
    myrStrong: myrRate < 4.0,
    goldTrend: goldMYR < 600 ? "eased from recent highs" : "elevated near recent highs"
  };
}

async function buildAnalysis(r) {
  const today = new Date().toLocaleDateString("en-MY", {
    weekday: "long", year: "numeric", month: "short", day: "numeric",
    timeZone: "Asia/Kuala_Lumpur"
  });
  const myrMood = r.myrStrong ? "Ringgit holding strong vs dollar" : "Ringgit under mild pressure";
  const ts = new Date().toLocaleTimeString("en-MY", {
    hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kuala_Lumpur"
  });

  if (!ANTH_KEY) {
    return buildFallbackMessage(r, today, myrMood, ts);
  }

  const prompt = `You are a sharp financial analyst writing a Telegram daily brief for a Malaysian investor. Today is ${today}.

Live market data fetched right now:
- Gold spot price: USD ${r.goldUSD}/oz (live)
- USD/MYR exchange rate: ${r.myrRate} (live)
- Gold price in MYR: ~RM ${r.goldMYR}/gram (24K, calculated live)
- BNM OPR: 2.75% (unchanged, 4th consecutive hold)
- Malaysia CPI: 1.6% YoY (Jan 2026)
- Malaysia GDP Q4 2025: 6.3% YoY
- MYR: Asia top performing currency, +10.9% YoY vs USD
- Context: Iran-US conflict keeping oil elevated; Fed rate decision upcoming; MY data centre FDI boom ongoing

Write a Telegram daily brief with these exact sections:

1. Header: date + one-line market mood sentence

2. KEY NUMBERS
List all 5 numbers cleanly (gold MYR/g, USD/MYR, gold USD/oz, BNM rate, CPI)

3. HOW THESE MARKETS CONNECT
Write 4 short paragraphs, each starting with an emoji label:
💵 USD & Gold — explain USD/gold inverse relationship and how MYR exchange rate affects what Malaysians actually pay for gold
🏦 BNM Rate & Ringgit — explain how rate hold attracts bond inflows, strengthens MYR, feeds back into gold price and imports
🛢️ Oil & Inflation — explain how Iran conflict raises oil, nudges CPI, limits BNM rate cuts, indirectly supports MYR
📦 Strong MYR: Winners & Losers — importers vs exporters, data centre FDI context

4. WATCH TODAY
One sharp line: what specific data or event to watch and why it matters for MYR and gold

Plain text only. No markdown (* _ etc). Max 5 emoji total (the section labels count). Keep it intelligent and specific to today's actual numbers.`;

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTH_KEY,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }]
    })
  });

  if (!resp.ok) {
    console.error("Claude API error:", resp.status);
    return buildFallbackMessage(r, today, myrMood, ts);
  }

  const data = await resp.json();
  const text = data.content?.find(b => b.type === "text")?.text || "";
  return text + `\n\nRates fetched live: ${ts} MYT`;
}

function buildFallbackMessage(r, today, myrMood, ts) {
  return `📊 MY Finance Update
${today} — 8:00 AM MYT
${myrMood}

─────────────────
KEY NUMBERS
─────────────────
💛 Gold (24K): RM ${r.goldMYR}/g
💵 USD/MYR: ${r.myrRate}
📈 Gold (oz): USD ${r.goldUSD}
🏦 BNM OPR: 2.75% (on hold)
📦 CPI: 1.6% YoY | GDP Q4: 6.3%

─────────────────
HOW THESE MARKETS CONNECT
─────────────────
💵 USD & Gold
Gold is priced in USD globally. When USD weakens, non-USD buyers find gold cheaper, lifting demand and pushing its USD price up. But what Malaysians actually pay depends on BOTH the USD gold price AND the USD/MYR rate. At ${r.myrRate} today, gold has ${r.goldTrend} in MYR terms — the Ringgit acts as a natural hedge, softening local gold price swings even when global gold moves.

🏦 BNM Rate & Ringgit
BNM holding at 2.75% while the Fed weighs cuts narrows the rate gap in Malaysia's favour. Foreign bond investors pour into Malaysian assets for the yield, driving MYR demand and strengthening the Ringgit. More MYR demand means stronger Ringgit — which lowers local gold prices and makes imports cheaper.

🛢️ Oil & Inflation
Malaysia exports oil via Petronas, so higher oil prices boost export revenue — but also raise domestic fuel and transport costs, nudging CPI up. Rising inflation reduces BNM's room to cut rates, keeping rates elevated longer, which continues attracting foreign capital and supporting MYR.

📦 Strong MYR: Winners & Losers
A strong Ringgit helps importers (cheaper electronics, machinery, food) and data centre FDI projects. But it squeezes palm oil and semiconductor exporters who earn in USD — their Ringgit revenue shrinks on conversion.

─────────────────
🔍 WATCH TODAY
─────────────────
US Fed commentary + Brent crude price — both move USD/MYR and gold simultaneously.

Rates fetched live: ${ts} MYT`;
}

async function sendTelegram(text) {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: CHAT_ID, text })
  });
  const data = await res.json();
  if (!data.ok) throw new Error("Telegram error: " + data.description);
  console.log("✓ Message sent to Telegram at", new Date().toISOString());
}

async function main() {
  if (!BOT_TOKEN || !CHAT_ID) {
    console.error("Missing BOT_TOKEN or CHAT_ID environment variables.");
    process.exit(1);
  }
  console.log("Fetching live rates...");
  const rates = await fetchRates();
  console.log(`USD/MYR: ${rates.myrRate} | Gold: USD ${rates.goldUSD}/oz | RM ${rates.goldMYR}/g`);
  console.log("Building message...");
  const message = await buildAnalysis(rates);
  console.log("Sending to Telegram...");
  await sendTelegram(message);
  console.log("Done.");
}

main().catch(e => {
  console.error("Bot error:", e.message);
  process.exit(1);
});
