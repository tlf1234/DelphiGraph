// OpenAI服务（备选）

import type { AIProvider, AIMessage, AIResponse, AIOptions } from './types'

export class OpenAIProvider implements AIProvider {
  name = 'OpenAI'
  private apiKey: string
  private model: string

  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY || ''
    this.model = process.env.OPENAI_MODEL || 'gpt-4'

    if (!this.apiKey) {
      throw new Error('OPENAI_API_KEY 未配置')
    }
  }

  async generateCompletion(
    messages: AIMessage[],
    options: AIOptions = {}
  ): Promise<AIResponse> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
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
      throw new Error(`OpenAI API错误: ${response.status} - ${error}`)
    }

    const data = await response.json()

    return {
      content: data.choices[0].message.content,
      model: data.model,
      usage: data.usage,
    }
  }
}
