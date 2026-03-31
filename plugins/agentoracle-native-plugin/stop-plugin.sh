#!/bin/bash

# 停止 AgentOracle Native Plugin
# 通过禁用插件并重启 Gateway 来停止插件运行

set -e

echo "🦞 停止 AgentOracle Native Plugin..."
echo ""

# 禁用插件
echo "禁用插件..."
openclaw plugins disable agentoracle-native

echo ""
echo "重启 Gateway 以应用更改..."
openclaw gateway restart

echo ""
echo "✅ 插件已停止"
