// AI服务统一入口

import type { AIProvider, AIMessage, AIResponse, AIOptions } from './types'
import { QwenProvider } from './qwen'
import { OpenAIProvider } from './openai'

export type { AIProvider, AIMessage, AIResponse, AIOptions }

/**
 * 获取AI服务实例
 * 优先使用千问，如果不可用则使用OpenAI
 */
export function getAIProvider(): AIProvider {
  // 优先尝试千问
  if (process.env.QWEN_API_KEY) {
    try {
      return new QwenProvider()
    } catch (error) {
      console.warn('千问初始化失败，尝试使用OpenAI:', error)
    }
  }

  // 备选OpenAI
  if (process.env.OPENAI_API_KEY) {
    try {
      return new OpenAIProvider()
    } catch (error) {
      console.error('OpenAI初始化失败:', error)
      throw new Error('没有可用的AI服务')
    }
  }

  throw new Error('未配置AI服务密钥（QWEN_API_KEY 或 OPENAI_API_KEY）')
}

/**
 * 生成AI补全
 */
export async function generateAICompletion(
  messages: AIMessage[],
  options?: AIOptions
): Promise<AIResponse> {
  const provider = getAIProvider()
  return provider.generateCompletion(messages, options)
}
