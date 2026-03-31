#!/bin/bash

# 自动更新所有函数调用路径
# 将旧路径 /functions/v1/xxx 更新为 /functions/v1/database/xxx 或 /functions/v1/ai/xxx

set -e

echo "🔄 开始更新函数调用路径..."

# ============================================================================
# 更新前端代码中的路径
# ============================================================================
echo "📝 更新前端代码..."

# AI 函数路径更新
find ../../frontend/src -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" \) -exec sed -i.bak \
  -e 's|/functions/v1/ai-match-niche-tags|/functions/v1/ai/ai-match-niche-tags|g' \
  -e 's|/functions/v1/generate-simulation|/functions/v1/ai/generate-simulation|g' \
  {} \;

# 数据库函数路径更新
find ../../frontend/src -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" \) -exec sed -i.bak \
  -e 's|/functions/v1/create-quest|/functions/v1/database/create-quest|g' \
  -e 's|/functions/v1/get-tasks|/functions/v1/database/get-tasks|g' \
  -e 's|/functions/v1/submit-prediction|/functions/v1/database/submit-prediction|g' \
  -e 's|/functions/v1/get-my-predictions|/functions/v1/database/get-my-predictions|g' \
  -e 's|/functions/v1/get-profile|/functions/v1/database/get-profile|g' \
  -e 's|/functions/v1/get-public-profile|/functions/v1/database/get-public-profile|g' \
  -e 's|/functions/v1/get-leaderboard|/functions/v1/database/get-leaderboard|g' \
  -e 's|/functions/v1/get-earnings-history|/functions/v1/database/get-earnings-history|g' \
  -e 's|/functions/v1/get-calibration-tasks|/functions/v1/database/get-calibration-tasks|g' \
  -e 's|/functions/v1/submit-calibration-answer|/functions/v1/database/submit-calibration-answer|g' \
  -e 's|/functions/v1/sign-nda|/functions/v1/database/sign-nda|g' \
  -e 's|/functions/v1/contribute-crowdfunding|/functions/v1/database/contribute-crowdfunding|g' \
  -e 's|/functions/v1/search-predictions|/functions/v1/database/search-predictions|g' \
  {} \;

# ============================================================================
# 更新函数间调用路径
# ============================================================================
echo "📝 更新函数间调用..."

# create-quest 调用 ai-match-niche-tags
find database/create-quest -type f -name "*.ts" -exec sed -i.bak \
  -e 's|/functions/v1/ai-match-niche-tags|/functions/v1/ai/ai-match-niche-tags|g' \
  {} \;

# ============================================================================
# 清理备份文件
# ============================================================================
echo "🧹 清理备份文件..."
find ../../frontend/src -name "*.bak" -delete
find database -name "*.bak" -delete
find ai -name "*.bak" -delete

echo ""
echo "✅ 路径更新完成！"
echo ""
echo "📋 已更新的路径："
echo "  AI 函数："
echo "    - ai-match-niche-tags → ai/ai-match-niche-tags"
echo "    - generate-simulation → ai/generate-simulation"
echo ""
echo "  数据库函数："
echo "    - create-quest → database/create-quest"
echo "    - get-tasks → database/get-tasks"
echo "    - submit-prediction → database/submit-prediction"
echo "    - ... (共 21 个函数)"
echo ""
echo "⚠️  请手动检查以下文件："
echo "  1. frontend/src/components/markets/market-creation-form.tsx"
echo "  2. supabase/functions/database/create-quest/index.ts"
echo "  3. 其他调用 Edge Functions 的文件"
echo ""
