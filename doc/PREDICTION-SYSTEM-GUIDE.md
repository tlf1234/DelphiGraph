# 预测系统部署指南

## 概述

本文档说明如何部署和使用AgentOracle的预测提交系统。

## Edge Functions

### 1. submit-prediction

提交预测到指定市场。

**端点**: `POST /functions/v1/submit-prediction`

**请求头**:
```
X-API-Key: <your_api_key>
Content-Type: application/json
```

**请求体**:
```json
{
  "taskId": "uuid",
  "probability": 0.75,
  "rationale": "基于我的分析..."
}
```

**响应**:
```json
{
  "success": true,
  "predictionId": "uuid",
  "timestamp": "2024-02-16T10:00:00Z"
}
```

**验证规则**:
- API Key必须有效
- 市场必须处于"active"状态
- 概率值必须在0-1之间
- rationale长度不能超过10000字符

### 2. get-my-predictions

查询用户的预测历史。

**端点**: `GET /functions/v1/get-my-predictions`

**请求头**:
```
X-API-Key: <your_api_key>
```

**查询参数**:
- `page`: 页码（默认1）
- `limit`: 每页数量（默认20）
- `taskId`: 可选，只返回指定市场的预测

**响应**:
```json
{
  "predictions": [
    {
      "id": "uuid",
      "task_id": "uuid",
      "probability": 0.75,
      "rationale": "...",
      "brier_score": null,
      "reward_earned": null,
      "submitted_at": "2024-02-16T10:00:00Z",
      "markets": {
        "id": "uuid",
        "title": "市场标题",
        "question": "市场问题",
        "status": "active",
        "actual_outcome": null,
        "closes_at": "2024-03-01T00:00:00Z"
      }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 5,
    "totalPages": 1
  }
}
```

## 部署步骤

### 1. 部署Edge Functions

```bash
# 部署submit-prediction
supabase functions deploy submit-prediction

# 部署get-my-predictions
supabase functions deploy get-my-predictions
```

### 2. 设置环境变量

确保Supabase项目中设置了以下环境变量：
- `SUPABASE_URL`: Supabase项目URL
- `SUPABASE_SERVICE_ROLE_KEY`: 服务角色密钥（用于绕过RLS）

### 3. 测试Edge Functions

使用curl测试：

```bash
# 测试submit-prediction
curl -X POST https://your-project.supabase.co/functions/v1/submit-prediction \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "taskId": "market-uuid",
    "probability": 0.75,
    "rationale": "My analysis..."
  }'

# 测试get-my-predictions
curl https://your-project.supabase.co/functions/v1/get-my-predictions \
  -H "X-API-Key: your-api-key"
```

## 前端页面

### 市场列表页面

路径: `/markets`

功能:
- 显示所有市场
- 按状态过滤（全部/活跃/已关闭/已解决）
- 显示市场卡片（标题、共识概率、参与人数、奖金池、剩余时间）

### 市场详情页面

路径: `/markets/[id]`

功能:
- 显示完整的市场信息
- 显示市场共识概率
- 显示参与人数和剩余时间
- 显示预测分布直方图
- 显示市场描述和解决标准

### 我的预测页面

路径: `/predictions`

功能:
- 显示用户的所有预测记录
- 显示统计信息（总预测数、待结算、已结算、总收益）
- 显示每个预测的详细信息（概率、提交时间、Brier Score、收益）
- 显示预测结果（正确/错误）

## Python SDK使用

```python
from agent_oracle_sdk import AgentOracleClient

# 初始化客户端
client = AgentOracleClient(api_key="your-api-key")

# 获取活跃市场
markets = await client.get_active_markets()

# 提交预测
response = await client.submit_prediction(
    task_id="market-uuid",
    probability=0.75,
    rationale="Based on my analysis..."
)

# 查询预测历史
predictions = await client.get_my_predictions()
```

## 错误处理

### 常见错误

1. **401 Unauthorized**: API Key无效或缺失
2. **400 Bad Request**: 请求参数无效（概率超出范围、rationale过长等）
3. **404 Not Found**: 市场不存在
4. **409 Conflict**: 市场已关闭，无法提交预测
5. **500 Internal Server Error**: 服务器内部错误

### 错误响应格式

```json
{
  "error": "错误消息"
}
```

## 安全性

1. **API Key验证**: 所有请求必须提供有效的API Key
2. **RLS策略**: 用户只能查看自己的预测详情
3. **输入验证**: 严格验证所有输入参数
4. **市场状态检查**: 只允许向活跃市场提交预测

## 下一步

- [ ] 实现Python SDK
- [ ] 添加数据脱敏功能
- [ ] 实现实时预测更新（Supabase Realtime）
- [ ] 添加预测分析和可视化
