# 数据库函数部署指南

## 当前问题

测试显示 500 错误：
```
"Could not find the function public.get_smart_distributed_tasks(p_agent_id, p_limit) in the schema cache"
```

这意味着数据库函数 `get_smart_distributed_tasks` 还没有部署到 Supabase 数据库中。

## 解决方案：部署数据库迁移

### 方法 1: 使用 Supabase Dashboard（推荐，最简单）

#### 步骤 1: 打开 SQL Editor

1. 访问 [Supabase Dashboard](https://your-platform-domain.com/dashboard)
2. 选择你的项目：`your-platform-domain.com`
3. 点击左侧菜单的 **SQL Editor**

#### 步骤 2: 复制 SQL 内容

打开文件：`supabase/migrations/20260218_optimize_smart_distribution.sql`

复制整个文件的内容（约 400 行）

#### 步骤 3: 粘贴并执行

1. 在 SQL Editor 中，点击 **New query**
2. 粘贴复制的 SQL 内容
3. 点击右下角的 **Run** 按钮（或按 Ctrl+Enter）

#### 步骤 4: 验证成功

执行成功后，你会看到类似这样的输出：

```
✅ Smart Distribution Optimization Complete
智能分发优化已成功应用

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 Optimizations Applied
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✓ get_smart_distributed_tasks()    智能分发函数（过滤 + 评分）
✓ Filtering logic                  访问权限过滤移至数据库层
✓ Match scoring                    匹配评分算法移至数据库层
...
```

#### 步骤 5: 验证函数存在

在 SQL Editor 中运行以下查询：

```sql
SELECT proname, prosrc 
FROM pg_proc 
WHERE proname = 'get_smart_distributed_tasks';
```

应该返回一行结果，显示函数已创建。

---

### 方法 2: 使用 Supabase CLI（如果已安装）

如果你已经安装并配置了 Supabase CLI：

```bash
# 在项目根目录
supabase db push
```

这会自动应用所有未执行的迁移文件。

---

## 部署后测试

### 1. 重新运行测试脚本

```bash
cd openclaw_agentoracle_plugin
python test_api_connection.py
```

### 2. 预期结果

```
[测试 1] ✓ 正确返回 401 (需要认证)

[测试 2] 测试 /get-tasks 端点（有 API key - x-api-key 头）...
  状态码: 200
✓ 成功连接到 Edge Function
  返回任务数: X
  
[测试 2b] 测试 /get-tasks 端点（有 API key - Authorization Bearer 头）...
  状态码: 200
✓ 成功连接到 Edge Function
  返回任务数: X
```

---

## 如果仍然失败

### 检查 1: 确认函数已创建

在 Supabase Dashboard SQL Editor 中运行：

```sql
-- 检查函数是否存在
SELECT 
  proname AS function_name,
  pg_get_function_arguments(oid) AS arguments,
  pg_get_function_result(oid) AS return_type
FROM pg_proc
WHERE proname = 'get_smart_distributed_tasks';
```

### 检查 2: 手动测试函数

在 SQL Editor 中运行：

```sql
-- 使用你的 profile ID 测试（需要先查询）
SELECT id FROM profiles WHERE api_key_hash = '172b1350-e6fc-469a-b7d9-5b6721d0319e';

-- 然后使用返回的 ID 测试函数
SELECT * FROM get_smart_distributed_tasks(
  '<your-profile-id>'::UUID,  -- 替换为上面查询到的 ID
  10
);
```

### 检查 3: 查看 Edge Function 日志

```bash
supabase functions logs get-tasks --follow
```

然后重新运行测试，查看详细错误信息。

---

## 部署 submit-prediction Edge Function

测试还显示 `submit-prediction` 返回 404，说明这个函数也需要部署：

```bash
# 在项目根目录
supabase functions deploy submit-prediction
```

---

## 完整的部署检查清单

- [ ] 在 Supabase Dashboard SQL Editor 中执行 `20260218_optimize_smart_distribution.sql`
- [ ] 验证函数存在：`SELECT proname FROM pg_proc WHERE proname = 'get_smart_distributed_tasks'`
- [ ] 重新运行测试：`python test_api_connection.py`
- [ ] 确认测试 2 和 2b 返回 200 状态码
- [ ] 部署 submit-prediction：`supabase functions deploy submit-prediction`
- [ ] 最终测试：运行插件 `python skill.py`

---

## 快速命令参考

```bash
# 1. 部署数据库迁移（在 Supabase Dashboard 手动执行 SQL）

# 2. 测试连接
cd openclaw_agentoracle_plugin
python test_api_connection.py

# 3. 部署 submit-prediction Edge Function
cd ..
supabase functions deploy submit-prediction

# 4. 运行插件
cd openclaw_agentoracle_plugin
python skill.py
```

---

## 预期的最终结果

所有测试通过后，你应该看到：

```
[测试 1] ✓ 正确返回 401 (需要认证)
[测试 2] ✓ 成功连接到 Edge Function (200)
[测试 2b] ✓ 成功连接到 Edge Function (200)
[测试 3] ✓ submit-prediction 可访问 (200 或 400)
```

然后插件就可以正常运行了！
