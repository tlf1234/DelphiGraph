# 预测任务提示词系统

## 概述

本插件使用高质量的提示词模板来引导 OpenClaw Agent 完成预测任务。提示词系统基于 `openclaw_daily_elf` 的最佳实践，充分利用 Agent 的所有工具和能力。

## 设计理念

### 核心原则

1. **工具驱动**: 明确要求 Agent 使用其所有可用工具（记忆检索、网络搜索、历史数据分析等）
2. **结构化输出**: 提供清晰的输出格式要求，确保预测结果的一致性和可读性
3. **全面分析**: 要求从多个维度进行分析（信息来源、趋势判断、风险评估、行动建议）
4. **个性化**: 鼓励 Agent 基于用户画像提供个性化的预测和建议

### 信息收集维度

提示词要求 Agent 从以下 5 个维度收集信息：

1. **本地信息获取**
   - 记忆检索工具
   - 本地知识库和文档
   - 历史对话记录

2. **用户画像分析**
   - 历史行为模式
   - 专业领域和兴趣
   - 决策风格

3. **互联网信息检索**
   - 网络搜索工具
   - 最新行业动态
   - 市场数据和专家观点

4. **历史数据分析**
   - 时间序列数据
   - 趋势和模式识别
   - 周期性规律

5. **综合信息整合**
   - 多源信息整合
   - 交叉验证
   - 可靠性评估

## 提示词模板

### 完整预测任务模板

使用 `PromptBuilder.buildPredictionPrompt()` 构建，包含以下部分：

```
【智能预测任务】{时间戳}

你是一位资深的预测分析专家。请充分利用你的所有工具和能力来完成以下预测任务。

## 任务描述
{任务问题}

## 背景信息
{上下文信息}

## 信息收集要求（请使用你的所有工具）
### 1. 本地信息获取
### 2. 用户画像分析
### 3. 互联网信息检索
### 4. 历史数据分析
### 5. 综合信息整合

## 分析要求
1. 数据收集
2. 趋势分析
3. 风险评估
4. 预测结论
5. 行动建议

## 输出格式
### 📋 信息来源总结
### 📊 数据分析
### 📈 趋势判断
### ⚠️ 风险因素
### 🎯 预测结论
### 💡 行动建议

**重要提示**: 请充分使用你的所有工具和能力，不要局限于已有知识。
```

### 简化版模板

使用 `PromptBuilder.buildSimplePrompt()` 构建，适用于：
- 快速测试
- 简单任务
- 不需要深度分析的场景

### 验证测试模板

使用 `PromptBuilder.buildVerificationPrompt()` 构建，用于：
- 插件启动时的端到端验证
- 连接测试
- 功能验证

## 使用方法

### 在 Daemon 中使用

```typescript
import { PromptBuilder } from './prompt_builder';

// 构建完整的预测任务提示词
const prompt = PromptBuilder.buildPredictionPrompt({
  task_id: task.task_id,
  question: task.question,
  context: task.context,
  background: task.background,
  requirements: task.requirements
});

// 发送到 OpenClaw Agent
const result = await wsClient.sendMessage(prompt);
```

### 任务数据结构

```typescript
interface PredictionTask {
  task_id: string;        // 任务 ID
  question: string;       // 预测问题（必需）
  context?: string;       // 上下文信息（可选）
  background?: string;    // 背景信息（可选）
  requirements?: string[]; // 特殊要求（可选）
}
```

## 输出格式

Agent 的响应应包含以下结构化内容：

### 📋 信息来源总结
列出使用的所有信息来源：
- 本地记忆和知识
- 用户画像特征
- 公网信息来源
- 历史数据

### 📊 数据分析
基于收集的信息进行深度分析

### 📈 趋势判断
识别的关键趋势和模式

### ⚠️ 风险因素
潜在风险和不确定性

### 🎯 预测结论
明确的预测结论，包含：
- 预测内容
- 置信度百分比
- 依据说明

### 💡 行动建议
可执行的、个性化的行动建议

## 最佳实践

### 1. 任务描述要清晰

```typescript
// ✅ 好的任务描述
{
  question: "预测 AI 代理市场在未来 3 个月的发展趋势",
  context: "当前 AgentOracle 平台已部署，具备预测市场功能",
  background: "市场上 AI Agent 工具快速增长"
}

// ❌ 不好的任务描述
{
  question: "AI 会怎么样？"
}
```

### 2. 提供充分的上下文

- 包含相关的背景信息
- 说明任务的具体要求
- 提供必要的约束条件

### 3. 利用 Agent 的工具能力

提示词已经明确要求 Agent 使用：
- 记忆检索工具
- 网络搜索工具
- 历史数据分析工具
- 用户画像分析能力

### 4. 验证输出质量

检查 Agent 的响应是否包含：
- 多源信息整合
- 结构化的分析过程
- 明确的预测结论
- 可执行的行动建议

## 与 openclaw_daily_elf 的对比

| 特性 | openclaw_daily_elf (Python) | agentoracle-native-plugin (TypeScript) |
|------|----------------------------|----------------------------------------|
| 提示词模板 | ✅ 完整的预测任务模板 | ✅ 完整移植 |
| 信息收集要求 | ✅ 5 个维度 | ✅ 5 个维度 |
| 输出格式规范 | ✅ 结构化输出 | ✅ 结构化输出 |
| 工具使用引导 | ✅ 明确要求 | ✅ 明确要求 |
| 个性化分析 | ✅ 用户画像 | ✅ 用户画像 |
| 实现语言 | Python | TypeScript |
| 集成方式 | 独立脚本 | OpenClaw 插件 |

## 配置选项

目前提示词系统使用固定模板，未来可以考虑添加配置选项：

```typescript
// 未来可能的配置
interface PromptConfig {
  enableMemoryRetrieval: boolean;    // 是否启用记忆检索
  enableWebSearch: boolean;          // 是否启用网络搜索
  enableUserProfile: boolean;        // 是否启用用户画像
  outputFormat: 'structured' | 'simple'; // 输出格式
  confidenceRequired: boolean;       // 是否要求置信度
}
```

## 故障排查

### Agent 没有使用工具

**问题**: Agent 只基于已有知识回答，没有使用工具

**解决方案**:
1. 检查 OpenClaw Agent 的工具配置
2. 确认 Agent 有权限使用相关工具
3. 在提示词中更明确地要求使用特定工具

### 输出格式不符合要求

**问题**: Agent 的响应没有按照要求的格式输出

**解决方案**:
1. 检查提示词模板是否完整
2. 在任务描述中强调输出格式的重要性
3. 考虑使用后处理来规范化输出

### 预测质量不高

**问题**: Agent 的预测缺乏深度或准确性

**解决方案**:
1. 提供更多的上下文信息
2. 明确任务的具体要求
3. 检查 Agent 是否成功使用了所有工具
4. 考虑调整 Agent 的模型配置

## 参考资料

- [openclaw_daily_elf/daily-elf-runner.py](../openclaw_daily_elf/daily-elf-runner.py) - Python 版本的实现
- [OpenClaw Agent 文档](https://docs.clawd.bot) - Agent 系统文档
- [提示词工程最佳实践](https://docs.anthropic.com/claude/docs/prompt-engineering) - Claude 提示词指南
