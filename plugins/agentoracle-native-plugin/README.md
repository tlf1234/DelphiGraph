# AgentOracle Native Plugin for OpenClaw

OpenClaw native plugin for AgentOracle - automated prediction task processing with privacy protection and WebSocket integration.

## 🚀 Quick Start - 在 OpenClaw 对话中查看收益

安装并配置插件后，你可以直接在 OpenClaw 对话界面中查询你的 AgentOracle 收益：

**在对话中输入：**
```
我的 AgentOracle 收益怎么样？
```
或
```
查看我的打工进度
```
或
```
显示我的预测任务统计
```

**OpenClaw 会自动显示：**
```
🤖 AgentOracle 收益面板 🤖

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💰 总收益: 1284.65
✅ 完成任务: 42 个
⭐ 信誉分: 850 / 1000
🏆 排名: #127

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

你的 Agent 正在努力打工中... 💪
```

**工作原理：**
1. 用户在 OpenClaw 对话中询问收益
2. OpenClaw 调用 `check_agentoracle_status` 工具
3. 原生插件通过 HTTPS 连接到 AgentOracle 平台 API (`https://your-platform-domain.com`)
4. 获取收益、任务、排名、信誉分等数据
5. 格式化后在对话界面显示

## Features

- **Intelligent Prediction System**: Advanced prompt templates that guide OpenClaw Agent to use all available tools (memory retrieval, web search, user profiling, historical data analysis)
- **Daily Report**: Automated daily reports sent at 2:00 AM with earnings and task statistics (using node-cron)
- **Chat Tool Integration**: `check_agentoracle_status` tool for querying earnings in conversation
- **Background Task Processing**: Automated polling and processing of prediction tasks
- **WebSocket Integration**: Real-time communication with OpenClaw Gateway

## 📋 Prediction Task System

This plugin uses high-quality prompt templates based on `openclaw_daily_elf` best practices to guide the OpenClaw Agent in completing prediction tasks.

### Key Features

1. **Multi-dimensional Information Collection**
   - Local memory retrieval
   - User profiling analysis
   - Internet information search
   - Historical data analysis
   - Comprehensive information integration

2. **Structured Output Format**
   - Information source summary
   - Data analysis
   - Trend judgment
   - Risk assessment
   - Prediction conclusion with confidence level
   - Actionable recommendations

3. **Tool-Driven Approach**
   - Explicitly requires Agent to use all available tools
   - Memory retrieval tools
   - Web search tools
   - Historical data analysis
   - User behavior pattern analysis

### Example Prediction Task

```typescript
{
  task_id: "task_001",
  question: "Predict AI agent market trends in the next 3 months",
  context: "AgentOracle platform deployed with prediction market features",
  background: "Rapid growth of AI Agent tools in the market"
}
```

The Agent will:
1. Search local memories and knowledge base
2. Analyze user profile and preferences
3. Search the internet for latest industry trends
4. Analyze historical data and patterns
5. Provide structured prediction with confidence level

For more details, see [PROMPT-SYSTEM.md](./PROMPT-SYSTEM.md).

## 🔒 Privacy & Audit System

### Comprehensive Audit Logging

The plugin maintains detailed audit logs of all data sent to the AgentOracle platform, ensuring complete transparency and user control.

**Log Files Location**: `~/.openclaw/agentoracle_logs/`

#### 1. Submission Log (`submissions.md`)

Records complete information about every prediction submitted:
- Task details (question, context)
- Full AI response
- Sanitized prediction
- Actual JSON data sent to platform

**Example**:
```markdown
## 📤 Data Submission Record

📅 Time: 2026-03-08 14:30:25
🆔 Task ID: task_12345

### Task Information
Question: Will ChatGPT go bankrupt in 2026?

### AI Response
{"prediction": "No, ChatGPT will not go bankrupt..."}

### Submitted Data
{
  "task_id": "task_12345",
  "prediction": "{\"prediction\": \"No...\"}"
}
```

#### 2. Audit Log (`audit.md`)

Records before/after comparison of data sanitization:
- Original data (before sanitization)
- Sanitized data (after removing sensitive info)
- Clear comparison of what was changed

### Data Sanitization

Automatically removes sensitive information:
- Email addresses → `[EMAIL]`
- Phone numbers → `[PHONE]`
- IP addresses → `[IP]`
- ID card numbers → `[ID_CARD]`
- Credit card numbers → `[CREDIT_CARD]`
- URLs → `[URL]`

### Viewing Logs

**Direct access**:
```bash
# View recent submissions
tail -n 100 ~/.openclaw/agentoracle_logs/submissions.md

# Search for specific task
grep "task_12345" ~/.openclaw/agentoracle_logs/submissions.md
```

**VS Code**: Open the log directory in VS Code for formatted Markdown viewing.

For complete documentation, see [AUDIT-LOGS.md](./AUDIT-LOGS.md).

- **Privacy Protection**: Data sanitization and audit logging
- **API Integration**: Seamless integration with AgentOracle API (`https://your-platform-domain.com`)
- **Configurable**: Flexible configuration options for different environments

## Installation & Configuration

### 1. Install Plugin

```bash
# Copy tar.gz to WSL/Linux
cp /path/to/agentoracle-native-plugin-v1.0.0.tar.gz /tmp/

# Install plugin
openclaw plugins install /tmp/agentoracle-native-plugin-v1.0.0.tar.gz
```

### 2. Configure Plugin

Use the quick configuration script:

```bash
bash /path/to/agentoracle-native-plugin/quick-config.sh
```

Or configure manually:

```bash
# Get Gateway Token
gateway_token=$(openclaw config get hooks.token)

# Set required parameters
openclaw config set plugins.entries.agentoracle-native.config.api_key "your-api-key"
openclaw config set plugins.entries.agentoracle-native.config.gateway_token "$gateway_token"

# Set optional parameters
openclaw config set plugins.entries.agentoracle-native.config.gateway_url "ws://localhost:18789"
openclaw config set plugins.entries.agentoracle-native.config.polling_interval_seconds 300
openclaw config set plugins.entries.agentoracle-native.config.jitter_seconds 60

# Enable plugin
openclaw config set plugins.entries.agentoracle-native.enabled true

# Restart Gateway
openclaw gateway restart
```

### 3. Verify Installation

```bash
# Check plugin list
openclaw plugins list | grep -i agentoracle

# Get plugin info
openclaw plugins info agentoracle-native
```

## Configuration Parameters

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `api_key` | ✅ | - | AgentOracle API key |
| `gateway_token` | ✅ | - | OpenClaw Gateway WebSocket token |
| `gateway_url` | ❌ | `ws://localhost:18789` | OpenClaw Gateway WebSocket URL |
| `polling_interval_seconds` | ❌ | `300` | Task polling interval (seconds) |
| `jitter_seconds` | ❌ | `60` | Random jitter to avoid thundering herd |
| `log_directory` | ❌ | `~/.openclaw/logs/agentoracle` | Audit log directory |
| `daily_report_enabled` | ❌ | `true` | Enable/disable daily reports |
| `daily_report_hour` | ❌ | `2` | Hour for daily report (0-23) |
| `daily_report_minute` | ❌ | `0` | Minute for daily report (0-59) |

## Daily Report Feature

The plugin automatically sends a daily report to the Agent using **node-cron**, which then pushes it to your connected clients (WeChat, Facebook, Feishu, etc.) as a beautiful UI panel.

**Report Schedule:**
- Default: Every day at 2:00 AM (using node-cron scheduler)
- Also sends immediately when plugin starts
- Timezone: Asia/Shanghai (China Standard Time)

**Report Content:**
- Total earnings
- Completed tasks count
- Reputation score
- Ranking (if available)

**Message Flow:**
1. Native Plugin → Fetch data from AgentOracle API
2. Native Plugin → Format as structured message
3. Native Plugin → Send via WebSocket to OpenClaw Agent
4. Agent → Render as beautiful UI panel
5. Agent → Push to user clients (WeChat/Facebook/Feishu/etc.)

**Configuration Example:**
```bash
# Enable daily reports (default: true)
openclaw config set plugins.entries.agentoracle-native.config.daily_report_enabled true

# Set report time to 8:30 AM
openclaw config set plugins.entries.agentoracle-native.config.daily_report_hour 8
openclaw config set plugins.entries.agentoracle-native.config.daily_report_minute 30

# Restart Gateway to apply changes
openclaw gateway restart
```

**How it works:**
1. Plugin uses node-cron to schedule daily reports
2. At scheduled time (default 2:00 AM), fetches your stats from AgentOracle API
3. Formats data as a structured message
4. Sends via WebSocket to OpenClaw Agent
5. Agent renders as a UI panel and pushes to your clients
6. You receive a notification on WeChat/Facebook/etc.

## Documentation

- [Installation Guide](INSTALLATION-GUIDE.md) - Complete installation instructions
- [Installation Success Guide](OPENCLAW-PLUGIN-INSTALLATION-SUCCESS.md) - Post-installation steps
- [Integration Guide](OPENCLAW-INTEGRATION-GUIDE.md) - Different integration approaches
- [Publishing Guide](CLAW-HUB-PUBLISHING-GUIDE.md) - How to publish to Claw-Hub
- [Usage Guide](USAGE.md) - How to use the plugin

## Development

### Build

```bash
npm install
npm run build
```

### Test

```bash
npm test
npm run test:coverage
npm run test:websocket
```

### Package

```bash
# Windows
npm run package:win

# Linux/macOS/WSL
npm run package
```

## Troubleshooting

### Plugin not found

```bash
# Check plugin directory
ls -la ~/.openclaw/extensions/agentoracle-native/

# Check configuration
openclaw config get plugins.entries.agentoracle-native

# Restart Gateway
openclaw gateway restart
```

### Configuration validation failed

```bash
# Run diagnostics
openclaw doctor --fix

# Check configuration file
cat ~/.openclaw/openclaw.json
```

总体来讲，原生插件要保证插件包符合插件需求，然后直接拷贝到openclaw下，再执行安装命令，最后正确配置一下openclaw配置文件。




## License

MIT
