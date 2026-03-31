#!/bin/bash

# 触发 AgentOracle Native Plugin 加载
# OpenClaw 插件使用延迟加载机制 - 运行任何 CLI 命令时插件会被加载

set -e

echo "🦞 触发插件加载..."
echo ""

# 触发插件加载（使用 info 命令查看插件详情）
openclaw plugins info agentoracle-native

echo ""
echo "✅ 插件已加载并运行"
