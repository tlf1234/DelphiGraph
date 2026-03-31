# 市场自动关闭功能指南

## 概述

市场自动关闭功能会在市场的`closes_at`时间到达时，自动将市场状态从`active`更新为`closed`。这确保了用户无法在截止时间后继续提交预测。

## 实现方式

### 1. 数据库层面

使用PostgreSQL的`pg_cron`扩展实现定时任务：

- **定时任务**: 每分钟执行一次检查
- **执行函数**: `auto_close_expired_markets()`
- **更新逻辑**: 将所有`status='active'`且`closes_at <= NOW()`的市场更新为`closed`

### 2. 审计日志

所有市场状态变更都会记录在`market_status_audit`表中：

```sql
SELECT * FROM market_status_audit 
WHERE task_id = 'your-market-id' 
ORDER BY changed_at DESC;
```

## 部署步骤

### 步骤1: 启用pg_cron扩展

1. 登录Supabase Dashboard
2. 进入 **Database** > **Extensions**
3. 搜索 `pg_cron`
4. 点击 **Enable** 启用扩展

### 步骤2: 执行迁移文件

1. 进入 **SQL Editor**
2. 复制 `supabase/migrations/20240216000001_market_auto_close.sql` 的内容
3. 粘贴并执行

执行后会看到成功消息：
```
✅ 市场自动关闭功能已配置
   - 自动关闭函数: auto_close_expired_markets()
   - 定时任务: 每分钟执行一次
   - 手动触发: SELECT * FROM trigger_market_auto_close();
   - 审计日志: market_status_audit表
```

### 步骤3: 部署Edge Function（可选）

如果需要通过API手动触发市场关闭：

```bash
# 部署Edge Function
supabase functions deploy check-market-status
```

## 使用方法

### 自动执行

定时任务会每分钟自动执行，无需手动干预。

### 手动触发（数据库）

在SQL Editor中执行：

```sql
-- 查看将要关闭的市场
SELECT id, title, closes_at, status 
FROM markets 
WHERE status = 'active' 
  AND closes_at <= NOW();

-- 手动触发关闭
SELECT * FROM trigger_market_auto_close();
```

### 手动触发（API）

调用Edge Function：

```bash
curl -X POST https://your-project.supabase.co/functions/v1/check-market-status \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json"
```

响应示例：
```json
{
  "success": true,
  "closedCount": 3,
  "closedTaskIds": ["uuid1", "uuid2", "uuid3"],
  "message": "Successfully closed 3 expired markets"
}
```

## 监控和调试

### 查看定时任务状态

```sql
-- 查看所有定时任务
SELECT * FROM cron.job;

-- 查看任务执行历史
SELECT * FROM cron.job_run_details 
WHERE jobname = 'auto-close-markets' 
ORDER BY start_time DESC 
LIMIT 10;
```

### 查看审计日志

```sql
-- 查看最近的状态变更
SELECT 
  m.title,
  a.old_status,
  a.new_status,
  a.changed_by,
  a.changed_at
FROM market_status_audit a
JOIN markets m ON a.task_id = m.id
ORDER BY a.changed_at DESC
LIMIT 20;
```

### 测试功能

创建一个测试市场，设置`closes_at`为1分钟后：

```sql
-- 创建测试市场
INSERT INTO markets (title, description, question, resolution_criteria, closes_at, status)
VALUES (
  '测试市场',
  '这是一个测试市场',
  '测试问题？',
  '测试标准',
  NOW() + INTERVAL '1 minute',
  'active'
);

-- 等待1分钟后检查状态
SELECT id, title, status, closes_at, updated_at 
FROM markets 
WHERE title = '测试市场';
```

## 故障排除

### 问题1: 定时任务未执行

**检查pg_cron是否启用：**
```sql
SELECT * FROM pg_extension WHERE extname = 'pg_cron';
```

如果返回空，需要在Dashboard中启用扩展。

### 问题2: 市场未自动关闭

**检查定时任务是否存在：**
```sql
SELECT * FROM cron.job WHERE jobname = 'auto-close-markets';
```

**手动执行函数测试：**
```sql
SELECT auto_close_expired_markets();
```

### 问题3: 权限错误

确保函数使用`SECURITY DEFINER`，这样可以以函数所有者的权限执行。

## 性能考虑

- **索引优化**: `closes_at`字段已建立索引，查询性能良好
- **执行频率**: 每分钟执行一次，对数据库负载影响极小
- **批量更新**: 使用单个UPDATE语句批量更新，效率高

## 未来增强

1. **通知功能**: 市场关闭时发送通知给参与者
2. **预警机制**: 在市场关闭前1小时发送提醒
3. **灵活调度**: 根据市场数量动态调整检查频率
4. **状态机**: 实现更复杂的市场生命周期管理

## 相关文件

- 迁移文件: `supabase/migrations/20240216000001_market_auto_close.sql`
- Edge Function: `supabase/functions/check-market-status/index.ts`
- 需求文档: `.kiro/specs/agent-oracle/requirements.md` (需求2.3)
- 任务列表: `.kiro/specs/agent-oracle/tasks.md` (Task 6.4)
