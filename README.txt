MY Finance Daily Bot — Mac Setup Guide
=======================================

REQUIREMENTS
- macOS (device stays on 24/7)
- Node.js (https://nodejs.org — LTS version, or: brew install node)

QUICK SETUP (3 minutes)
1. Open Terminal (Cmd+Space → type "Terminal" → Enter)
2. cd to this folder:
     cd ~/Downloads/mac-bot
3. Run setup:
     bash setup.sh
4. TextEdit opens with run_bot.sh — paste your 4 keys, save
5. Test it:
     bash ~/finance-bot/run_bot.sh
6. Check Telegram — message should arrive within 30 seconds

YOUR 4 KEYS
  BOT_TOKEN   From @BotFather in Telegram
  CHAT_ID     Your Telegram chat ID
  ANTH_KEY    From console.anthropic.com (needs $5 credits for AI news)
  METALS_KEY  From metals.dev (free, optional)

HOW IT WORKS
- macOS launchd runs run_bot.sh every day at 8:00 AM
- Node.js fetches live gold price + USD/MYR rate
- Claude AI writes the market analysis (needs Anthropic credits)
- Message sent to your Telegram
- Logs saved to ~/finance-bot/bot_log.txt

WITHOUT ANTHROPIC CREDITS
Bot still works — sends live rates + template analysis.
Only AI-written news section is skipped.

USEFUL COMMANDS
  View logs:
    cat ~/finance-bot/bot_log.txt

  Test manually:
    bash ~/finance-bot/run_bot.sh

  Check scheduler status:
    launchctl list | grep myfinancebot

  Stop scheduler:
    launchctl unload ~/Library/LaunchAgents/com.myfinancebot.daily.plist

  Restart scheduler:
    launchctl load ~/Library/LaunchAgents/com.myfinancebot.daily.plist
