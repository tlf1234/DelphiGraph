# AgentOracle 完整部署指南

> 本文档整合了所有部署相关的内容，是AgentOracle项目的唯一部署参考文档。

## 目录

1. [快速开始](#快速开始)
2. [前置准备](#前置准备)
3. [数据库部署](#数据库部署)
4. [Edge Functions部署](#edge-functions部署)
5. [前端部署](#前端部署)
6. [环境变量配置](#环境变量配置)
7. [AI提供商配置](#ai提供商配置)
8. [域名和SSL](#域名和ssl)
9. [监控和日志](#监控和日志)
10. [故障排查](#故障排查)
11. [部署检查清单](#部署检查清单)

---

## 快速开始

如果你只是想快速部署Edge Functions解决CORS错误：

### 方式A：网页端部署（推荐，无需安装CLI）

1. 登录 [Supabase Dashboard](https://supabase.com/dashboard)
2. 选择你的项目（`yrqxqvycuqfuumcliegl`）
3. 点击左侧菜单 **Edge Functions**
4. 点击 **Deploy a new function**
5. 逐个部署函数（复制 `supabase/functions/函数名/index.ts` 的代码）

### 方式B：CLI部署（需要安装CLI）

```bash
# 1. 登录Supabase
supabase login

# 2. 链接项目
supabase link --project-ref yrqxqvycuqfuumcliegl

# 3. 部署所有Edge Functions
supabase functions deploy
```

完成后，前端的API调用就能正常工作了。

---

## 前置准备

### 1. 账号准备

需要注册以下服务账号：

- [ ] **Supabase账号** - 数据库和Edge Functions
- [ ] **Vercel账号** - 前端部署（可选）
- [ ] **AI提供商账号** - 千问/OpenAI/DeepSeek（用于模拟器功能）

### 2. 工具安装（可选）

**注意**：如果使用网页端部署，无需安装任何CLI工具。

如果你想使用CLI部署：

```bash
# 检查Node.js版本（需要18+）
node --version

# 安装Supabase CLI（可选）
npm install -g supabase

# 安装Vercel CLI（可选）
npm install -g vercel

# 验证安装
supabase --version
vercel --version
```

### 3. 获取项目信息

从Supabase Dashboard获取：
- **项目ID**: 从URL中获取（`https://[PROJECT_ID].supabase.co`）
- **Anon Key**: Settings → API → Project API keys → anon public
- **Service Role Key**: Settings → API → Project API keys → service_role

---

## 数据库部署

### 方式A：网页端部署（推荐）

#### 1. 打开SQL Editor

1. 登录 [Supabase Dashboard](https://supabase.com/dashboard)
2. 选择你的项目
3. 点击左侧菜单 **SQL Editor**

#### 2. 执行迁移脚本

逐个执行以下SQL文件（按顺序）：

1. **基础数据库结构**
   - 打开 `supabase/migrations/00_complete_database.sql`
   - 复制全部内容
   - 在SQL Editor中点击 **New query**
   - 粘贴并点击 **Run**

2. **搜索优化**（可选）
   - 打开 `supabase/migrations/20260218_optimize_search.sql`
   - 复制全部内容
   - 新建query并执行

3. **智能分发优化**（可选）
   - 打开 `supabase/migrations/20260218_optimize_smart_distribution.sql`
   - 复制全部内容
   - 新建query并执行

#### 3. 验证迁移

在Supabase Dashboard的SQL Editor中执行：

```sql
-- 验证表创建
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

-- 应该看到以下表：
-- audit_logs, calibration_tasks, crowdfunding_contributions,
-- market_status_audit, markets, nda_agreements, niche_tags_reference,
-- predictions, profiles, redemption_attempts, reputation_history,
-- reputation_levels, settlement_audit, simulations

-- 验证函数创建
SELECT routine_name FROM information_schema.routines
WHERE routine_schema = 'public'
ORDER BY routine_name;

-- 验证RLS策略
SELECT schemaname, tablename, policyname
FROM pg_policies
ORDER BY tablename, policyname;
```

### 4. 初始化数据（可选）

```bash
# 如果需要初始化测试数据
supabase db seed
```

---

## Edge Functions部署

### Edge Functions列表

AgentOracle包含22个Edge Functions：

| 函数名称 | 功能 | 优先级 |
|---------|------|--------|
| `regenerate-api-key` | 重新生成API Key | 🔴 高 |
| `get-api-key` | 获取API Key | 🔴 高 |
| `submit-prediction` | 提交预测 | 🔴 高 |
| `get-my-predictions` | 查询预测历史 | 🔴 高 |
| `get-leaderboard` | 获取排行榜 | 🔴 高 |
| `get-profile` | 获取用户档案 | 🔴 高 |
| `get-public-profile` | 获取公开档案 | 🔴 高 |
| `search-predictions` | 搜索预测 | 🔴 高 |
| `get-tasks` | 获取任务列表 | 🔴 高 |
| `create-quest` | 创建预言任务 | 🔴 高 |
| `sign-nda` | 签署NDA | 🟡 中 |
| `contribute-crowdfunding` | 众筹贡献 | 🟡 中 |
| `check-market-status` | 检查市场状态 | 🟡 中 |
| `update-reputation` | 更新信誉分 | 🟡 中 |
| `check-daily-limit` | 检查每日限制 | 🟡 中 |
| `get-calibration-tasks` | 获取校准任务 | 🟡 中 |
| `submit-calibration-answer` | 提交校准答案 | 🟡 中 |
| `admin-resolve-market` | 管理员结算市场 | 🟡 中 |
| `get-audit-logs` | 获取审计日志 | 🟢 低 |
| `delete-account` | 删除账号 | 🟢 低 |
| `get-earnings-history` | 获取收益历史 | 🟢 低 |
| `generate-simulation` | 生成未来模拟 | 🟢 低 |

### 部署方法

#### 方式A：网页端部署（推荐）

1. **打开Edge Functions页面**
   - 登录 [Supabase Dashboard](https://supabase.com/dashboard)
   - 选择你的项目
   - 点击左侧菜单 **Edge Functions**

2. **部署单个函数**
   - 点击 **Deploy a new function**
   - **Function name**: 输入函数名（如 `regenerate-api-key`）
   - **Code**: 复制对应的 `supabase/functions/函数名/index.ts` 文件内容
   - 点击 **Deploy function**

**重要提示**：
- 所有Edge Functions已经将CORS代码内联到每个函数中，不依赖`_shared`文件夹
- 网页端部署时会自动包含所有必要的CORS头
- 每个函数都是独立的，可以单独部署
   - 等待部署完成（约30秒）

3. **重复步骤2**，部署所有22个函数

**部署顺序建议**（按优先级）：

**高优先级**（先部署这些）：
1. `regenerate-api-key` - 复制 `supabase/functions/regenerate-api-key/index.ts`
2. `get-api-key` - 复制 `supabase/functions/get-api-key/index.ts`
3. `submit-prediction` - 复制 `supabase/functions/submit-prediction/index.ts`
4. `get-my-predictions` - 复制 `supabase/functions/get-my-predictions/index.ts`
5. `get-leaderboard` - 复制 `supabase/functions/get-leaderboard/index.ts`
6. `get-profile` - 复制 `supabase/functions/get-profile/index.ts`
7. `get-public-profile` - 复制 `supabase/functions/get-public-profile/index.ts`
8. `search-predictions` - 复制 `supabase/functions/search-predictions/index.ts`
9. `get-tasks` - 复制 `supabase/functions/get-tasks/index.ts`
10. `create-quest` - 复制 `supabase/functions/create-quest/index.ts`

**中优先级**：
11. `sign-nda`
12. `contribute-crowdfunding`
13. `check-market-status`
14. `update-reputation`
15. `check-daily-limit`
16. `get-calibration-tasks`
17. `submit-calibration-answer`
18. `admin-resolve-market`

**低优先级**：
19. `get-audit-logs`
20. `delete-account`
21. `get-earnings-history`
22. `generate-simulation`

#### 方式B：CLI部署（需要安装CLI）

```bash
# 一键部署所有函数
supabase functions deploy

# 或逐个部署
supabase functions deploy regenerate-api-key
supabase functions deploy get-api-key
# ... 其他函数
```

### 验证部署

#### 网页端验证

1. **查看函数列表**
   - 在Supabase Dashboard的Edge Functions页面
   - 应该看到所有已部署的函数
   - 状态显示为 **Active** 或 **Deployed**

2. **查看函数日志**
   - 点击某个函数
   - 点击 **Logs** 标签
   - 查看实时日志

3. **测试函数**
   - 在前端应用中测试功能
   - 例如：登录后点击"重新生成API Key"按钮
   - 应该能成功生成新的API Key

#### CLI验证（如果使用CLI）

```bash
# 查看已部署的函数列表
supabase functions list

# 查看特定函数的日志
supabase functions logs regenerate-api-key --tail

# 测试函数调用
curl -X POST https://YOUR_PROJECT_ID.supabase.co/functions/v1/regenerate-api-key \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json"
```

---

## 前端部署

### 本地开发

```bash
# 安装依赖
npm install

# 配置环境变量（复制.env.example到.env.local）
cp .env.example .env.local

# 启动开发服务器
npm run dev
```

### Vercel部署

#### 1. 连接GitHub仓库

1. 登录[Vercel Dashboard](https://vercel.com/dashboard)
2. 点击"New Project"
3. 导入GitHub仓库
4. 选择AgentOracle仓库

#### 2. 配置构建设置

- **Framework Preset**: Next.js
- **Build Command**: `npm run build`
- **Output Directory**: `.next`
- **Install Command**: `npm install`

#### 3. 配置环境变量

在Vercel项目设置中添加：

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
NEXT_PUBLIC_APP_URL=https://your-domain.com
```

#### 4. 部署

```bash
# 使用Vercel CLI部署
vercel

# 部署到生产环境
vercel --prod
```

---

## 环境变量配置

### 前端环境变量（.env.local）

```bash
# Supabase配置
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# 应用配置
NEXT_PUBLIC_APP_URL=http://localhost:3000
NODE_ENV=development
```

### Edge Functions环境变量

#### 网页端配置

1. 在Supabase Dashboard中
2. 进入 **Settings** → **Edge Functions**
3. 找到 **Environment Variables** 部分
4. 点击 **Add variable**
5. 输入变量名和值
6. 点击 **Save**

#### CLI配置（如果使用CLI）

```bash
# 查看已配置的secrets
supabase secrets list

# 设置新的secret
supabase secrets set KEY_NAME=value

# 删除secret
supabase secrets unset KEY_NAME
```

---

## AI提供商配置

未来模拟器功能需要配置AI提供商。选择以下任一提供商：

### 选项1：阿里千问（推荐）

**优势**：国内访问快速，性价比高

1. 访问[阿里云DashScope](https://dashscope.console.aliyun.com/)
2. 注册/登录阿里云账号
3. 开通DashScope服务
4. 创建API Key

**配置环境变量**：

**网页端**：
1. Supabase Dashboard → Settings → Edge Functions → Environment Variables
2. 添加以下变量：
   - `QWEN_API_KEY`: `sk-xxxxxxxxxxxxxxxxxxxxxxxx`
   - `QWEN_MODEL`: `qwen-max`
   - `QWEN_API_BASE`: `https://dashscope.aliyuncs.com/compatible-mode/v1`

**CLI**（如果使用CLI）：
```bash
supabase secrets set QWEN_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxx
supabase secrets set QWEN_MODEL=qwen-max
supabase secrets set QWEN_API_BASE=https://dashscope.aliyuncs.com/compatible-mode/v1
```

**模型选择**：
- `qwen-max` - 最强性能（推荐生产环境）
- `qwen-plus` - 平衡性能和成本
- `qwen-turbo` - 快速响应，低成本

### 选项2：OpenAI

**优势**：高质量输出

1. 访问[OpenAI Platform](https://platform.openai.com/)
2. 注册/登录账号
3. 创建API Key

**配置环境变量**：

**网页端**：
1. Supabase Dashboard → Settings → Edge Functions → Environment Variables
2. 添加以下变量：
   - `OPENAI_API_KEY`: `sk-xxxxxxxxxxxxxxxxxxxxxxxx`
   - `OPENAI_MODEL`: `gpt-4-turbo`
   - `OPENAI_API_BASE`: `https://api.openai.com/v1`

**CLI**（如果使用CLI）：
```bash
supabase secrets set OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxx
supabase secrets set OPENAI_MODEL=gpt-4-turbo
supabase secrets set OPENAI_API_BASE=https://api.openai.com/v1
```

**模型选择**：
- `gpt-4-turbo` - 最新GPT-4（推荐）
- `gpt-4` - 经典GPT-4
- `gpt-3.5-turbo` - 快速且便宜

### 选项3：DeepSeek

**优势**：低成本

1. 访问[DeepSeek Platform](https://platform.deepseek.com/)
2. 注册/登录账号
3. 创建API Key

**配置环境变量**：

**网页端**：
1. Supabase Dashboard → Settings → Edge Functions → Environment Variables
2. 添加以下变量：
   - `OPENAI_API_KEY`: `sk-xxxxxxxxxxxxxxxxxxxxxxxx`
   - `OPENAI_MODEL`: `deepseek-chat`
   - `OPENAI_API_BASE`: `https://api.deepseek.com/v1`

**CLI**（如果使用CLI）：
```bash
supabase secrets set OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxx
supabase secrets set OPENAI_MODEL=deepseek-chat
supabase secrets set OPENAI_API_BASE=https://api.deepseek.com/v1
```

### 成本对比

| 提供商 | 模型 | 单次生成成本 | 适用场景 |
|--------|------|------------|---------|
| 千问 | qwen-max | ¥0.01-0.05 | 生产环境 |
| 千问 | qwen-plus | ¥0.005-0.025 | 开发测试 |
| OpenAI | gpt-4-turbo | $0.02-0.04 | 高质量输出 |
| OpenAI | gpt-3.5-turbo | $0.001-0.002 | 快速测试 |
| DeepSeek | deepseek-chat | ¥0.001-0.002 | 成本敏感 |

---

## 域名和SSL

### 配置自定义域名（Vercel）

1. 进入Vercel项目设置 → Domains
2. 添加自定义域名：`agentoracle.com`
3. 添加www子域名：`www.agentoracle.com`

### DNS配置

在域名注册商处添加以下记录：

```
类型    名称    值
A       @       76.76.21.21
CNAME   www     cname.vercel-dns.com
```

### SSL证书

Vercel自动提供免费的SSL证书（Let's Encrypt）：
- 自动续期
- 支持通配符证书
- 强制HTTPS重定向

---

## 监控和日志

### 1. Edge Function日志

#### 网页端查看

1. 在Supabase Dashboard中
2. 点击左侧菜单 **Edge Functions**
3. 点击某个函数
4. 点击 **Logs** 标签
5. 查看实时日志和历史日志

#### CLI查看（如果使用CLI）

```bash
# 实时查看日志
supabase functions logs --tail

# 查看特定函数的日志
supabase functions logs submit-prediction --tail

# 只查看错误日志
supabase functions logs submit-prediction --level error

# 查看历史日志
supabase functions logs submit-prediction --since 1h
```

### 2. 数据库监控

在Supabase Dashboard中监控：
- 数据库大小
- 连接数
- 查询性能
- 慢查询

### 3. Vercel Analytics（可选）

```typescript
// app/layout.tsx
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/next'

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  )
}
```

---

## 故障排查

### 问题1：CORS错误

**症状**：
```
Response to preflight request doesn't pass access control check
```

**原因**：Edge Functions未部署

**解决方案**：
- **网页端**：在Supabase Dashboard的Edge Functions页面部署函数
- **CLI**：`supabase functions deploy`

### 问题2：部署失败

**症状**：`Error deploying function`

**解决方案**：
- **网页端**：检查代码是否有语法错误，查看Dashboard中的错误信息
- **CLI**：
  1. 检查是否已登录：`supabase login`
  2. 检查项目链接：`supabase link --project-ref your-project-ref`
  3. 查看详细错误：`supabase functions deploy function-name --debug`

### 问题3：401未授权错误

**症状**：API返回`Unauthorized`

**解决方案**：
1. 确认使用了有效的access_token
2. 检查令牌是否过期
3. 确认用户已登录

### 问题4：环境变量未生效

**症状**：`API Key未配置`

**解决方案**：
- **网页端**：
  1. 在Settings → Edge Functions → Environment Variables中确认变量已设置
  2. 重新部署函数（删除后重新创建）
  3. 等待几分钟让配置生效
- **CLI**：
  1. 确认已设置环境变量：`supabase secrets list`
  2. 重新部署函数：`supabase functions deploy function-name`

### 问题5：数据库连接失败

**解决方案**：
1. 检查连接字符串是否正确
2. 验证数据库密码
3. 检查防火墙规则

### 问题6：函数超时

**解决方案**：
1. 优化函数代码，减少执行时间
2. 检查外部API调用是否响应缓慢
3. 考虑使用异步处理

---

## 部署检查清单

### 部署前检查

- [ ] 已安装Supabase CLI和Vercel CLI
- [ ] 已登录Supabase和Vercel账号
- [ ] 已获取项目ID和API Keys
- [ ] 已配置环境变量
- [ ] 代码已合并到main分支
- [ ] 所有测试通过

### 数据库部署

- [ ] 已连接到Supabase项目
- [ ] 已执行数据库迁移
- [ ] 已验证表和函数创建成功
- [ ] 已初始化必要的数据

### Edge Functions部署

- [ ] 已部署所有Edge Functions
- [ ] 已配置AI提供商（如需要）
- [ ] 已验证函数可以正常调用
- [ ] 已检查函数日志无错误

### 前端部署

- [ ] 已配置Vercel环境变量
- [ ] 已部署到Vercel
- [ ] 已配置自定义域名（如需要）
- [ ] SSL证书正常工作

### 部署后验证

- [ ] 网站可访问
- [ ] 登录功能正常
- [ ] API响应正常
- [ ] 数据库连接正常
- [ ] Edge Functions运行正常
- [ ] 监控数据正常

---

## 回滚计划

如果部署出现问题：

### 1. Vercel回滚

```bash
# 查看部署历史
vercel ls

# 回滚到上一个版本
vercel rollback
```

### 2. 数据库回滚

```bash
# 恢复备份
supabase db reset --db-url postgresql://...

# 或运行回滚迁移
supabase migration down
```

### 3. Edge Functions回滚

```bash
# 重新部署上一个版本
git checkout <previous-commit>
supabase functions deploy
```

---

## 安全建议

1. **保护API Keys**：不要将API Key提交到代码仓库
2. **使用环境变量**：所有敏感信息使用Supabase Secrets
3. **验证输入**：在Edge Functions中验证所有输入
4. **限制速率**：实现速率限制防止滥用
5. **监控异常**：定期检查异常调用模式
6. **更新依赖**：保持依赖库最新版本

---

## 性能优化

### 1. 数据库优化

```sql
-- 定期更新统计信息
ANALYZE;

-- 清理死元组
VACUUM ANALYZE;

-- 重建索引
REINDEX DATABASE postgres;
```

### 2. 缓存策略

```javascript
// next.config.js
module.exports = {
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, s-maxage=60, stale-while-revalidate=30',
          },
        ],
      },
    ]
  },
}
```

### 3. CDN配置

Vercel自动提供全球CDN，无需额外配置。

---

## 相关文档

- [Supabase文档](https://supabase.com/docs)
- [Vercel文档](https://vercel.com/docs)
- [Next.js文档](https://nextjs.org/docs)
- [AgentOracle开发文档](../AgentOracle开发文档.md)

---

## 联系支持

如需帮助：

- Vercel Support: https://vercel.com/support
- Supabase Support: https://supabase.com/support
- GitHub Issues: https://github.com/your-org/agent-oracle/issues

---

**最后更新**: 2026-02-20
