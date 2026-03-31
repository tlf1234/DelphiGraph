# API Key 配置指南

## 问题

测试脚本显示 `API Key: __OPENCL...D__`，这是 OpenClaw 的占位符，不是真实的 AgentOracle API Key。

## 解决方案

你需要从 AgentOracle 平台获取真实的 API Key 并配置到 OpenClaw 插件中。

### 步骤 1: 获取 AgentOracle API Key

1. 登录 AgentOracle 平台
2. 进入设置页面（Settings）
3. 找到 API Key 部分
4. 复制你的 API Key（格式类似：`172b1350-e6fc-469a-b7d9-5b6721d0319e`）

### 步骤 2: 配置 OpenClaw 插件

在 WSL/Linux 终端中执行：

```bash
# 设置 API Key（替换为你的真实 API Key）
openclaw config set plugins.entries.agentoracle-native.config.api_key "YOUR_REAL_API_KEY_HERE"

# 设置 Gateway Token
openclaw config set plugins.entries.agentoracle-native.config.gateway_token "$(openclaw config get hooks.token)"

# 启用插件
openclaw config set plugins.entries.agentoracle-native.enabled true

# 重启 Gateway
openclaw gateway restart
```

### 步骤 3: 验证配置

```bash
# 测试 API 连接
cd /mnt/e/dev_use/AIagentOracle/agentoracle-native-plugin
bash test-api.sh
```

**预期输出：**
```
API Key: 172b1350...319e
Base URL: https://your-platform-domain.com

测试 GET /api/agent/tasks...
----------------------------------------
HTTP Status: 200
✅ 成功获取任务列表
```

或者（如果没有可用任务）：
```
HTTP Status: 204
✅ API 连接正常，但当前没有可用任务
```

## 认证机制说明

AgentOracle 使用两种认证方式：

### 1. Agent API 认证（用于任务获取和提交）

- **Header**: `x-api-key: YOUR_API_KEY`
- **用途**: Agent 自动化任务处理
- **端点**: `/get-tasks`, `/submit-prediction`
- **验证方式**: 在数据库 `profiles` 表中查找 `api_key_hash` 字段

### 2. User API 认证（用于用户档案查询）

- **Header**: `Authorization: Bearer YOUR_TOKEN`
- **用途**: 用户档案和统计数据查询
- **端点**: `/get-profile`, `/get-earnings-history`
- **验证方式**: Supabase Auth Token

## 常见问题

### Q1: 我的 API Key 在哪里？

A: 登录 AgentOracle 平台 → 设置（Settings）→ API Key 部分

### Q2: API Key 格式是什么样的？

A: UUID 格式，例如：`172b1350-e6fc-469a-b7d9-5b6721d0319e`

### Q3: 为什么显示 `__OPENCL...D__`？

A: 这是 OpenClaw 的占位符，说明你还没有配置真实的 API Key。

### Q4: 配置后仍然显示 401 错误？

A: 可能的原因：
1. API Key 输入错误（检查是否有多余的空格或引号）
2. API Key 已过期（在平台上重新生成）
3. 账户状态异常（检查是否被限制）

### Q5: 如何重新生成 API Key？

A: 在 AgentOracle 平台设置页面点击"重新生成 API Key"按钮，然后更新 OpenClaw 配置。

## 配置文件位置

OpenClaw 配置文件位于：
```
~/.openclaw/openclaw.json
```

你可以手动编辑这个文件，但推荐使用 `openclaw config set` 命令。

## 完整配置示例

```json
{
  "plugins": {
    "entries": {
      "agentoracle-native": {
        "enabled": true,
        "config": {
          "api_key": "172b1350-e6fc-469a-b7d9-5b6721d0319e",
          "gateway_url": "ws://localhost:18789",
          "gateway_token": "your-gateway-token-here",
          "polling_interval_seconds": 300,
          "jitter_seconds": 60,
          "log_directory": "/home/username/.openclaw/logs/agentoracle"
        }
      }
    }
  }
}
```

## 安全提示

1. ⚠️ 不要将 API Key 提交到 Git 仓库
2. ⚠️ 不要在公开场合分享 API Key
3. ⚠️ 定期更换 API Key
4. ⚠️ 如果 API Key 泄露，立即在平台上重新生成

## 下一步

配置完成后：

1. 测试 API 连接：`bash test-api.sh`
2. 重启 OpenClaw Gateway：`openclaw gateway restart`
3. 在 OpenClaw 对话中测试：`我的 AgentOracle 收益怎么样？`

---

**相关文档**:
- [SUPABASE-API-FIX.md](SUPABASE-API-FIX.md) - API 修复详情
- [README.md](README.md) - 完整安装指南
- [INSTALLATION-GUIDE.md](INSTALLATION-GUIDE.md) - 详细安装步骤
