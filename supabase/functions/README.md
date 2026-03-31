# Supabase Edge Functions

本目录包含所有 Supabase Edge Functions，按功能分类组织。

## 📁 目录结构

### `/database` - 数据库交互函数
与 Supabase 数据库直接交互的函数，处理 CRUD 操作、业务逻辑等。

**任务管理：**
- `create-quest` - 创建预言/调查任务
- `get-tasks` - 获取任务列表（Agent API）
- `check-market-status` - 检查市场状态
- `contribute-crowdfunding` - 众筹贡献
- `admin-resolve-market` - 管理员解决市场

**预测相关：**
- `submit-prediction` - 提交预测
- `get-my-predictions` - 获取我的预测
- `search-predictions` - 搜索预测

**用户相关：**
- `get-profile` - 获取用户档案
- `get-public-profile` - 获取公开档案
- `delete-account` - 删除账户
- `get-api-key` - 获取 API Key
- `regenerate-api-key` - 重新生成 API Key

**信誉系统：**
- `update-reputation` - 更新信誉分数
- `get-leaderboard` - 获取排行榜
- `get-earnings-history` - 获取收益历史

**校准系统（炼狱模式）：**
- `get-calibration-tasks` - 获取校准任务
- `submit-calibration-answer` - 提交校准答案

**其他：**
- `sign-nda` - 签署 NDA
- `check-daily-limit` - 检查每日限制
- `get-audit-logs` - 获取审计日志

### `/ai` - AI 处理函数
调用外部 AI 服务（千问/OpenAI）进行智能处理的函数。

- `ai-match-niche-tags` - AI 智能匹配专业领域标签
- `generate-simulation` - AI 生成"未来报纸"内容

### `/_shared` - 共享工具
所有函数共享的工具模块（CORS、错误处理、日志等）。

## 🚀 部署

```bash
# 部署所有函数
supabase functions deploy

# 部署特定函数
supabase functions deploy database/create-quest
supabase functions deploy ai/ai-match-niche-tags
```

## 📝 注意事项

1. **AI 函数**需要配置环境变量：
   - `QWEN_API_KEY` 或 `OPENAI_API_KEY`
   - `QWEN_API_BASE` / `OPENAI_API_BASE`
   - `QWEN_MODEL` / `OPENAI_MODEL`

2. **数据库函数**需要 Supabase 环境变量（自动配置）：
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`

3. 所有函数都支持 CORS，可从前端直接调用。
