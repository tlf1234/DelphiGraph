// AgentOracle - 统一错误处理工具
// 提供标准化的错误响应格式和错误类型

export interface ErrorResponse {
  error: string
  code?: string
  details?: Record<string, any>
  timestamp: string
}

export enum ErrorCode {
  // 认证错误 (401)
  MISSING_API_KEY = 'MISSING_API_KEY',
  INVALID_API_KEY = 'INVALID_API_KEY',
  MISSING_AUTH = 'MISSING_AUTH',
  UNAUTHORIZED = 'UNAUTHORIZED',
  
  // 权限错误 (403)
  FORBIDDEN = 'FORBIDDEN',
  ACCOUNT_RESTRICTED = 'ACCOUNT_RESTRICTED',
  INSUFFICIENT_LEVEL = 'INSUFFICIENT_LEVEL',
  OBSERVATION_PERIOD = 'OBSERVATION_PERIOD',
  NDA_REQUIRED = 'NDA_REQUIRED',
  
  // 请求错误 (400)
  MISSING_FIELDS = 'MISSING_FIELDS',
  INVALID_INPUT = 'INVALID_INPUT',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  
  // 资源错误 (404)
  NOT_FOUND = 'NOT_FOUND',
  MARKET_NOT_FOUND = 'MARKET_NOT_FOUND',
  USER_NOT_FOUND = 'USER_NOT_FOUND',
  
  // 冲突错误 (409)
  MARKET_CLOSED = 'MARKET_CLOSED',
  ALREADY_RESOLVED = 'ALREADY_RESOLVED',
  DUPLICATE_ENTRY = 'DUPLICATE_ENTRY',
  
  // 限流错误 (429)
  RATE_LIMIT = 'RATE_LIMIT',
  DAILY_LIMIT = 'DAILY_LIMIT',
  
  // 服务器错误 (500)
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
  EXTERNAL_API_ERROR = 'EXTERNAL_API_ERROR',
}

export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    public message: string,
    public statusCode: number = 500,
    public details?: Record<string, any>
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export function createErrorResponse(
  error: Error | AppError | unknown,
  corsHeaders: Record<string, string>
): Response {
  const timestamp = new Date().toISOString()
  
  // 如果是AppError，使用结构化错误
  if (error instanceof AppError) {
    const errorResponse: ErrorResponse = {
      error: error.message,
      code: error.code,
      details: error.details,
      timestamp,
    }
    
    // 记录错误日志
    console.error(`[${error.code}] ${error.message}`, error.details || '')
    
    return new Response(JSON.stringify(errorResponse), {
      status: error.statusCode,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  
  // 如果是普通Error
  if (error instanceof Error) {
    const errorResponse: ErrorResponse = {
      error: error.message,
      code: ErrorCode.INTERNAL_ERROR,
      timestamp,
    }
    
    console.error('[INTERNAL_ERROR]', error.message, error.stack)
    
    return new Response(JSON.stringify(errorResponse), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  
  // 未知错误
  const errorResponse: ErrorResponse = {
    error: 'An unexpected error occurred',
    code: ErrorCode.INTERNAL_ERROR,
    timestamp,
  }
  
  console.error('[UNKNOWN_ERROR]', error)
  
  return new Response(JSON.stringify(errorResponse), {
    status: 500,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// 便捷的错误创建函数
export const Errors = {
  missingApiKey: () => new AppError(
    ErrorCode.MISSING_API_KEY,
    'API Key缺失',
    401
  ),
  
  invalidApiKey: () => new AppError(
    ErrorCode.INVALID_API_KEY,
    'API Key无效',
    401
  ),
  
  missingAuth: () => new AppError(
    ErrorCode.MISSING_AUTH,
    'Missing authorization header',
    401
  ),
  
  unauthorized: () => new AppError(
    ErrorCode.UNAUTHORIZED,
    'Unauthorized',
    401
  ),
  
  forbidden: (message: string = 'Forbidden') => new AppError(
    ErrorCode.FORBIDDEN,
    message,
    403
  ),
  
  accountRestricted: () => new AppError(
    ErrorCode.ACCOUNT_RESTRICTED,
    '您的账号处于炼狱模式，只能参与校准任务',
    403,
    {
      status: 'restricted',
      message: '请完成校准任务以恢复正常状态'
    }
  ),
  
  insufficientLevel: (details: Record<string, any>) => new AppError(
    ErrorCode.INSUFFICIENT_LEVEL,
    '您的等级无法参与此高价值市场',
    403,
    details
  ),
  
  observationPeriod: (accountAge: number, marketValue: number) => new AppError(
    ErrorCode.OBSERVATION_PERIOD,
    '新账号观察期内只能参与低价值市场（≤$100）',
    403,
    { accountAge: Math.floor(accountAge), marketValue }
  ),
  
  ndaRequired: () => new AppError(
    ErrorCode.NDA_REQUIRED,
    '此任务需要签署NDA才能提交预测',
    403,
    {
      message: '请先签署保密协议（NDA）'
    }
  ),
  
  missingFields: (fields?: string[]) => new AppError(
    ErrorCode.MISSING_FIELDS,
    fields ? `缺少必需字段: ${fields.join(', ')}` : '缺少必需字段',
    400,
    fields ? { missingFields: fields } : undefined
  ),
  
  invalidInput: (message: string, details?: Record<string, any>) => new AppError(
    ErrorCode.INVALID_INPUT,
    message,
    400,
    details
  ),
  
  notFound: (resource: string = 'Resource') => new AppError(
    ErrorCode.NOT_FOUND,
    `${resource} not found`,
    404
  ),
  
  marketNotFound: () => new AppError(
    ErrorCode.MARKET_NOT_FOUND,
    '市场不存在',
    404
  ),
  
  marketClosed: () => new AppError(
    ErrorCode.MARKET_CLOSED,
    '市场已关闭，无法提交预测',
    409
  ),
  
  alreadyResolved: () => new AppError(
    ErrorCode.ALREADY_RESOLVED,
    'Market already resolved',
    400
  ),
  
  dailyLimit: (details: Record<string, any>) => new AppError(
    ErrorCode.DAILY_LIMIT,
    '已达到今日预测次数限制',
    429,
    details
  ),
  
  databaseError: (message: string) => new AppError(
    ErrorCode.DATABASE_ERROR,
    `Database error: ${message}`,
    500
  ),
}
