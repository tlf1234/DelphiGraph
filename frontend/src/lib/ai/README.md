# AI服务使用指南

## 概述

AgentOracle支持多个AI服务提供商，优先使用阿里千问，自动降级到OpenAI。

## 配置

在 `.env.local` 中配置：

```env
# 阿里千问（推荐，国内访问快）
QWEN_API_KEY=sk-xxxxx
QWEN_MODEL=qwen-max
QWEN_API_BASE=https://dashscope.aliyuncs.com/compatible-mode/v1

# OpenAI（备选）
OPENAI_API_KEY=sk-xxxxx
OPENAI_MODEL=gpt-4
```

## 使用示例

### 基础用法

```typescript
import { generateAICompletion } from '@/lib/ai'

const response = await generateAICompletion([
  { role: 'system', content: '你是一个预测分析助手' },
  { role: 'user', content: '分析这个市场的趋势' }
])

console.log(response.content)
console.log(response.model)
console.log(response.usage)
```

### 自定义参数

```typescript
import { generateAICompletion } from '@/lib/ai'

const response = await generateAICompletion(
  [
    { role: 'user', content: '生成一个预测' }
  ],
  {
    temperature: 0.8,
    max_tokens: 1000,
    top_p: 0.9
  }
)
```

### 直接使用特定提供商

```typescript
import { QwenProvider } from '@/lib/ai/qwen'
import { OpenAIProvider } from '@/lib/ai/openai'

// 使用千问
const qwen = new QwenProvider()
const response1 = await qwen.generateCompletion([...])

// 使用OpenAI
const openai = new OpenAIProvider()
const response2 = await openai.generateCompletion([...])
```

## 服务选择逻辑

1. 检查 `QWEN_API_KEY` 是否配置
   - 如果配置，尝试使用千问
   - 如果千问初始化失败，继续下一步

2. 检查 `OPENAI_API_KEY` 是否配置
   - 如果配置，使用OpenAI
   - 如果OpenAI初始化失败，抛出错误

3. 如果都未配置，抛出错误

## 错误处理

```typescript
import { generateAICompletion } from '@/lib/ai'

try {
  const response = await generateAICompletion([...])
  console.log(response.content)
} catch (error) {
  if (error.message.includes('未配置')) {
    console.error('请配置AI服务密钥')
  } else if (error.message.includes('API错误')) {
    console.error('AI服务调用失败:', error.message)
  } else {
    console.error('未知错误:', error)
  }
}
```

## 在Edge Functions中使用

```typescript
// supabase/functions/your-function/index.ts
import { generateAICompletion } from '../../../lib/ai/index.ts'

Deno.serve(async (req) => {
  try {
    const { prompt } = await req.json()
    
    const response = await generateAICompletion([
      { role: 'user', content: prompt }
    ])
    
    return new Response(
      JSON.stringify({ result: response.content }),
      { headers: { 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})
```

## API参考

### AIMessage

```typescript
interface AIMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}
```

### AIResponse

```typescript
interface AIResponse {
  content: string
  model: string
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}
```

### AIOptions

```typescript
interface AIOptions {
  temperature?: number  // 0-1, 默认0.7
  max_tokens?: number   // 默认2000
  top_p?: number        // 0-1, 默认0.9
}
```

## 成本估算

### 阿里千问 (qwen-max)
- 输入: ¥0.04 / 1K tokens
- 输出: ¥0.12 / 1K tokens

### OpenAI (gpt-4)
- 输入: $0.03 / 1K tokens
- 输出: $0.06 / 1K tokens

建议优先使用千问以降低成本。

## 常见问题

### Q: 如何切换AI服务？
A: 只需在 `.env.local` 中配置对应的API密钥即可。系统会自动选择可用的服务。

### Q: 可以同时使用两个服务吗？
A: 可以。系统会优先使用千问，如果失败会自动切换到OpenAI。

### Q: 如何添加新的AI服务？
A: 
1. 在 `lib/ai/` 下创建新的提供商文件（如 `claude.ts`）
2. 实现 `AIProvider` 接口
3. 在 `lib/ai/index.ts` 中添加选择逻辑

### Q: API调用失败怎么办？
A: 检查：
1. API密钥是否正确
2. 网络连接是否正常
3. API配额是否用完
4. 查看错误日志获取详细信息
