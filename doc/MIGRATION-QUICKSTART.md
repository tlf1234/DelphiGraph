# 🚀 数据库迁移快速执行指南

## 你的情况
- ✅ 使用**线上Supabase**（yrqxqvycuqfuumcliegl.supabase.co）
- ✅ 已有3个迁移文件（保持分开是正确的）
- ⏳ 需要执行第3个迁移文件

## 最简单的执行方法

### 选项1：通过Supabase Dashboard（推荐，最安全）⭐

```bash
# 1. 登录Supabase Dashboard
https://app.supabase.com

# 2. 选择你的项目：yrqxqvycuqfuumcliegl

# 3. 点击左侧菜单 "SQL Editor"

# 4. 点击 "New query"

# 5. 复制粘贴以下文件的全部内容：
#    supabase/migrations/20240215000001_add_purgatory_and_reputation_fields.sql

# 6. 点击 "Run" 或按 Ctrl+Enter 执行

# 7. 等待执行完成，应该看到成功消息
```

**预期输出**：
```
✅ Success. No rows returned
✅ AgentOracle 数据库架构更新完成
```

### 选项2：使用Supabase CLI（需要先链接项目）

```bash
# 1. 安装Supabase CLI（如果还没安装）
npm install -g supabase

# 2. 登录Supabase
supabase login

# 3. 链接到你的线上项目
supabase link --project-ref yrqxqvycuqfuumcliegl

# 4. 执行迁移
supabase db push --linked

# 5. 验证迁移
supabase migration list --linked
```

### 选项3：使用psql直接连接（高级用户）

```bash
# 1. 从Supabase Dashboard获取数据库连接字符串
#    Settings > Database > Connection string > URI

# 2. 执行迁移
psql "你的连接字符串" -f supabase/migrations/20240215000001_add_purgatory_and_reputation_fields.sql
```

## 快速验证

执行迁移后，在Supabase Dashboard的SQL Editor中运行以下SQL验证：

```sql
-- 检查新字段是否存在
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'profiles' AND column_name IN ('status', 'role', 'redemption_streak');

-- 检查新表是否创建
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public'
  AND table_name IN ('reputation_levels', 'calibration_tasks', 'redemption_attempts', 'reputation_history');

-- 查看等级配置（应该有8条记录）
SELECT level_key, level_name, min_score, max_score FROM reputation_levels ORDER BY min_score;
```

**预期结果**：
- 第1个查询：应该返回3行（status, role, redemption_streak）
- 第2个查询：应该返回4行（4个新表）
- 第3个查询：应该返回8行（8个等级配置）

## 关于文件分开还是合并

### ✅ 推荐：保持3个文件分开

**原因**：
1. **符合迁移最佳实践**：每个迁移文件代表一次数据库变更
2. **便于版本控制**：可以追踪每次变更的历史
3. **便于团队协作**：其他开发者可以看到变更时间线
4. **便于回滚**：如果有问题，可以针对性回滚
5. **生产环境安全**：已部署的数据库不会受影响

**当前文件结构（正确）**：
```
supabase/migrations/
├── 20240213000001_initial_schema.sql           # 初始架构
├── 20240213000002_rls_policies.sql             # RLS策略
└── 20240215000001_add_purgatory_and_reputation_fields.sql  # 新增字段
```

### ❌ 不推荐：合并成1个文件

**问题**：
- 破坏迁移历史
- 如果前两个文件已在生产环境执行，合并会导致冲突
- 违反数据库迁移的不可变原则
- 无法追踪具体的变更时间

## 常见问题

### Q: 迁移会影响现有数据吗？
**A**: 不会。新迁移只是添加字段和表，不会删除或修改现有数据。

### Q: 如果迁移失败怎么办？
**A**: 
1. 查看错误信息
2. 检查是否字段已存在（迁移文件已使用 `IF NOT EXISTS`，应该不会失败）
3. 如果有问题，可以手动回滚

### Q: 需要重启应用吗？
**A**: 不需要。数据库迁移后，应用会自动使用新的数据库结构。但建议更新TypeScript类型定义。

## 下一步

迁移完成后：
1. ✅ 更新TypeScript类型定义
2. ✅ 验证代码无错误
3. ✅ 开始实施Task 6.6（管理员结算功能）

## 需要帮助？

如果遇到问题，查看详细文档：`doc/DATABASE-MIGRATION-GUIDE.md`
