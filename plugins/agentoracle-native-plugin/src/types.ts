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
// ============ UAP v3.0 数据模型 ============
/**
 * 数据因子信号 (v3.0)
 * 单条数据因子，包含原始事实和相关性推理
 */
export interface Signal {
  signal_id: string;
  evidence_type: 'hard_fact' | 'persona_inference';
  source_type: string;
  data_exclusivity?: 'private' | 'semi_private' | 'public';
  source_description?: string;
  observed_at?: string;
  evidence_text: string;
  relevance_reasoning: string;
  relevance_score?: number;
  source_urls?: string[];
  entity_tags?: Array<{ text: string; type: string; role: string }>;
}
/**
 * 用户画像 (v3.0)
 */
export interface UserPersona {
  occupation?: string;
  age_range?: string;
  region?: string;
  interests?: string[];
  income_level?: string;
  consumption_style?: string;
  risk_appetite?: string;
  [key: string]: unknown;
}
/**
 * 从 OpenClaw 响应中解析出的结构化信号数据 (v3.0)
 */
export interface ParsedSignalResponse {
  status: 'submitted' | 'abstained';
  signals: Signal[];
  user_persona?: UserPersona;
  abstain_reason?: string;
  abstain_detail?: string;
}
/**
 * 信号提交数据结构 (v3.0)
 * 提交到平台 /api/agent/signals 的数据因子
 */
export interface SignalSubmission {
  task_id: string;
  status: 'submitted' | 'abstained';
  signals?: Signal[];
  user_persona?: UserPersona;
  abstain_reason?: string;
  abstain_detail?: string;
  model_name?: string;
  plugin_version?: string;
  privacy_cleared: boolean;
  protocol_version: '3.0';
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
  apiBaseUrl: string;
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
  deviceIdentityFile?: string;
}
/**
 * 设备身份参数
 * connect 请求中携带的 device identity 字段
 */
export interface DeviceParams {
  id: string;
  publicKey: string;
  signature: string;
  signedAt: number;
  nonce: string;
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
    device?: DeviceParams;
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
