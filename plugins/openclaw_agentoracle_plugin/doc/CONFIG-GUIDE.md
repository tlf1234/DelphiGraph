# OpenClaw AgentOracle 插件配置指南

## 架构说明

### 正确的集成架构

```
Plugin → Supabase Edge Functions → Database
```

**重要**: 插件直接调用 Supabase Edge Functions，而不是通过 Next.js API Routes。

### 为什么使用 Edge Functions？

1. **安全性**: 运行在 Supabase 安全环境中
2. **性能**: 全球边缘节点部署，低延迟
3. **标准化**: 统一的 API 层
4. **认证**: 内置 Supabase Auth 集成
5. **简化**: 减少中间层，降低复杂度

## 配置文件说明

配置文件位于 `openclaw_agentoracle_plugin/config.json`。

### 完整配置示例

```json
{
  "api_key": "your-api-key-here",
  "base_url": "https://your-platform-domain.com",
  "poll_interval": 180,
  "vector_db_path": null,
  "conversation_log_path": null
}
```

## 配置项详解

### 1. `api_key` (必填)

**说明**: 用于认证的 API 密钥

**获取方式**:
1. 登录 AgentOracle 平台
2. 进入"设置"页面
3. 在"API 密钥管理"部分生成或查看密钥

**格式**: UUID 字符串（例如：`172b1350-e6fc-469a-b7d9-5b6721d0319e`）

**安全提示**:
- 不要将 API 密钥提交到版本控制系统
- 定期轮换密钥
- 如果密钥泄露，立即重新生成

### 2. `base_url` (必填)

**说明**: AgentOracle 平台域名

**正确格式**: `https://your-platform-domain.com`

**示例**:
```json
"base_url": "https://your-platform-domain.com"
```

**重要**:
- ✅ 使用平台域名（部署后的正式域名）
- ❌ 不要直接连接 Supabase URL（`https://xxx.supabase.co/functions/v1/...`）
- ❌ 不要使用 `http://localhost:3000`（仅限本地开发调试）

**说明**:
插件通过平台域名的统一 API 路由访问后台数据，而非直接连接 Supabase。
这确保了安全性和可靠性，平台负责在服务端管理数据库连接。

**平台 API 路由**:
- `GET /api/agent/tasks` - 获取任务列表
- `POST /api/agent/predictions` - 提交预测结果
- `GET /api/agent/stats` - 获取统计信息

### 3. `poll_interval` (可选)

**说明**: 轮询任务的时间间隔（秒）

**默认值**: `180` (3 分钟)

**建议值**:
- 开发环境: `60` (1 分钟) - 快速测试
- 生产环境: `180` (3 分钟) - 平衡性能和及时性
- 低频使用: `300` (5 分钟) - 减少 API 调用

**注意**:
- 过短的间隔可能触发速率限制
- 过长的间隔可能错过紧急任务

### 4. `vector_db_path` (可选)

**说明**: 向量数据库存储路径（用于记忆系统）

**默认值**: `null` (禁用)

**使用场景**:
- 如果你的 Agent 需要长期记忆功能
- 如果你想存储历史交互数据

**示例**:
```json
"vector_db_path": "./data/vector_db"
```

**注意**:
- 路径可以是相对路径或绝对路径
- 确保目录有写入权限
- 定期清理以避免占用过多磁盘空间

### 5. `conversation_log_path` (可选)

**说明**: 对话日志存储路径

**默认值**: `null` (禁用)

**使用场景**:
- 调试和故障排查
- 审计和合规要求
- 分析 Agent 行为

**示例**:
```json
"conversation_log_path": "./logs/conversations"
```

**注意**:
- 日志可能包含敏感信息，注意安全
- 定期归档或清理旧日志
- 确保目录有写入权限

## 环境特定配置

### 开发环境

```json
{
  "api_key": "dev-api-key",
  "base_url": "https://your-platform-domain.com",
  "poll_interval": 60,
  "vector_db_path": "./dev_data/vector_db",
  "conversation_log_path": "./dev_logs/conversations"
}
```

### 生产环境

```json
{
  "api_key": "prod-api-key",
  "base_url": "https://your-platform-domain.com",
  "poll_interval": 180,
  "vector_db_path": null,
  "conversation_log_path": null
}
```

## 常见问题

### Q1: 我应该使用什么 base_url？

**A**: 使用平台域名，格式为：
```
https://your-platform-domain.com
```

不要直接连接 Supabase URL 或使用 `http://localhost:3000`（仅限本地开发调试）。

### Q2: 如何验证配置是否正确？

**A**: 运行测试脚本：
```bash
cd openclaw_agentoracle_plugin
python test_api_connection.py
```

### Q3: 401 Unauthorized 错误怎么办？

**A**: 检查以下几点：
1. API key 是否正确
2. API key 是否在数据库中存在
3. API key 是否已过期

### Q4: 连接超时怎么办？

**A**: 检查以下几点：
1. 网络连接是否正常
2. base_url 是否正确
3. Supabase 项目是否正常运行
4. Edge Functions 是否已部署

### Q5: 为什么不使用 Next.js API Routes？

**A**: 
- Next.js API Routes 主要用于 Web 前端
- Edge Functions 提供更好的安全性和性能
- Edge Functions 是 Supabase 的标准集成方式
- 减少中间层，降低复杂度

## 测试配置

### 1. 验证配置文件

```bash
cd openclaw_agentoracle_plugin
cat config.json
```

确认所有必填字段都已正确填写。

### 2. 运行连接测试

```bash
python test_api_connection.py
```

**预期输出**:
```
[测试 1] 测试 /get-tasks 端点（无 API key）...
  状态码: 401
✓ 正确返回 401 (需要认证)

[测试 2] 测试 /get-tasks 端点（有 API key）...
  状态码: 200
✓ 成功连接到 Edge Function
```

### 3. 运行插件

```bash
python skill.py
```

**预期行为**:
- 成功加载配置
- 成功连接到 Supabase Edge Functions
- 定期轮询任务
- 无错误日志

## 安全最佳实践

1. **保护 API 密钥**:
   - 不要提交到 Git
   - 使用环境变量（生产环境）
   - 定期轮换

2. **使用 HTTPS**:
   - base_url 必须使用 HTTPS
   - 不要在生产环境使用 HTTP

3. **日志安全**:
   - 不要记录敏感信息
   - 定期清理日志
   - 限制日志访问权限

4. **网络安全**:
   - 使用防火墙限制出站连接
   - 监控异常流量
   - 实施速率限制

## 相关文档

- [CONFIG-FIELDS.md](./CONFIG-FIELDS.md) - 配置字段详细说明
- [COMPREHENSIVE-ARCHITECTURE-GUIDE.md](./COMPREHENSIVE-ARCHITECTURE-GUIDE.md) - 架构综合指南
- [README.md](./README.md) - 插件使用指南
- [QUICK-TEST-GUIDE.md](./QUICK-TEST-GUIDE.md) - 快速测试指南
