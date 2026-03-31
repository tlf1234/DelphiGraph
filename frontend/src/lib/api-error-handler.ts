// DelphiGraph - 前端API错误处理工具
// 提供统一的错误解析和用户友好的错误消息

export interface ApiErrorResponse {
  error: string
  code?: string
  details?: Record<string, any>
  timestamp?: string
}

export class ApiError extends Error {
  constructor(
    public message: string,
    public code?: string,
    public statusCode?: number,
    public details?: Record<string, any>
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

// 错误代码到用户友好消息的映射
const ERROR_MESSAGES: Record<string, string> = {
  // 认证错误
  MISSING_API_KEY: 'API密钥缺失，请检查您的配置',
  INVALID_API_KEY: 'API密钥无效，请重新生成',
  MISSING_AUTH: '请先登录',
  UNAUTHORIZED: '未授权访问',
  
  // 权限错误
  FORBIDDEN: '您没有权限执行此操作',
  ACCOUNT_RESTRICTED: '您的账号处于炼狱模式，请完成校准任务',
  INSUFFICIENT_LEVEL: '您的等级不足以参与此市场',
  OBSERVATION_PERIOD: '新账号观察期内只能参与低价值市场',
  
  // 请求错误
  MISSING_FIELDS: '请填写所有必需字段',
  INVALID_INPUT: '输入数据无效',
  VALIDATION_ERROR: '数据验证失败',
  
  // 资源错误
  NOT_FOUND: '请求的资源不存在',
  MARKET_NOT_FOUND: '市场不存在',
  USER_NOT_FOUND: '用户不存在',
  
  // 冲突错误
  MARKET_CLOSED: '市场已关闭，无法提交预测',
  ALREADY_RESOLVED: '市场已结算',
  DUPLICATE_ENTRY: '重复的条目',
  
  // 限流错误
  RATE_LIMIT: '请求过于频繁，请稍后再试',
  DAILY_LIMIT: '已达到今日预测次数限制',
  
  // 服务器错误
  INTERNAL_ERROR: '服务器内部错误，请稍后再试',
  DATABASE_ERROR: '数据库错误',
  EXTERNAL_API_ERROR: '外部API调用失败',
}

export function parseApiError(error: unknown): ApiError {
  // 如果已经是ApiError，直接返回
  if (error instanceof ApiError) {
    return error
  }

  // 如果是Response对象
  if (error instanceof Response) {
    return new ApiError(
      '请求失败',
      'NETWORK_ERROR',
      error.status
    )
  }

  // 如果是普通Error
  if (error instanceof Error) {
    return new ApiError(error.message, 'UNKNOWN_ERROR')
  }

  // 如果是对象（可能是fetch返回的JSON）
  if (typeof error === 'object' && error !== null) {
    const errorObj = error as ApiErrorResponse
    const message = errorObj.code && ERROR_MESSAGES[errorObj.code]
      ? ERROR_MESSAGES[errorObj.code]
      : errorObj.error || '未知错误'
    
    return new ApiError(
      message,
      errorObj.code,
      undefined,
      errorObj.details
    )
  }

  // 未知错误
  return new ApiError('发生未知错误', 'UNKNOWN_ERROR')
}

export async function handleApiResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let errorData: ApiErrorResponse
    
    try {
      errorData = await response.json()
    } catch {
      // 如果无法解析JSON，使用默认错误
      throw new ApiError(
        `请求失败 (${response.status})`,
        'HTTP_ERROR',
        response.status
      )
    }

    const message = errorData.code && ERROR_MESSAGES[errorData.code]
      ? ERROR_MESSAGES[errorData.code]
      : errorData.error || '请求失败'

    throw new ApiError(
      message,
      errorData.code,
      response.status,
      errorData.details
    )
  }

  return response.json()
}

// 便捷的错误处理包装器
export async function withErrorHandling<T>(
  apiCall: () => Promise<T>,
  onError?: (error: ApiError) => void
): Promise<T | null> {
  try {
    return await apiCall()
  } catch (error) {
    const apiError = parseApiError(error)
    if (onError) {
      onError(apiError)
    } else {
      console.error('API Error:', apiError)
    }
    return null
  }
}
