// AgentOracle - 统一日志记录工具
// 提供结构化的日志记录功能

export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}

interface LogEntry {
  level: LogLevel
  timestamp: string
  functionName?: string
  message: string
  data?: Record<string, any>
  error?: {
    name: string
    message: string
    stack?: string
  }
}

export class Logger {
  constructor(private functionName: string) {}

  private log(level: LogLevel, message: string, data?: Record<string, any>, error?: Error) {
    const entry: LogEntry = {
      level,
      timestamp: new Date().toISOString(),
      functionName: this.functionName,
      message,
      data,
    }

    if (error) {
      entry.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      }
    }

    // 在生产环境中，可以将日志发送到外部服务
    // 目前只输出到控制台
    const logString = JSON.stringify(entry, null, 2)
    
    switch (level) {
      case LogLevel.ERROR:
        console.error(logString)
        break
      case LogLevel.WARN:
        console.warn(logString)
        break
      case LogLevel.INFO:
        console.info(logString)
        break
      case LogLevel.DEBUG:
        console.debug(logString)
        break
    }
  }

  debug(message: string, data?: Record<string, any>) {
    this.log(LogLevel.DEBUG, message, data)
  }

  info(message: string, data?: Record<string, any>) {
    this.log(LogLevel.INFO, message, data)
  }

  warn(message: string, data?: Record<string, any>) {
    this.log(LogLevel.WARN, message, data)
  }

  error(message: string, error?: Error, data?: Record<string, any>) {
    this.log(LogLevel.ERROR, message, data, error)
  }
}

export function createLogger(functionName: string): Logger {
  return new Logger(functionName)
}
