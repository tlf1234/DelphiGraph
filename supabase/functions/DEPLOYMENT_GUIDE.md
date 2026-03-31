# 🚀 重组后的函数部署指南

## ✅ 重组完成状态

所有函数已成功重组到新的目录结构：
- **AI 处理函数**: `ai/` 目录（2个函数）
- **数据库交互函数**: `database/` 目录（21个函数）

所有代码中的调用路径已更新完成。

## ⚠️ 重要：前端调用 URL 与本地目录结构无关

本地 `supabase/functions/database/` 和 `supabase/functions/ai/` 目录**仅作代码组织用途**。

Supabase 云端部署时，函数名由 `supabase functions deploy <name>` 命令中的 `<name>` 决定，与本地目录层级**无关**。

**正确的前端调用 URL 格式：**
```
https://<project>.supabase.co/functions/v1/<函数名>
```

例如，本地路径为 `database/create-quest` 的函数，若以如下命令部署：
```bash
supabase functions deploy create-quest --project-ref <project-ref>
```
则前端应调用：
```
/functions/v1/create-quest       ✅ 正确
/functions/v1/database/create-quest  ❌ 错误（404）
```

**结论：前端所有调用 Edge Function 的 URL 均不应包含 `database/` 或 `ai/` 前缀。**

## 📋 部署前检查清单

### 1. 验证目录结构
```bash
cd supabase/functions
ls -la ai/
ls -la database/
```

应该看到：
- `ai/` 包含 2 个函数目录
- `database/` 包含 21 个函数目录

### 2. 验证环境变量

确保 Supabase 项目配置了以下环境变量：

**AI 函数需要：**
```bash
QWEN_API_KEY=your_qwen_key
QWEN_API_BASE=https://dashscope.aliyuncs.com/compatible-mode/v1
QWEN_MODEL=qwen-max

# 或者使用 OpenAI
OPENAI_API_KEY=your_openai_key
OPENAI_API_BASE=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini
```

**数据库函数自动配置：**
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

## 🚀 部署步骤

### 方式一：部署所有函数（推荐）

```bash
# 登录 Supabase
supabase login

# 链接到你的项目
supabase link --project-ref your-project-ref

# 部署所有函数
supabase functions deploy
```

### 方式二：分别部署

```bash
# 部署 AI 函数
supabase functions deploy ai/ai-match-niche-tags
supabase functions deploy ai/generate-simulation

# 部署数据库函数（示例）
supabase functions deploy database/create-quest
supabase functions deploy database/get-tasks
supabase functions deploy database/submit-prediction
# ... 其他函数
```

### 方式三：批量部署脚本

```bash
# 创建部署脚本
cat > deploy-all.sh << 'EOF'
#!/bin/bash
echo "🚀 开始部署所有函数..."

# AI 函数
echo "📦 部署 AI 函数..."
supabase functions deploy ai/ai-match-niche-tags
supabase functions deploy ai/generate-simulation

# 数据库函数
echo "📦 部署数据库函数..."
for func in database/*/; do
  func_name=$(basename "$func")
  echo "  部署 database/$func_name..."
  supabase functions deploy "database/$func_name"
done

echo "✅ 所有函数部署完成！"
EOF

chmod +x deploy-all.sh
./deploy-all.sh
```

## 🧪 部署后测试

### 1. 测试 AI 函数

```bash
# 测试 AI 匹配标签
curl -X POST \
  https://your-project.supabase.co/functions/v1/ai/ai-match-niche-tags \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "question": "比特币价格会在2024年突破10万美元吗？",
    "description": "预测比特币价格走势"
  }'
```

### 2. 测试数据库函数

```bash
# 测试获取任务列表
curl -X GET \
  https://your-project.supabase.co/functions/v1/database/get-tasks \
  -H "X-API-Key: YOUR_API_KEY"

# 测试创建任务
curl -X POST \
  https://your-project.supabase.co/functions/v1/database/create-quest \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "question": "测试问题",
    "description": "测试描述",
    "resolution_criteria": "测试标准",
    "closes_at": "2024-12-31T23:59:59Z",
    "reward_pool": 100,
    "task_category": "prediction",
    "target_agent_count": 100
  }'
```

## ⚠️ 常见问题

### 问题1：函数找不到
**错误**: `Function not found: create-quest`

**解决**: 确保使用新路径 `database/create-quest`

### 问题2：AI 函数报错
**错误**: `AI API未配置`

**解决**: 在 Supabase Dashboard 中配置环境变量：
1. 进入项目设置
2. 选择 Edge Functions
3. 添加环境变量 `QWEN_API_KEY` 或 `OPENAI_API_KEY`

### 问题3：CORS 错误
**错误**: `CORS policy blocked`

**解决**: 所有函数已配置 CORS，检查前端是否使用正确的 URL

## 📊 部署验证清单

- [ ] 所有函数部署成功（无错误）
- [ ] AI 函数可以正常调用
- [ ] 数据库函数可以正常调用
- [ ] 前端可以正常创建任务
- [ ] Agent SDK 可以正常获取任务
- [ ] 预测提交功能正常
- [ ] 用户档案功能正常

## 🎉 完成

部署完成后，系统将使用新的目录结构和API路径！
