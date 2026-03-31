# 市场自动关闭 - 快速部署指南

## 3步快速部署

### 步骤1: 启用pg_cron扩展（1分钟）

1. 打开 Supabase Dashboard: https://supabase.com/dashboard/project/yrqxqvycuqfuumcliegl
2. 点击左侧 **Database** > **Extensions**
3. 搜索框输入 `pg_cron`
4. 点击右侧的 **Enable** 按钮

### 步骤2: 执行迁移SQL（2分钟）

1. 点击左侧 **SQL Editor**
2. 点击 **New query**
3. 复制 `supabase/migrations/20240216000001_market_auto_close.sql` 的全部内容
4. 粘贴到编辑器
5. 点击 **Run** 执行

**预期输出：**
```
✅ 市场自动关闭功能已配置
   - 自动关闭函数: auto_close_expired_markets()
   - 定时任务: 每分钟执行一次
   - 手动触发: SELECT * FROM trigger_market_auto_close();
   - 审计日志: market_status_audit表

📊 当前执行结果: 关闭了 0 个过期市场
```

### 步骤3: 验证功能（1分钟）

在SQL Editor中执行：

```sql
-- 查看定时任务是否创建成功
SELECT jobname, schedule, command 
FROM cron.job 
WHERE jobname = 'auto-close-markets';
```

**预期结果：**
```
jobname              | schedule  | command
---------------------|-----------|----------------------------------
auto-close-markets   | * * * * * | SELECT auto_close_expired_markets();
```

## 完成！

现在系统会每分钟自动检查并关闭过期的市场。

## 测试（可选）

创建一个1分钟后过期的测试市场：

```sql
INSERT INTO markets (title, description, question, resolution_criteria, closes_at, status)
VALUES (
  '测试市场 - 1分钟后关闭',
  '测试自动关闭功能',
  '这个市场会自动关闭吗？',
  '等待1分钟观察',
  NOW() + INTERVAL '1 minute',
  'active'
) RETURNING id, title, status, closes_at;
```

等待1-2分钟后检查：

```sql
SELECT id, title, status, closes_at, updated_at 
FROM markets 
WHERE title LIKE '测试市场%'
ORDER BY created_at DESC;
```

状态应该从`active`变为`closed`。

## 故障排除

如果市场没有自动关闭：

1. **检查pg_cron是否启用**
   ```sql
   SELECT * FROM pg_extension WHERE extname = 'pg_cron';
   ```

2. **手动触发测试**
   ```sql
   SELECT * FROM trigger_market_auto_close();
   ```

3. **查看执行日志**
   ```sql
   SELECT * FROM cron.job_run_details 
   WHERE jobname = 'auto-close-markets' 
   ORDER BY start_time DESC 
   LIMIT 5;
   ```

## 下一步

- ✅ Task 6.4 已完成
- ⏭️ 继续 Task 6.6: 实现市场解决功能（MVP简化版）
