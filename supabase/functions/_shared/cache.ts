// AgentOracle - 缓存工具
// 提供简单的内存缓存和响应缓存头设置

interface CacheEntry<T> {
  data: T
  timestamp: number
  ttl: number
}

class MemoryCache {
  private cache: Map<string, CacheEntry<any>> = new Map()

  set<T>(key: string, data: T, ttlSeconds: number = 60): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttlSeconds * 1000,
    })
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key)
    
    if (!entry) {
      return null
    }

    // 检查是否过期
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key)
      return null
    }

    return entry.data as T
  }

  delete(key: string): void {
    this.cache.delete(key)
  }

  clear(): void {
    this.cache.clear()
  }

  // 清理过期条目
  cleanup(): void {
    const now = Date.now()
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key)
      }
    }
  }
}

// 全局缓存实例
export const cache = new MemoryCache()

// 定期清理过期条目（每5分钟）
setInterval(() => {
  cache.cleanup()
}, 5 * 60 * 1000)

/**
 * 创建带缓存头的响应
 */
export function createCachedResponse(
  data: any,
  options: {
    maxAge?: number  // 浏览器缓存时间（秒）
    sMaxAge?: number  // CDN缓存时间（秒）
    staleWhileRevalidate?: number  // 过期后仍可使用的时间（秒）
    corsHeaders?: Record<string, string>
  } = {}
): Response {
  const {
    maxAge = 0,
    sMaxAge = 60,
    staleWhileRevalidate = 30,
    corsHeaders = {},
  } = options

  const cacheControl = [
    maxAge > 0 ? `max-age=${maxAge}` : 'no-cache',
    `s-maxage=${sMaxAge}`,
    `stale-while-revalidate=${staleWhileRevalidate}`,
  ].join(', ')

  return new Response(JSON.stringify(data), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': cacheControl,
      ...corsHeaders,
    },
  })
}

/**
 * 缓存装饰器函数
 * 用于包装异步函数，自动处理缓存
 */
export function withCache<T>(
  fn: () => Promise<T>,
  cacheKey: string,
  ttlSeconds: number = 60
): Promise<T> {
  // 尝试从缓存获取
  const cached = cache.get<T>(cacheKey)
  if (cached !== null) {
    return Promise.resolve(cached)
  }

  // 执行函数并缓存结果
  return fn().then((result) => {
    cache.set(cacheKey, result, ttlSeconds)
    return result
  })
}

/**
 * 生成缓存键
 */
export function generateCacheKey(
  prefix: string,
  params: Record<string, any>
): string {
  const sortedParams = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&')
  
  return `${prefix}:${sortedParams}`
}

/**
 * 条件缓存：仅在满足条件时缓存
 */
export function conditionalCache<T>(
  data: T,
  cacheKey: string,
  condition: (data: T) => boolean,
  ttlSeconds: number = 60
): T {
  if (condition(data)) {
    cache.set(cacheKey, data, ttlSeconds)
  }
  return data
}
