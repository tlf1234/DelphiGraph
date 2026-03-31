import { createClient } from '@supabase/supabase-js'
import { Database } from '@/lib/types/database.types'

export interface ApiKeyVerificationResult {
  valid: boolean
  userId?: string
  error?: string
}

/**
 * 验证API Key并返回关联的用户ID
 * @param apiKey - 要验证的API Key
 * @returns 验证结果，包含用户ID或错误信息
 */
export async function verifyApiKey(apiKey: string): Promise<ApiKeyVerificationResult> {
  if (!apiKey) {
    return {
      valid: false,
      error: 'API Key不能为空',
    }
  }

  try {
    // 创建Supabase客户端（使用服务角色密钥）
    const supabase = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // 查询API Key对应的用户
    // 注意：实际应该使用bcrypt比较哈希值，这里简化处理
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username')
      .eq('api_key_hash', apiKey)
      .maybeSingle()

    if (error || !data) {
      return {
        valid: false,
        error: 'API Key无效',
      }
    }

    return {
      valid: true,
      userId: (data as { id: string; username: string }).id,
    }
  } catch (error) {
    console.error('API Key验证错误:', error)
    return {
      valid: false,
      error: '验证过程中发生错误',
    }
  }
}

/**
 * 从请求头中提取API Key
 * @param headers - 请求头对象
 * @returns API Key字符串或null
 */
export function extractApiKey(headers: Headers): string | null {
  // 支持两种格式：
  // 1. Authorization: Bearer <api_key>
  // 2. X-API-Key: <api_key>
  
  const authHeader = headers.get('authorization')
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7)
  }

  const apiKeyHeader = headers.get('x-api-key')
  if (apiKeyHeader) {
    return apiKeyHeader
  }

  return null
}
