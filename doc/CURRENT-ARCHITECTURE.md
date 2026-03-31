# AgentOracle 当前架构说明

## 🏗️ 当前系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                     你的开发环境                              │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Next.js 应用 (localhost:3000)                        │   │
│  │                                                        │   │
│  │  - 前端页面 (React)                                    │   │
│  │  - API路由                                             │   │
│  │  - 中间件                                              │   │
│  └──────────────────────────────────────────────────────┘   │
│                          ↓                                    │
│                  读取 .env.local                              │
│                          ↓                                    │
│  NEXT_PUBLIC_SUPABASE_URL=                                   │
│  https://yrqxqvycuqfuumcliegl.supabase.co                   │
└─────────────────────────────────────────────────────────────┘
                          ↓
                    通过互联网连接
                          ↓
┌─────────────────────────────────────────────────────────────┐
│              Supabase 云端（线上/生产环境）                    │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  PostgreSQL 数据库                                     │   │
│  │                                                        │   │
│  │  - profiles 表                                         │   │
│  │  - markets 表                                          │   │
│  │  - predictions 表                                      │   │
│  │  - simulations 表                                      │   │
│  │  - ... 其他表                                          │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Edge Functions                                        │   │
│  │                                                        │   │
│  │  - get-api-key                                         │   │
│  │  - regenerate-api-key                                  │   │
│  │  - submit-prediction                                   │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Auth 服务                                             │   │
│  │  - Twitter OAuth                                       │   │
│  │  - 用户会话管理                                         │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## 🔄 数据流向

### 用户登录流程
```
用户点击登录
    ↓
Next.js 前端 (localhost:3000)
    ↓
Supabase Auth (线上)
    ↓
Twitter OAuth
    ↓
创建/更新用户 → PostgreSQL (线上)
    ↓
返回会话 → Next.js
    ↓
用户登录成功
```

### 预测提交流程
```
用户提交预测
    ↓
Next.js API (localhost:3000)
    ↓
验证 API Key
    ↓
Edge Function: submit-prediction (线上)
    ↓
存储到 predictions 表 (线上)
    ↓
返回成功响应
```

## 📊 环境对比

| 特性 | 线上Supabase（当前） | 本地Supabase |
|------|---------------------|-------------|
| **URL** | https://yrqxqvycuqfuumcliegl.supabase.co | http://localhost:54321 |
| **数据持久化** | ✅ 是 | ❌ 否（重启丢失） |
| **需要网络** | ✅ 是 | ❌ 否 |
| **团队共享** | ✅ 是 | ❌ 否 |
| **自动备份** | ✅ 是 | ❌ 否 |
| **使用限制** | ⚠️ 免费版有限制 | ✅ 无限制 |
| **安装要求** | ❌ 无 | ✅ 需要Docker |
| **适用场景** | 生产环境、团队协作 | 本地开发、测试 |

## 🎯 你的当前配置

### .env.local（开发环境）
```env
# 连接到线上Supabase
NEXT_PUBLIC_SUPABASE_URL=https://yrqxqvycuqfuumcliegl.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...（线上密钥）
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...（线上密钥）
```

### 生产环境（Vercel部署后）
```env
# 同样连接到线上Supabase
NEXT_PUBLIC_SUPABASE_URL=https://yrqxqvycuqfuumcliegl.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...（线上密钥）
```

**结论**：开发环境和生产环境使用**同一个数据库**

## ✅ 优点

1. **简单直接**：无需配置多个环境
2. **数据一致**：开发和生产数据同步
3. **团队协作**：所有人看到相同的数据
4. **无需Docker**：不需要本地安装Supabase

## ⚠️ 注意事项

1. **小心操作**：开发时的操作会直接影响生产数据
2. **使用迁移**：通过迁移文件管理数据库变更
3. **定期备份**：在Supabase Dashboard设置自动备份
4. **测试数据**：可以添加标记字段区分测试和真实数据

## 🔀 如果需要本地开发环境

### 配置本地Supabase

1. **安装Supabase CLI**：
```bash
npm install -g supabase
```

2. **启动本地Supabase**：
```bash
supabase start
```

3. **创建本地环境配置**：
```bash
# .env.local.development
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...（本地密钥）
```

4. **切换环境**：
```bash
# 使用本地
cp .env.local.development .env.local

# 使用线上
cp .env.local.production .env.local
```

## 📝 总结

**当前状态**：
- ✅ 你的项目**已经连接到线上Supabase**
- ✅ 这就是你的**生产环境**
- ✅ 开发和生产使用**同一个数据库**

**这意味着**：
- 你在 `localhost:3000` 开发时，所有数据库操作都在线上执行
- 部署到Vercel后，也使用相同的线上数据库
- 数据是持久化的，不会丢失

**下一步**：
- 执行数据库迁移（通过Supabase Dashboard）
- 继续开发MVP功能
- 考虑是否需要配置本地开发环境
