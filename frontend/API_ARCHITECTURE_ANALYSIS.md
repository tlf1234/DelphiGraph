# 前端 API 架构分析与重构方案

## 🔍 当前架构问题

### 问题1：数据访问混乱

**三种不同的数据访问方式并存：**

1. **组件直接调用 Supabase Edge Functions**
   ```typescript
   // ❌ 不规范：组件直接调用
   fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/database/create-quest`)
   ```
   - `market-creation-form.tsx`
   - `purgatory-view.tsx`
   - `earnings-view.tsx`
   - `market-detail-with-nda.tsx`

2. **组件直接调用 Supabase Client**
   ```typescript
   // ❌ 不规范：组件直接操作数据库
   const supabase = createClient()
   supabase.from('markets').select('*')
   ```
   - `market-detail-client.tsx`
   - `settings` 组件
   - `auth` 组件

3. **通过 Next.js API Routes（少数）**
   ```typescript
   // ✅ 规范：通过 API 层
   fetch('/api/hot-tasks')
   ```
   - `hot-tasks`
   - `search-predictions`
   - `delete-account`

### 问题2：职责不清

- **组件层**：既负责 UI 又负责数据获取
- **API 层**：只有少数几个端点，不完整
- **Edge Functions**：被前端直接调用，缺少中间层

### 问题3：安全隐患

- 前端直接暴露 Supabase URL 和 API Key
- 没有统一的错误处理
- 缺少请求拦截和日志

## ✅ 推荐架构

### 标准的三层架构

```
┌─────────────────────────────────────────┐
│         Components (UI Layer)           │
│  - 只负责 UI 渲染和用户交互              │
│  - 通过 API 层获取数据                   │
└─────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│      Next.js API Routes (API Layer)     │
│  - /api/searchs/create                  │
│  - /api/searchs/[id]                    │
│  - /api/profile                         │
│  - 统一的错误处理和日志                  │
└─────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│    Supabase Edge Functions (Backend)    │
│  - /functions/v1/database/create-quest  │
│  - /functions/v1/database/get-profile   │
│  - 业务逻辑和数据库操作                  │
└─────────────────────────────────────────┘
```

## 🎯 重构方案

### 方案 A：完整 API 层（推荐）

**优点：**
- 架构清晰，职责分明
- 安全性高，隐藏后端细节
- 便于添加中间件（认证、日志、缓存）
- 便于切换后端（从 Supabase 迁移到其他服务）

**缺点：**
- 需要创建大量 API Routes
- 增加一层网络请求（轻微性能损失）

**实施：**
```
frontend/src/app/api/
├── searchs/
│   ├── route.ts              # GET /api/searchs - 列表
│   ├── [id]/route.ts         # GET /api/searchs/[id] - 详情
│   └── create/route.ts       # POST /api/searchs/create
├── profile/
│   ├── route.ts              # GET /api/profile
│   └── [userId]/route.ts     # GET /api/profile/[userId]
├── earnings/route.ts         # GET /api/earnings
├── predictions/
│   ├── route.ts              # GET /api/predictions
│   └── submit/route.ts       # POST /api/predictions/submit
├── purgatory/
│   ├── tasks/route.ts        # GET /api/purgatory/tasks
│   └── submit/route.ts       # POST /api/purgatory/submit
└── nda/
    └── sign/route.ts         # POST /api/nda/sign
```

### 方案 B：混合架构（折中）

**保留部分直接调用，关键功能走 API 层**

**直接调用 Supabase（允许）：**
- 认证相关（login, logout）
- 实时订阅（realtime）
- 文件上传（storage）

**通过 API 层（必须）：**
- 创建任务
- 提交预测
- 敏感操作（删除账户、签署 NDA）

## 📋 重构步骤

### 第一阶段：创建 API 层（核心功能）

1. **创建搜索相关 API**
   - `POST /api/searchs/create` - 创建搜索任务
   - `GET /api/searchs/[id]` - 获取搜索详情

2. **创建用户相关 API**
   - `GET /api/profile` - 获取当前用户档案
   - `GET /api/profile/[userId]` - 获取公开档案
   - `GET /api/earnings` - 获取收益历史

3. **创建预测相关 API**
   - `POST /api/predictions/submit` - 提交预测
   - `GET /api/predictions` - 获取我的预测

4. **创建炼狱模式 API**
   - `GET /api/purgatory/tasks` - 获取校准任务
   - `POST /api/purgatory/submit` - 提交校准答案

### 第二阶段：更新组件调用

将所有组件中的直接调用改为 API 调用：

```typescript
// ❌ 之前：直接调用
const response = await fetch(
  `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/database/create-quest`,
  { ... }
)

// ✅ 之后：通过 API 层
const response = await fetch('/api/searchs/create', {
  method: 'POST',
  body: JSON.stringify(data)
})
```

### 第三阶段：添加统一的错误处理

创建 API 工具函数：

```typescript
// lib/api-client.ts
export async function apiRequest(url: string, options?: RequestInit) {
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    })
    
    if (!response.ok) {
      throw new Error(`API Error: ${response.status}`)
    }
    
    return await response.json()
  } catch (error) {
    console.error('API Request failed:', error)
    throw error
  }
}
```

## 🚀 实施建议

### 立即执行（高优先级）
1. 创建核心 API Routes（searchs, profile, predictions）
2. 更新关键组件（market-creation-form, purgatory-view）
3. 添加统一的 API 客户端工具

### 后续优化（中优先级）
1. 添加请求缓存
2. 添加请求日志
3. 添加 API 限流

### 长期规划（低优先级）
1. 考虑使用 tRPC 或 GraphQL
2. 添加 API 文档（Swagger）
3. 性能监控和优化

## 📊 对比表

| 方面 | 当前架构 | 重构后架构 |
|------|---------|-----------|
| 安全性 | ⚠️ 低 | ✅ 高 |
| 可维护性 | ❌ 差 | ✅ 好 |
| 可测试性 | ❌ 差 | ✅ 好 |
| 性能 | ✅ 好 | ⚠️ 略低 |
| 扩展性 | ❌ 差 | ✅ 好 |

## 💡 我的建议

**推荐采用方案 A（完整 API 层）**，理由：
1. 架构更规范，符合行业最佳实践
2. 便于团队协作和代码维护
3. 安全性更高
4. 便于未来迁移和扩展

你觉得这个方案怎么样？我可以开始实施重构。
