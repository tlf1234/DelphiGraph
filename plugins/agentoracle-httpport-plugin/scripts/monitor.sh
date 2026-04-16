#!/usr/bin/env bash
LOG="/tmp/openclaw/openclaw-$(date +%Y-%m-%d).log"
echo "🔍 Monitoring AgentOracle HTTP Port Plugin..."
echo "   Log file: $LOG"
echo "   Press Ctrl+C to stop"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
tail -n 0 -f "$LOG" | while IFS= read -r line; do
  echo "$line" | grep -q 'agentoracle-httpport' || continue
  msg=$(echo "$line" | sed -n 's/.*"1":"\(.*\)","_meta.*/\1/p')
  [ -z "$msg" ] && continue
  ts=$(echo "$line" | sed -n 's/.*"time":"\([^"]*\)".*/\1/p' | cut -c12-19)
  level=$(echo "$line" | sed -n 's/.*"logLevelName":"\([^"]*\)".*/\1/p')
  case "$level" in
    ERROR) color="\033[31m" ;;
    WARN)  color="\033[33m" ;;
    *)     color="\033[0m"  ;;
  esac
  clean_msg=$(echo "$msg" | sed 's/\[agentoracle-httpport\] //')
  printf "${color}[${ts}] ${clean_msg}\033[0m\n"
done
