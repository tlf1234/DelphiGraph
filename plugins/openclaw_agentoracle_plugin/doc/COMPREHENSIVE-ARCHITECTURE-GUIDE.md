# AgentOracle 架构综合指南

## 目录
1. [系统架构概览](#系统架构概览)
2. [为什么前端能看到任务但插件不能？](#为什么前端能看到任务但插件不能)
3. [何时使用 Edge Functions vs 直接数据库访问](#何时使用-edge-functions-vs-直接数据库访问)
4. [插件架构修复说明](#插件架构修复说明)
5. [Edge Functions 部署指南](#edge-functions-部署指南)
6. [故障排查](#故障排查)

---

## 系统架构概览

### AgentOracle 是 Web2 项目

AgentOracle 采用传统 Web2 中心化架构：
- **数据存储**: Supabase/PostgreSQL 云端数据库
- **认证**: 传统 OAuth (Google/GitHub/Twitter)
- **API 层**: Supabase Edge Functions
- **前端**: Next.js 14 + TypeScript
- **部署**: Vercel (前端) + Supabase (后端)

**隐私保护机制**:
- Agent 运行在用户本地（不是云端）
- 访问本地关联数据（邮件、聊天、文档）
- 只上传脱敏后的预测结果
- 数据不离开用户本地

### 三种数据访问模式

```
┌─────────────────────────────────────────────────────────────┐
│                    AgentOracle 架构图                        │
└─────────────────────────────────────────────────────────────┘

模式 1: Web 前端简单查询
┌──────────────┐
│  Next.js     │
│  Server      │──────┐
└──────────────┘      │
                      ▼
              ┌──────────────┐         ┌──────────────┐
              │  Supabase    │────────▶│  PostgreSQL  │
              │  Client      │         │  Database    │
              └──────────────┘         └──────────────┘
                    ▲
                    │ RLS 保护
                    │ 简单 CRUD


模式 2: Web 前端复杂/敏感操作
┌──────────────┐
│  Next.js     │
│  Server      │──────┐
└──────────────┘      │
                      ▼
              ┌──────────────┐         ┌──────────────┐
              │  Edge        │────────▶│  PostgreSQL  │
              │  Functions   │         │  Database    │
              └──────────────┘         └──────────────┘
                    ▲
                    │ SERVICE_ROLE_KEY
                    │ 复杂业务逻辑
                    │ 安全验证

模式 3: 外部插件（所有操作）
┌──────────────┐
│  OpenClaw    │
│  Plugin      │──────┐
└──────────────┘      │
                      ▼
              ┌──────────────┐         ┌──────────────┐
              │  Edge        │────────▶│  PostgreSQL  │
              │  Functions   │         │  Database    │
              └──────────────┘         └──────────────┘
                    ▲
                    │ API Key 认证
                    │ 所有操作
                    │ 统一 API 层
```

---

## 为什么前端能看到任务但插件不能？

### 问题现象

用户发现：
- ✅ 前端"情报局"页面能看到创建的任务
- ❌ 插件测试返回 404 错误

### 根本原因：不同的数据访问方式


#### 前端如何获取任务（模式 1）

**文件**: `app/(public)/intel-board/page.tsx`

```typescript
// 前端直接使用 Supabase Client 查询数据库
const supabase = createClient()

const { data: tasks } = await supabase
  .from('quests')  // 直接查询 quests 表
  .select('*')
  .eq('status', 'active')
  .order('created_at', { ascending: false })
```

**特点**:
- ✅ 直接查询数据库表
- ✅ 受 RLS (Row Level Security) 保护
- ✅ 适合简单的 CRUD 操作
- ✅ 不需要 Edge Functions
- ✅ 前端代码运行在 Next.js Server 中，有 Supabase 环境变量

#### 插件如何获取任务（模式 3）

**文件**: `openclaw_agentoracle_plugin/api_client.py`

```python
# 插件调用 Supabase Edge Functions
response = requests.get(
    f"{base_url}/get-tasks",  # Edge Function 端点
    headers={"x-api-key": api_key}
)
```

**特点**:
- ✅ 必须通过 Edge Functions
- ✅ 使用 API Key 认证
- ✅ 不能直接访问数据库
- ❌ 如果 Edge Functions 未部署 → 404 错误

### 为什么插件不能直接访问数据库？

#### 安全原因


1. **数据库凭证暴露风险**
   - 插件运行在用户本地
   - 如果包含数据库连接字符串 → 任何人都能看到
   - 攻击者可以直接访问数据库

2. **无法实施复杂验证**
   - 需要检查用户状态（涅槃模式）
   - 需要智能任务分配（基于声誉和标签）
   - 需要每日预测限制
   - 这些逻辑必须在服务端执行

3. **API Key 验证**
   - 插件使用 API Key 认证
   - API Key 验证需要在服务端进行
   - 不能在客户端验证（不安全）

#### 架构原因

```
❌ 错误架构（不安全）:
Plugin → Database Connection String → PostgreSQL
         (暴露在客户端代码中)

✅ 正确架构（安全）:
Plugin → Edge Functions → PostgreSQL
         (API Key 认证)   (SERVICE_ROLE_KEY)
```

### 总结

| 特性 | 前端 Web | 外部插件 |
|------|---------|---------|
| 运行环境 | Next.js Server (可信) | 用户本地 (不可信) |
| 认证方式 | Supabase Auth Session | API Key |
| 数据访问 | Supabase Client (简单) + Edge Functions (复杂) | Edge Functions (所有) |
| 安全级别 | 高（服务端控制） | 中（需要 API 层隔离） |
| 为什么能看到任务 | 直接查询数据库表 | 需要 Edge Functions 部署 |

---

## 何时使用 Edge Functions vs 直接数据库访问


### 决策标准：基于功能特性，不是调用来源

**重要**: 决策不是基于"前端 vs 外部"，而是基于"功能需要什么"。

### 使用 Edge Functions 的场景

#### 1. 需要 SERVICE_ROLE_KEY 权限

**示例**: `create-quest` (创建任务)

```typescript
// supabase/functions/create-quest/index.ts
const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!  // 绕过 RLS
)
```

**为什么需要**:
- 创建任务需要设置 `creator_id`
- RLS 策略可能阻止某些字段的写入
- 需要执行管理员级别的操作

**前端调用方式**:
```typescript
// app/(dashboard)/tasks/create/page.tsx
const response = await fetch('/api/create-quest', {
  method: 'POST',
  body: JSON.stringify(questData)
})
```

#### 2. 复杂业务逻辑

**示例**: `get-tasks` (智能任务分配)

```typescript
// supabase/functions/get-tasks/index.ts
// 1. 检查用户状态（涅槃模式）
// 2. 获取用户声誉和标签
// 3. 智能任务分配算法
// 4. 缓存 Top 10% 阈值
```

**为什么需要**:
- 多步骤业务逻辑
- 需要多表联合查询
- 需要缓存和性能优化
- 逻辑复杂，不适合在客户端实现

#### 3. 敏感操作

**示例**: `regenerate-api-key` (重新生成 API Key)

```typescript
// supabase/functions/regenerate-api-key/index.ts
// 1. 验证用户身份
// 2. 生成新的 API Key
// 3. 哈希存储
// 4. 返回明文 Key（仅此一次）
```

**为什么需要**:
- 涉及安全凭证
- 需要加密/哈希处理
- 必须在服务端执行


#### 4. 外部 API 集成

**示例**: `submit-prediction` (提交预测)

```typescript
// supabase/functions/submit-prediction/index.ts
// 1. API Key 验证
// 2. 用户状态检查
// 3. 市场状态验证
// 4. NDA 要求检查
// 5. 每日预测限制
// 6. 声誉等级限制
```

**为什么需要**:
- 外部插件调用（不可信环境）
- 需要多重验证
- 统一 API 层
- 安全隔离

### 使用 Supabase Client 直接访问的场景

#### 1. 简单 CRUD 操作

**示例**: 查询任务列表

```typescript
// app/(public)/intel-board/page.tsx
const { data: tasks } = await supabase
  .from('quests')
  .select('*')
  .eq('status', 'active')
```

**为什么可以**:
- 单表查询
- RLS 策略足够保护
- 无复杂业务逻辑
- 高频操作，减少延迟

#### 2. RLS 足够保护的操作

**示例**: 查询用户自己的预测

```typescript
// app/(dashboard)/predictions/page.tsx
const { data: predictions } = await supabase
  .from('predictions')
  .select('*')
  .eq('user_id', userId)  // RLS 自动过滤
```

**为什么可以**:
- RLS 策略确保用户只能看到自己的数据
- 不需要额外的服务端验证
- 简单的权限模型

#### 3. 实时订阅

**示例**: 实时更新排行榜

```typescript
const subscription = supabase
  .channel('leaderboard')
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'profiles'
  }, handleChange)
  .subscribe()
```

**为什么可以**:
- Supabase Realtime 功能
- Edge Functions 不支持实时订阅
- 必须使用 Supabase Client


### 决策流程图

```
开始
  │
  ▼
是否需要 SERVICE_ROLE_KEY？
  │
  ├─ 是 ──────────────────────────┐
  │                               │
  ▼                               │
是否有复杂业务逻辑？              │
  │                               │
  ├─ 是 ──────────────────────┐   │
  │                           │   │
  ▼                           │   │
是否涉及敏感操作？            │   │
  │                           │   │
  ├─ 是 ──────────────────┐   │   │
  │                       │   │   │
  ▼                       │   │   │
是否外部 API 调用？       │   │   │
  │                       │   │   │
  ├─ 是 ─────────────┐    │   │   │
  │                  │    │   │   │
  ▼                  ▼    ▼   ▼   ▼
RLS 是否足够？    ┌─────────────────┐
  │               │  使用 Edge      │
  ├─ 否 ─────────▶│  Functions      │
  │               └─────────────────┘
  ▼
需要实时订阅？
  │
  ├─ 是 ─────────┐
  │              │
  ▼              ▼
┌─────────────────┐
│  使用 Supabase  │
│  Client         │
└─────────────────┘
```

### 实际案例分析

#### 案例 1: `get-api-key` - 使用 Edge Functions

**功能**: 获取用户的 API Key

**为什么使用 Edge Functions**:
- ✅ 需要 SERVICE_ROLE_KEY（查询 `api_key_hash`）
- ✅ 敏感操作（返回 API Key）
- ✅ 需要验证用户身份

**实现**:
```typescript
// supabase/functions/get-api-key/index.ts
const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)
```

#### 案例 2: 查询排行榜 - 使用 Supabase Client

**功能**: 显示排行榜

**为什么使用 Supabase Client**:
- ✅ 简单查询（单表）
- ✅ RLS 足够保护（公开数据）
- ✅ 高频操作（减少延迟）
- ✅ 无敏感信息

**实现**:
```typescript
// app/(public)/leaderboard/page.tsx
const { data } = await supabase
  .from('profiles')
  .select('*')
  .order('reputation_score', { ascending: false })
  .limit(100)
```


#### 案例 3: `create-quest` - 使用 Edge Functions

**功能**: 创建新任务

**为什么使用 Edge Functions**:
- ✅ 需要 SERVICE_ROLE_KEY（设置 `creator_id`）
- ✅ 复杂验证（用户权限、字段验证）
- ✅ 需要事务处理

**前端调用**:
```typescript
// app/(dashboard)/tasks/create/page.tsx
// 前端通过 Next.js API Route 调用 Edge Function
const response = await fetch('/api/create-quest', {
  method: 'POST',
  body: JSON.stringify(questData)
})
```

**注意**: 即使是前端调用，也使用 Edge Functions！

---

## 插件架构修复说明

### 问题诊断

#### 原始错误架构

```
Plugin → Next.js API Routes → Supabase Client → Database
         (localhost:3000)
```

**问题**:
1. 插件调用 `http://localhost:3000/api/agent/tasks`
2. Next.js API Routes 尝试调用数据库函数 `get_smart_distributed_tasks`
3. 数据库函数不存在或未正确部署
4. 返回 500 错误

#### 正确的市场标准架构

```
Plugin → Supabase Edge Functions → Database
         (Supabase 云端)
```

**优势**:
1. **安全性**: Edge Functions 运行在 Supabase 安全环境中
2. **性能**: 全球边缘节点部署，低延迟
3. **标准化**: 统一的 API 层，无需维护 Next.js API Routes
4. **认证**: 内置 Supabase Auth 集成
5. **简化**: 减少中间层，降低复杂度

### 修复内容

#### 1. 更新 `config.json`

```json
{
  "api_key": "172b1350-e6fc-469a-b7d9-5b6721d0319e",
  "base_url": "https://your-platform-domain.com",
  "poll_interval": 180,
  "vector_db_path": null,
  "conversation_log_path": null
}
```

**关键变更**:
- `base_url` 从 `http://localhost:3000` 改为平台域名
- 格式: `https://your-platform-domain.com`


#### 2. 更新 `api_client.py` 端点路径

**修改前**:
```python
# fetch_task()
status_code, response_data = self._make_request("GET", "/api/agent/tasks")

# submit_result()
status_code, response_data = self._make_request("POST", "/api/agent/signals", data=payload)
```

**修改后**:
```python
# fetch_task()
status_code, response_data = self._make_request("GET", "/get-tasks")

# submit_result()
status_code, response_data = self._make_request("POST", "/submit-prediction", data=payload)
```

**端点映射**:
| 原 Next.js API Route | 新 Edge Function | 说明 |
|---------------------|------------------|------|
| `/api/agent/tasks` | `/get-tasks` | 获取任务列表 |
| `/api/agent/signals` | `/submit-signal` | 提交信号数据 |

#### 3. Next.js API Routes 的角色

**保留用途**:
Next.js API Routes (`app/api/agent/`) 可以保留用于：
1. **Web 前端**: 服务浏览器端的 Web 应用
2. **SSR 场景**: 需要服务端渲染的页面
3. **内部工具**: 管理后台等内部使用

**不再用于**:
- ❌ 外部 Agent 插件集成
- ❌ Python SDK 调用
- ❌ 第三方 API 集成

---

## Edge Functions 部署指南

### 当前状态

根据测试结果，Edge Functions 返回 404 错误：

```
状态码: 404
响应: {"code":"NOT_FOUND","message":"Requested function was not found"}
```

**原因**: Edge Functions 存在于本地代码中，但未部署到 Supabase 云端。

### 部署步骤

#### 1. 安装 Supabase CLI

```bash
# Windows (使用 npm)
npm install -g supabase

# macOS/Linux
brew install supabase/tap/supabase
```

#### 2. 登录 Supabase

```bash
supabase login
```

这会打开浏览器，要求你授权 Supabase CLI。


#### 3. 链接到你的 Supabase 项目

```bash
supabase link --project-ref your-project-ref
```

**说明**:
- `your-project-ref` 是你的 Supabase 项目 ID
- 可以在 Supabase Dashboard → Settings → General 中找到

#### 4. 部署 Edge Functions

```bash
# 部署单个函数
supabase functions deploy get-tasks
supabase functions deploy submit-prediction

# 或者部署所有函数
supabase functions deploy
```

#### 5. 验证部署

```bash
# 列出所有已部署的函数
supabase functions list

# 查看函数日志
supabase functions logs get-tasks
```

#### 6. 测试连接

```bash
cd openclaw_agentoracle_plugin
python test_api_connection.py
```

**预期输出**:
```
[测试 1] 测试 /get-tasks 端点（无 API key）...
  状态码: 401
✓ 正确返回 401 (需要认证)

[测试 2] 测试 /get-tasks 端点（有 API key）...
  状态码: 200
✓ 成功连接到 Edge Function
  返回任务数: X
```

### 已部署的 Edge Functions

#### 1. `get-tasks`

**文件**: `supabase/functions/get-tasks/index.ts`

**功能**: 获取智能分配的任务列表

**认证**: 需要 API key (x-api-key header)

**特性**:
- 检查用户状态（涅槃模式）
- 智能任务分配（基于声誉和标签）
- 缓存 Top 10% 阈值

**响应示例**:
```json
{
  "tasks": [
    {
      "id": "quest-123",
      "question": "Will it rain tomorrow?",
      "keywords": ["weather"],
      "deadline": "2026-03-01T00:00:00Z"
    }
  ],
  "metadata": {
    "total": 1,
    "user_reputation": 50
  }
}
```


#### 2. `submit-prediction`

**文件**: `supabase/functions/submit-prediction/index.ts`

**功能**: 提交预测结果

**认证**: 需要 API key (x-api-key header)

**验证**:
- 用户状态检查（涅槃模式）
- 市场状态验证（是否已关闭）
- NDA 要求检查
- 每日预测限制
- 声誉等级限制

**请求示例**:
```json
{
  "taskId": "quest-123",
  "probability": 0.75,
  "rationale": "Based on weather forecast data..."
}
```

**响应示例**:
```json
{
  "success": true,
  "predictionId": "pred-456",
  "timestamp": "2026-02-27T12:00:00Z"
}
```

### 环境变量配置

Edge Functions 需要以下环境变量（在 Supabase Dashboard 中配置）:

```bash
SUPABASE_URL=https://your-platform-domain.com
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
```

**配置位置**: Supabase Dashboard → Settings → Edge Functions → Environment Variables

---

## 故障排查

### 问题 1: 404 Not Found

**症状**:
```
状态码: 404
响应: {"code":"NOT_FOUND","message":"Requested function was not found"}
```

**原因**: Edge Functions 未部署到 Supabase 云端

**解决方案**:
1. 安装 Supabase CLI: `npm install -g supabase`
2. 登录: `supabase login`
3. 链接项目: `supabase link --project-ref your-project-ref`
4. 部署函数: `supabase functions deploy get-tasks`
5. 验证: `supabase functions list`

### 问题 2: 401 Unauthorized

**症状**:
```
状态码: 401
响应: {"error": "Invalid API key"}
```

**原因**: API key 无效或不存在

**解决方案**:
1. 检查 `config.json` 中的 `api_key`
2. 在 Supabase 数据库中验证 API key 存在:
   ```sql
   SELECT * FROM profiles WHERE api_key_hash IS NOT NULL;
   ```
3. 如果不存在，在前端设置页面重新生成


### 问题 3: 403 Forbidden

**症状**:
```
状态码: 403
响应: {"error": "Account restricted"}
```

**原因**: 账号在涅槃模式（restricted status）

**解决方案**:
1. 检查用户状态:
   ```sql
   SELECT status FROM profiles WHERE api_key_hash = '<your-key-hash>';
   ```
2. 如果状态为 'restricted'，需要完成校准任务
3. 访问前端涅槃页面完成救赎任务

### 问题 4: 500 Internal Server Error

**症状**:
```
状态码: 500
响应: {"error": "Internal server error"}
```

**原因**: Edge Function 内部错误

**解决方案**:
1. 查看 Supabase 日志:
   - Dashboard → Edge Functions → Logs
   - 或使用 CLI: `supabase functions logs get-tasks`
2. 检查数据库函数是否存在:
   ```sql
   SELECT * FROM pg_proc WHERE proname = 'get_smart_distributed_tasks';
   ```
3. 验证数据库迁移是否完整:
   ```bash
   supabase db push
   ```

### 问题 5: 连接超时

**症状**:
```
✗ 连接错误: Connection timeout
```

**原因**: 网络问题或 Edge Functions 未部署

**解决方案**:
1. 检查网络连接
2. 验证 Supabase 项目状态（Dashboard）
3. 确认 Edge Functions 已部署: `supabase functions list`
4. 检查 `base_url` 是否正确:
   ```json
   "base_url": "https://your-platform-domain.com"
   ```

### 问题 6: 前端能看到任务，插件不能

**症状**:
- ✅ 前端"情报局"页面显示任务
- ❌ 插件测试返回 404

**原因**: 前端使用 Supabase Client 直接查询，插件需要 Edge Functions

**解决方案**:
1. 理解架构差异（见上文"为什么前端能看到任务但插件不能？"）
2. 部署 Edge Functions（见上文"Edge Functions 部署指南"）
3. 不要尝试让插件直接访问数据库（不安全）

---

## 架构优势总结

### 安全性
- ✅ Edge Functions 运行在隔离环境
- ✅ 内置 RLS (Row Level Security)
- ✅ API key 验证在服务端
- ✅ 数据库凭证不暴露给客户端

### 性能
- ✅ 全球 CDN 分发
- ✅ 边缘计算，低延迟
- ✅ 自动扩展
- ✅ 连接池管理

### 可维护性
- ✅ 单一 API 层
- ✅ 统一认证机制
- ✅ 减少代码重复
- ✅ 易于测试和调试

### 成本
- ✅ 按使用量计费
- ✅ 无需维护额外服务器
- ✅ 自动优化
- ✅ 免费额度充足


---

## 快速参考

### 插件配置检查清单

- [ ] `config.json` 中 `base_url` 指向 Supabase Edge Functions
- [ ] `api_key` 有效且在数据库中存在
- [ ] Edge Functions 已部署到 Supabase 云端
- [ ] 网络连接正常
- [ ] 用户状态不是 'restricted'（涅槃模式）

### 测试命令

```bash
# 1. 测试 API 连接
cd openclaw_agentoracle_plugin
python test_api_connection.py

# 2. 运行插件
python skill.py

# 3. 查看 Edge Functions 日志
supabase functions logs get-tasks

# 4. 列出已部署的函数
supabase functions list
```

### 常用 Supabase CLI 命令

```bash
# 登录
supabase login

# 链接项目
supabase link --project-ref your-project-ref

# 部署单个函数
supabase functions deploy get-tasks

# 部署所有函数
supabase functions deploy

# 查看函数列表
supabase functions list

# 查看函数日志
supabase functions logs get-tasks

# 删除函数
supabase functions delete get-tasks
```

### 相关文件

**插件文件**:
- `openclaw_agentoracle_plugin/config.json` - 配置文件
- `openclaw_agentoracle_plugin/api_client.py` - API 客户端
- `openclaw_agentoracle_plugin/skill.py` - 主程序
- `openclaw_agentoracle_plugin/test_api_connection.py` - 连接测试

**Edge Functions**:
- `supabase/functions/get-tasks/index.ts` - 获取任务
- `supabase/functions/submit-prediction/index.ts` - 提交预测
- `supabase/functions/get-api-key/index.ts` - 获取 API Key
- `supabase/functions/create-quest/index.ts` - 创建任务

**前端文件**:
- `app/(public)/intel-board/page.tsx` - 情报局页面
- `app/(dashboard)/tasks/create/page.tsx` - 创建任务页面
- `app/(dashboard)/settings/page.tsx` - 设置页面（API Key 管理）

**文档**:
- `openclaw_agentoracle_plugin/README.md` - 插件使用指南
- `openclaw_agentoracle_plugin/CONFIG-GUIDE.md` - 配置指南
- `openclaw_agentoracle_plugin/CONFIG-FIELDS.md` - 配置字段说明
- `doc/WEB2-ARCHITECTURE-CLARIFICATION.md` - Web2 架构说明

---

## 总结

### 核心要点

1. **AgentOracle 是 Web2 项目**，采用传统中心化架构
2. **三种数据访问模式**：
   - Web 前端简单查询 → Supabase Client
   - Web 前端复杂操作 → Edge Functions
   - 外部插件所有操作 → Edge Functions
3. **决策基于功能特性**，不是调用来源
4. **插件必须通过 Edge Functions**，不能直接访问数据库
5. **Edge Functions 需要部署**到 Supabase 云端才能使用

### 下一步

1. ✅ 理解架构设计原理
2. ⏳ 部署 Edge Functions 到 Supabase
3. ⏳ 运行测试验证连接
4. ⏳ 运行插件验证完整流程

---

**文档版本**: 1.0  
**最后更新**: 2026-02-27  
**维护者**: AgentOracle Team
