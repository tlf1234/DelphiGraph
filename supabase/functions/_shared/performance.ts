// AgentOracle - 性能监控工具
// 提供API响应时间监控和性能分析

import { createLogger } from './logger.ts'

const logger = createLogger('performance')

/**
 * 性能计时器
 */
export class PerformanceTimer {
  private startTime: number
  private marks: Map<string, number> = new Map()

  constructor() {
    this.startTime = Date.now()
  }

  /**
   * 标记一个时间点
   */
  mark(name: string): void {
    this.marks.set(name, Date.now() - this.startTime)
  }

  /**
   * 获取从开始到现在的时间
   */
  elapsed(): number {
    return Date.now() - this.startTime
  }

  /**
   * 获取两个标记之间的时间
   */
  measure(startMark: string, endMark: string): number | null {
    const start = this.marks.get(startMark)
    const end = this.marks.get(endMark)
    
    if (start === undefined || end === undefined) {
      return null
    }
    
    return end - start
  }

  /**
   * 获取所有标记
   */
  getMarks(): Record<string, number> {
    return Object.fromEntries(this.marks)
  }

  /**
   * 记录性能日志
   */
  log(functionName: string): void {
    const totalTime = this.elapsed()
    const marks = this.getMarks()
    
    logger.info('Performance metrics', {
      function: functionName,
      total_time_ms: totalTime,
      marks,
    })

    // 如果响应时间超过1秒，记录警告
    if (totalTime > 1000) {
      logger.warn('Slow response detected', {
        function: functionName,
        total_time_ms: totalTime,
      })
    }
  }
}

/**
 * 性能监控装饰器
 * 自动记录函数执行时间
 */
export function withPerformanceMonitoring<T>(
  fn: () => Promise<T>,
  functionName: string
): Promise<T> {
  const timer = new PerformanceTimer()
  
  return fn()
    .then((result) => {
      timer.log(functionName)
      return result
    })
    .catch((error) => {
      timer.log(functionName)
      throw error
    })
}

/**
 * 添加性能头到响应
 */
export function addPerformanceHeaders(
  response: Response,
  timer: PerformanceTimer
): Response {
  const headers = new Headers(response.headers)
  headers.set('X-Response-Time', `${timer.elapsed()}ms`)
  
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

/**
 * 数据库查询性能监控
 */
export async function monitorQuery<T>(
  queryName: string,
  queryFn: () => Promise<T>
): Promise<T> {
  const startTime = Date.now()
  
  try {
    const result = await queryFn()
    const duration = Date.now() - startTime
    
    logger.info('Database query completed', {
      query: queryName,
      duration_ms: duration,
    })
    
    // 慢查询警告（超过500ms）
    if (duration > 500) {
      logger.warn('Slow database query detected', {
        query: queryName,
        duration_ms: duration,
      })
    }
    
    return result
  } catch (error) {
    const duration = Date.now() - startTime
    logger.error('Database query failed', {
      query: queryName,
      duration_ms: duration,
      error,
    })
    throw error
  }
}

/**
 * 批量操作性能监控
 */
export class BatchMonitor {
  private operations: Array<{ name: string; duration: number }> = []
  private startTime: number

  constructor() {
    this.startTime = Date.now()
  }

  async track<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const opStart = Date.now()
    try {
      const result = await fn()
      this.operations.push({
        name,
        duration: Date.now() - opStart,
      })
      return result
    } catch (error) {
      this.operations.push({
        name: `${name} (failed)`,
        duration: Date.now() - opStart,
      })
      throw error
    }
  }

  log(batchName: string): void {
    const totalTime = Date.now() - this.startTime
    
    logger.info('Batch operation completed', {
      batch: batchName,
      total_time_ms: totalTime,
      operations: this.operations,
      operation_count: this.operations.length,
    })
  }
}

/**
 * 响应大小监控
 */
export function logResponseSize(data: any, functionName: string): void {
  const jsonString = JSON.stringify(data)
  const sizeBytes = new TextEncoder().encode(jsonString).length
  const sizeKB = (sizeBytes / 1024).toFixed(2)
  
  logger.info('Response size', {
    function: functionName,
    size_bytes: sizeBytes,
    size_kb: sizeKB,
  })
  
  // 大响应警告（超过1MB）
  if (sizeBytes > 1024 * 1024) {
    logger.warn('Large response detected', {
      function: functionName,
      size_kb: sizeKB,
    })
  }
}
