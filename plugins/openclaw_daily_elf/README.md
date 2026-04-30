# OpenClaw 智能预测助手 (生产级)

通过 WebSocket 连接到 OpenClaw Gateway，利用 AI 进行智能预测分析。

## 🚀 新特性 (生产级优化 v1.1.1)

- ✅ **自动重连**: 连接失败自动重试（最多3次）
- ✅ **指数退避**: 重试间隔逐渐增加（2秒、4秒、8秒）
- ✅ **长文本支持**: 5分钟超时，支持大规模文本传输
- ✅ **心跳保活**: 30秒心跳间隔，保持连接稳定
- ✅ **进度显示**: 实时显示接收进度和字符数
- ✅ **完善的错误处理**: 详细的错误日志和异常处理
- ✅ **连接超时保护**: 多层超时机制防止卡死
- ✅ **边界原则**: 不直接读取 OpenClaw 内部文件，让 Agent 使用自己的工具

## 功能

- 🎯 **任务发起**: 通过 WebSocket 向 OpenClaw 发起预测任务
- 🔍 **全面信息收集**: OpenClaw 使用它的所有工具获取信息
  - 📝 本地记忆和历史交互
  - 👤 用户画像和行为分析
  - 🌐 公网信息和最新动态
  - 📊 历史数据和趋势分析
- 🧠 **智能分析**: 基于 OpenClaw AI 进行深度分析
- 📊 **趋势预测**: 识别趋势、评估风险、给出预测结论
- 💾 **结果保存**: 自动保存预测报告到本地
- 📝 **日志记录**: 完整的执行日志

## 设计理念

**插件职责**：发起任务要求 → 接收结果  
**OpenClaw 职责**：使用所有工具获取信息 → 分析总结 → 生成预测

我们不直接读取 OpenClaw 的内部数据，而是通过提示词指示 OpenClaw 使用它自己的所有工具和能力。这样可以：
- ✅ 保持边界清晰
- ✅ 充分利用 OpenClaw 的所有能力
- ✅ 获取最全面的信息（本地记忆 + 用户画像 + 公网信息 + 历史数据）

详见 `DESIGN-PHILOSOPHY.md`

## 使用方法

### 1. 快速开始

双击 `run.bat` 启动脚本，将执行示例预测任务。

### 2. 自定义预测任务

编辑 `daily-elf-runner.py` 中的 `task_description`：

```python
task_description = """
预测任务：你的预测主题

背景信息：
- 相关背景1
- 相关背景2

请分析：
1. 分析点1
2. 分析点2
"""
```

### 3. 手动运行

```bash
python daily-elf-runner.py
```

## 预测任务示例

### 示例 1: 市场趋势预测
```
预测任务：AI 代理市场在未来 3 个月的发展趋势

背景信息：
- 当前市场规模和增长率
- 主要竞争对手情况
- 技术发展现状

请分析：
1. 市场增长潜力
2. 用户采用率变化
3. 技术突破点
4. 竞争格局演变
5. 投资价值评估
```

### 示例 2: 技术趋势预测
```
预测任务：大语言模型在企业应用中的普及速度

背景信息：
- 当前企业采用率
- 成本和效益分析
- 技术成熟度

请分析：
1. 采用障碍和驱动因素
2. 预期普及时间线
3. 关键应用场景
4. ROI 预期
```

### 示例 3: 个人决策预测
```
预测任务：学习新技术栈的投资回报

背景信息：
- 当前技能水平
- 市场需求趋势
- 学习时间成本

请分析：
1. 技能市场价值
2. 学习曲线评估
3. 职业发展影响
4. 时间投入建议
```

## 输出结果

### 控制台输出
- 实时显示分析过程
- 显示完整的预测结论

### 文件输出
预测报告自动保存到 `predictions/` 目录：
- 文件名格式: `prediction_YYYYMMDD_HHMMSS.md`
- 包含完整的任务描述和分析结果
- Markdown 格式，易于阅读和分享

### 日志文件
详细日志保存在 `logs/elf-runner.log`：
- 连接状态
- 消息发送和接收记录
- 错误信息

## 配置

在 `daily-elf-runner.py` 中修改以下配置：

```python
GATEWAY_WS_URL = "ws://127.0.0.1:18789"  # OpenClaw Gateway 地址
GATEWAY_TOKEN = "your-token-here"         # 你的 Gateway Token
TIMEOUT = 300                             # 总超时时间（秒），默认5分钟
MAX_RETRIES = 3                           # 最大重试次数
RETRY_DELAY_BASE = 2                      # 重试延迟基数（秒）
CONNECT_TIMEOUT = 10                      # 连接超时（秒）
MESSAGE_TIMEOUT = 20                      # 单个消息超时（秒）
```

### 超时配置说明

- **TIMEOUT (300秒)**: 整个任务的最大执行时间，适合大文本分析
- **CONNECT_TIMEOUT (10秒)**: 建立连接的超时时间
- **MESSAGE_TIMEOUT (20秒)**: 等待单个消息的超时时间
- **心跳间隔 (30秒)**: 自动发送心跳保持连接

### 重试机制说明

连接失败时会自动重试，重试间隔采用指数退避：
- 第1次重试：等待 2 秒
- 第2次重试：等待 4 秒
- 第3次重试：等待 8 秒

## 稳定性测试

运行稳定性测试脚本：

```bash
python test_stability.py
# 或
test_stability.bat
```

测试结果：⭐⭐⭐⭐⭐ 优秀 - 100% 通过率

## 定时任务设置

可以使用 Windows 任务计划程序设置定期预测分析：

1. 打开"任务计划程序"
2. 创建基本任务
3. 触发器：选择频率（每天/每周/每月）
4. 操作：启动程序
   - 程序/脚本：`E:\dev_use\AIagentOracle\openclaw_daily_elf\run.bat`
   - 起始于：`E:\dev_use\AIagentOracle\openclaw_daily_elf`

建议频率：
- 市场趋势预测：每周一次
- 技术趋势预测：每月一次
- 个人决策分析：按需运行

## 日志

日志文件保存在 `logs/elf-runner.log`，包含：
- 连接状态
- 消息发送和接收记录
- 错误信息

## 技术说明

### OpenClaw Gateway Protocol v3

消息格式：
```json
{
  "type": "event",
  "event": "chat",
  "payload": {
    "runId": "...",
    "sessionKey": "...",
    "seq": 2,
    "state": "delta",  // 或 "final" 表示完成
    "message": {
      "role": "assistant",
      "content": [
        {
          "type": "text",
          "text": "实际的回复内容"
        }
      ],
      "timestamp": 1772531747692
    }
  }
}
```

关键点：
- `message` 字段是字典，文本内容在 `message["content"][0]["text"]`
- `state` 字段：`"delta"` = 流式更新，`"final"` = 最终消息
- 每次 delta 更新都包含完整消息（非增量）

## 依赖

- Python 3.9+
- websockets 库

安装依赖：
```bash
pip install websockets
```

## 故障排除

如果遇到连接问题：

1. 确认 OpenClaw Gateway 正在运行
2. 检查 Gateway 地址和端口是否正确
3. 验证 Gateway Token 是否有效
4. 查看日志文件获取详细错误信息
