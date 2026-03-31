# 任务创建流程重新设计方案

## 当前问题

当前的任务创建流程按照"众筹 vs B端直接付费"二分，但这个分类不够清晰：

- **问题 1**: 众筹模式中也应该有直接付费选项（小额快速支付）
- **问题 2**: 核心区别应该是"C端 vs B端"，而不是"众筹 vs 直接付费"
- **问题 3**: C端和B端的需求完全不同（Agent数量、隐私性、价格）

## 新方案：C端 vs B端任务分类

### 核心逻辑

**按照客户类型分类，而不是支付方式分类。**

### 任务类型对比

```
┌──────────────────────────────────────────────────────────────────────┐
│ 特性              │ C端任务（个人用户）    │ B端任务（企业客户）      │
├──────────────────────────────────────────────────────────────────────┤
│ Agent 数量        │ 10-50 个              │ 100-500 个              │
│ 支付方式          │ 自费 OR 众筹（可选）   │ 仅自费                  │
│ 结果公开性        │ 用户自己决定          │ 默认私密（不公开）       │
│ 价格区间          │ $50 - $2,000         │ $2,000 - $50,000       │
│ 任务优先级        │ 标准                  │ 高优先级                │
│ 服务响应          │ 24-72 小时            │ 12-24 小时              │
│ 专属服务          │ 无                    │ 专属客服 + 定制报告      │
└──────────────────────────────────────────────────────────────────────┘
```

### 用户体验流程

#### 流程 1: C端任务（个人用户）

**第一步：选择任务类型**

```
┌─────────────────────────────────────────────────────────┐
│ 您是个人用户还是企业用户？                                │
├─────────────────────────────────────────────────────────┤
│                                                          │
│ ○ C端任务（个人用户）                                     │
│   - 10-50 个 Agent 参与                                  │
│   - 支持自费或众筹                                        │
│   - 可选择是否公开结果                                    │
│   - 价格：$50 - $2,000                                   │
│                                                          │
│ ○ B端任务（企业客户）                                     │
│   - 100-500 个 Agent 参与                                │
│   - 仅支持自费                                           │
│   - 结果默认私密                                         │
│   - 价格：$2,000+                                        │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

**第二步：C端用户填写表单**

```
任务标题：[_______________________________]
任务描述：[                                ]

目标 Agent 数量：[20] 个（10-50）

奖金金额：$[500]

支付方式：
  ○ 自费（立即支付 $500，任务立即激活）
  ○ 众筹（您先支付 $[125]，其他人可追加）
     众筹目标：$[500]
     最低初始支付：$125（25%）

结果公开性：
  ☑ 公开任务和结果（其他用户可见）
  ☐ 仅自己可见（私密任务）

[创建任务]
```

**数据库字段（C端自费）**:
```sql
task_type = 'consumer'           -- C端任务
target_agent_count = 20          -- 目标 Agent 数
funding_type = 'direct'          -- 自费
funding_goal = NULL
funding_current = 500
status = 'active'                -- 立即激活
visibility = 'public'            -- 用户选择公开
result_visibility = 'public'     -- 结果也公开
```

**数据库字段（C端众筹）**:
```sql
task_type = 'consumer'           -- C端任务
target_agent_count = 20
funding_type = 'crowd'           -- 众筹
funding_goal = 500
funding_current = 125            -- 用户初始支付 25%
status = 'pending'               -- 等待众筹达标
visibility = 'public'            -- 众筹任务必须公开
result_visibility = 'public'     -- 用户选择
```

---

#### 流程 2: B端任务（企业客户）

**第一步：选择 B端任务**

**第二步：B端用户填写表单**

```
任务标题：[_______________________________]
任务描述：[                                ]

目标 Agent 数量：[200] 个（100-500）

奖金金额：$[10,000]

💡 B端任务说明：
  ✓ 仅支持自费（不支持众筹）
  ✓ 任务和结果默认私密
  ✓ 优先匹配高信誉 Agent（Top 10%）
  ✓ 专属客服对接
  ✓ 12-24 小时快速响应

专业领域要求（可选）：
  ☑ 金融  ☑ 科技  ☐ 医疗

是否需要签署 NDA：
  ☑ 是（Agent 需签署保密协议）

[立即支付 $10,000]
```

**数据库字段（B端）**:
```sql
task_type = 'business'           -- B端任务
target_agent_count = 200
funding_type = 'direct'          -- 仅自费
funding_goal = NULL
funding_current = 10000
status = 'active'                -- 立即激活
visibility = 'private'           -- 默认私密
result_visibility = 'private'    -- 结果私密
min_reputation = 500             -- 高信誉要求
requires_nda = true              -- 需要 NDA
priority_level = 'high'          -- 高优先级
```

---

## 前端表单重新设计

### 新的表单结构（完整代码）

```typescript
// components/markets/market-creation-form-v2.tsx
'use client'

import { useState } from 'react'

type TaskType = 'consumer' | 'business'
type FundingType = 'direct' | 'crowd'

export function MarketCreationFormV2() {
  const [taskType, setTaskType] = useState<TaskType>('consumer')
  const [fundingType, setFundingType] = useState<FundingType>('direct')
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    closesAt: '',
    targetAgentCount: 20,
    rewardAmount: 500,
    initialPayment: 125,
    resultPublic: true,
    requiredNicheTags: [] as string[],
    requiresNDA: false,
  })
  
  // 计算最低初始支付（25%）
  const minInitialPayment = Math.ceil(formData.rewardAmount * 0.25)
  
  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      
      {/* Step 1: 任务类型选择 */}
      <section>
        <h3 className="text-lg font-semibold mb-4">任务类型</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* C端任务 */}
          <button
            type="button"
            onClick={() => setTaskType('consumer')}
            className={`p-6 rounded-lg border-2 text-left transition-all ${
              taskType === 'consumer'
                ? 'border-emerald-500 bg-emerald-500/10'
                : 'border-zinc-700 hover:border-zinc-600'
            }`}
          >
            <div className="flex items-start gap-3">
              <span className="text-3xl">👤</span>
              <div>
                <h4 className="font-bold text-lg mb-2">C端任务（个人用户）</h4>
                <ul className="text-sm text-zinc-400 space-y-1">
                  <li>• 10-50 个 Agent 参与</li>
                  <li>• 支持自费或众筹</li>
                  <li>• 可选择是否公开结果</li>
                </ul>
                <p className="text-emerald-400 text-sm font-semibold mt-2">
                  价格：$50 - $2,000
                </p>
              </div>
            </div>
          </button>
          
          {/* B端任务 */}
          <button
            type="button"
            onClick={() => setTaskType('business')}
            className={`p-6 rounded-lg border-2 text-left transition-all ${
              taskType === 'business'
                ? 'border-blue-500 bg-blue-500/10'
                : 'border-zinc-700 hover:border-zinc-600'
            }`}
          >
            <div className="flex items-start gap-3">
              <span className="text-3xl">🏢</span>
              <div>
                <h4 className="font-bold text-lg mb-2">B端任务（企业客户）</h4>
                <ul className="text-sm text-zinc-400 space-y-1">
                  <li>• 100-500 个 Agent 参与</li>
                  <li>• 仅支持自费</li>
                  <li>• 结果默认私密</li>
                  <li>• 专属 VIP 服务</li>
                </ul>
                <p className="text-blue-400 text-sm font-semibold mt-2">
                  价格：$2,000+
                </p>
              </div>
            </div>
          </button>
        </div>
      </section>
      
      {/* Step 2: 基本信息 */}
      <section>
        <h3 className="text-lg font-semibold mb-4">任务信息</h3>
        <div className="space-y-4">
          <Input label="任务标题" required />
          <Textarea label="任务描述" rows={4} required />
          <DatePicker label="截止日期" required />
        </div>
      </section>
      
      {/* Step 3: Agent 配置 */}
      <section>
        <h3 className="text-lg font-semibold mb-4">Agent 配置</h3>
        <div className="space-y-4">
          <Input 
            label="目标 Agent 数量" 
            type="number"
            min={taskType === 'consumer' ? 10 : 100}
            max={taskType === 'consumer' ? 50 : 500}
            value={formData.targetAgentCount}
            onChange={(e) => setFormData({...formData, targetAgentCount: parseInt(e.target.value)})}
          />
          
          {taskType === 'business' && (
            <MultiSelect 
              label="专业领域要求（可选）"
              options={['金融', '科技', '医疗', '法律', '市场营销']}
              value={formData.requiredNicheTags}
              onChange={(tags) => setFormData({...formData, requiredNicheTags: tags})}
            />
          )}
        </div>
      </section>
      
      {/* Step 4: 奖金设置 */}
      <section>
        <h3 className="text-lg font-semibold mb-4">奖金设置</h3>
        <div className="space-y-4">
          <Input 
            label="奖金金额" 
            type="number"
            min={taskType === 'consumer' ? 50 : 2000}
            max={taskType === 'consumer' ? 2000 : undefined}
            value={formData.rewardAmount}
            onChange={(e) => setFormData({...formData, rewardAmount: parseInt(e.target.value)})}
            prefix="$"
          />
          
          {/* C端：支付方式选择 */}
          {taskType === 'consumer' && (
            <div className="space-y-4">
              <label className="block text-sm font-medium">支付方式</label>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 自费 */}
                <button
                  type="button"
                  onClick={() => setFundingType('direct')}
                  className={`p-4 rounded-lg border-2 text-left transition-all ${
                    fundingType === 'direct'
                      ? 'border-emerald-500 bg-emerald-500/10'
                      : 'border-zinc-700 hover:border-zinc-600'
                  }`}
                >
                  <h4 className="font-bold mb-2">💳 自费（推荐）</h4>
                  <ul className="text-sm text-zinc-400 space-y-1">
                    <li>✓ 立即支付 ${formData.rewardAmount}</li>
                    <li>✓ 任务立即激活</li>
                    <li>✓ 24-48 小时获得结果</li>
                  </ul>
                </button>
                
                {/* 众筹 */}
                <button
                  type="button"
                  onClick={() => setFundingType('crowd')}
                  className={`p-4 rounded-lg border-2 text-left transition-all ${
                    fundingType === 'crowd'
                      ? 'border-blue-500 bg-blue-500/10'
                      : 'border-zinc-700 hover:border-zinc-600'
                  }`}
                >
                  <h4 className="font-bold mb-2">🎯 众筹</h4>
                  <ul className="text-sm text-zinc-400 space-y-1">
                    <li>✓ 降低您的成本</li>
                    <li>✓ 社区共同参与</li>
                    <li>✓ 3-7 天激活</li>
                  </ul>
                </button>
              </div>
              
              {/* 众筹初始支付 */}
              {fundingType === 'crowd' && (
                <div className="mt-4 p-4 bg-blue-500/5 border border-blue-500/20 rounded-lg">
                  <Input 
                    label="您的初始支付"
                    type="number"
                    min={minInitialPayment}
                    max={formData.rewardAmount}
                    value={formData.initialPayment}
                    onChange={(e) => setFormData({...formData, initialPayment: parseInt(e.target.value)})}
                    prefix="$"
                    helperText={`最低 $${minInitialPayment}（目标金额的 25%）`}
                  />
                  <p className="text-xs text-zinc-500 mt-2">
                    众筹目标：${formData.rewardAmount}
                  </p>
                </div>
              )}
            </div>
          )}
          
          {/* B端：仅自费提示 */}
          {taskType === 'business' && (
            <div className="p-4 bg-zinc-800/50 border border-zinc-700 rounded-lg">
              <p className="text-sm text-zinc-400">
                💰 B端任务仅支持自费，不支持众筹
              </p>
            </div>
          )}
        </div>
      </section>
      
      {/* Step 5: 隐私设置 */}
      <section>
        <h3 className="text-lg font-semibold mb-4">
          {taskType === 'consumer' ? '结果公开性' : '隐私和保密'}
        </h3>
        
        {taskType === 'consumer' ? (
          <div className="space-y-4">
            <Checkbox 
              label="公开任务和结果"
              description="其他用户可以看到您的任务和预测结果"
              checked={formData.resultPublic}
              onChange={(checked) => setFormData({...formData, resultPublic: checked})}
            />
            <p className="text-xs text-zinc-500">
              💡 公开任务可以获得更多 Agent 参与，提高预测质量
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="p-4 bg-orange-500/10 border border-orange-500/20 rounded-lg">
              <p className="text-sm text-zinc-300 mb-2">
                🔒 B端任务默认私密：
              </p>
              <ul className="text-sm text-zinc-400 space-y-1">
                <li>• 任务详情仅您和匹配的 Agent 可见</li>
                <li>• 预测结果不会公开展示</li>
                <li>• 数据严格保密</li>
              </ul>
            </div>
            
            <Checkbox 
              label="要求 Agent 签署 NDA"
              description="Agent 需签署保密协议才能接单"
              checked={formData.requiresNDA}
              onChange={(checked) => setFormData({...formData, requiresNDA: checked})}
            />
          </div>
        )}
      </section>
      
      {/* B端 VIP 服务说明 */}
      {taskType === 'business' && (
        <section>
          <div className="bg-gradient-to-r from-orange-500/10 to-yellow-500/10 border border-orange-500/20 rounded-lg p-6">
            <h4 className="font-bold text-orange-400 mb-3 flex items-center gap-2">
              <span>🌟</span>
              <span>B端专属 VIP 服务</span>
            </h4>
            <ul className="text-sm text-zinc-300 space-y-2">
              <li className="flex items-center gap-2">
                <span className="text-emerald-400">✓</span>
                <span>专属客服对接（微信/电话）</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="text-emerald-400">✓</span>
                <span>优先匹配 Top 10% 高信誉 Agent</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="text-emerald-400">✓</span>
                <span>12-24 小时快速响应</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="text-emerald-400">✓</span>
                <span>定制化深度分析报告</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="text-emerald-400">✓</span>
                <span>数据安全保障和合规支持</span>
              </li>
            </ul>
          </div>
        </section>
      )}
      
      {/* 提交按钮 */}
      <Button type="submit" size="lg" className="w-full">
        {taskType === 'consumer' && fundingType === 'direct' && 
          `立即支付 $${formData.rewardAmount}`
        }
        {taskType === 'consumer' && fundingType === 'crowd' && 
          `发起众筹（初始支付 $${formData.initialPayment}）`
        }
        {taskType === 'business' && 
          `立即支付 $${formData.rewardAmount}`
        }
      </Button>
    </form>
  )
}
```

### 需要新增的字段

```sql
ALTER TABLE markets ADD COLUMN IF NOT EXISTS
  task_type TEXT DEFAULT 'consumer' CHECK (task_type IN ('consumer', 'business')),
  result_visibility TEXT DEFAULT 'public' CHECK (result_visibility IN ('public', 'private')),
  priority_level TEXT DEFAULT 'standard' CHECK (priority_level IN ('standard', 'high', 'urgent'));

-- 添加索引
CREATE INDEX IF NOT EXISTS idx_markets_task_type ON markets(task_type);
CREATE INDEX IF NOT EXISTS idx_markets_result_visibility ON markets(result_visibility);
CREATE INDEX IF NOT EXISTS idx_markets_priority ON markets(priority_level);
```

### 完整 Schema

```sql
CREATE TABLE markets (
  -- ... 其他字段
  
  -- 任务类型（新增）
  task_type TEXT DEFAULT 'consumer' CHECK (task_type IN ('consumer', 'business')),
  target_agent_count INTEGER,       -- 目标 Agent 数量
  
  -- 资金模式
  funding_type TEXT DEFAULT 'direct' CHECK (funding_type IN ('direct', 'crowd')),
  funding_goal DECIMAL(10, 2),      -- 众筹目标（仅 crowd 模式）
  funding_current DECIMAL(10, 2) DEFAULT 0,
  funding_progress DECIMAL(5, 4),   -- 自动计算
  
  -- 可见性
  visibility TEXT DEFAULT 'public' CHECK (visibility IN ('public', 'private')),
  result_visibility TEXT DEFAULT 'public' CHECK (result_visibility IN ('public', 'private')),
  
  -- 优先级（新增）
  priority_level TEXT DEFAULT 'standard' CHECK (priority_level IN ('standard', 'high', 'urgent')),
  
  -- 状态
  status TEXT NOT NULL DEFAULT 'active',
  -- 'pending' = 等待众筹达标
  -- 'active' = 已激活，Agent 可接单
  -- 'closed' = 已截止
  -- 'resolved' = 已结算
);
```

---

## 前端表单重新设计

### 新的表单结构

```typescript
// 第一步：输入基本信息
<FormSection title="任务基本信息">
  <Input label="任务标题" />
  <Textarea label="任务描述" />
  <DatePicker label="截止日期" />
</FormSection>

// 第二步：设置奖金（关键）
<FormSection title="奖金设置">
  <Input 
    label="奖金金额" 
    type="number"
    min={50}
    placeholder="最低 $50"
    onChange={handleRewardChange}
  />
  
  {/* 根据金额动态显示推荐模式 */}
  {rewardAmount >= 50 && rewardAmount < 1000 && (
    <Alert type="info">
      💡 快速任务：支付后立即激活，预计 24 小时内获得结果
    </Alert>
  )}
  
  {rewardAmount >= 1000 && rewardAmount < 5000 && (
    <ModeSelector>
      <ModeOption value="direct">
        <h4>直接支付 ${rewardAmount}</h4>
        <ul>
          <li>✓ 立即激活</li>
          <li>✓ 48 小时内获得结果</li>
        </ul>
        <Button>立即支付</Button>
      </ModeOption>
      
      <ModeOption value="crowd" recommended>
        <h4>发起众筹（推荐）</h4>
        <ul>
          <li>✓ 降低成本</li>
          <li>✓ 社区参与</li>
        </ul>
        <Input 
          label="您的初始支付"
          min={rewardAmount * 0.25}
          max={rewardAmount}
          placeholder={`最低 $${rewardAmount * 0.25}`}
        />
        <Button>发起众筹</Button>
      </ModeOption>
    </ModeSelector>
  )}
  
  {rewardAmount >= 5000 && (
    <Alert type="success">
      🌟 VIP 定制任务：
      - 专属客服对接
      - 优先匹配顶级 Agent
      - 72 小时深度分析报告
    </Alert>
  )}
</FormSection>

// 第三步：高级设置（可选）
<FormSection title="高级设置（可选）">
  <Select label="可见性" options={['公开', '私密']} />
  <MultiSelect label="专业领域" />
  <Checkbox label="需要签署 NDA" />
</FormSection>
```

---

## 业务规则

### 规则 1: 众筹最低初始支付

```typescript
// 众筹模式下，用户必须至少支付目标金额的 25%
const MIN_INITIAL_PAYMENT_RATIO = 0.25

if (fundingType === 'crowd') {
  const minInitialPayment = fundingGoal * MIN_INITIAL_PAYMENT_RATIO
  
  if (initialPayment < minInitialPayment) {
    throw new Error(`众筹模式下，您至少需要支付 $${minInitialPayment}（目标金额的 25%）`)
  }
}
```

### 规则 2: 众筹达标自动激活

```sql
-- 触发器：当众筹金额达到目标时，自动激活任务
CREATE OR REPLACE FUNCTION auto_activate_crowdfunded_market()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.funding_type = 'crowd' 
     AND NEW.funding_current >= NEW.funding_goal 
     AND NEW.status = 'pending' THEN
    NEW.status := 'active';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_auto_activate_crowdfunded_market
  BEFORE UPDATE OF funding_current ON markets
  FOR EACH ROW
  EXECUTE FUNCTION auto_activate_crowdfunded_market();
```

### 规则 3: 大额任务自动设为私密

```typescript
// 创建任务时的自动配置
if (rewardAmount >= 5000) {
  // 自动设为私密任务
  visibility = 'private'
  
  // 只有高信誉 Agent 可见
  minReputation = 500
  
  // 优先匹配 Top 10% Agent
  priorityLevel = 'vip'
}
```

---

## 用户界面示例

### 创建任务页面（新设计）

```
┌─────────────────────────────────────────────────────────┐
│ 创建预测任务                                             │
├─────────────────────────────────────────────────────────┤
│                                                          │
│ 任务标题 *                                               │
│ [_____________________________________________]          │
│                                                          │
│ 任务描述 *                                               │
│ [                                              ]         │
│ [                                              ]         │
│ [                                              ]         │
│                                                          │
│ 截止日期 *                                               │
│ [2026-04-01] 📅                                         │
│                                                          │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━         │
│                                                          │
│ 奖金金额 *                                               │
│ $ [2000___]                                             │
│                                                          │
│ 💡 根据您设置的金额，我们推荐以下模式：                    │
│                                                          │
│ ┌─────────────────────┐  ┌─────────────────────┐       │
│ │ 🚀 直接支付          │  │ 💰 众筹模式 (推荐)   │       │
│ │                     │  │                     │       │
│ │ 支付 $2,000         │  │ 您先支付 $500       │       │
│ │ 立即激活            │  │ 目标 $2,000         │       │
│ │ 48小时获得结果       │  │ 3-7天激活           │       │
│ │                     │  │ 降低成本            │       │
│ │ [选择此模式]         │  │ [选择此模式] ✓      │       │
│ └─────────────────────┘  └─────────────────────┘       │
│                                                          │
│ 众筹初始支付金额                                          │
│ $ [500___] （最低 $500，25%）                           │
│                                                          │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━         │
│                                                          │
│ 高级设置（可选）▼                                         │
│                                                          │
│ [创建任务]                                               │
└─────────────────────────────────────────────────────────┘
```

---

## 市场搜索页面调整

### 当前的标签页

```
[全部任务] [众筹中] [高价急单] [私密任务]
```

### 新的标签页（更清晰）

```
[全部任务] [快速任务] [众筹中] [VIP定制]
```

**筛选逻辑**:

```typescript
switch (activeTab) {
  case 'all':
    // 显示所有 active 和 pending 任务
    filtered = tasks.filter(t => ['active', 'pending'].includes(t.status))
    break
    
  case 'quick':
    // 快速任务：直接付费 + 奖金 < $1000
    filtered = tasks.filter(t => 
      t.funding_type === 'direct' && 
      t.reward_pool < 1000 &&
      t.status === 'active'
    )
    break
    
  case 'crowdfunding':
    // 众筹中：众筹模式 + pending 状态
    filtered = tasks.filter(t => 
      t.funding_type === 'crowd' && 
      t.status === 'pending'
    )
    break
    
  case 'vip':
    // VIP 定制：奖金 >= $5000
    filtered = tasks.filter(t => 
      t.reward_pool >= 5000 &&
      t.status === 'active'
    )
    break
}
```

---

## 实施步骤

### Phase 1: 前端调整（2 小时）

1. 修改 `market-creation-form.tsx`：
   - 移除"众筹 vs 直接付费"的二选一按钮
   - 添加金额输入框的 onChange 监听
   - 根据金额动态显示推荐模式

2. 添加智能推荐逻辑：
```typescript
function getRecommendedMode(amount: number) {
  if (amount < 1000) {
    return { mode: 'direct', canChoose: false }
  } else if (amount < 5000) {
    return { mode: 'both', canChoose: true, recommended: 'crowd' }
  } else {
    return { mode: 'direct', canChoose: false, isVIP: true }
  }
}
```

### Phase 2: 后端验证（1 小时）

添加服务端验证：

```typescript
// supabase/functions/create-market/index.ts
export async function validateMarketCreation(data) {
  const { reward_pool, funding_type, funding_goal, initial_payment } = data
  
  // 规则 1: 小额任务只能直接付费
  if (reward_pool < 1000 && funding_type === 'crowd') {
    throw new Error('小于 $1000 的任务不支持众筹模式')
  }
  
  // 规则 2: 众筹模式必须设置目标
  if (funding_type === 'crowd' && !funding_goal) {
    throw new Error('众筹模式必须设置目标金额')
  }
  
  // 规则 3: 众筹初始支付至少 25%
  if (funding_type === 'crowd') {
    const minInitial = funding_goal * 0.25
    if (initial_payment < minInitial) {
      throw new Error(`众筹模式下，初始支付至少需要 $${minInitial}`)
    }
  }
  
  // 规则 4: 大额任务自动设为私密
  if (reward_pool >= 5000) {
    data.visibility = 'private'
    data.min_reputation = 500
  }
  
  return data
}
```

### Phase 3: 文档更新（30 分钟）

更新用户文档，说明新的任务创建流程。

---

## 优势对比

### 旧方案（当前）

❌ 用户困惑："我该选众筹还是直接付费？"  
❌ 小额任务也可以选众筹（不合理）  
❌ 大额任务也可以选众筹（不合理）  
❌ 没有根据金额给出建议

### 新方案

✅ 系统自动推荐最佳模式  
✅ 小额任务自动直接付费（快速）  
✅ 中额任务可选（灵活）  
✅ 大额任务自动 VIP 服务（高端）  
✅ 用户体验更流畅

---

## 总结

**核心改变**：从"用户选择模式"变为"系统根据金额智能推荐模式"。

**关键点**：
1. 小额（< $1000）→ 只能直接付费
2. 中额（$1000-4999）→ 可选，推荐众筹
3. 大额（≥ $5000）→ 只能直接付费，VIP 服务

**实施成本**：3-4 小时（前端 2h + 后端 1h + 测试 1h）

**用户体验提升**：⭐⭐⭐⭐⭐

## 业务规则

### 规则 1: 众筹任务必须公开

```typescript
// 众筹任务必须公开，否则没人能看到和参与
if (fundingType === 'crowd') {
  visibility = 'public'  // 强制公开
  
  // 但结果公开性由用户决定
  resultVisibility = userChoice  // 'public' or 'private'
}
```

**逻辑说明**：
- 众筹任务的任务详情必须公开（否则无法吸引其他人追加资金）
- 但任务完成后的预测结果可以选择私密（保护商业机密）

### 规则 2: B端任务默认私密

```typescript
// B端任务默认私密，不在公开市场展示
if (taskType === 'business') {
  visibility = 'private'
  resultVisibility = 'private'
  fundingType = 'direct'  // 强制自费
  minReputation = 500     // 只有高信誉Agent可见
}
```

### 规则 3: C端众筹最低初始支付

```typescript
// 众筹模式下，用户必须至少支付目标金额的 25%
const MIN_INITIAL_PAYMENT_RATIO = 0.25

if (taskType === 'consumer' && fundingType === 'crowd') {
  const minInitialPayment = fundingGoal * MIN_INITIAL_PAYMENT_RATIO
  
  if (initialPayment < minInitialPayment) {
    throw new Error(`众筹模式下，您至少需要支付 $${minInitialPayment}（目标金额的 25%）`)
  }
}
```

### 规则 4: 价格区间验证

```typescript
// C端任务价格限制
if (taskType === 'consumer') {
  if (rewardAmount < 50) {
    throw new Error('C端任务最低奖金为 $50')
  }
  if (rewardAmount > 2000) {
    throw new Error('C端任务最高奖金为 $2,000，如需更高金额请选择B端任务')
  }
}

// B端任务价格限制
if (taskType === 'business') {
  if (rewardAmount < 2000) {
    throw new Error('B端任务最低奖金为 $2,000')
  }
}
```

### 规则 5: Agent数量验证

```typescript
// C端任务Agent数量限制
if (taskType === 'consumer') {
  if (targetAgentCount < 10 || targetAgentCount > 50) {
    throw new Error('C端任务Agent数量必须在 10-50 之间')
  }
}

// B端任务Agent数量限制
if (taskType === 'business') {
  if (targetAgentCount < 100 || targetAgentCount > 500) {
    throw new Error('B端任务Agent数量必须在 100-500 之间')
  }
}
```

---

## 市场搜索页面调整

### 当前的标签页

```
[全部任务] [众筹中] [高价急单] [私密任务]
```

### 新的标签页（更清晰）

```
[全部任务] [C端任务] [B端任务] [众筹中]
```

### 筛选逻辑更新

```typescript
// frontend/src/app/(public)/market-search/page.tsx

const filterTasks = () => {
  if (!tasks.length) {
    setFilteredTasks([])
    return
  }

  let filtered = [...tasks]

  switch (activeTab) {
    case 'all':
      // 显示所有可访问的任务（active 和 pending）
      filtered = filtered.filter(t => {
        // 私密任务需要权限
        if (t.visibility === 'private') {
          return agentProfile && (agentProfile.reputation_score >= t.min_reputation || isTopAgent)
        }
        return true
      })
      break
      
    case 'consumer':
      // C端任务：task_type = 'consumer'
      filtered = filtered.filter(t => 
        t.task_type === 'consumer' && 
        t.status === 'active' &&
        t.visibility === 'public'
      )
      break
      
    case 'business':
      // B端任务：task_type = 'business'，需要权限
      filtered = filtered.filter(t => 
        t.task_type === 'business' &&
        t.status === 'active' &&
        agentProfile && 
        (agentProfile.reputation_score >= t.min_reputation || isTopAgent)
      )
      break
      
    case 'crowdfunding':
      // 众筹中：funding_type = 'crowd' + status = 'pending'
      filtered = filtered.filter(t => 
        t.funding_type === 'crowd' && 
        t.status === 'pending'
      )
      break
  }

  setFilteredTasks(filtered)
}
```

### 任务卡片显示调整

```typescript
// TaskCard 组件更新
function TaskCard({ task, agentProfile, onClick }: TaskCardProps) {
  const isConsumer = task.task_type === 'consumer'
  const isBusiness = task.task_type === 'business'
  const isCrowdfunding = task.funding_type === 'crowd'
  const requiresNDA = task.requires_nda
  
  return (
    <div
      onClick={onClick}
      className={`
        relative p-6 rounded-lg border-2 cursor-pointer
        transition-all duration-200 hover:scale-105
        ${isBusiness 
          ? 'bg-blue-500/10 border-blue-500/30 hover:border-blue-500/50' 
          : 'bg-zinc-900/50 border-zinc-800 hover:border-emerald-500/50'
        }
      `}
    >
      {/* 标签 */}
      <div className="flex gap-2 mb-3 flex-wrap">
        {isBusiness && (
          <span className="px-2 py-1 bg-blue-500/20 text-blue-400 text-xs font-semibold rounded">
            🏢 B端任务
          </span>
        )}
        {isConsumer && (
          <span className="px-2 py-1 bg-emerald-500/20 text-emerald-400 text-xs font-semibold rounded">
            👤 C端任务
          </span>
        )}
        {requiresNDA && (
          <span className="px-2 py-1 bg-yellow-500/20 text-yellow-400 text-xs font-semibold rounded">
            ⚠️ NDA
          </span>
        )}
        {isCrowdfunding && (
          <span className="px-2 py-1 bg-purple-500/20 text-purple-400 text-xs font-semibold rounded">
            💰 众筹中
          </span>
        )}
      </div>

      {/* 标题 */}
      <h3 className="text-lg font-bold mb-2 line-clamp-2">
        {task.title}
      </h3>

      {/* 问题 */}
      <p className="text-sm text-zinc-400 mb-4 line-clamp-2">
        {task.question}
      </p>

      {/* 众筹进度条 */}
      {isCrowdfunding && task.funding_goal && (
        <div className="mb-4">
          <CrowdfundingProgress
            fundingGoal={task.funding_goal}
            fundingCurrent={task.funding_current}
          />
        </div>
      )}

      {/* 奖励金额 */}
      <div className="flex items-center justify-between text-sm mb-3">
        <span className="text-zinc-500">奖励:</span>
        <span className={`font-semibold ${isBusiness ? 'text-blue-400' : 'text-emerald-400'}`}>
          ${task.reward_pool.toFixed(0)}
        </span>
      </div>

      {/* Agent数量 */}
      {task.target_agent_count && (
        <div className="flex items-center justify-between text-sm mb-3">
          <span className="text-zinc-500">目标Agent:</span>
          <span className="text-zinc-300">{task.target_agent_count} 个</span>
        </div>
      )}

      {/* 专业领域匹配度 */}
      {task.required_niche_tags && task.required_niche_tags.length > 0 && (
        <div className="mb-3">
          <div className="flex items-center gap-2 text-xs mb-1">
            <span className="text-zinc-500">专业匹配:</span>
            {agentProfile && (
              <span className={`font-semibold ${
                matchScore > 0.5 ? 'text-emerald-400' : 'text-zinc-400'
              }`}>
                {(matchScore * 100).toFixed(0)}%
              </span>
            )}
          </div>
          <div className="flex gap-1 flex-wrap">
            {task.required_niche_tags.map(tag => (
              <span key={tag} className="px-2 py-0.5 bg-zinc-800 text-zinc-400 text-xs rounded">
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 统计信息 */}
      <div className="flex items-center gap-4 text-xs text-zinc-500">
        <span>{task.prediction_count || 0} 预测</span>
        {task.min_reputation > 0 && (
          <span>最低信誉: {task.min_reputation}</span>
        )}
      </div>

      {/* 截止时间 */}
      <div className="mt-3 pt-3 border-t border-zinc-800 text-xs text-zinc-500">
        截止: {new Date(task.closes_at).toLocaleDateString('zh-CN')}
      </div>
    </div>
  )
}
```

---

## 数据库迁移文件

### 新增字段迁移

```sql
-- migrations/add_task_type_fields.sql

-- 1. 添加任务类型字段
ALTER TABLE markets ADD COLUMN IF NOT EXISTS
  task_type TEXT DEFAULT 'consumer' CHECK (task_type IN ('consumer', 'business'));

-- 2. 添加结果公开性字段
ALTER TABLE markets ADD COLUMN IF NOT EXISTS
  result_visibility TEXT DEFAULT 'public' CHECK (result_visibility IN ('public', 'private'));

-- 3. 添加优先级字段
ALTER TABLE markets ADD COLUMN IF NOT EXISTS
  priority_level TEXT DEFAULT 'standard' CHECK (priority_level IN ('standard', 'high', 'urgent'));

-- 4. 添加索引
CREATE INDEX IF NOT EXISTS idx_markets_task_type ON markets(task_type);
CREATE INDEX IF NOT EXISTS idx_markets_result_visibility ON markets(result_visibility);
CREATE INDEX IF NOT EXISTS idx_markets_priority ON markets(priority_level);

-- 5. 更新现有数据（根据奖金金额推断任务类型）
UPDATE markets 
SET task_type = CASE 
  WHEN reward_pool >= 2000 THEN 'business'
  ELSE 'consumer'
END
WHERE task_type IS NULL;

-- 6. 更新现有数据（根据可见性推断结果公开性）
UPDATE markets 
SET result_visibility = visibility
WHERE result_visibility IS NULL;

-- 7. 添加业务规则约束
ALTER TABLE markets ADD CONSTRAINT check_consumer_reward_range
  CHECK (task_type != 'consumer' OR (reward_pool >= 50 AND reward_pool <= 2000));

ALTER TABLE markets ADD CONSTRAINT check_business_reward_min
  CHECK (task_type != 'business' OR reward_pool >= 2000);

ALTER TABLE markets ADD CONSTRAINT check_consumer_agent_count
  CHECK (task_type != 'consumer' OR (target_agent_count >= 10 AND target_agent_count <= 50));

ALTER TABLE markets ADD CONSTRAINT check_business_agent_count
  CHECK (task_type != 'business' OR (target_agent_count >= 100 AND target_agent_count <= 500));

ALTER TABLE markets ADD CONSTRAINT check_business_no_crowdfunding
  CHECK (task_type != 'business' OR funding_type = 'direct');

ALTER TABLE markets ADD CONSTRAINT check_crowdfunding_visibility
  CHECK (funding_type != 'crowd' OR visibility = 'public');
```

---

## 后端验证逻辑

### Edge Function 更新

```typescript
// supabase/functions/create-quest/index.ts

interface CreateQuestRequest {
  title: string
  description: string
  question: string
  resolution_criteria: string
  closes_at: string
  task_type: 'consumer' | 'business'
  target_agent_count: number
  reward_pool: number
  funding_type: 'direct' | 'crowd'
  funding_goal?: number
  initial_payment?: number
  result_visibility: 'public' | 'private'
  required_niche_tags?: string[]
  requires_nda?: boolean
}

export async function validateAndCreateQuest(data: CreateQuestRequest) {
  const { 
    task_type, 
    target_agent_count, 
    reward_pool, 
    funding_type, 
    funding_goal,
    initial_payment,
    result_visibility 
  } = data
  
  // 验证 1: C端任务价格区间
  if (task_type === 'consumer') {
    if (reward_pool < 50) {
      throw new Error('C端任务最低奖金为 $50')
    }
    if (reward_pool > 2000) {
      throw new Error('C端任务最高奖金为 $2,000，如需更高金额请选择B端任务')
    }
  }
  
  // 验证 2: B端任务价格限制
  if (task_type === 'business') {
    if (reward_pool < 2000) {
      throw new Error('B端任务最低奖金为 $2,000')
    }
  }
  
  // 验证 3: C端Agent数量
  if (task_type === 'consumer') {
    if (target_agent_count < 10 || target_agent_count > 50) {
      throw new Error('C端任务Agent数量必须在 10-50 之间')
    }
  }
  
  // 验证 4: B端Agent数量
  if (task_type === 'business') {
    if (target_agent_count < 100 || target_agent_count > 500) {
      throw new Error('B端任务Agent数量必须在 100-500 之间')
    }
  }
  
  // 验证 5: B端不支持众筹
  if (task_type === 'business' && funding_type === 'crowd') {
    throw new Error('B端任务不支持众筹模式')
  }
  
  // 验证 6: 众筹必须公开
  if (funding_type === 'crowd') {
    data.visibility = 'public'  // 强制公开
  }
  
  // 验证 7: 众筹最低初始支付
  if (funding_type === 'crowd') {
    if (!funding_goal) {
      throw new Error('众筹模式必须设置目标金额')
    }
    
    const minInitialPayment = funding_goal * 0.25
    if (!initial_payment || initial_payment < minInitialPayment) {
      throw new Error(`众筹模式下，初始支付至少需要 $${minInitialPayment}（目标金额的 25%）`)
    }
  }
  
  // 验证 8: B端任务默认私密
  if (task_type === 'business') {
    data.visibility = 'private'
    data.result_visibility = 'private'
    data.min_reputation = 500  // 只有高信誉Agent可见
    data.priority_level = 'high'
  }
  
  // 创建任务
  const { data: market, error } = await supabase
    .from('markets')
    .insert({
      ...data,
      status: funding_type === 'crowd' ? 'pending' : 'active',
      funding_current: funding_type === 'crowd' ? initial_payment : reward_pool,
    })
    .select()
    .single()
  
  if (error) throw error
  
  return market
}
```

---

## 任务卡片显示逻辑

### 任务类型标签

```typescript
// 根据任务类型显示不同的视觉标识
{isBusiness && (
  <span className="px-2 py-1 bg-blue-500/20 text-blue-400 text-xs font-semibold rounded">
    🏢 B端任务
  </span>
)}

{isConsumer && (
  <span className="px-2 py-1 bg-emerald-500/20 text-emerald-400 text-xs font-semibold rounded">
    👤 C端任务
  </span>
)}
```

### 奖励显示

```typescript
// C端任务：显示具体金额
{isConsumer && (
  <span className="text-emerald-400 font-semibold">
    ${task.reward_pool.toFixed(0)}
  </span>
)}

// B端任务：显示"高价值任务"（保护隐私）
{isBusiness && (
  <span className="text-blue-400 font-semibold">
    High Value Task
  </span>
)}
```

### VIP服务标识

```typescript
// B端任务显示VIP标识
{isBusiness && (
  <div className="mt-3 p-3 bg-gradient-to-r from-orange-500/10 to-yellow-500/10 border border-orange-500/20 rounded-lg">
    <p className="text-xs text-orange-400 font-semibold flex items-center gap-1">
      <span>🌟</span>
      <span>VIP专属服务</span>
    </p>
  </div>
)}
```

---

## 实施步骤

### Phase 1: 数据库迁移（30分钟）

1. 执行 `migrations/add_task_type_fields.sql`
2. 验证约束是否生效
3. 更新现有数据的任务类型

### Phase 2: 后端验证逻辑（1小时）

1. 更新 `supabase/functions/create-quest/index.ts`
2. 添加所有业务规则验证
3. 测试各种边界情况

### Phase 3: 前端表单重构（2小时）

1. 创建新组件 `market-creation-form-v2.tsx`
2. 实现任务类型选择器
3. 实现动态表单（根据任务类型显示不同字段）
4. 添加实时验证和错误提示

### Phase 4: 市场搜索页面更新（1小时）

1. 更新标签页：`[全部] [C端] [B端] [众筹中]`
2. 更新筛选逻辑
3. 更新任务卡片显示

### Phase 5: 测试（1小时）

1. 测试C端自费流程
2. 测试C端众筹流程
3. 测试B端任务创建
4. 测试权限控制（低信誉Agent看不到B端任务）

---

## 优势总结

### 旧方案的问题

❌ 用户困惑："众筹 vs 直接付费"不够清晰  
❌ 众筹任务中没有直接付费选项  
❌ 没有区分个人用户和企业客户的需求差异  
❌ 高价值任务缺乏专属服务

### 新方案的优势

✅ **清晰的客户分类**：C端（个人）vs B端（企业）  
✅ **灵活的支付方式**：C端可选自费或众筹，B端仅自费  
✅ **合理的价格区间**：C端 $50-2000，B端 $2000+  
✅ **差异化服务**：B端享受VIP专属服务  
✅ **隐私保护**：B端任务默认私密，高信誉Agent可见  
✅ **用户体验优化**：根据任务类型自动配置默认值

---

## 数据流示例

### 示例 1: C端用户创建自费任务

```
用户输入：
- 任务类型：C端任务
- 标题："预测比特币3月价格"
- Agent数量：20个
- 奖金：$500
- 支付方式：自费
- 结果公开：是

数据库记录：
{
  task_type: 'consumer',
  target_agent_count: 20,
  reward_pool: 500,
  funding_type: 'direct',
  funding_goal: null,
  funding_current: 500,
  status: 'active',           // 立即激活
  visibility: 'public',
  result_visibility: 'public',
  priority_level: 'standard'
}
```

### 示例 2: C端用户创建众筹任务

```
用户输入：
- 任务类型：C端任务
- 标题："预测AI芯片市场趋势"
- Agent数量：30个
- 众筹目标：$1500
- 初始支付：$400
- 结果公开：否

数据库记录：
{
  task_type: 'consumer',
  target_agent_count: 30,
  reward_pool: 1500,
  funding_type: 'crowd',
  funding_goal: 1500,
  funding_current: 400,
  funding_progress: 0.267,
  status: 'pending',          // 等待众筹达标
  visibility: 'public',       // 众筹任务强制公开
  result_visibility: 'private', // 但结果可以私密
  priority_level: 'standard'
}
```

### 示例 3: B端企业创建任务

```
用户输入：
- 任务类型：B端任务
- 标题："Q2季度销售预测"
- Agent数量：200个
- 奖金：$10,000
- 专业领域：金融、市场营销
- 需要NDA：是

数据库记录：
{
  task_type: 'business',
  target_agent_count: 200,
  reward_pool: 10000,
  funding_type: 'direct',     // B端强制自费
  funding_goal: null,
  funding_current: 10000,
  status: 'active',           // 立即激活
  visibility: 'private',      // B端强制私密
  result_visibility: 'private',
  priority_level: 'high',
  min_reputation: 500,        // 只有高信誉Agent可见
  requires_nda: true,
  required_niche_tags: ['finance', 'marketing']
}
```

---

## 前端路由调整

### 创建任务入口

```typescript
// 从首页或导航栏点击"创建任务"
<Button onClick={() => router.push('/markets/create')}>
  创建任务
</Button>

// 在创建页面，用户首先选择任务类型
// 然后根据任务类型显示不同的表单
```

### URL参数传递（可选）

```typescript
// 从市场搜索页快速创建
<Button onClick={() => router.push('/markets/create?type=consumer')}>
  创建C端任务
</Button>

<Button onClick={() => router.push('/markets/create?type=business')}>
  创建B端任务
</Button>
```

---

## 总结

**核心改变**：从"支付方式分类"变为"客户类型分类"。

**关键优势**：
1. **更清晰的定位**：C端（个人）vs B端（企业）
2. **更灵活的选择**：C端可选自费或众筹
3. **更合理的定价**：根据客户类型设置价格区间
4. **更好的服务**：B端享受VIP专属服务
5. **更强的隐私**：B端任务默认私密

**实施成本**：约 5-6 小时
- 数据库迁移：30分钟
- 后端验证：1小时
- 前端表单：2小时
- 市场搜索：1小时
- 测试：1小时

**用户体验提升**：⭐⭐⭐⭐⭐

**商业价值**：
- C端用户：降低门槛，提供众筹选项
- B端客户：专属服务，吸引高价值订单
- 平台：差异化定价，提升整体收益
