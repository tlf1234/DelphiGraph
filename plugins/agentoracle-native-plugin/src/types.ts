import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';

// ============ OpenClaw SDK 类型 ============

/**
 * 插件日志接口
 * 从 OpenClaw Plugin SDK 的 api.logger 类型派生
 */
export type PluginLogger = OpenClawPluginApi['logger'];

/**
 * 插件模块接口
 * 遵循 OpenClaw Plugin SDK 标准的插件定义
 */
export interface AgentOraclePluginModule {
  id: string;
  name: string;
  description: string;
  configSchema?: unknown;
  register(api: OpenClawPluginApi): void;
}

// ============ API 数据模型 ============

/**
 * 任务数据结构
 * 从平台 /api/agent/tasks 返回的智能分发任务
 * 字段来自 get_smart_distributed_tasks RPC
 */
export interface Task {
  id: string;
  title: string;
  question: string;
  description: string;
  reward_pool: number;
  closes_at: string | null;
  visibility: string;
  funding_type: string;
  funding_goal: number | null;
  funding_current: number | null;
  funding_progress: number | null;
  required_niche_tags: string[] | null;
  requires_nda: boolean;
  min_reputation: number;
  match_score: number;
  match_reason: string;
  created_at: string;
}

/**
 * 预测提交数据结构
 * 提交到平台 /api/agent/predictions 的预测结果
 * 字段与 PredictionRequest 接口对齐
 */
export interface PredictionSubmission {
  taskId: string;
  probability: number;
  rationale: string;
  evidence_type?: 'hard_fact' | 'persona_inference';
  evidence_text?: string;
  relevance_score?: number;
  entity_tags?: Array<{ text: string; type: string; role: string }>;
  privacy_cleared?: boolean;
  source_url?: string;
  user_persona?: Record<string, unknown>;
}

/**
 * LLM 结构化输出
 * 从 LLM 响应中解析出的预测结构数据
 */
export interface ParsedPrediction {
  probability: number;
  rationale: string;
  evidence_type: 'hard_fact' | 'persona_inference';
  evidence_text: string;
  relevance_score: number;
  source_urls: string[];
  entity_tags: Array<{ text: string; type: string; role: string }>;
}

/**
 * 统计数据结构
 * 从 AgentOracle API 获取的用户统计信息
 */
export interface Stats {
  total_earnings: number;
  completed_tasks: number;
  reputation_score: number;
  rank?: number;
}

// ============ 内部数据模型 ============

/**
 * 脱敏结果数据结构
 * 包含原始文本和脱敏后的文本
 */
export interface SanitizationResult {
  original: string;
  sanitized: string;
}

/**
 * 审计日志条目数据结构
 * 用于记录脱敏前后的对比信息
 */
export interface LogEntry {
  timestamp: string;      // YYYY-MM-DD HH:mm:ss
  taskId: string;
  original: string;
  sanitized: string;
}

/**
 * 插件配置数据结构
 * 从 OpenClaw 配置系统读取的完整配置
 */
export interface PluginConfig {
  apiKey: string;
  gatewayUrl: string;
  gatewayToken: string;
  pollingIntervalSeconds: number;
  jitterSeconds: number;
  logDirectory: string;
  dailyReportEnabled?: boolean;
  dailyReportHour?: number;
  dailyReportMinute?: number;
}

/**
 * 守护进程配置数据结构
 * 用于初始化 Daemon 的配置参数
 */
export interface DaemonConfig {
  pollingIntervalSeconds: number;
  jitterSeconds: number;
}

/**
 * WebSocket 配置数据结构
 * 用于初始化 WebSocket Client 的配置参数
 */
export interface WebSocketConfig {
  gatewayUrl: string;
  gatewayToken: string;
  timeout: number;
  maxRetries: number;
  retryDelayBase: number;
  connectTimeout: number;
  messageTimeout: number;
}

// ============ WebSocket Protocol v3 消息类型 ============

/**
 * 连接挑战事件
 * Gateway 发送的认证挑战
 */
export interface ConnectChallengeEvent {
  type: 'event';
  event: 'connect.challenge';
  payload: {
    nonce: string;
  };
}

/**
 * 连接请求
 * 客户端发送的连接请求
 */
export interface ConnectRequest {
  type: 'req';
  id: string;
  method: 'connect';
  params: {
    minProtocol: number;
    maxProtocol: number;
    client: {
      id: string;
      version: string;
      platform: string;
      mode: string;
    };
    role: string;
    scopes: string[];
    caps: string[];
    commands: string[];
    permissions: object;
    auth: {
      token: string;
    };
    locale: string;
    userAgent: string;
  };
}

/**
 * 连接响应
 * Gateway 返回的连接响应
 */
export interface ConnectResponse {
  type: 'res';
  id: string;
  ok: boolean;
  payload?: {
    snapshot?: {
      sessionDefaults?: {
        mainSessionKey?: string;
      };
    };
  };
  error?: string;
}

/**
 * 聊天发送请求
 * 客户端发送的聊天消息
 */
export interface ChatSendRequest {
  type: 'req';
  id: string;
  method: 'chat.send';
  params: {
    sessionKey: string;
    message: string;
    idempotencyKey: string;
  };
}

/**
 * 聊天事件
 * Gateway 返回的聊天事件（流式响应）
 */
export interface ChatEvent {
  type: 'event';
  event: 'chat';
  payload: {
    state: 'streaming' | 'final' | 'done' | 'complete' | 'finished';
    message?: {
      content?: Array<{
        text?: string;
      }>;
    };
  };
}

// ============ 错误类型 ============

/**
 * 网络错误
 * 当无法连接到 AgentOracle API 时抛出
 */
export class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NetworkError';
  }
}

/**
 * 认证错误
 * 当 API Key 无效或过期时抛出
 */
export class AuthenticationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

/**
 * 限流错误
 * 当请求频率超过限制时抛出
 */
export class RateLimitError extends Error {
  public retryAfter: number;

  constructor(message: string, retryAfter: number) {
    super(message);
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}

/**
 * 配置错误
 * 当配置验证失败时抛出
 */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

// ============ 向后兼容类型别名 ============

/**
 * @deprecated 使用 PluginLogger 替代
 */
export type OpenClawLogger = PluginLogger;
