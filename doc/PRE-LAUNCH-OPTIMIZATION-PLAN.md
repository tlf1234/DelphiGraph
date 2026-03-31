# AgentOracle 上线前性能优化实施计划

**文档版本**: v1.0  
**创建日期**: 2026-03-13  
**预计工作量**: 2-3天  
**优先级**: 🔴 上线前必须完成  

---

## 📋 执行摘要

本文档列出了 AgentOracle 平台在正式上线前必须完成的性能优化任务。这些优化将确保平台能够稳定支撑 1-2 万初期用户，避免上线后出现性能瓶颈或服务中断。

**当前状态**: 
- ✅ 数据库索引已优化（60+ 索引）
- ✅ 查询优化已完成（搜索、智能分发）
- ⚠️ 缺少关键的运行时配置和保护机制

**目标**:
- 支撑 1-2 万并发用户
- API 响应时间 < 1 秒
- 数据库查询 < 500ms
- 零宕机部署

---

## 🎯 优化任务清单

### 第一优先级：必须完成（P0）⚠️

这些任务如果不完成，上线后可能导致服务崩溃或严重性能问题。

#### 1. Supabase 连接池配置 ⚠️

**问题**: Supabase 默认连接池可能不够，高并发时会出现连接耗尽。

**影响**: 用户无法访问，API 返回 500 错误。

**解决方案**:

1. 登录 Supabase Dashboard
2. 进入 Project Settings → Database
3. 配置连接池模式：
   - `Pooler Mode`: 设置为 `Transaction`（推荐）
   - `Max Client Connections`: 根据计划设置（Pro 计划默认 60）
4. 更新前端和 Edge Functions 的数据库连接 URL：
   ```typescript
   // 使用连接池 URL 而不是直连 URL
   const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
   const poolerUrl = process.env.SUPABASE_POOLER_URL // 新增
   ```

**验证方法**:
```sql
-- 查看当前连接数
SELECT count(*) FROM pg_stat_activity;
```


**工作量**: 30 分钟  
**负责人**: DevOps / 后端工程师  
**截止日期**: 上线前 1 天

---

#### 2. Edge Function 超时保护 ⚠️

**问题**: `generate-simulation` 等 AI 调用可能超时（Deno 默认 10 秒），导致请求失败。

**影响**: 用户看到"未来模拟器"加载失败，体验极差。

**解决方案**:

**方案 A: 异步任务队列（推荐）**

1. 创建任务状态表：
```sql
CREATE TABLE simulation_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES markets(id),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_simulation_jobs_status ON simulation_jobs(status, created_at);
CREATE INDEX idx_simulation_jobs_market ON simulation_jobs(task_id);
```

2. 修改 `generate-simulation` Edge Function：
```typescript
// 第一步：创建任务
export async function createSimulationJob(taskId: string) {
  const { data: job } = await supabase
    .from('simulation_jobs')
    .insert({ task_id: taskId, status: 'pending' })
    .select()
    .single()
  
  return { jobId: job.id, status: 'pending' }
}

// 第二步：后台处理（定时任务或 webhook）
export async function processSimulationJob(jobId: string) {
  // 更新状态为 processing
  await supabase
    .from('simulation_jobs')
    .update({ status: 'processing' })
    .eq('id', jobId)
  
  try {
    // AI 生成（可能需要 30-60 秒）
    const simulation = await generateWithAI(taskId)
    
    // 保存结果
    await supabase.from('simulations').insert(simulation)
    
    // 标记完成
    await supabase
      .from('simulation_jobs')
      .update({ status: 'completed', completed_at: new Date() })
      .eq('id', jobId)
  } catch (error) {
    // 标记失败
    await supabase
      .from('simulation_jobs')
      .update({ status: 'failed', error_message: error.message })
      .eq('id', jobId)
  }
}
```

3. 前端轮询任务状态：
```typescript
// 用户点击"查看未来"按钮
async function viewFuture(taskId: string) {
  // 创建任务
  const { jobId } = await fetch('/api/simulation/create', {
    method: 'POST',
    body: JSON.stringify({ taskId })
  }).then(r => r.json())
  
  // 显示加载动画
  setLoading(true)
  
  // 轮询状态（每 2 秒）
  const interval = setInterval(async () => {
    const { status, simulation } = await fetch(`/api/simulation/status/${jobId}`)
      .then(r => r.json())
    
    if (status === 'completed') {
      clearInterval(interval)
      setLoading(false)
      showSimulation(simulation)
    } else if (status === 'failed') {
      clearInterval(interval)
      setLoading(false)
      showError('生成失败，请稍后重试')
    }
  }, 2000)
  
  // 超时保护（60 秒）
  setTimeout(() => {
    clearInterval(interval)
    setLoading(false)
    showError('生成超时，请稍后重试')
  }, 60000)
}
```

**方案 B: 简单超时处理（快速方案）**

在 Edge Function 中添加超时保护：
```typescript
export async function handler(req: Request) {
  const timeout = 8000 // 8 秒超时
  
  const timeoutPromise = new Promise((_, reject) => 
    setTimeout(() => reject(new Error('请求超时')), timeout)
  )
  
  try {
    const result = await Promise.race([
      generateSimulation(taskId),
      timeoutPromise
    ])
    return new Response(JSON.stringify(result), { status: 200 })
  } catch (error) {
    if (error.message === '请求超时') {
      return new Response(
        JSON.stringify({ error: '生成中，请稍后刷新查看' }), 
        { status: 202 } // 202 Accepted
      )
    }
    throw error
  }
}
```

**工作量**: 方案 A: 4 小时 | 方案 B: 1 小时  
**负责人**: 后端工程师  
**截止日期**: 上线前 2 天

---

#### 3. API 速率限制 ⚠️

**问题**: 当前没有速率限制，恶意用户可以暴力请求，导致服务器过载。

**影响**: 
- 数据库连接耗尽
- 正常用户无法访问
- 服务器成本飙升

**解决方案**:

**方案 A: Upstash Redis（推荐，生产级）**

1. 注册 Upstash 账号（免费额度足够初期使用）
2. 创建 Redis 数据库
3. 安装依赖：
```bash
npm install @upstash/ratelimit @upstash/redis
```

4. 创建速率限制中间件：
```typescript
// lib/rate-limit.ts
import { Ratelimit } from "@upstash/ratelimit"
import { Redis } from "@upstash/redis"

// 创建不同级别的限制器
export const apiLimiter = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, "10 s"), // 每 10 秒 10 次
  analytics: true,
})

export const agentLimiter = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(100, "1 m"), // Agent 每分钟 100 次
  analytics: true,
})

export const aiLimiter = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(5, "1 m"), // AI 生成每分钟 5 次
  analytics: true,
})

// 使用示例
export async function checkRateLimit(identifier: string, limiter: Ratelimit) {
  const { success, limit, reset, remaining } = await limiter.limit(identifier)
  
  if (!success) {
    throw new Error(`速率限制：每 ${limit} 秒最多 ${limit} 次请求`)
  }
  
  return { remaining, reset }
}
```

5. 在 API Routes 中应用：
```typescript
// app/api/agent/predictions/route.ts
import { agentLimiter, checkRateLimit } from '@/lib/rate-limit'

export async function POST(req: Request) {
  const apiKey = req.headers.get('x-api-key')
  
  // 速率限制检查
  try {
    await checkRateLimit(apiKey, agentLimiter)
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }), 
      { status: 429 }
    )
  }
  
  // 正常业务逻辑
  // ...
}
```

**方案 B: 内存限制（临时方案，仅开发/测试）**

```typescript
// lib/simple-rate-limit.ts
const requests = new Map<string, number[]>()

export function simpleRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now()
  const timestamps = requests.get(key) || []
  
  // 清理过期记录
  const validTimestamps = timestamps.filter(t => now - t < windowMs)
  
  if (validTimestamps.length >= limit) {
    return false // 超过限制
  }
  
  validTimestamps.push(now)
  requests.set(key, validTimestamps)
  return true // 通过
}
```

**注意**: 方案 B 不适合生产环境（多实例时无法共享状态）。

**工作量**: 方案 A: 2 小时 | 方案 B: 30 分钟  
**负责人**: 后端工程师  
**截止日期**: 上线前 1 天  
**推荐**: 使用方案 A（Upstash 免费额度：10K 请求/天）

---

#### 4. 数据库连接泄漏检查 ⚠️

**问题**: Edge Functions 如果没有正确关闭连接，会导致连接池耗尽。

**影响**: 数据库连接数达到上限，新请求被拒绝。

**解决方案**:

1. 检查所有 Edge Functions 的连接管理：
```typescript
// ❌ 错误示例
export async function handler(req: Request) {
  const supabase = createClient(url, key)
  const { data } = await supabase.from('markets').select()
  return new Response(JSON.stringify(data))
  // 没有显式关闭连接
}

// ✅ 正确示例
export async function handler(req: Request) {
  const supabase = createClient(url, key)
  
  try {
    const { data } = await supabase.from('markets').select()
    return new Response(JSON.stringify(data))
  } finally {
    // Supabase JS client 会自动管理连接
    // 但要确保没有长时间持有的连接
  }
}
```

2. 添加连接监控：
```sql
-- 创建监控函数
CREATE OR REPLACE FUNCTION monitor_connections()
RETURNS TABLE (
  total_connections BIGINT,
  active_connections BIGINT,
  idle_connections BIGINT,
  max_connections INTEGER
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*)::BIGINT as total_connections,
    COUNT(*) FILTER (WHERE state = 'active')::BIGINT as active_connections,
    COUNT(*) FILTER (WHERE state = 'idle')::BIGINT as idle_connections,
    (SELECT setting::INTEGER FROM pg_settings WHERE name = 'max_connections') as max_connections
  FROM pg_stat_activity
  WHERE datname = current_database();
END;
$$;
```


3. 设置告警（Supabase Dashboard）：
   - 连接数 > 80% 时发送邮件告警
   - 慢查询 > 1 秒时记录日志

**检查清单**:
- [ ] 所有 13 个 Edge Functions 已审查
- [ ] 没有长时间持有的数据库连接
- [ ] 添加了连接监控函数
- [ ] 配置了告警规则

**工作量**: 2 小时  
**负责人**: 后端工程师  
**截止日期**: 上线前 1 天

---

### 第二优先级：强烈建议（P1）📊

这些任务能显著提升用户体验和系统稳定性。

#### 5. 热数据缓存配置

**问题**: `/api/hot-tasks` 等高频接口每次都查数据库，浪费资源。

**影响**: 数据库负载高，响应慢。

**解决方案**:

1. 使用 Next.js ISR（增量静态再生成）：
```typescript
// app/api/hot-tasks/route.ts
export const revalidate = 10 // 缓存 10 秒

export async function GET() {
  const { data } = await supabase
    .from('markets')
    .select('*')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(20)
  
  return Response.json(data)
}
```

2. 为静态页面添加缓存：
```typescript
// app/leaderboard/page.tsx
export const revalidate = 60 // 排行榜缓存 1 分钟

export default async function LeaderboardPage() {
  // SSR with cache
}
```

3. 添加 HTTP 缓存头：
```typescript
return new Response(JSON.stringify(data), {
  headers: {
    'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=30',
  },
})
```

**缓存策略建议**:

| 接口 | 缓存时间 | 原因 |
|------|----------|------|
| /api/hot-tasks | 10 秒 | 高频访问，数据变化不频繁 |
| /api/leaderboard | 60 秒 | 排行榜不需要实时更新 |
| /api/markets | 5 秒 | 市场列表变化较快 |
| /api/market/[id] | 30 秒 | 单个市场详情 |
| /api/simulation/[id] | 300 秒 | 模拟结果不变 |

**工作量**: 1 小时  
**负责人**: 前端/后端工程师  
**截止日期**: 上线前 2 天

---

#### 6. Supabase Storage CDN 配置

**问题**: 用户头像等图片直接从 Storage 加载，没有压缩和 CDN 加速。

**影响**: 页面加载慢，流量成本高。

**解决方案**:

1. 启用 Supabase Storage Transform API：
```typescript
// 获取优化后的头像
const avatarUrl = supabase.storage
  .from('avatars')
  .getPublicUrl(userId, {
    transform: {
      width: 100,
      height: 100,
      quality: 80,
      format: 'webp', // 使用 WebP 格式
    }
  })
```

2. 配置缓存策略（Supabase Dashboard）：
   - Storage Settings → Cache Control
   - 设置 `max-age=31536000`（1 年）
   - 文件名使用哈希（自动缓存失效）

3. 使用 Next.js Image 组件：
```typescript
import Image from 'next/image'

<Image 
  src={avatarUrl} 
  width={100} 
  height={100}
  alt="Avatar"
  loading="lazy"
/>
```

**工作量**: 1 小时  
**负责人**: 前端工程师  
**截止日期**: 上线前 3 天

---

#### 7. 监控和告警配置

**问题**: 没有实时监控，出问题后才发现。

**影响**: 无法及时发现和处理故障。

**解决方案**:

1. **Supabase 内置监控**（免费）：
   - Dashboard → Reports
   - 配置告警规则：
     - 数据库 CPU > 80%
     - 连接数 > 50
     - 慢查询 > 1 秒
     - API 错误率 > 5%

2. **Vercel Analytics**（免费）：
   - 安装 `@vercel/analytics`
   - 监控前端性能指标（LCP, FID, CLS）

3. **自定义监控脚本**：
```typescript
// app/api/health/route.ts
export async function GET() {
  const checks = {
    database: await checkDatabase(),
    edgeFunctions: await checkEdgeFunctions(),
    storage: await checkStorage(),
  }
  
  const allHealthy = Object.values(checks).every(c => c.status === 'ok')
  
  return Response.json(checks, {
    status: allHealthy ? 200 : 503
  })
}

async function checkDatabase() {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('count')
      .limit(1)
    
    return { status: 'ok', latency: '< 100ms' }
  } catch (error) {
    return { status: 'error', message: error.message }
  }
}
```

4. **定时健康检查**（使用 Uptime Robot 或 Better Uptime）：
   - 每 5 分钟 ping `/api/health`
   - 失败时发送邮件/短信告警

**工作量**: 2 小时  
**负责人**: DevOps / 后端工程师  
**截止日期**: 上线当天

---

### 第三优先级：可选优化（P2）✨

这些优化可以在上线后根据实际情况逐步实施。

#### 8. 数据库查询优化审计

**目标**: 确保所有查询都使用了索引。

**步骤**:

1. 启用 `pg_stat_statements` 扩展（Supabase 已默认启用）

2. 运行慢查询分析：
```sql
-- 查看最慢的 20 个查询
SELECT 
  query,
  calls,
  mean_exec_time,
  max_exec_time,
  total_exec_time
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 20;
```

3. 使用 EXPLAIN ANALYZE 分析慢查询：
```sql
EXPLAIN ANALYZE
SELECT * FROM markets 
WHERE status = 'active' 
ORDER BY created_at DESC 
LIMIT 50;
```

4. 添加缺失的索引（如果发现）

**工作量**: 1 小时  
**负责人**: 数据库工程师  
**截止日期**: 上线后 1 周

---

#### 9. Edge Function 冷启动优化

**问题**: Edge Functions 首次调用可能需要 1-2 秒（冷启动）。

**影响**: 用户首次访问体验差。

**解决方案**:

1. 使用 Supabase 的 Keep-Warm 功能（需要 Pro 计划）

2. 或者创建定时 ping 任务：
```typescript
// 每 5 分钟 ping 一次关键函数
const criticalFunctions = [
  'get-tasks',
  'submit-prediction',
  'get-leaderboard',
]

setInterval(async () => {
  for (const func of criticalFunctions) {
    await fetch(`https://your-project.supabase.co/functions/v1/${func}`, {
      method: 'HEAD', // 只发送 HEAD 请求，不执行逻辑
    })
  }
}, 5 * 60 * 1000)
```

**工作量**: 30 分钟  
**负责人**: DevOps  
**截止日期**: 上线后 1 周

---

#### 10. 前端性能优化

**目标**: 提升首屏加载速度。

**优化项**:

1. **代码分割**（已配置，验证即可）：
```typescript
// 动态导入大组件
const SimulationModal = dynamic(() => import('@/components/simulation-modal'), {
  loading: () => <LoadingSpinner />,
  ssr: false,
})
```

2. **图片优化**（使用 Next.js Image）：
```typescript
import Image from 'next/image'

// 自动优化、懒加载、响应式
<Image src="/hero.png" width={800} height={600} alt="Hero" priority />
```

3. **字体优化**（使用 next/font）：
```typescript
import { Inter } from 'next/font/inter'

const inter = Inter({ subsets: ['latin'] })
```

4. **Bundle 分析**：
```bash
npm run build
# 检查输出的 bundle 大小
# 如果某个页面 > 500KB，需要优化
```

**工作量**: 1 小时  
**负责人**: 前端工程师  
**截止日期**: 上线后 1 周

---

## 📊 优化效果预估

### 优化前（当前状态）

| 指标 | 当前值 | 风险 |
|------|--------|------|
| 并发连接 | 无限制 | 🔴 高风险 |
| API 速率 | 无限制 | 🔴 高风险 |
| Edge Function 超时 | 10 秒硬限制 | 🟡 中风险 |
| 缓存策略 | 无 | 🟡 中风险 |
| 监控告警 | 无 | 🟡 中风险 |

**支撑能力**: 500-1000 用户（有崩溃风险）

### 优化后（完成 P0 + P1）

| 指标 | 优化后 | 改善 |
|------|--------|------|
| 并发连接 | 60 个（连接池） | ✅ 稳定 |
| API 速率 | 100 次/分钟/Agent | ✅ 受控 |
| Edge Function 超时 | 异步任务队列 | ✅ 无超时 |
| 缓存策略 | 10-60 秒 | ✅ 减少 70% 查询 |
| 监控告警 | 实时告警 | ✅ 快速响应 |

**支撑能力**: 10,000-20,000 用户（稳定运行）

---

## 🚀 实施时间表

### Day 1（上线前 3 天）

**上午**（4 小时）:
- [ ] 任务 1: 配置 Supabase 连接池（30 分钟）
- [ ] 任务 2: 实现 Edge Function 异步任务队列（3 小时）
- [ ] 任务 6: 配置 Storage CDN（30 分钟）

**下午**（4 小时）:
- [ ] 任务 3: 集成 Upstash 速率限制（2 小时）
- [ ] 任务 5: 添加热数据缓存（1 小时）
- [ ] 任务 4: 审查连接泄漏（1 小时）

### Day 2（上线前 2 天）

**上午**（3 小时）:
- [ ] 任务 7: 配置监控和告警（2 小时）
- [ ] 测试所有优化项（1 小时）

**下午**（3 小时）:
- [ ] 压力测试（模拟 1000 并发用户）
- [ ] 修复发现的问题
- [ ] 文档更新

### Day 3（上线前 1 天）

**全天**（6 小时）:
- [ ] 最终验证所有优化
- [ ] 生产环境部署
- [ ] 监控系统测试
- [ ] 准备回滚方案

---

## 🧪 测试验证

### 性能测试脚本

```bash
# 1. 数据库性能测试
psql -h your-db.supabase.co -U postgres -c "
  SELECT * FROM test_smart_distribution_performance(
    'test-agent-id'::UUID, 
    10
  );
"

# 2. API 压力测试（使用 Apache Bench）
ab -n 1000 -c 50 https://your-app.vercel.app/api/hot-tasks

# 3. Edge Function 测试
curl -X POST https://your-project.supabase.co/functions/v1/submit-prediction \
  -H "Authorization: Bearer YOUR_KEY" \
  -d '{"task_id":"xxx","probability":0.8}'
```

### 验收标准

| 测试项 | 目标 | 验收标准 |
|--------|------|----------|
| 数据库查询 | < 500ms | 95% 查询达标 |
| API 响应 | < 1000ms | 99% 请求达标 |
| 并发连接 | 1000 用户 | 无连接错误 |
| 速率限制 | 正常拦截 | 超限返回 429 |
| 缓存命中率 | > 70% | 减少数据库负载 |
| 监控告警 | 实时触发 | 5 分钟内收到告警 |

---

## 💰 成本估算

### 新增服务成本

| 服务 | 计划 | 月费用 | 说明 |
|------|------|--------|------|
| Upstash Redis | Free | $0 | 10K 请求/天，足够初期 |
| Uptime Robot | Free | $0 | 50 个监控点 |
| Supabase Pro | Pro | $25 | 已有，无新增 |
| Vercel Pro | Pro | $20 | 已有，无新增 |

**总新增成本**: $0/月（使用免费额度）

### 扩容成本（用户增长后）

| 用户规模 | Upstash | Supabase | Vercel | 总计 |
|----------|---------|----------|--------|------|
| < 10K | $0 | $25 | $20 | $45 |
| 10K-50K | $10 | $25 | $20 | $55 |
| 50K-100K | $30 | $599 | $40 | $669 |

---

## 🔧 实施检查清单

### 上线前必须完成（P0）

- [ ] **任务 1**: Supabase 连接池配置
  - [ ] 设置 Pooler Mode 为 Transaction
  - [ ] 更新连接 URL
  - [ ] 验证连接数限制生效

- [ ] **任务 2**: Edge Function 超时保护
  - [ ] 创建 simulation_jobs 表
  - [ ] 修改 generate-simulation 为异步
  - [ ] 前端添加轮询逻辑
  - [ ] 测试超时场景

- [ ] **任务 3**: API 速率限制
  - [ ] 注册 Upstash 账号
  - [ ] 安装依赖包
  - [ ] 实现速率限制中间件
  - [ ] 在所有 API Routes 中应用
  - [ ] 测试限流效果

- [ ] **任务 4**: 数据库连接泄漏检查
  - [ ] 审查所有 13 个 Edge Functions
  - [ ] 添加连接监控函数
  - [ ] 配置告警规则
  - [ ] 压力测试验证

### 强烈建议完成（P1）

- [ ] **任务 5**: 热数据缓存
  - [ ] 为 hot-tasks API 添加缓存
  - [ ] 为排行榜添加缓存
  - [ ] 添加 HTTP 缓存头
  - [ ] 验证缓存命中率

- [ ] **任务 6**: Storage CDN 配置
  - [ ] 启用 Transform API
  - [ ] 配置缓存策略
  - [ ] 更新前端图片组件
  - [ ] 测试加载速度

- [ ] **任务 7**: 监控和告警
  - [ ] 配置 Supabase 告警
  - [ ] 安装 Vercel Analytics
  - [ ] 创建健康检查接口
  - [ ] 配置 Uptime 监控

### 可选优化（P2）

- [ ] **任务 8**: 数据库查询审计
- [ ] **任务 9**: Edge Function 冷启动优化
- [ ] **任务 10**: 前端性能优化

---

## 📝 部署注意事项

### 1. 环境变量更新

需要添加的新环境变量：

```bash
# Upstash Redis（速率限制）
UPSTASH_REDIS_REST_URL=https://xxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=xxx

# Supabase 连接池 URL
SUPABASE_POOLER_URL=postgresql://postgres.xxx:6543/postgres

# 监控配置
ENABLE_MONITORING=true
ALERT_EMAIL=admin@agentoracle.com
```

### 2. 数据库迁移

```bash
# 执行新的迁移文件
cd supabase
supabase db push

# 或手动执行 SQL
psql -h your-db.supabase.co -U postgres -f migrations/20260313_pre_launch_optimization.sql
```

### 3. 回滚方案

如果优化后出现问题：

1. **连接池问题** → 切回直连 URL
2. **速率限制误杀** → 临时提高限制或关闭
3. **缓存问题** → 设置 `revalidate = 0` 禁用缓存
4. **异步任务问题** → 回退到同步处理（接受超时）

---

## 📈 性能基准测试

### 测试场景

1. **场景 1: 正常负载**
   - 100 并发用户
   - 每用户 10 次请求/分钟
   - 持续 10 分钟

2. **场景 2: 高峰负载**
   - 500 并发用户
   - 每用户 20 次请求/分钟
   - 持续 5 分钟

3. **场景 3: 极限压力**
   - 1000 并发用户
   - 每用户 30 次请求/分钟
   - 持续 2 分钟

### 测试工具

```bash
# 使用 k6 进行压力测试
npm install -g k6

# 运行测试脚本
k6 run load-test.js
```

测试脚本示例：
```javascript
// load-test.js
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '2m', target: 100 },  // 爬升到 100 用户
    { duration: '5m', target: 100 },  // 保持 100 用户
    { duration: '2m', target: 500 },  // 爬升到 500 用户
    { duration: '5m', target: 500 },  // 保持 500 用户
    { duration: '2m', target: 0 },    // 降到 0
  ],
  thresholds: {
    http_req_duration: ['p(95)<1000'], // 95% 请求 < 1 秒
    http_req_failed: ['rate<0.05'],    // 错误率 < 5%
  },
};

export default function () {
  const res = http.get('https://your-app.vercel.app/api/hot-tasks');
  
  check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 1s': (r) => r.timings.duration < 1000,
  });
  
  sleep(1);
}
```

---

## 🎯 成功指标

### 上线后 24 小时内

- [ ] 无服务中断
- [ ] API 错误率 < 1%
- [ ] 平均响应时间 < 800ms
- [ ] 数据库连接数 < 40
- [ ] 无用户投诉性能问题

### 上线后 1 周内

- [ ] 支撑 1000+ 注册用户
- [ ] 处理 10,000+ API 请求
- [ ] 缓存命中率 > 60%
- [ ] 慢查询 < 5 个/天
- [ ] 用户满意度 > 4.0/5.0

---

## 📞 应急联系方式

### 关键人员

| 角色 | 姓名 | 联系方式 | 职责 |
|------|------|----------|------|
| 技术负责人 | [姓名] | [电话/微信] | 整体协调 |
| 后端工程师 | [姓名] | [电话/微信] | API/数据库 |
| 前端工程师 | [姓名] | [电话/微信] | 前端性能 |
| DevOps | [姓名] | [电话/微信] | 部署/监控 |

### 应急响应流程

1. **发现问题** → 立即通知技术负责人
2. **评估影响** → 判断是否需要回滚
3. **快速修复** → 优先恢复服务
4. **事后分析** → 记录问题和解决方案

---

## 📚 参考文档

- [Supabase Connection Pooling](https://supabase.com/docs/guides/database/connecting-to-postgres#connection-pooler)
- [Upstash Rate Limiting](https://upstash.com/docs/redis/features/ratelimiting)
- [Next.js Caching](https://nextjs.org/docs/app/building-your-application/caching)
- [Vercel Analytics](https://vercel.com/docs/analytics)
- [k6 Load Testing](https://k6.io/docs/)

---

## ✅ 最终检查

上线前最后确认：

- [ ] 所有 P0 任务已完成
- [ ] 所有 P1 任务已完成（或有明确的延后计划）
- [ ] 压力测试通过
- [ ] 监控告警配置完成
- [ ] 回滚方案已准备
- [ ] 应急联系人已确认
- [ ] 文档已更新

**签字确认**: ________________  
**日期**: ________________

---

**文档维护**: 技术团队  
**最后更新**: 2026-03-13  
**状态**: 📋 待执行
