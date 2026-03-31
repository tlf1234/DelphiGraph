# AgentOracle API优化指南

本文档提供API响应时间优化的最佳实践和实现示例。

## 目录

1. [缓存策略](#缓存策略)
2. [性能监控](#性能监控)
3. [数据库优化](#数据库优化)
4. [响应优化](#响应优化)

---

## 缓存策略

### 1. 内存缓存

使用`_shared/cache.ts`工具实现内存缓存：

```typescript
import { cache, withCache, generateCacheKey } from '../_shared/cache.ts'

// 示例：缓存市场列表
async function getMarkets(status: string) {
  const cacheKey = generateCacheKey('markets', { status })
  
  return withCache(
    async () => {
      const { data } = await supabase
        .from('markets')
        .select('*')
        .eq('status', status)
      return data
    },
    cacheKey,
    60  // 缓存60秒
  )
}
```

### 2. HTTP缓存头

使用`createCachedResponse`设置适当的缓存头：

```typescript
import { createCachedResponse } from '../_shared/cache.ts'

// 公开数据：长时间缓存
return createCachedResponse(markets, {
  maxAge: 60,        // 浏览器缓存60秒
  sMaxAge: 300,      // CDN缓存5分钟
  staleWhileRevalidate: 60,  // 过期后60秒内仍可使用
  corsHeaders,
})

// 用户特定数据：不缓存
return createCachedResponse(userProfile, {
  maxAge: 0,         // 不缓存
  sMaxAge: 0,
  corsHeaders,
})
```

### 3. 条件缓存

仅在满足条件时缓存：

```typescript
import { conditionalCache } from '../_shared/cache.ts'

const markets = await fetchMarkets()

// 仅缓存活跃市场
conditionalCache(
  markets,
  'active-markets',
  (data) => data.every(m => m.status === 'active'),
  120
)
```

### 4. 缓存失效

```typescript
import { cache } from '../_shared/cache.ts'

// 市场状态更新后清除缓存
async function updateMarketStatus(taskId: string, status: string) {
  await supabase
    .from('markets')
    .update({ status })
    .eq('id', taskId)
  
  // 清除相关缓存
  cache.delete(`market:${taskId}`)
  cache.delete('markets:status=active')
  cache.delete('markets:status=closed')
}
```

---

## 性能监控

### 1. 基本性能监控

```typescript
import { PerformanceTimer, withPerformanceMonitoring } from '../_shared/performance.ts'

serve(async (req: Request) => {
  const timer = new PerformanceTimer()
  
  try {
    // 验证用户
    timer.mark('auth_start')
    const user = await authenticateUser(req)
    timer.mark('auth_end')
    
    // 查询数据
    timer.mark('query_start')
    const data = await fetchData()
    timer.mark('query_end')
    
    // 处理数据
    timer.mark('process_start')
    const result = processData(data)
    timer.mark('process_end')
    
    // 记录性能日志
    timer.log('my-function')
    
    return new Response(JSON.stringify(result))
  } catch (error) {
    timer.log('my-function')
    throw error
  }
})
```

### 2. 数据库查询监控

```typescript
import { monitorQuery } from '../_shared/performance.ts'

// 自动记录查询时间
const markets = await monitorQuery(
  'fetch-active-markets',
  async () => {
    const { data } = await supabase
      .from('markets')
      .select('*')
      .eq('status', 'active')
    return data
  }
)
```

### 3. 批量操作监控

```typescript
import { BatchMonitor } from '../_shared/performance.ts'

async function resolveMarket(taskId: string) {
  const batch = new BatchMonitor()
  
  // 跟踪每个操作
  const market = await batch.track('fetch-market', () => 
    fetchMarket(taskId)
  )
  
  const predictions = await batch.track('fetch-predictions', () =>
    fetchPredictions(taskId)
  )
  
  await batch.track('update-users', () =>
    updateUserReputations(predictions)
  )
  
  await batch.track('update-market', () =>
    updateMarketStatus(taskId)
  )
  
  // 记录批量操作性能
  batch.log('resolve-market')
}
```

### 4. 响应大小监控

```typescript
import { logResponseSize } from '../_shared/performance.ts'

const data = await fetchLargeDataset()

// 记录响应大小
logResponseSize(data, 'get-large-dataset')

return new Response(JSON.stringify(data))
```

---

## 数据库优化

### 1. 使用索引

确保查询使用适当的索引：

```sql
-- 检查查询计划
EXPLAIN ANALYZE
SELECT * FROM markets
WHERE status = 'active'
ORDER BY closes_at;

-- 应该看到 "Index Scan using idx_markets_active"
```

### 2. 限制返回字段

只查询需要的字段：

```typescript
// 不好：查询所有字段
const { data } = await supabase
  .from('markets')
  .select('*')

// 好：只查询需要的字段
const { data } = await supabase
  .from('markets')
  .select('id, title, status, closes_at')
```

### 3. 使用分页

```typescript
const PAGE_SIZE = 20

const { data, count } = await supabase
  .from('markets')
  .select('*', { count: 'exact' })
  .range(offset, offset + PAGE_SIZE - 1)
```

### 4. 批量操作

使用单个查询代替多个查询：

```typescript
// 不好：N次查询
for (const userId of userIds) {
  await supabase
    .from('profiles')
    .update({ reputation_score: newScore })
    .eq('id', userId)
}

// 好：1次查询
await supabase
  .from('profiles')
  .update({ reputation_score: newScore })
  .in('id', userIds)
```

### 5. 使用数据库函数

复杂逻辑在数据库中执行：

```typescript
// 使用数据库函数（更快）
const { data } = await supabase.rpc('resolve_market_transaction', {
  p_task_id: taskId,
  p_outcome: outcome,
  p_admin_id: adminId,
})

// 而不是多次往返
```

---

## 响应优化

### 1. 压缩响应

Edge Functions自动支持gzip/brotli压缩。确保响应头正确：

```typescript
return new Response(JSON.stringify(data), {
  headers: {
    'Content-Type': 'application/json',
    'Content-Encoding': 'gzip',  // Deno自动处理
  },
})
```

### 2. 流式响应

对于大数据集使用流式响应：

```typescript
serve(async (req: Request) => {
  const stream = new ReadableStream({
    async start(controller) {
      const markets = await fetchAllMarkets()
      
      // 逐个发送
      for (const market of markets) {
        const chunk = JSON.stringify(market) + '\n'
        controller.enqueue(new TextEncoder().encode(chunk))
      }
      
      controller.close()
    },
  })
  
  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson',
    },
  })
})
```

### 3. 数据预处理

在数据库层面预处理数据：

```sql
-- 使用视图预计算
CREATE VIEW market_summary AS
SELECT 
  m.id,
  m.title,
  m.status,
  COUNT(p.id) as prediction_count,
  AVG(p.probability) as avg_probability
FROM markets m
LEFT JOIN predictions p ON p.task_id = m.id
GROUP BY m.id;
```

```typescript
// 直接查询视图
const { data } = await supabase
  .from('market_summary')
  .select('*')
```

### 4. 并行请求

使用Promise.all并行执行独立请求：

```typescript
// 不好：串行执行
const markets = await fetchMarkets()
const users = await fetchUsers()
const predictions = await fetchPredictions()

// 好：并行执行
const [markets, users, predictions] = await Promise.all([
  fetchMarkets(),
  fetchUsers(),
  fetchPredictions(),
])
```

### 5. 早期返回

尽早返回错误或空结果：

```typescript
serve(async (req: Request) => {
  // 快速验证
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }
  
  const user = await authenticateUser(req)
  if (!user) {
    return new Response('Unauthorized', { status: 401 })
  }
  
  // 继续处理...
})
```

---

## 性能目标

### API响应时间目标

- **简单查询**: < 100ms
- **复杂查询**: < 500ms
- **批量操作**: < 1000ms
- **AI生成**: < 5000ms

### 监控指标

```typescript
// 在日志中查看性能指标
{
  "function": "get-markets",
  "total_time_ms": 85,
  "marks": {
    "auth_end": 15,
    "query_end": 65,
    "process_end": 80
  }
}
```

### 性能警告阈值

- 响应时间 > 1000ms: 警告
- 查询时间 > 500ms: 慢查询警告
- 响应大小 > 1MB: 大响应警告

---

## 实战示例

### 优化前

```typescript
serve(async (req: Request) => {
  const user = await authenticateUser(req)
  
  // 多次查询
  const markets = await supabase.from('markets').select('*')
  
  for (const market of markets.data) {
    const predictions = await supabase
      .from('predictions')
      .select('*')
      .eq('task_id', market.id)
    
    market.predictions = predictions.data
  }
  
  return new Response(JSON.stringify(markets.data))
})
```

### 优化后

```typescript
import { withCache, createCachedResponse } from '../_shared/cache.ts'
import { PerformanceTimer, monitorQuery } from '../_shared/performance.ts'

serve(async (req: Request) => {
  const timer = new PerformanceTimer()
  
  // 缓存认证结果
  timer.mark('auth_start')
  const user = await authenticateUser(req)
  timer.mark('auth_end')
  
  // 使用缓存
  const cacheKey = 'markets-with-predictions'
  const data = await withCache(
    async () => {
      timer.mark('query_start')
      
      // 单次JOIN查询
      const result = await monitorQuery(
        'fetch-markets-with-predictions',
        async () => {
          const { data } = await supabase
            .from('markets')
            .select(`
              id,
              title,
              status,
              closes_at,
              predictions:predictions(count)
            `)
            .limit(20)
          return data
        }
      )
      
      timer.mark('query_end')
      return result
    },
    cacheKey,
    60  // 缓存60秒
  )
  
  timer.log('get-markets')
  
  // 返回带缓存头的响应
  return createCachedResponse(data, {
    maxAge: 60,
    sMaxAge: 300,
    corsHeaders,
  })
})
```

**性能提升**:
- 响应时间: 500ms → 85ms (83%提升)
- 数据库查询: N+1 → 1次
- 缓存命中后: < 5ms

---

## 检查清单

### 部署前检查

- [ ] 所有公开API设置适当的缓存头
- [ ] 数据库查询使用索引
- [ ] 避免N+1查询
- [ ] 使用分页限制返回数据
- [ ] 添加性能监控日志
- [ ] 设置响应时间警告
- [ ] 测试并发请求性能

### 定期审查

- [ ] 检查慢查询日志
- [ ] 审查缓存命中率
- [ ] 监控API响应时间
- [ ] 检查数据库连接池
- [ ] 审查大响应警告

---

## 工具和资源

### 性能测试工具

```bash
# 使用Apache Bench测试
ab -n 1000 -c 10 https://your-api.com/markets

# 使用wrk测试
wrk -t4 -c100 -d30s https://your-api.com/markets
```

### 监控命令

```bash
# 查看Edge Function日志
supabase functions logs get-markets --tail

# 查看数据库性能
psql -c "SELECT * FROM slow_queries;"
```

---

## 参考资源

- [Supabase Edge Functions Performance](https://supabase.com/docs/guides/functions/performance)
- [PostgreSQL Performance Tips](https://wiki.postgresql.org/wiki/Performance_Optimization)
- [HTTP Caching](https://developer.mozilla.org/en-US/docs/Web/HTTP/Caching)
