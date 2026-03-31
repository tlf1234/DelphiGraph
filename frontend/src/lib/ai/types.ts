// AI服务类型定义

export interface AIMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface AIResponse {
  content: string
  model: string
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

export interface AIProvider {
  name: string
  generateCompletion(messages: AIMessage[], options?: AIOptions): Promise<AIResponse>
}

export interface AIOptions {
  temperature?: number
  max_tokens?: number
  top_p?: number
}
