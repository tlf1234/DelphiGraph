/**
 * 统一的 API 客户端
 * 所有组件通过这个工具调用 /api/ 路由
 */

interface ApiRequestOptions extends RequestInit {
  params?: Record<string, string>
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/**
 * 统一的 API 请求函数
 */
export async function apiRequest<T = any>(
  url: string,
  options?: ApiRequestOptions
): Promise<T> {
  try {
    // 构建 URL（添加查询参数）
    const fullUrl = new URL(url, window.location.origin)
    if (options?.params) {
      Object.entries(options.params).forEach(([key, value]) => {
        fullUrl.searchParams.append(key, value)
      })
    }

    const response = await fetch(fullUrl.toString(), {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    })

    // 解析响应
    const data = await response.json()

    if (!response.ok) {
      throw new ApiError(
        data.error || data.message || 'API request failed',
        response.status,
        data.code
      )
    }

    return data
  } catch (error) {
    if (error instanceof ApiError) {
      throw error
    }
    
    console.error('API Request failed:', error)
    throw new ApiError(
      error instanceof Error ? error.message : 'Unknown error',
      500
    )
  }
}

/**
 * GET 请求
 */
export async function apiGet<T = any>(
  url: string,
  params?: Record<string, string>
): Promise<T> {
  return apiRequest<T>(url, { method: 'GET', params })
}

/**
 * POST 请求
 */
export async function apiPost<T = any>(
  url: string,
  data?: any
): Promise<T> {
  return apiRequest<T>(url, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

/**
 * PUT 请求
 */
export async function apiPut<T = any>(
  url: string,
  data?: any
): Promise<T> {
  return apiRequest<T>(url, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

/**
 * DELETE 请求
 */
export async function apiDelete<T = any>(url: string): Promise<T> {
  return apiRequest<T>(url, { method: 'DELETE' })
}
