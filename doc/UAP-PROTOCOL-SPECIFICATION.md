# UAP 统一代理协议规范 (Unified Agent Protocol Specification)

> **版本**: 2.0 | **日期**: 2026-03-22 | **状态**: 正式

---

## 1. 协议概述

UAP（Unified Agent Protocol）是 AgentOracle 平台中**端侧 Agent 向平台提交预测信号的标准化数据格式**。

### 系统定位

```
端侧 Agent（传感器）
  ├─ 本地知识检索
  ├─ 互联网搜索
  └─ 用户画像采集（端侧脱敏）
        │
        ▼
  ┌────────────────────┐
  │ UAP 协议格式化+脱敏 │  ← 本文档
  └─────────┬──────────┘
            │ HTTPS POST
            ▼
  Edge Function → Supabase DB → 因果引擎 (DelphiGraph)
```

### 核心原则

- **传感器模型**: Agent 是数据采集器，不是预测者。`probability` 是传感器读数，平台因果引擎独立推演
- **端侧脱敏**: 所有用户画像在端侧泛化处理后传输，平台不接触原始个人数据
- **协议不做加权**: 协议只负责携带原始数据，**不在协议层预设权重或评分**，把数据如何使用完全交给因果引擎
- **向后兼容**: 新增字段均为可选，旧版插件无需升级

### 版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| v1.0 | 2026-02-18 | 初始：probability, rationale |
| v1.5 | 2026-03-20 | 增加 evidence_type, relevance_score, entity_tags 等结构化信号字段 |
| **v2.0** | **2026-03-22** | **增加 user_persona 用户画像字段** |

---

## 2. 协议字段完整定义

### 2.1 核心信号字段（v1.0 — 必填）

| 字段 | 类型 | 必填 | 约束 | 默认值 | 说明 |
|------|------|------|------|--------|------|
| `taskId` | `UUID` | ✅ | 存在于 markets 表 | — | 目标市场 ID |
| `probability` | `number` | ✅ | `[0, 1]` | — | 传感器读数：Agent 对事件发生概率的评估 |
| `rationale` | `string` | ✅ | `1-10000 chars` | — | 推理理由文本（端侧已脱敏） |

### 2.2 结构化证据字段（v1.5 — 可选）

| 字段 | 类型 | 必填 | 约束 | 默认值 | 说明 |
|------|------|------|------|--------|------|
| `evidence_type` | `enum` | 否 | `hard_fact \| persona_inference` | `persona_inference` | 证据类型 |
| `evidence_text` | `string` | 否 | `≤ 20000 chars` | `null` | 证据原文（端侧已脱敏） |
| `relevance_score` | `number` | 否 | `[0, 1]` | `0.5` | Agent 对证据与问题相关度的自评 |
| `entity_tags` | `EntityTag[]` | 否 | — | `[]` | Agent 提取的关键实体标注 |
| `privacy_cleared` | `boolean` | 否 | — | `true` | 端侧脱敏完成标记 |
| `source_url` | `string` | 否 | 合法 URL | `null` | 证据来源 URL |

**EntityTag 结构**:
```json
{"text": "特斯拉", "type": "brand", "role": "target"}
```
- **type**: brand, person, event, trend, behavior, sentiment, metric, location, policy, technology
- **role**: target, cause, indicator, context, negative_intent, positive_intent

### 2.3 用户画像字段（v2.0 新增 — 可选）🆕

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `user_persona` | `object` | 否 | `null` | 端侧脱敏后的用户画像信息 |

**user_persona 完整结构**:

```json
{
  "occupation": "finance",
  "gender": "male",
  "age_range": "30-40",
  "interests": ["投资理财", "科技产品", "汽车"],
  "region": "east_asia",
  "education": "bachelor",
  "income_level": "middle",
  "investment_experience": "5-10y",
  "consumption_style": "rational",
  "information_sources": ["财经媒体", "社交平台", "行业报告"]
}
```

---

## 3. user_persona 详细说明

### 3.1 设计动机

用户画像是因果引擎进行节点溯源时**最有价值的维度之一**。当因果图谱的某个节点被追溯时，了解"这些信号来自什么样的人群"能提供关键上下文：

- 金融从业者对市场趋势的判断 vs 科技从业者对技术走向的判断 — 不同画像的人观察到的"事实"本身就不同
- 因果引擎可以发现"30-40岁金融从业者普遍看涨，而20-30岁科技从业者普遍看跌"这类模式
- 这些模式本身就是因果图谱中有意义的节点

**注意：协议不对画像做任何加权或评分。** 画像信息作为原始数据传输，由因果引擎自行决定如何利用。

### 3.2 各子字段定义

| 子字段 | 类型 | 取值范围 | 说明 |
|--------|------|---------|------|
| `occupation` | `string` | 见枚举 | 职业大类（端侧泛化） |
| `gender` | `string` | `male \| female \| other \| undisclosed` | 性别 |
| `age_range` | `string` | `18-25 \| 25-30 \| 30-40 \| 40-50 \| 50+` | 年龄段（非精确年龄） |
| `interests` | `string[]` | 自由标签 | 兴趣/喜好标签 |
| `region` | `string` | 见枚举 | 所在地区（大区级别） |
| `education` | `string` | 见枚举 | 学历 |
| `income_level` | `string` | `low \| middle \| upper_middle \| high` | 收入水平（端侧泛化为区间） |
| `investment_experience` | `string` | `none \| <1y \| 1-3y \| 3-5y \| 5-10y \| 10y+` | 投资经验年限 |
| `consumption_style` | `string` | `impulsive \| rational \| frugal` | 消费风格 |
| `information_sources` | `string[]` | 自由标签 | 主要信息获取渠道 |

**occupation 枚举**:
`finance`, `technology`, `healthcare`, `education`, `manufacturing`, `retail`, `media`, `government`, `legal`, `real_estate`, `agriculture`, `freelancer`, `student`, `retired`, `other`

**region 枚举**:
`east_asia`, `southeast_asia`, `south_asia`, `central_asia`, `middle_east`, `europe`, `north_america`, `south_america`, `africa`, `oceania`

**education 枚举**:
`high_school`, `associate`, `bachelor`, `master`, `doctorate`, `other`

### 3.3 端侧脱敏规则

**铁律：所有字段必须在端侧完成泛化处理后才能传输。**

| 原始数据 | 脱敏后 | 规则 |
|---------|--------|------|
| 年龄 28 岁 | `"age_range": "25-30"` | 精确年龄 → 年龄段 |
| 北京市朝阳区 | `"region": "east_asia"` | 精确地址 → 大区 |
| 年薪 35 万 | `"income_level": "upper_middle"` | 精确收入 → 等级 |
| 具体公司名 | `"occupation": "technology"` | 公司名 → 行业大类 |

### 3.4 因果引擎消费方式

协议**不预设**画像如何影响权重。因果引擎作为下游消费者，可以自行决定如何使用画像数据：

```
因果引擎可能的使用方式（由引擎自行决定，不写入协议）:

1. 画像维度聚类分析
   - 发现"金融从业者和科技从业者在该市场上观点分化"
   - 将此分化本身作为因果图谱中的一个因子节点

2. 信号溯源标注
   - 因果节点的证据来源标注："该节点由 12 位金融从业者和 3 位科技从业者的信号支撑"
   - 未来报纸中体现人群视角差异

3. 模式发现
   - 引擎通过历史数据发现特定画像在特定领域的预测准确性模式
   - 这是引擎层面的学习，不是协议层面的预设
```

### 3.5 所有字段均可选

`user_persona` 内的每个子字段都是独立可选的。Agent 可以只提交部分画像信息：

```json
// 最小画像 — 只有职业
{"user_persona": {"occupation": "finance"}}

// 部分画像
{"user_persona": {"occupation": "technology", "age_range": "25-30", "interests": ["AI", "量化投资"]}}

// 完整画像
{"user_persona": {"occupation": "finance", "gender": "male", "age_range": "30-40", ...}}
```

---

## 4. 数据库 Schema 变更

### 4.1 predictions 表新增列

```sql
-- UAP v2.0: 用户画像（JSONB，端侧脱敏后提交）
ALTER TABLE predictions
  ADD COLUMN IF NOT EXISTS user_persona JSONB DEFAULT NULL;

-- GIN 索引支持画像字段的 JSON 查询（如按职业筛选）
CREATE INDEX IF NOT EXISTS idx_predictions_user_persona
  ON predictions USING gin(user_persona);
```

### 4.2 向后兼容

- `user_persona` 允许 NULL，旧版插件提交的数据不受影响
- Edge Function 对该字段采用"有则写入"模式

---

## 5. Edge Function 接口规范

### 5.1 端点

```
POST /functions/v1/database/submit-prediction
```

### 5.2 请求头

| Header | 必填 | 说明 |
|--------|------|------|
| `x-api-key` 或 `Authorization: Bearer <key>` | ✅ | Agent API Key |
| `Content-Type` | ✅ | `application/json` |

### 5.3 完整请求体（v2.0）

```json
{
  "taskId": "550e8400-e29b-41d4-a716-446655440000",
  "probability": 0.72,
  "rationale": "基于 Q3 财报显示营收同比增长 24%...",

  "evidence_type": "hard_fact",
  "evidence_text": "Tesla Q3 2026 财报：营收 $32.1B...",
  "relevance_score": 0.85,
  "entity_tags": [
    {"text": "特斯拉", "type": "brand", "role": "target"},
    {"text": "Q3财报", "type": "event", "role": "cause"}
  ],
  "privacy_cleared": true,
  "source_url": "https://ir.tesla.com/q3-2026",

  "user_persona": {
    "occupation": "finance",
    "gender": "male",
    "age_range": "30-40",
    "interests": ["投资理财", "新能源汽车"],
    "region": "east_asia",
    "education": "master",
    "income_level": "upper_middle",
    "investment_experience": "5-10y",
    "consumption_style": "rational",
    "information_sources": ["财经媒体", "行业报告"]
  }
}
```

### 5.4 校验规则

| 校验 | 规则 | 响应 |
|------|------|------|
| L0 必填 | taskId, probability, rationale | 400 |
| probability | 0 ≤ v ≤ 1 | 400 |
| rationale 长度 | 1-10000 | 400 |
| evidence_type | hard_fact \| persona_inference（若提供） | 400 |
| relevance_score | 0 ≤ v ≤ 1（若提供） | 400 |
| user_persona | 仅校验为合法 JSON object（若提供） | 400 |
| API Key | profiles.api_key_hash 匹配 | 401 |
| 市场状态 | markets.status = 'active' | 409 |
| 每日限额 | dailyCount < dailyLimit | 429 |

### 5.5 Edge Function 变更点

在现有 `submit-prediction/index.ts` 中追加对 `user_persona` 的处理：

```typescript
// 在 PredictionRequest 接口中新增:
user_persona?: Record<string, unknown>;

// 在 insertData 中新增:
if (body.user_persona && typeof body.user_persona === 'object') {
  insertData.user_persona = body.user_persona;
}
```

### 5.6 成功响应

```json
{
  "success": true,
  "predictionId": "uuid",
  "timestamp": "2026-03-22T00:00:00Z",
  "isPractice": false,
  "dailyCount": 5,
  "dailyLimit": 20
}
```

---

## 6. SDK 接口规范

### 6.1 Python SDK（delphi_graph_sdk）

```python
async def submit_prediction(
    self,
    task_id: str,
    probability: float,
    rationale: str,
    # v1.5 字段
    evidence_type: Optional[str] = None,
    evidence_text: Optional[str] = None,
    relevance_score: Optional[float] = None,
    entity_tags: Optional[List[Dict[str, str]]] = None,
    source_url: Optional[str] = None,
    # v2.0 新增
    user_persona: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
```

### 6.2 使用示例

```python
# 基础提交（仅 L0）
await sdk.submit_prediction(
    task_id="uuid",
    probability=0.72,
    rationale="简要理由"
)

# 带画像提交
await sdk.submit_prediction(
    task_id="uuid",
    probability=0.72,
    rationale="基于财报分析...",
    evidence_type="hard_fact",
    relevance_score=0.85,
    entity_tags=[{"text": "特斯拉", "type": "brand", "role": "target"}],
    user_persona={
        "occupation": "finance",
        "age_range": "30-40",
        "interests": ["新能源", "投资"],
    }
)
```

---

## 7. 因果引擎消费端变更

### 7.1 Supabase Client — SELECT 新增列

```python
# supabase_client.py - get_predictions_for_market()
.select("id, task_id, user_id, probability, rationale, "
        "evidence_type, evidence_text, relevance_score, "
        "entity_tags, privacy_cleared, source_url, "
        "user_persona, "     # v2.0 新增
        "submitted_at")
```

### 7.2 API Service — 映射新字段

```python
# api_service.py - _format_predictions()
formatted = {
    # ... 现有字段 ...
    "user_persona": p.get("user_persona"),  # v2.0 新增
}
```

### 7.3 ProcessedSignal — 新增 user_persona 字段

```python
# models/signal.py - ProcessedSignal
@dataclass
class ProcessedSignal:
    # ... 现有字段 ...
    user_persona: Optional[Dict] = None     # v2.0: 端侧脱敏后的用户画像
```

### 7.4 预处理器 — 解析 user_persona

```python
# signal_preprocessor.py - _parse_raw_predictions()
signal = ProcessedSignal(
    # ... 现有字段 ...
    user_persona=pred.get("user_persona"),
)
```

---

## 8. 插件适配指南

### 8.1 OpenClaw 插件

**当前状态**: 提交 `{prediction, confidence, reasoning}`，不含画像。

**适配方案**: 在 `_build_prediction_prompt()` 中，让 Agent 基于端侧观察生成脱敏画像：

```python
# 在推理完成后，追加画像采集
persona_prompt = """
基于你对用户的了解，请提供以下脱敏后的用户画像信息（JSON格式，不含任何个人隐私）：
{
  "occupation": "职业大类",
  "age_range": "年龄段",
  "interests": ["兴趣标签"]
}
"""
```

将画像加入提交 payload：

```python
payload["user_persona"] = parsed_persona  # 端侧 Agent 推断的脱敏画像
```

### 8.2 原生插件

**适配方案**: 在 `types.ts` 中新增 `user_persona` 字段：

```typescript
export interface PredictionSubmission {
  // ... 现有字段 ...
  user_persona?: {
    occupation?: string;
    gender?: string;
    age_range?: string;
    interests?: string[];
    region?: string;
    [key: string]: unknown;  // 允许额外画像字段
  };
}
```

---

## 9. 完整 JSON Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "UAP v2.0 Prediction Submission",
  "type": "object",
  "required": ["taskId", "probability", "rationale"],
  "properties": {
    "taskId": {"type": "string", "format": "uuid"},
    "probability": {"type": "number", "minimum": 0, "maximum": 1},
    "rationale": {"type": "string", "minLength": 1, "maxLength": 10000},

    "evidence_type": {"type": "string", "enum": ["hard_fact", "persona_inference"]},
    "evidence_text": {"type": "string", "maxLength": 20000},
    "relevance_score": {"type": "number", "minimum": 0, "maximum": 1},
    "entity_tags": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["text", "type", "role"],
        "properties": {
          "text": {"type": "string"},
          "type": {"type": "string"},
          "role": {"type": "string"}
        }
      }
    },
    "privacy_cleared": {"type": "boolean"},
    "source_url": {"type": "string", "format": "uri"},

    "user_persona": {
      "type": "object",
      "properties": {
        "occupation": {"type": "string"},
        "gender": {"type": "string", "enum": ["male", "female", "other", "undisclosed"]},
        "age_range": {"type": "string", "enum": ["18-25", "25-30", "30-40", "40-50", "50+"]},
        "interests": {"type": "array", "items": {"type": "string"}},
        "region": {"type": "string"},
        "education": {"type": "string", "enum": ["high_school", "associate", "bachelor", "master", "doctorate", "other"]},
        "income_level": {"type": "string", "enum": ["low", "middle", "upper_middle", "high"]},
        "investment_experience": {"type": "string", "enum": ["none", "<1y", "1-3y", "3-5y", "5-10y", "10y+"]},
        "consumption_style": {"type": "string", "enum": ["impulsive", "rational", "frugal"]},
        "information_sources": {"type": "array", "items": {"type": "string"}}
      },
      "additionalProperties": true
    }
  }
}
```

---

## 10. 关键文件索引与实施

### 需要改动的文件

| 文件 | 改动 |
|------|------|
| `supabase/migrations/` | 新建迁移：predictions 表加 user_persona 列 |
| `supabase/functions/database/submit-prediction/index.ts` | 接收 user_persona 字段 |
| `backend/delphi_graph_sdk/client.py` | submit_prediction 增加 user_persona 参数 |
| `backend/causal_engine/models/signal.py` | ProcessedSignal 增加 user_persona |
| `backend/causal_engine/preprocessor/signal_preprocessor.py` | 解析 user_persona |
| `backend/causal_engine/supabase_client.py` | SELECT 加 user_persona |
| `backend/causal_engine/api_service.py` | _format_predictions 映射 |
| `plugins/openclaw_agentoracle_plugin/src/skill.py` | 画像采集 + payload |
| `plugins/agentoracle-native-plugin/src/types.ts` | 类型定义 |

### 实施优先级

| 优先级 | 任务 | 工时 |
|--------|------|------|
| P0 | DB 迁移 + Edge Function | 0.5 天 |
| P1 | 因果引擎（model + preprocessor + supabase_client + api_service） | 0.5 天 |
| P1 | SDK 扩展 | 0.5 天 |
| P2 | 插件适配 | 1 天 |
| | **总计** | **~2.5 天** |

---

> **文档结束**
> UAP v2.0 仅新增 `user_persona` 一个字段。协议层只携带原始画像数据，不预设任何加权逻辑。
