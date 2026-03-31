/**
 * Performance Utilities
 * 
 * Provides debounce, throttle, and other performance optimization utilities
 */

/**
 * Debounce function - delays execution until after wait time has elapsed
 * since the last time it was invoked
 * 
 * @param func - Function to debounce
 * @param wait - Wait time in milliseconds
 * @returns Debounced function
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null
  
  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null
      func(...args)
    }
    
    if (timeout) clearTimeout(timeout)
    timeout = setTimeout(later, wait)
  }
}

/**
 * Throttle function - ensures function is called at most once per limit period
 * 
 * @param func - Function to throttle
 * @param limit - Minimum time between calls in milliseconds
 * @returns Throttled function
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean = false
  
  return function executedFunction(...args: Parameters<T>) {
    if (!inThrottle) {
      func(...args)
      inThrottle = true
      setTimeout(() => (inThrottle = false), limit)
    }
  }
}

/**
 * Simple in-memory cache with TTL
 */
const cache = new Map<string, { data: any; timestamp: number }>()

/**
 * Get cached data if not expired
 * 
 * @param key - Cache key
 * @param ttl - Time to live in milliseconds (default: 60000 = 1 minute)
 * @returns Cached data or null if expired/not found
 */
export function getCachedData<T>(key: string, ttl: number = 60000): T | null {
  const cached = cache.get(key)
  if (!cached) return null
  
  if (Date.now() - cached.timestamp > ttl) {
    cache.delete(key)
    return null
  }
  
  return cached.data as T
}

/**
 * Set data in cache
 * 
 * @param key - Cache key
 * @param data - Data to cache
 */
export function setCachedData(key: string, data: any): void {
  cache.set(key, {
    data,
    timestamp: Date.now()
  })
}

/**
 * Clear cache entries
 * 
 * @param pattern - Optional pattern to match keys (substring match)
 */
export function clearCache(pattern?: string): void {
  if (!pattern) {
    cache.clear()
    return
  }
  
  cache.forEach((_, key) => {
    if (key.includes(pattern)) {
      cache.delete(key)
    }
  })
}

/**
 * Measure function execution time
 * 
 * @param func - Function to measure
 * @param label - Label for console output
 * @returns Wrapped function that logs execution time
 */
export function measurePerformance<T extends (...args: any[]) => any>(
  func: T,
  label: string
): T {
  return ((...args: Parameters<T>) => {
    const start = performance.now()
    const result = func(...args)
    const end = performance.now()
    console.log(`[Performance] ${label}: ${(end - start).toFixed(2)}ms`)
    return result
  }) as T
}

/**
 * Lazy load component with retry logic
 * 
 * @param importFunc - Dynamic import function
 * @param retries - Number of retries on failure
 * @returns Promise that resolves to component
 */
export function lazyWithRetry<T extends React.ComponentType<any>>(
  importFunc: () => Promise<{ default: T }>,
  retries: number = 3
): Promise<{ default: T }> {
  return new Promise((resolve, reject) => {
    importFunc()
      .then(resolve)
      .catch((error) => {
        if (retries === 0) {
          reject(error)
          return
        }
        
        setTimeout(() => {
          lazyWithRetry(importFunc, retries - 1)
            .then(resolve)
            .catch(reject)
        }, 1000)
      })
  })
}

/**
 * Preload image
 * 
 * @param src - Image source URL
 * @returns Promise that resolves when image is loaded
 */
export function preloadImage(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve()
    img.onerror = reject
    img.src = src
  })
}

/**
 * Batch multiple function calls into a single execution
 * 
 * @param func - Function to batch
 * @param wait - Wait time before execution
 * @returns Batched function
 */
export function batch<T>(
  func: (items: T[]) => void,
  wait: number = 100
): (item: T) => void {
  let items: T[] = []
  let timeout: NodeJS.Timeout | null = null
  
  return (item: T) => {
    items.push(item)
    
    if (timeout) clearTimeout(timeout)
    
    timeout = setTimeout(() => {
      func(items)
      items = []
      timeout = null
    }, wait)
  }
}
