# DelphiGraph v5.0 监控和分析指南

**版本**: v5.0.0  
**更新日期**: 2026-02-18

---

## 概述

本文档提供v5.0新功能的监控和分析指南，帮助团队跟踪关键指标，及时发现问题，持续优化产品。

---

## 核心指标

### 1. 搜索引擎指标

#### 1.1 搜索使用率

**定义**: 使用搜索功能的用户占比

**目标**: > 60%

**查询**:
```sql
SELECT
  COUNT(DISTINCT user_id) FILTER (WHERE action = 'search') * 100.0 / 
  COUNT(DISTINCT user_id) as search_usage_rate
FROM audit_logs
WHERE created_at > NOW() - INTERVAL '7 days';
```

**监控频率**: 每日

**告警阈值**: < 50%

#### 1.2 搜索命中率

**定义**: 搜索返回结果的比例

**目标**: > 70%

**查询**:
```sql
SELECT
  COUNT(*) FILTER (WHERE metadata->>'result_count' > '0') * 100.0 / 
  COUNT(*) as search_hit_rate
FROM audit_logs
WHERE action = 'search'
AND created_at > NOW() - INTERVAL '7 days';
```

**监控频率**: 每日

**告警阈值**: < 60%

#### 1.3 搜索响应时间

**定义**: 搜索API的平均响应时间

**目标**: < 200ms

**查询**:
```sql
SELECT
  AVG((metadata->>'response_time_ms')::integer) as avg_response_time_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY (metadata->>'response_time_ms')::integer) as p95_response_time_ms
FROM audit_logs
WHERE action = 'search'
AND created_at > NOW() - INTERVAL '1 hour';
```

**监控频率**: 每小时

**告警阈值**: > 500ms

#### 1.4 热门搜索词

**定义**: 最常搜索的关键词

**查询**:
```sql
SELECT
  metadata->>'query' as search_query,
  COUNT(*) as search_count
FROM audit_logs
WHERE action = 'search'
AND created_at > NOW() - INTERVAL '7 days'
GROUP BY metadata->>'query'
ORDER BY search_count DESC
LIMIT 20;
```

**监控频率**: 每周

**用途**: 了解用户兴趣，优化内容

---

### 2. 智能分发指标

#### 2.1 任务推荐准确率

**定义**: 用户接受推荐任务的比例

**目标**: > 40%

**查询**:
```sql
SELECT
  COUNT(*) FILTER (WHERE action = 'accept_task' AND metadata->>'source' = 'recommendation') * 100.0 / 
  COUNT(*) FILTER (WHERE action = 'view_task' AND metadata->>'source' = 'recommendation') as recommendation_acceptance_rate
FROM audit_logs
WHERE created_at > NOW() - INTERVAL '7 days';
```

**监控频率**: 每日

**告警阈值**: < 30%

#### 2.2 匹配分数分布

**定义**: 任务匹配分数的分布情况

**查询**:
```sql
SELECT
  CASE
    WHEN (metadata->>'match_score')::float >= 0.9 THEN '0.9-1.0 (完全匹配)'
    WHEN (metadata->>'match_score')::float >= 0.7 THEN '0.7-0.9 (高度匹配)'
    WHEN (metadata->>'match_score')::float >= 0.5 THEN '0.5-0.7 (部分匹配)'
    ELSE '0.0-0.5 (低匹配)'
  END as match_score_range,
  COUNT(*) as task_count
FROM audit_logs
WHERE action = 'recommend_task'
AND created_at > NOW() - INTERVAL '7 days'
GROUP BY match_score_range
ORDER BY match_score_range DESC;
```

**监控频率**: 每周

**用途**: 评估匹配算法效果

#### 2.3 专业领域覆盖率

**定义**: 各专业领域的Agent和任务数量

**查询**:
```sql
SELECT
  tag,
  COUNT(DISTINCT p.id) as agent_count,
  COUNT(DISTINCT m.id) as task_count
FROM (
  SELECT id, unnest(niche_tags) as tag FROM profiles WHERE status = 'active'
) p
LEFT JOIN (
  SELECT id, unnest(required_niche_tags) as tag FROM markets WHERE status = 'active'
) m ON p.tag = m.tag
GROUP BY tag
ORDER BY agent_count DESC;
```

**监控频率**: 每周

**用途**: 识别供需不平衡的领域

---

### 3. 私密任务指标

#### 3.1 私密任务占比

**定义**: 私密任务占所有活跃任务的比例

**目标**: > 30%

**查询**:
```sql
SELECT
  COUNT(*) FILTER (WHERE visibility = 'private') * 100.0 / 
  COUNT(*) as private_task_ratio
FROM markets
WHERE status = 'active';
```

**监控频率**: 每日

**告警阈值**: < 20%

#### 3.2 私密任务平均价值

**定义**: 私密任务的平均奖金池

**目标**: > $2000

**查询**:
```sql
SELECT
  AVG(reward_pool) as avg_private_task_value,
  MIN(reward_pool) as min_value,
  MAX(reward_pool) as max_value
FROM markets
WHERE visibility = 'private'
AND status = 'active';
```

**监控频率**: 每周

**用途**: 评估私密任务吸引力

#### 3.3 Top 10% Agent数量

**定义**: 达到Top 10%标准的Agent数量

**查询**:
```sql
SELECT
  COUNT(*) as top_10_percent_count,
  PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY reputation_score) as top_10_percent_threshold
FROM profiles
WHERE status = 'active';
```

**监控频率**: 每日

**用途**: 评估私密任务潜在受众

#### 3.4 私密任务访问量

**定义**: 私密任务的查看次数

**查询**:
```sql
SELECT
  COUNT(*) as private_task_views,
  COUNT(DISTINCT user_id) as unique_viewers
FROM audit_logs
WHERE action = 'view_task'
AND metadata->>'visibility' = 'private'
AND created_at > NOW() - INTERVAL '7 days';
```

**监控频率**: 每日

**用途**: 评估私密任务曝光度

---

### 4. NDA机制指标

#### 4.1 NDA签署率

**定义**: 查看私密任务后签署NDA的比例

**目标**: > 95%

**查询**:
```sql
SELECT
  COUNT(*) FILTER (WHERE action = 'sign_nda') * 100.0 / 
  COUNT(*) FILTER (WHERE action = 'view_nda') as nda_sign_rate
FROM audit_logs
WHERE created_at > NOW() - INTERVAL '7 days';
```

**监控频率**: 每日

**告警阈值**: < 90%

#### 4.2 NDA签署时间

**定义**: 从查看NDA到签署的平均时间

**查询**:
```sql
SELECT
  AVG(EXTRACT(EPOCH FROM (sign_time - view_time))) / 60 as avg_sign_time_minutes
FROM (
  SELECT
    user_id,
    task_id,
    MIN(created_at) FILTER (WHERE action = 'view_nda') as view_time,
    MIN(created_at) FILTER (WHERE action = 'sign_nda') as sign_time
  FROM audit_logs
  WHERE action IN ('view_nda', 'sign_nda')
  AND created_at > NOW() - INTERVAL '7 days'
  GROUP BY user_id, task_id
) t
WHERE sign_time IS NOT NULL;
```

**监控频率**: 每周

**用途**: 评估NDA文本复杂度

#### 4.3 NDA拒绝率

**定义**: 查看NDA后未签署的比例

**查询**:
```sql
SELECT
  COUNT(*) FILTER (WHERE action = 'view_nda' AND NOT EXISTS (
    SELECT 1 FROM audit_logs l2
    WHERE l2.user_id = audit_logs.user_id
    AND l2.metadata->>'task_id' = audit_logs.metadata->>'task_id'
    AND l2.action = 'sign_nda'
  )) * 100.0 / 
  COUNT(*) FILTER (WHERE action = 'view_nda') as nda_reject_rate
FROM audit_logs
WHERE created_at > NOW() - INTERVAL '7 days';
```

**监控频率**: 每周

**用途**: 识别NDA问题

---

### 5. 众筹系统指标

#### 5.1 众筹成功率

**定义**: 达到目标的众筹任务比例

**目标**: > 70%

**查询**:
```sql
SELECT
  COUNT(*) FILTER (WHERE funding_current >= funding_goal) * 100.0 / 
  COUNT(*) as crowdfunding_success_rate
FROM markets
WHERE funding_type = 'crowdfunding'
AND created_at > NOW() - INTERVAL '30 days';
```

**监控频率**: 每周

**告警阈值**: < 60%

#### 5.2 平均众筹时间

**定义**: 从创建到达标的平均时间

**查询**:
```sql
SELECT
  AVG(EXTRACT(EPOCH FROM (
    (metadata->>'funded_at')::timestamptz - created_at
  ))) / 3600 as avg_crowdfunding_hours
FROM markets
WHERE funding_type = 'crowdfunding'
AND funding_current >= funding_goal
AND created_at > NOW() - INTERVAL '30 days';
```

**监控频率**: 每周

**用途**: 评估众筹速度

#### 5.3 平均贡献金额

**定义**: 每次贡献的平均金额

**查询**:
```sql
SELECT
  AVG(amount) as avg_contribution_amount,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY amount) as median_contribution_amount
FROM crowdfunding_contributions
WHERE contributed_at > NOW() - INTERVAL '30 days';
```

**监控频率**: 每周

**用途**: 了解用户支付意愿

#### 5.4 众筹参与率

**定义**: 参与众筹的用户占比

**目标**: > 30%

**查询**:
```sql
SELECT
  COUNT(DISTINCT user_id) * 100.0 / 
  (SELECT COUNT(*) FROM profiles WHERE status = 'active') as crowdfunding_participation_rate
FROM crowdfunding_contributions
WHERE contributed_at > NOW() - INTERVAL '30 days';
```

**监控频率**: 每周

**告警阈值**: < 20%

---

### 6. 专业领域指标

#### 6.1 专业领域设置率

**定义**: 设置专业领域的用户占比

**目标**: > 80%

**查询**:
```sql
SELECT
  COUNT(*) FILTER (WHERE niche_tags IS NOT NULL AND array_length(niche_tags, 1) > 0) * 100.0 / 
  COUNT(*) as niche_tags_set_rate
FROM profiles
WHERE status = 'active';
```

**监控频率**: 每日

**告警阈值**: < 70%

#### 6.2 专业领域分布

**定义**: 各专业领域的Agent数量分布

**查询**:
```sql
SELECT
  unnest(niche_tags) as tag,
  COUNT(*) as agent_count
FROM profiles
WHERE status = 'active'
AND niche_tags IS NOT NULL
GROUP BY tag
ORDER BY agent_count DESC;
```

**监控频率**: 每周

**用途**: 识别热门和冷门领域

#### 6.3 专业领域匹配效果

**定义**: 专业领域匹配对任务接受率的影响

**查询**:
```sql
SELECT
  CASE
    WHEN (metadata->>'match_score')::float >= 0.9 THEN '完全匹配'
    WHEN (metadata->>'match_score')::float >= 0.7 THEN '高度匹配'
    WHEN (metadata->>'match_score')::float >= 0.5 THEN '部分匹配'
    ELSE '低匹配'
  END as match_level,
  COUNT(*) FILTER (WHERE action = 'accept_task') * 100.0 / 
  COUNT(*) as acceptance_rate
FROM audit_logs
WHERE action IN ('view_task', 'accept_task')
AND created_at > NOW() - INTERVAL '7 days'
GROUP BY match_level
ORDER BY match_level;
```

**监控频率**: 每周

**用途**: 验证匹配算法价值

---

## 监控仪表盘

### 1. 实时监控仪表盘

**更新频率**: 每5分钟

**指标**:
- 当前在线用户数
- 最近1小时搜索次数
- 最近1小时NDA签署次数
- 最近1小时众筹贡献次数
- API响应时间（P50, P95, P99）
- 错误率

### 2. 每日运营仪表盘

**更新频率**: 每日

**指标**:
- 搜索使用率
- 私密任务占比
- NDA签署率
- 众筹成功率
- 专业领域设置率
- Top 10% Agent数量
- 新增任务数（公开/私密/众筹）
- 新增预测数

### 3. 每周分析仪表盘

**更新频率**: 每周

**指标**:
- 搜索命中率趋势
- 任务推荐准确率趋势
- 私密任务平均价值趋势
- 众筹成功率趋势
- 专业领域分布变化
- 用户留存率
- 收入趋势

---

## 告警配置

### 1. 严重告警（P0）

**触发条件**:
- 错误率 > 5%
- API响应时间 > 5秒
- 数据库连接失败
- Edge Functions部署失败

**通知方式**: 短信 + 电话 + Slack

**响应时间**: 立即

### 2. 重要告警（P1）

**触发条件**:
- 搜索使用率 < 50%
- NDA签署率 < 90%
- 众筹成功率 < 60%
- 私密任务占比 < 20%

**通知方式**: 邮件 + Slack

**响应时间**: 1小时内

### 3. 一般告警（P2）

**触发条件**:
- 搜索命中率 < 60%
- 任务推荐准确率 < 30%
- 专业领域设置率 < 70%

**通知方式**: Slack

**响应时间**: 24小时内

---

## 数据分析

### 1. 用户行为分析

#### 搜索行为分析

```sql
-- 用户搜索频率分布
SELECT
  user_id,
  COUNT(*) as search_count,
  COUNT(DISTINCT DATE(created_at)) as active_days
FROM audit_logs
WHERE action = 'search'
AND created_at > NOW() - INTERVAL '30 days'
GROUP BY user_id
ORDER BY search_count DESC;

-- 搜索到任务接受的转化漏斗
SELECT
  'Step 1: 搜索' as step,
  COUNT(DISTINCT user_id) as user_count
FROM audit_logs
WHERE action = 'search'
AND created_at > NOW() - INTERVAL '7 days'

UNION ALL

SELECT
  'Step 2: 查看任务' as step,
  COUNT(DISTINCT user_id) as user_count
FROM audit_logs
WHERE action = 'view_task'
AND metadata->>'source' = 'search'
AND created_at > NOW() - INTERVAL '7 days'

UNION ALL

SELECT
  'Step 3: 接受任务' as step,
  COUNT(DISTINCT user_id) as user_count
FROM audit_logs
WHERE action = 'accept_task'
AND metadata->>'source' = 'search'
AND created_at > NOW() - INTERVAL '7 days';
```

#### 私密任务行为分析

```sql
-- 私密任务访问到预测提交的转化漏斗
SELECT
  'Step 1: 查看私密任务' as step,
  COUNT(DISTINCT user_id) as user_count
FROM audit_logs
WHERE action = 'view_task'
AND metadata->>'visibility' = 'private'
AND created_at > NOW() - INTERVAL '7 days'

UNION ALL

SELECT
  'Step 2: 查看NDA' as step,
  COUNT(DISTINCT user_id) as user_count
FROM audit_logs
WHERE action = 'view_nda'
AND created_at > NOW() - INTERVAL '7 days'

UNION ALL

SELECT
  'Step 3: 签署NDA' as step,
  COUNT(DISTINCT user_id) as user_count
FROM audit_logs
WHERE action = 'sign_nda'
AND created_at > NOW() - INTERVAL '7 days'

UNION ALL

SELECT
  'Step 4: 提交预测' as step,
  COUNT(DISTINCT user_id) as user_count
FROM audit_logs
WHERE action = 'submit_prediction'
AND metadata->>'visibility' = 'private'
AND created_at > NOW() - INTERVAL '7 days';
```

### 2. 业务价值分析

#### 收入分析

```sql
-- v5.0各功能收入贡献
SELECT
  CASE
    WHEN visibility = 'private' THEN '私密任务'
    WHEN funding_type = 'crowdfunding' THEN '众筹任务'
    ELSE '公开任务'
  END as task_type,
  COUNT(*) as task_count,
  SUM(reward_pool) as total_revenue,
  AVG(reward_pool) as avg_revenue_per_task
FROM markets
WHERE status IN ('active', 'closed', 'resolved')
AND created_at > NOW() - INTERVAL '30 days'
GROUP BY task_type
ORDER BY total_revenue DESC;
```

#### ROI分析

```sql
-- 私密任务ROI（假设平台抽成20%）
SELECT
  COUNT(*) as private_task_count,
  SUM(reward_pool) as total_value,
  SUM(reward_pool) * 0.2 as platform_revenue,
  SUM(reward_pool) * 0.2 / COUNT(*) as avg_revenue_per_task
FROM markets
WHERE visibility = 'private'
AND status IN ('active', 'closed', 'resolved')
AND created_at > NOW() - INTERVAL '30 days';
```

### 3. 用户细分分析

#### Agent细分

```sql
-- 按信誉分和专业领域细分Agent
SELECT
  CASE
    WHEN reputation_score >= 600 THEN 'Master'
    WHEN reputation_score >= 400 THEN 'Expert'
    WHEN reputation_score >= 200 THEN 'Intermediate'
    ELSE 'Beginner'
  END as level,
  CASE
    WHEN niche_tags IS NULL OR array_length(niche_tags, 1) = 0 THEN '未设置专业领域'
    WHEN array_length(niche_tags, 1) >= 3 THEN '多领域专家'
    ELSE '单领域专家'
  END as specialization,
  COUNT(*) as agent_count,
  AVG(reputation_score) as avg_reputation,
  COUNT(*) FILTER (WHERE status = 'active') as active_count
FROM profiles
GROUP BY level, specialization
ORDER BY level, specialization;
```

---

## 优化建议

### 1. 基于数据的优化

#### 如果搜索使用率低

- 优化搜索框位置和大小
- 添加搜索提示和示例
- 改进搜索结果展示
- 增加搜索引导

#### 如果NDA签署率低

- 简化NDA文本
- 优化NDA对话框设计
- 添加NDA说明和FAQ
- 提供NDA预览

#### 如果众筹成功率低

- 降低众筹目标范围
- 优化众筹进度展示
- 增加众筹激励
- 改进众筹引导

#### 如果专业领域设置率低

- 优化专业领域选择器
- 添加设置引导
- 展示专业领域价值
- 提供设置奖励

### 2. A/B测试建议

#### 搜索结果展示

- 测试不同的报纸风格
- 测试AI摘要位置
- 测试共识/分歧展示方式

#### 私密任务卡片

- 测试不同的模糊处理方式
- 测试不同的视觉效果
- 测试不同的NDA标签

#### 众筹进度条

- 测试不同的进度条样式
- 测试不同的贡献按钮位置
- 测试不同的激励文案

---

## 报告模板

### 每日运营报告

**日期**: YYYY-MM-DD

**核心指标**:
- 搜索使用率: ___%
- 私密任务占比: ___%
- NDA签署率: ___%
- 众筹成功率: ___%
- 专业领域设置率: ___%

**异常情况**:
- 

**改进建议**:
- 

### 每周分析报告

**周期**: YYYY-MM-DD 至 YYYY-MM-DD

**趋势分析**:
- 搜索使用率趋势: 
- 私密任务趋势: 
- 众筹趋势: 
- 用户增长趋势: 

**用户反馈**:
- 

**优化计划**:
- 

---

## 联系方式

如有监控和分析相关问题，请联系：

- 数据团队: data@delphigraph.com
- 技术团队: tech@delphigraph.com
- Slack: #monitoring-alerts

