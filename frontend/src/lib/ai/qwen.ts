// 阿里千问AI服务

import type { AIProvider, AIMessage, AIResponse, AIOptions } from './types'

export class QwenProvider implements AIProvider {
  name = 'Qwen'
  private apiKey: string
  private model: string
  private apiBase: string

  constructor() {
    this.apiKey = process.env.QWEN_API_KEY || ''
    this.model = process.env.QWEN_MODEL || 'qwen-max'
    this.apiBase = process.env.QWEN_API_BASE || 'https://dashscope.aliyuncs.com/compatible-mode/v1'

    if (!this.apiKey) {
      throw new Error('QWEN_API_KEY 未配置')
    }
  }

  async generateCompletion(
    messages: AIMessage[],
    options: AIOptions = {}
  ): Promise<AIResponse> {
    const response = await fetch(`${this.apiBase}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.max_tokens ?? 2000,
        top_p: options.top_p ?? 0.9,
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Qwen API错误: ${response.status} - ${error}`)
    }

    const data = await response.json()

    return {
      content: data.choices[0].message.content,
      model: data.model,
      usage: data.usage,
    }
  }
}
