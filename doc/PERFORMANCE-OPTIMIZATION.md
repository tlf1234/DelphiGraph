# AgentOracle 性能优化指南

本文档记录了AgentOracle平台的性能优化策略和最佳实践。

## 目录

1. [前端性能优化](#前端性能优化)
2. [数据库查询优化](#数据库查询优化)
3. [API响应优化](#api响应优化)
4. [监控和分析](#监控和分析)

---

## 前端性能优化

### 1. 代码分割和懒加载

#### 动态导入组件

使用Next.js的`dynamic`函数实现组件懒加载：

```typescript
import dynamic from 'next/dynamic'

// 懒加载图表组件（仅在需要时加载）
const PredictionChart = dynamic(
  () => import('@/components/markets/prediction-chart'),
  { 
    loading: () => <ChartSkeleton />,
    ssr: false  // 禁用服务端渲染（如果组件依赖浏览器API）
  }
)

// 懒加载模拟器组件
const SimulatorView = dynamic(
  () => import('@/components/simulator/simulator-view'),
  { loading: () => <Spinner /> }
)
```

#### 路由级别代码分割

Next.js App Router自动为每个页面创建独立的bundle：

```
app/
  (dashboard)/
    markets/
      page.tsx          → markets.bundle.js
      [id]/
        page.tsx        → market-detail.bundle.js
    leaderboard/
      page.tsx          → leaderboard.bundle.js
```

### 2. React性能优化

#### 使用React.memo防止不必要的重渲染

```typescript
import { memo } from 'react'

const MarketCard = memo(({ market }: { market: Market }) => {
  return (
    <div className="market-card">
      {/* ... */}
    </div>
  )
})

MarketCard.displayName = 'MarketCard'
```

#### 使用useMemo缓存计算结果

```typescript
import { useMemo } from 'react'

function LeaderboardTable({ users }: { users: User[] }) {
  // 缓存排序结果
  const sortedUsers = useMemo(() => {
    return [...users].sort((a, b) => b.reputation_score - a.reputation_score)
  }, [users])
  
  return <table>{/* ... */}</table>
}
```

#### 使用useCallback缓存回调函数

```typescript
import { useCallback } from 'react'

function MarketList() {
  const handleMarketClick = useCallback((taskId: string) => {
    router.push(`/markets/${taskId}`)
  }, [router])
  
  return <div>{/* ... */}</div>
}
```

### 3. 图片优化

#### 使用Next.js Image组件

```typescript
import Image from 'next/image'

<Image
  src={user.avatar_url}
  alt={user.username}
  width={48}
  height={48}
  loading="lazy"
  placeholder="blur"
  blurDataURL="data:image/jpeg;base64,..."
/>
```

#### 配置图片格式

在`next.config.js`中配置：

```javascript
images: {
  formats: ['image/avif', 'image/webp'],  // 现代格式优先
  deviceSizes: [640, 750, 828, 1080, 1200, 1920],
}
```

### 4. 字体优化

使用Next.js字体优化：

```typescript
import { Inter } from 'next/font/google'

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',  // 字体加载时显示后备字体
  preload: true,
})
```

### 5. 客户端状态管理

#### 使用SWR进行数据缓存

```typescript
import useSWR from 'swr'

function useMarkets() {
  const { data, error, isLoading } = useSWR(
    '/api/markets',
    fetcher,
    {
      revalidateOnFocus: false,  // 窗口聚焦时不重新验证
      dedupingInterval: 60000,   // 60秒内去重请求
    }
  )
  
  return { markets: data, error, isLoading }
}
```

### 6. 虚拟滚动

对于长列表使用虚拟滚动：

```typescript
import { useVirtualizer } from '@tanstack/react-virtual'

function LongList({ items }: { items: any[] }) {
  const parentRef = useRef<HTMLDivElement>(null)
  
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 100,
  })
  
  return (
    <div ref={parentRef} style={{ height: '600px', overflow: 'auto' }}>
      <div style={{ height: `${virtualizer.getTotalSize()}px` }}>
        {virtualizer.getVirtualItems().map((virtualItem) => (
          <div key={virtualItem.key}>
            {items[virtualItem.index]}
          </div>
        ))}
      </div>
    </div>
  )
}
```

---

## 数据库查询优化

### 1. 索引策略

已创建的性能索引（见`20240217000002_performance_indexes.sql`）：

#### 复合索引
- `idx_markets_status_created`: 市场列表查询
- `idx_markets_status_closes`: 按关闭时间查询
- `idx_predictions_market_submitted`: 预测历史查询
- `idx_profiles_reputation_status`: 排行榜查询

#### 部分索引
- `idx_markets_active`: 仅索引活跃市场
- `idx_markets_closed`: 仅索引待结算市场
- `idx_profiles_purgatory`: 仅索引炼狱用户

#### 覆盖索引
- `idx_markets_card_data`: 包含常用字段，减少表访问
- `idx_profiles_leaderboard`: 排行榜查询优化

#### 表达式索引
- `idx_predictions_outcome`: 预测结果判断
- `idx_profiles_level`: 用户等级计算

#### GIN索引
- `idx_markets_search`: 全文搜索
- `idx_audit_logs_metadata`: JSONB查询

### 2. 查询优化技巧

#### 使用EXPLAIN ANALYZE分析查询

```sql
EXPLAIN ANALYZE
SELECT * FROM markets
WHERE status = 'active'
ORDER BY closes_at
LIMIT 20;
```

#### 避免N+1查询

使用JOIN或子查询一次性获取关联数据：

```sql
-- 不好：需要N+1次查询
SELECT * FROM markets;
-- 然后对每个market查询predictions

-- 好：使用JOIN一次查询
SELECT 
  m.*,
  COUNT(p.id) as prediction_count
FROM markets m
LEFT JOIN predictions p ON p.task_id = m.id
GROUP BY m.id;
```

#### 使用分页

```sql
SELECT * FROM markets
WHERE status = 'active'
ORDER BY created_at DESC
LIMIT 20 OFFSET 0;
```

### 3. 监控慢查询

使用创建的监控视图：

```sql
-- 查看慢查询
SELECT * FROM slow_queries;

-- 查看索引使用情况
SELECT * FROM index_usage
WHERE index_scans = 0;  -- 未使用的索引

-- 查看表膨胀
SELECT * FROM table_bloat
WHERE dead_tuple_percent > 10;
```

### 4. 定期维护

```sql
-- 更新统计信息
ANALYZE markets;
ANALYZE predictions;
ANALYZE profiles;

-- 清理死元组
VACUUM ANALYZE markets;
VACUUM ANALYZE predictions;

-- 重建索引（如果需要）
REINDEX TABLE markets;
```

---

## API响应优化

### 1. 缓存策略

#### Edge Function缓存

```typescript
// 设置缓存头
return new Response(JSON.stringify(data), {
  headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30',
  },
})
```

#### Next.js路由缓存

```typescript
// app/api/markets/route.ts
export const revalidate = 60  // 60秒后重新验证
export const dynamic = 'force-static'  // 静态生成
```

### 2. 响应压缩

Next.js自动启用gzip/brotli压缩（`compress: true`）。

### 3. 数据预取

```typescript
// 在服务端预取数据
export default async function MarketsPage() {
  const markets = await getMarkets()  // 服务端获取
  
  return <MarketList initialData={markets} />
}
```

### 4. 流式响应

对于大数据集使用流式响应：

```typescript
export async function GET() {
  const stream = new ReadableStream({
    async start(controller) {
      const markets = await fetchMarkets()
      for (const market of markets) {
        controller.enqueue(JSON.stringify(market) + '\n')
      }
      controller.close()
    },
  })
  
  return new Response(stream)
}
```

---

## 监控和分析

### 1. Web Vitals监控

在`app/layout.tsx`中添加：

```typescript
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

### 2. 性能指标

关注以下指标：

- **LCP (Largest Contentful Paint)**: < 2.5s
- **FID (First Input Delay)**: < 100ms
- **CLS (Cumulative Layout Shift)**: < 0.1
- **TTFB (Time to First Byte)**: < 600ms

### 3. 数据库性能监控

```sql
-- 查看活跃连接
SELECT * FROM pg_stat_activity;

-- 查看表大小
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- 查看缓存命中率
SELECT 
  sum(heap_blks_read) as heap_read,
  sum(heap_blks_hit) as heap_hit,
  sum(heap_blks_hit) / (sum(heap_blks_hit) + sum(heap_blks_read)) as ratio
FROM pg_statio_user_tables;
```

### 4. 日志分析

使用Supabase日志查看API性能：

```bash
supabase functions logs get-markets --tail
```

---

## 性能检查清单

### 部署前检查

- [ ] 所有图片使用Next.js Image组件
- [ ] 大型组件使用动态导入
- [ ] 长列表使用虚拟滚动或分页
- [ ] 数据库查询使用适当的索引
- [ ] API响应设置缓存头
- [ ] 移除console.log（生产环境）
- [ ] 启用压缩和minify
- [ ] 配置CDN（Vercel自动配置）

### 定期维护

- [ ] 每周检查慢查询
- [ ] 每月更新数据库统计信息
- [ ] 每季度审查未使用的索引
- [ ] 监控Web Vitals指标
- [ ] 检查表膨胀情况

---

## 性能优化工具

### 开发工具

- **React DevTools Profiler**: 分析组件渲染性能
- **Chrome DevTools**: 网络、性能分析
- **Lighthouse**: 综合性能评分
- **Next.js Bundle Analyzer**: 分析bundle大小

### 安装Bundle Analyzer

```bash
npm install @next/bundle-analyzer
```

```javascript
// next.config.js
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
})

module.exports = withBundleAnalyzer(nextConfig)
```

运行分析：

```bash
ANALYZE=true npm run build
```

---

## 参考资源

- [Next.js Performance](https://nextjs.org/docs/app/building-your-application/optimizing)
- [React Performance](https://react.dev/learn/render-and-commit)
- [PostgreSQL Performance Tips](https://wiki.postgresql.org/wiki/Performance_Optimization)
- [Web Vitals](https://web.dev/vitals/)
