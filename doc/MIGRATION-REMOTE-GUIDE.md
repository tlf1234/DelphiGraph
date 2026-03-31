# 线上Supabase数据库迁移详细指南

## 项目信息
- **Supabase项目**: yrqxqvycuqfuumcliegl
- **URL**: https://yrqxqvycuqfuumcliegl.supabase.co
- **环境**: 生产环境（线上）

## ⚠️ 重要提醒

在执行迁移前：
1. ✅ **备份数据**：虽然这次迁移只是添加字段，但建议先备份
2. ✅ **选择低峰时段**：如果有用户在使用，选择访问量低的时间
3. ✅ **通知团队**：如果是团队项目，提前通知其他成员

## 🎯 推荐方法：Supabase Dashboard（最安全）

### 步骤1：登录Supabase Dashboard

1. 打开浏览器访问：https://app.supabase.com
2. 使用你的账号登录
3. 在项目列表中找到并点击你的项目

### 步骤2：打开SQL Editor

1. 在左侧菜单中找到 **"SQL Editor"**
2. 点击进入SQL编辑器
3. 点击右上角的 **"New query"** 按钮

### 步骤3：复制迁移SQL

1. 打开本地文件：`supabase/migrations/20240215000001_add_purgatory_and_reputation_fields.sql`
2. 全选并复制所有内容（Ctrl+A, Ctrl+C）
3. 粘贴到Supabase SQL Editor中（Ctrl+V）

### 步骤4：执行迁移

1. 检查SQL内容是否完整（应该看到完整的SQL语句）
2. 点击右下角的 **"Run"** 按钮（或按 Ctrl+Enter）
3. 等待执行完成

### 步骤5：查看执行结果

**成功的标志**：
```
✅ Success. No rows returned
```

在结果面板中，你应该看到类似这样的消息：
```
NOTICE:  ✅ AgentOracle 数据库架构更新完成
NOTICE:     - profiles 表已添加炼狱、信誉和管理员字段
NOTICE:     - markets 表已添加校准任务字段
NOTICE:     - calibration_tasks 表已创建
NOTICE:     - redemption_attempts 表已创建
NOTICE:     - reputation_history 表已创建
NOTICE:     - reputation_levels 表已创建并插入配置
NOTICE:     - recovery_tasks 表已创建
NOTICE:     - 所有索引已创建
```

### 步骤6：验证迁移结果

在SQL Editor中创建新查询，运行以下验证SQL：

#### 验证1：检查profiles表新字段
```sql
SELECT 
  column_name, 
  data_type, 
  column_default
FROM information_schema.columns
WHERE table_name = 'profiles'
  AND column_name IN (
    'status', 'role', 'redemption_streak', 'reputation_level',
    'win_streak', 'purgatory_entered_at', 'is_banned'
  )
ORDER BY column_name;
```

**预期结果**：应该返回7行，显示所有新增字段

#### 验证2：检查markets表新字段
```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'markets'
  AND column_name IN ('is_calibration', 'calibration_answer', 'calibration_difficulty');
```

**预期结果**：应该返回3行

#### 验证3：检查新表
```sql
SELECT 
  table_name,
  (SELECT COUNT(*) FROM information_schema.columns WHERE columns.table_name = tables.table_name) as column_count
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'calibration_tasks',
    'redemption_attempts',
    'reputation_history',
    'reputation_levels',
    'recovery_tasks',
    'recovery_task_attempts'
  )
ORDER BY table_name;
```

**预期结果**：应该返回6行，显示所有新表

#### 验证4：检查reputation_levels数据
```sql
SELECT 
  level_key, 
  level_name, 
  min_score, 
  max_score,
  daily_prediction_limit,
  revenue_share_percent
FROM reputation_levels
ORDER BY min_score;
```

**预期结果**：应该返回8行，从"封禁区"到"传奇预言家"

#### 验证5：检查索引
```sql
SELECT 
  tablename,
  indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('profiles', 'markets', 'calibration_tasks', 'redemption_attempts')
  AND indexname LIKE '%status%' OR indexname LIKE '%role%' OR indexname LIKE '%calibration%'
ORDER BY tablename, indexname;
```

**预期结果**：应该看到新创建的索引

## 🔧 备选方法：使用Supabase CLI

如果你更喜欢命令行，可以使用Supabase CLI：

### 前提条件
```bash
# 安装Supabase CLI
npm install -g supabase

# 验证安装
supabase --version
```

### 执行步骤
```bash
# 1. 登录Supabase
supabase login

# 2. 链接到你的线上项目
supabase link --project-ref yrqxqvycuqfuumcliegl

# 3. 查看待执行的迁移
supabase migration list --linked

# 4. 执行迁移
supabase db push --linked

# 5. 验证迁移
supabase migration list --linked
```

## 📊 迁移后的数据库结构

### profiles表（更新后）
```
原有字段：
- id, username, twitter_handle, avatar_url
- api_key_hash, reputation_score, total_earnings
- prediction_count, created_at, updated_at

新增字段：
- status (用户状态: active/restricted)
- role (用户角色: user/admin)
- redemption_streak (救赎连胜数)
- redemption_attempts (救赎尝试次数)
- purgatory_entered_at (进入炼狱时间)
- purgatory_reason (进入炼狱原因)
- reputation_level (信誉等级)
- win_streak (连胜次数)
- total_predictions (总预测数)
- correct_predictions (正确预测数)
- is_banned (是否被封禁)
- ban_reason (封禁原因)
- recovery_tasks_completed (完成的恢复任务数)
- last_prediction_at (最后预测时间)
- daily_prediction_count (每日预测计数)
- daily_reset_at (每日重置时间)
```

### markets表（更新后）
```
新增字段：
- is_calibration (是否为校准任务)
- calibration_answer (校准任务正确答案)
- calibration_difficulty (校准任务难度)
```

### 新增的表
1. **calibration_tasks** - 校准任务表
2. **redemption_attempts** - 救赎尝试记录表
3. **reputation_history** - 信誉分历史记录表
4. **reputation_levels** - 信誉等级配置表（含8个等级）
5. **recovery_tasks** - 恢复任务表
6. **recovery_task_attempts** - 恢复任务尝试表

## ❌ 常见问题

### Q1: 执行时报错 "column already exists"
**原因**：字段可能已经存在（之前手动添加过）

**解决方案**：
- 迁移文件已使用 `IF NOT EXISTS`，应该不会报错
- 如果还是报错，可以忽略该错误，继续执行后续语句

### Q2: 执行时报错 "permission denied"
**原因**：当前用户没有足够权限

**解决方案**：
- 确保使用的是项目所有者账号
- 或者使用 `SUPABASE_SERVICE_ROLE_KEY` 连接

### Q3: 迁移执行很慢
**原因**：数据库可能有大量数据

**解决方案**：
- 耐心等待，迁移操作是原子性的
- 不要中断执行

### Q4: 如何回滚迁移？
**解决方案**：
创建回滚迁移文件，删除新增的字段和表：
```sql
-- 删除新增字段
ALTER TABLE profiles DROP COLUMN IF EXISTS status;
ALTER TABLE profiles DROP COLUMN IF EXISTS role;
-- ... 其他字段

-- 删除新增表
DROP TABLE IF EXISTS redemption_attempts;
DROP TABLE IF EXISTS calibration_tasks;
-- ... 其他表
```

## ✅ 迁移完成后的检查清单

- [ ] 所有验证SQL都返回预期结果
- [ ] reputation_levels表有8条记录
- [ ] profiles表有新的status和role字段
- [ ] markets表有is_calibration字段
- [ ] 应用仍然正常运行
- [ ] 更新TypeScript类型定义
- [ ] 通知团队成员迁移已完成

## 🚀 下一步

迁移完成后：

1. **更新TypeScript类型定义**
   ```bash
   # 如果使用Supabase CLI
   supabase gen types typescript --linked > lib/types/database.types.ts
   ```

2. **验证应用代码**
   ```bash
   npm run build
   ```

3. **开始实施Task 6.6**
   - 管理员结算功能（MVP简化版）
   - 现在数据库已经有role字段，可以验证管理员权限了

## 📞 需要帮助？

如果遇到问题：
1. 检查Supabase Dashboard的日志
2. 查看详细错误信息
3. 参考 `doc/DATABASE-MIGRATION-GUIDE.md`
4. 或者询问团队成员

---

**最后更新**: 2026-02-15  
**迁移文件**: `20240215000001_add_purgatory_and_reputation_fields.sql`
