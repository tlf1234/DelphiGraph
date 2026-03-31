# 市场创建功能部署指南

## 概述

市场创建功能是AgentOracle平台的核心B端功能，允许任何已认证用户创建自定义预测市场。这是一个付费功能，因此不需要信誉等级限制。

## 功能特性

- ✅ 任何登录用户都可以创建市场（无信誉限制）
- ✅ 完整的表单验证（客户端+服务器端）
- ✅ 安全防护（SQL注入、XSS防护）
- ✅ 用户体验优化（创建指南、示例、确认对话框）
- ✅ Bloomberg Terminal深色主题
- ✅ 响应式设计

## 架构组件

### 1. Edge Function
- **文件**: `supabase/functions/create-market/index.ts`
- **功能**: 处理市场创建请求
- **验证**: 用户认证、表单数据、业务规则

### 2. 前端组件
- **MarketCreationForm**: `components/markets/market-creation-form.tsx`
- **CreateMarketPage**: `app/(dashboard)/markets/create/page.tsx`
- **Markets Page**: `app/(dashboard)/markets/page.tsx` (添加创建按钮)

### 3. 数据库
- **RLS策略**: `supabase/migrations/20240218000001_market_creation_rls.sql`
- **表**: markets (已存在)

## 部署步骤

### 1. 部署数据库迁移

```bash
# 应用RLS策略
supabase db push

# 或者手动执行
psql -h <your-db-host> -U postgres -d postgres -f supabase/migrations/20240218000001_market_creation_rls.sql
```

### 2. 部署Edge Function

```bash
# 部署create-market函数
supabase functions deploy create-market

# 验证部署
supabase functions list
```

### 3. 验证部署

访问以下URL验证功能：
- 市场列表页: `https://your-domain.com/markets`
- 创建市场页: `https://your-domain.com/markets/create`

## 使用指南

### 创建市场流程

1. **登录系统**
   - 用户必须先登录才能创建市场

2. **访问创建页面**
   - 点击市场页面的"创建市场"按钮
   - 或直接访问 `/markets/create`

3. **填写表单**
   - 标题（必填，最多200字符）
   - 问题（必填，最多500字符）
   - 描述（必填，最多5000字符）
   - 解决标准（必填，最多2000字符）
   - 截止时间（必填，必须是未来时间）
   - 奖金池（必填，1-1,000,000）

4. **提交创建**
   - 系统验证所有字段
   - 创建成功后跳转到市场详情页

### 表单验证规则

#### 客户端验证
- 必填字段检查
- 字符长度限制
- 截止时间必须是未来
- 奖金池范围检查

#### 服务器端验证
- 用户认证检查
- 所有客户端验证规则
- SQL注入防护
- XSS防护

## API文档

### 创建市场 API

**Endpoint**: `POST /functions/v1/create-market`

**Headers**:
```json
{
  "Content-Type": "application/json",
  "Authorization": "Bearer <access_token>"
}
```

**Request Body**:
```json
{
  "title": "市场标题",
  "description": "详细描述",
  "question": "预测问题",
  "resolution_criteria": "解决标准",
  "closes_at": "2024-12-31T23:59:59Z",
  "reward_pool": 1000
}
```

**Success Response** (201):
```json
{
  "success": true,
  "task_id": "uuid",
  "market": {
    "id": "uuid",
    "title": "市场标题",
    "status": "active",
    ...
  }
}
```

**Error Response** (400/401/500):
```json
{
  "error": "错误信息"
}
```

## 安全考虑

### 1. 认证
- 所有请求必须包含有效的JWT token
- Edge Function验证用户身份

### 2. 授权
- RLS策略确保用户只能创建自己的市场
- 用户可以查看所有公开市场

### 3. 输入验证
- 客户端和服务器端双重验证
- 防止SQL注入和XSS攻击
- 字段长度和格式限制

### 4. 数据完整性
- 外键约束确保数据一致性
- 截止时间必须是未来
- 奖金池必须大于0

## 故障排查

### 问题1: 创建市场失败
**症状**: 提交表单后返回错误

**可能原因**:
1. 用户未登录或token过期
2. 表单验证失败
3. RLS策略未正确配置

**解决方案**:
```bash
# 检查用户认证
supabase auth status

# 检查RLS策略
psql -c "SELECT * FROM pg_policies WHERE tablename = 'markets';"

# 查看Edge Function日志
supabase functions logs create-market
```

### 问题2: 创建按钮不显示
**症状**: 市场页面没有"创建市场"按钮

**可能原因**:
1. 用户未登录
2. 前端代码未正确部署

**解决方案**:
```bash
# 重新构建前端
npm run build

# 检查用户登录状态
# 在浏览器控制台执行
console.log(await supabase.auth.getUser())
```

### 问题3: RLS权限错误
**症状**: 创建市场时返回权限错误

**可能原因**:
1. RLS策略未应用
2. 用户角色配置错误

**解决方案**:
```sql
-- 检查RLS是否启用
SELECT tablename, rowsecurity FROM pg_tables WHERE tablename = 'markets';

-- 重新应用RLS策略
\i supabase/migrations/20240218000001_market_creation_rls.sql
```

## 测试

### 手动测试清单

- [ ] 未登录用户访问创建页面被重定向到登录页
- [ ] 已登录用户可以看到创建市场按钮
- [ ] 表单验证正确工作（必填字段、长度限制）
- [ ] 截止时间必须是未来时间
- [ ] 奖金池必须在有效范围内
- [ ] 提交成功后跳转到市场详情页
- [ ] 创建的市场在列表中可见
- [ ] 错误提示清晰明确

### API测试

```bash
# 获取access token
TOKEN=$(supabase auth login --email user@example.com --password password)

# 测试创建市场
curl -X POST \
  https://your-project.supabase.co/functions/v1/create-market \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "测试市场",
    "description": "这是一个测试市场",
    "question": "测试问题？",
    "resolution_criteria": "测试标准",
    "closes_at": "2024-12-31T23:59:59Z",
    "reward_pool": 1000
  }'
```

## 监控

### 关键指标

1. **创建成功率**: 成功创建的市场数 / 总请求数
2. **平均响应时间**: Edge Function响应时间
3. **错误率**: 失败请求数 / 总请求数
4. **用户参与度**: 创建市场的用户数

### 日志查看

```bash
# 查看Edge Function日志
supabase functions logs create-market --tail

# 查看数据库日志
supabase db logs
```

## 未来增强

- [ ] 支付集成（当前假设已付费）
- [ ] 多种市场类型（当前只支持二元市场）
- [ ] 市场草稿保存
- [ ] 市场编辑功能
- [ ] 批量创建市场
- [ ] 市场模板
- [ ] 创建向导

## 相关文档

- [API参考文档](./API-REFERENCE.md)
- [数据库架构](./DATABASE-MIGRATION-GUIDE.md)
- [部署指南](./PRODUCTION-DEPLOYMENT.md)
- [安全最佳实践](./SECURITY-GUIDE.md)
