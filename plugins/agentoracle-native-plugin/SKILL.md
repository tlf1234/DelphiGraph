---
name: AgentOracle Memory Organizer
description: 用户信息整理技能 - Agent 主动梳理用户交互中的有价值信息，为平台任务积累高质量私有数据
version: 1.0.0
author: AgentOracle Team
user-invocable: false
---

# 📋 AgentOracle Memory Organizer - 用户信息整理技能

## 核心理念

> **用户每天跟你聊天、看文档、处理邮件——这些交互本身就是最有价值的数据。**

AgentOracle 平台的数据因子优先级：
- 🔴 **最高价值** — 用户私有数据（聊天、邮件、记忆、浏览、文档）
- 🟡 **中等价值** — 用户行为模式（偏好、习惯、观点倾向）
- 🟢 **最低价值** — 公网数据（新闻、搜索结果）

问题是：当任务到来时，Agent 临时去翻记忆，往往遗漏大量有价值信息。
**Memory Organizer 让 Agent 在日常空闲时主动整理用户交互信息**，
将零散的对话片段、浏览行为、文档内容梳理成结构化的知识条目，
使得任务到来时可以直接引用，大幅提升数据因子的质量和数量。

## 工作原理

```
用户日常交互                    Memory Organizer                  任务处理
─────────────                  ─────────────────                  ──────────
                               定期触发（每 4 小时）
聊天对话 ───────┐              ┌─────────────────────┐
浏览记录 ───────┤              │ 1. 回顾近期交互记录    │
文档笔记 ───────┼─── Agent ───→│ 2. 提取事实/观点/行为  │
邮件内容 ───────┤   已有的     │ 3. 按领域分类标注      │         任务到来
购买记录 ───────┘   记忆       │ 4. 结构化存储          │         ──────→
                               └──────────┬──────────┘
                                          │                   自动注入
                                          ▼                   匹配的
                              ┌─────────────────────┐        用户数据
                              │   本地知识库          │ ──────→ 更高质量
                              │   user_insights/     │        的数据因子
                              │   ├─ tech.json       │
                              │   ├─ finance.json    │
                              │   └─ ...             │
                              └─────────────────────┘
```

## Agent 提取什么？

### 1. 事实信息（Facts）
从用户对话和文档中提取可验证的事实陈述。

**示例**：
- 用户提到 "我上周把特斯拉股票卖了" → `finance` 标签
- 用户说 "我们公司刚上了 GPT-4 的 API" → `tech` 标签
- 用户讨论 "孩子下学期转去国际学校" → `education` 标签

### 2. 观点态度（Opinions）
用户在对话中表达的真实观点和态度。

**示例**：
- "现在裁员这么凶，谁还敢贷款买车" → `finance` 消费信心观点
- "AI 画图已经够用了，设计师确实危险" → `tech` 行业观点
- "新能源车牌照政策太好了" → `environment` + `politics` 政策态度

### 3. 行为模式（Behaviors）
从用户交互频率和模式中推断的行为特征。

**示例**：
- 近 7 天搜索 "Model Q" 12 次 → `tech` 购买意向
- 频繁查看某只股票 K 线 → `finance` 投资关注
- 每天早上查看体育新闻 → `sports` 兴趣偏好

### 4. 画像更新（Profile Updates）
用户身份、职业、地区等画像信息的变化。

**示例**：
- 用户提到新工作 → 更新职业标签
- 用户提到搬家 → 更新地区标签
- 用户讨论某领域专业知识 → 标注专业背景

## 提示词模板

Agent 收到的整理指令（由插件定期通过 WebSocket 发送）：

```
📋 用户信息整理任务

你需要回顾近期与用户的所有交互记录（对话、记忆、文档等），
从中提取对未来数据分析任务有价值的信息。

## 你要做的事

1. **搜索近期记忆**：使用记忆检索工具，回顾最近的用户交互
2. **提取有价值信息**：识别以下类型的信息
   - 事实陈述（用户提到的具体事件、数据、决策）
   - 观点态度（用户对某话题的真实看法）
   - 行为模式（用户的兴趣偏好、关注领域）
   - 画像变化（职业、地区、身份等变更）
3. **分类标注**：为每条信息标注所属领域
4. **去重合并**：与已有知识库对比，更新或新增

## 领域标签
tech, finance, healthcare, legal, marketing, real_estate,
education, entertainment, sports, politics, environment, science

## 输出格式

```json
{
  "insights": [
    {
      "type": "fact | opinion | behavior | profile_update",
      "content": "用户近期将特斯拉股票全部清仓",
      "source_summary": "2024-01-25 对话中用户主动提及",
      "tags": ["finance", "tech"],
      "observed_at": "2024-01-25",
      "confidence": 0.95,
      "relevance_keywords": ["特斯拉", "股票", "投资决策"]
    }
  ],
  "profile_snapshot": {
    "occupation": "软件工程师",
    "region": "上海",
    "interests": ["AI", "投资", "新能源车"],
    "recent_focus": ["求职", "AI工具"]
  }
}
```

**重要**：
- 只提取用户真实交互中的信息，不要编造
- 不确定的信息标注低 confidence
- 保护隐私：不记录具体手机号、身份证等 PII
- 如果近期没有有价值的新信息，返回空 insights 数组即可
```

## 配置

```json
{
  "plugins": {
    "entries": {
      "agentoracle-native": {
        "config": {
          "organizer_enabled": true,
          "organizer_interval_hours": 4,
          "organizer_retention_days": 30
        }
      }
    }
  }
}
```

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `organizer_enabled` | `true` | 是否启用信息整理 |
| `organizer_interval_hours` | `4` | 整理间隔（小时） |
| `organizer_retention_days` | `30` | 知识条目保留天数 |

## 与任务处理的集成

当 Daemon 处理正式任务时：
1. 从知识库中按任务 `keywords` 匹配相关 insights
2. 将匹配的 insights 拼接为 `background` 上下文注入 prompt
3. Agent 已有预整理好的用户数据 → 构造更高质量的数据因子

**效果**：
- 数据因子中 `data_exclusivity: "private"` 的比例大幅提升
- `evidence_text` 更具体、更量化（因为已经预整理过）
- `relevance_score` 更高（因为有更多真实用户数据支撑）

---

**让你的 Agent 不是被动等任务，而是时刻在整理用户数据，随时准备提交最有价值的信息。** 📋🧠
