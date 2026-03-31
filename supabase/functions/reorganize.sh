#!/bin/bash

# Supabase Functions 重组脚本
# 将函数按职责分类到 /database 和 /ai 目录

set -e

echo "🔄 开始重组 Supabase Functions..."

# 创建新目录
mkdir -p database
mkdir -p ai

# ============================================================================
# AI 处理函数（调用外部 AI 服务）
# ============================================================================
echo "📦 移动 AI 处理函数..."

mv ai-match-niche-tags ai/ 2>/dev/null || echo "  ⚠️  ai-match-niche-tags 已存在或不存在"
mv generate-simulation ai/ 2>/dev/null || echo "  ⚠️  generate-simulation 已存在或不存在"

# ============================================================================
# 数据库交互函数
# ============================================================================
echo "📦 移动数据库交互函数..."

# 任务管理
mv create-quest database/ 2>/dev/null || echo "  ⚠️  create-quest 已存在或不存在"
mv get-tasks database/ 2>/dev/null || echo "  ⚠️  get-tasks 已存在或不存在"
mv check-market-status database/ 2>/dev/null || echo "  ⚠️  check-market-status 已存在或不存在"
mv contribute-crowdfunding database/ 2>/dev/null || echo "  ⚠️  contribute-crowdfunding 已存在或不存在"
mv admin-resolve-market database/ 2>/dev/null || echo "  ⚠️  admin-resolve-market 已存在或不存在"

# 预测相关
mv submit-prediction database/ 2>/dev/null || echo "  ⚠️  submit-prediction 已存在或不存在"
mv get-my-predictions database/ 2>/dev/null || echo "  ⚠️  get-my-predictions 已存在或不存在"
mv search-predictions database/ 2>/dev/null || echo "  ⚠️  search-predictions 已存在或不存在"

# 用户相关
mv get-profile database/ 2>/dev/null || echo "  ⚠️  get-profile 已存在或不存在"
mv get-public-profile database/ 2>/dev/null || echo "  ⚠️  get-public-profile 已存在或不存在"
mv delete-account database/ 2>/dev/null || echo "  ⚠️  delete-account 已存在或不存在"
mv get-api-key database/ 2>/dev/null || echo "  ⚠️  get-api-key 已存在或不存在"
mv regenerate-api-key database/ 2>/dev/null || echo "  ⚠️  regenerate-api-key 已存在或不存在"

# 信誉系统
mv update-reputation database/ 2>/dev/null || echo "  ⚠️  update-reputation 已存在或不存在"
mv get-leaderboard database/ 2>/dev/null || echo "  ⚠️  get-leaderboard 已存在或不存在"
mv get-earnings-history database/ 2>/dev/null || echo "  ⚠️  get-earnings-history 已存在或不存在"

# 校准系统
mv get-calibration-tasks database/ 2>/dev/null || echo "  ⚠️  get-calibration-tasks 已存在或不存在"
mv submit-calibration-answer database/ 2>/dev/null || echo "  ⚠️  submit-calibration-answer 已存在或不存在"

# 其他
mv sign-nda database/ 2>/dev/null || echo "  ⚠️  sign-nda 已存在或不存在"
mv check-daily-limit database/ 2>/dev/null || echo "  ⚠️  check-daily-limit 已存在或不存在"
mv get-audit-logs database/ 2>/dev/null || echo "  ⚠️  get-audit-logs 已存在或不存在"

echo ""
echo "✅ 重组完成！"
echo ""
echo "📁 新的目录结构："
echo "  supabase/functions/"
echo "    ├── _shared/          # 共享工具"
echo "    ├── ai/               # AI 处理函数（2个）"
echo "    ├── database/         # 数据库交互函数（21个）"
echo "    └── README.md         # 文档"
echo ""
echo "⚠️  重要提示："
echo "  1. 需要更新前端调用路径（例如：/functions/v1/create-quest → /functions/v1/database/create-quest）"
echo "  2. 需要更新函数间调用路径（例如：create-quest 调用 ai-match-niche-tags）"
echo "  3. 运行 'bash update-paths.sh' 自动更新所有路径"
echo ""
