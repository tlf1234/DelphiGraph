# AgentOracle 数据库迁移指南

## 当前迁移状态

### 已执行的迁移
1. ✅ `20240213000001_initial_schema.sql` - 初始数据库架构
2. ✅ `20240213000002_rls_policies.sql` - RLS安全策略

### 待执行的迁移
3. ⏳ `20240215000001_add_purgatory_and_reputation_fields.sql` - 炼狱机制和信誉系统字段

## 执行迁移的方法

### 方法1：使用Supabase CLI（推荐）

#### 前提条件
确保已安装Supabase CLI：
```bash
# 检查是否已安装
supabase --version

# 如果未安装，使用npm安装
npm install -g supabase
```

#### 步骤1：链接到Supabase项目
```bash
# 如果是本地开发
supabase start

# 如果是远程项目
supabase link --project-ref your-project-ref
```

#### 步骤2：执行迁移
```bash
# 本地开发环境
supabase db push

# 或者直接应用特定迁移
supabase db push --include-all
```

#### 步骤3：验证迁移
```bash
# 查看迁移状态
supabase migration list

# 检查数据库结构
supabase db diff
```

### 方法2：通过Supabase Dashboard（简单但不推荐用于生产）

#### 步骤1：登录Supabase Dashboard
访问：https://app.supabase.com

#### 步骤2：进入SQL Editor
1. 选择你的项目
2. 点击左侧菜单 "SQL Editor"
3. 点击 "New query"

#### 步骤3：复制并执行SQL
1. 打开 `supabase/migrations/20240215000001_add_purgatory_and_reputation_fields.sql`
2. 复制全部内容
3. 粘贴到SQL Editor
4. 点击 "Run" 执行

#### 步骤4：验证结果
在SQL Editor中运行：
```sql
-- 检查profiles表的新字段
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'profiles'
ORDER BY ordinal_position;

-- 检查新表是否创建
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('calibration_tasks', 'redemption_attempts', 'reputation_history', 'reputation_levels');

-- 检查reputation_levels表的数据
SELECT * FROM reputation_levels ORDER BY min_score;
```

### 方法3：使用psql命令行（高级用户）

```bash
# 获取数据库连接字符串
# 从Supabase Dashboard > Settings > Database > Connection string

# 执行迁移
psql "your-connection-string" -f supabase/migrations/20240215000001_add_purgatory_and_reputation_fields.sql
```

## 迁移后的验证清单

### 1. 检查profiles表字段
```sql
SELECT 
  column_name, 
  data_type, 
  column_default,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'profiles'
  AND column_name IN (
    'status', 'redemption_streak', 'reputation_level', 
    'role', 'win_streak', 'purgatory_entered_at'
  );
```

预期结果：应该看到6个新字段

### 2. 检查markets表字段
```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'markets'
  AND column_name IN ('is_calibration', 'calibration_answer', 'calibration_difficulty');
```

预期结果：应该看到3个新字段

### 3. 检查新表
```sql
-- 应该返回4行
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'calibration_tasks',
    'redemption_attempts',
    'reputation_history',
    'reputation_levels'
  );
```

### 4. 检查reputation_levels数据
```sql
SELECT level_key, level_name, min_score, max_score
FROM reputation_levels
ORDER BY min_score;
```

预期结果：应该看到8个等级（banned到legend）

### 5. 检查索引
```sql
SELECT 
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('profiles', 'markets', 'calibration_tasks', 'redemption_attempts')
ORDER BY tablename, indexname;
```

## 常见问题

### Q1: 迁移执行失败怎么办？
**A**: 检查错误信息，常见原因：
- 字段已存在：可能之前手动添加过
- 权限不足：确保使用的是数据库管理员账号
- 语法错误：检查SQL语法

**解决方案**：
```sql
-- 如果字段已存在，可以跳过该字段的ALTER TABLE语句
-- 或者使用 IF NOT EXISTS（已在迁移文件中使用）
```

### Q2: 如何回滚迁移？
**A**: 创建回滚迁移文件：
```bash
# 创建回滚迁移
supabase migration new rollback_purgatory_fields
```

然后在新文件中写入回滚SQL：
```sql
-- 删除新增的字段
ALTER TABLE profiles DROP COLUMN IF EXISTS status;
ALTER TABLE profiles DROP COLUMN IF EXISTS redemption_streak;
-- ... 其他字段

-- 删除新增的表
DROP TABLE IF EXISTS redemption_attempts;
DROP TABLE IF EXISTS calibration_tasks;
-- ... 其他表
```

### Q3: 本地和生产环境如何同步？
**A**: 
1. 本地开发：使用 `supabase start` 启动本地数据库
2. 测试迁移：在本地执行 `supabase db push`
3. 验证通过后：在生产环境执行相同迁移
4. 使用Git管理迁移文件，确保团队同步

## 下一步

迁移完成后：
1. ✅ 更新TypeScript类型定义（`lib/types/database.types.ts`）
2. ✅ 运行类型生成命令：`supabase gen types typescript --local > lib/types/database.types.ts`
3. ✅ 验证所有TypeScript代码无错误
4. ✅ 开始实施Task 6.6（管理员结算功能）

## 参考资源

- [Supabase Migrations文档](https://supabase.com/docs/guides/cli/local-development#database-migrations)
- [Supabase CLI命令参考](https://supabase.com/docs/reference/cli/introduction)
- [PostgreSQL ALTER TABLE文档](https://www.postgresql.org/docs/current/sql-altertable.html)
