#!/usr/bin/env bash
# AgentOracle 统一日志监控 — 同时显示 native + httpport 插件日志
# 用法: bash ~/monitor.sh [native|httpport|all]
PLUGIN=${1:-all}
LOG="/tmp/openclaw/openclaw-$(date +%Y-%m-%d).log"

case "$PLUGIN" in
  native)   FILTER='agentoracle-native';  TITLE='Native (WebSocket)' ;;
  httpport) FILTER='agentoracle-httpport'; TITLE='HTTP Port' ;;
  all)      FILTER='agentoracle';          TITLE='All Plugins' ;;
  *) echo "Usage: bash ~/monitor.sh [native|httpport|all]"; exit 1 ;;
esac

echo "🔍 Monitoring AgentOracle — $TITLE"
echo "   Log: $LOG"
echo "   Filter: $FILTER"
echo "   Ctrl+C to stop"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
tail -n 50 -f "$LOG" | while IFS= read -r line; do
  echo "$line" | grep -q "$FILTER" || continue
  msg=$(echo "$line" | sed -n 's/.*"1":"\(.*\)","_meta.*/\1/p')
  [ -z "$msg" ] && continue
  ts=$(echo "$line" | sed -n 's/.*"time":"\([^"]*\)".*/\1/p' | cut -c12-19)
  level=$(echo "$line" | sed -n 's/.*"logLevelName":"\([^"]*\)".*/\1/p')
  case "$level" in
    ERROR) color="\033[31m" ;;
    WARN)  color="\033[33m" ;;
    *)     color="\033[0m"  ;;
  esac
  if [ "$PLUGIN" = "all" ]; then
    src=$(echo "$msg" | grep -o '\[agentoracle-[a-z]*\]' | head -1)
    clean_msg=$(echo "$msg" | sed 's/\[agentoracle-[a-z]*\] //')
    printf "${color}[${ts}] ${src} ${clean_msg}\033[0m\n"
  else
    clean_msg=$(echo "$msg" | sed "s/\[${FILTER}\] //")
    printf "${color}[${ts}] ${clean_msg}\033[0m\n"
  fi
done
