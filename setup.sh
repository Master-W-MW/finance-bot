#!/bin/bash
set -e

echo ""
echo "================================================"
echo "  MY Finance Bot — Mac Setup"
echo "================================================"
echo ""

# ── Check Node.js ──────────────────────────────────────────────────────────
if ! command -v node &> /dev/null; then
  echo "❌  Node.js not found."
  echo ""
  echo "Install it one of two ways:"
  echo "  Option A (easiest): Download from https://nodejs.org — choose LTS"
  echo "  Option B (Homebrew): run → brew install node"
  echo ""
  echo "Then run this setup again: bash setup.sh"
  exit 1
fi
echo "✅  Node.js $(node --version) found"

# ── Get Mac username ───────────────────────────────────────────────────────
MACUSER=$(whoami)
INSTALL_DIR="$HOME/finance-bot"

echo "✅  Installing to: $INSTALL_DIR"

# ── Create install folder ──────────────────────────────────────────────────
mkdir -p "$INSTALL_DIR"

# ── Copy files ─────────────────────────────────────────────────────────────
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cp "$SCRIPT_DIR/bot.js"     "$INSTALL_DIR/bot.js"
cp "$SCRIPT_DIR/package.json" "$INSTALL_DIR/package.json"
cp "$SCRIPT_DIR/run_bot.sh" "$INSTALL_DIR/run_bot.sh"
chmod +x "$INSTALL_DIR/run_bot.sh"
echo "✅  Bot files copied"

# ── Fix plist paths with actual username ──────────────────────────────────
PLIST_SRC="$SCRIPT_DIR/com.myfinancebot.daily.plist"
PLIST_DST="$HOME/Library/LaunchAgents/com.myfinancebot.daily.plist"

sed "s|YOURUSERNAME|$MACUSER|g" "$PLIST_SRC" > "$PLIST_DST"
sed -i '' "s|/Users/$MACUSER/finance-bot/run_bot.sh|$INSTALL_DIR/run_bot.sh|g" "$PLIST_DST"
sed -i '' "s|/Users/$MACUSER/finance-bot/launchd_out.log|$INSTALL_DIR/launchd_out.log|g" "$PLIST_DST"
sed -i '' "s|/Users/$MACUSER/finance-bot/launchd_err.log|$INSTALL_DIR/launchd_err.log|g" "$PLIST_DST"
echo "✅  launchd schedule created (8:00 AM daily)"

# ── Load the launchd agent ─────────────────────────────────────────────────
launchctl unload "$PLIST_DST" 2>/dev/null || true
launchctl load "$PLIST_DST"
echo "✅  launchd agent loaded and active"

# ── Open run_bot.sh in TextEdit for key entry ──────────────────────────────
echo ""
echo "================================================"
echo "  ⚠️  IMPORTANT: Paste your API keys now"
echo "================================================"
echo ""
echo "TextEdit will open with run_bot.sh."
echo "Replace the 4 PASTE_YOUR_..._HERE placeholders:"
echo ""
echo "  BOT_TOKEN   → Your Telegram bot token"
echo "  CHAT_ID     → Your Telegram chat ID"
echo "  ANTH_KEY    → Your Anthropic API key"
echo "  METALS_KEY  → Your metals.dev key (optional)"
echo ""
echo "Save the file, then test with:"
echo "  bash $INSTALL_DIR/run_bot.sh"
echo ""

open -e "$INSTALL_DIR/run_bot.sh"

echo "Setup complete! Bot will run every day at 8:00 AM."
echo "Logs: $INSTALL_DIR/bot_log.txt"
