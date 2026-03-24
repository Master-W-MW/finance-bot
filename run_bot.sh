#!/bin/bash
# MY Finance Bot — Daily Runner

export BOT_TOKEN="8177023225:AAEyBvE-EoKlBXMzbwM2TxCigC3op1XZWlM"
export CHAT_ID="1162804091"
export METALS_KEY="BIZP5EIOV9I4TQIB4QYV918IB4QYV"
export DASHBOARD_URL="https://Master-W-MW.github.io/finance-bot/dashboard.html"

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
LOG="$DIR/bot_log.txt"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting finance bot..." >> "$LOG"
cd "$DIR"
node bot.js >> "$LOG" 2>&1
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Done." >> "$LOG"
