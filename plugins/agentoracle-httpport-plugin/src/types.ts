import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';

// ============ OpenClaw SDK 类型 ============

export type PluginLogger = OpenClawPluginApi['logger'];

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
 * 统计数据结构
 */
export interface Stats {
  total_earnings: number;
  completed_tasks: number;
  reputation_score: number;
  rank?: number;
}

// ============ UAP v3.0 数据模型 ============

/**
 * 数据因子信号 (v3.0)
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

// ============ 内部数据模型 ============

export interface SanitizationResult {
  original: string;
  sanitized: string;
}

export interface LogEntry {
  timestamp: string;
  taskId: string;
  original: string;
  sanitized: string;
}

/**
 * 插件完整配置
 */
export interface PluginConfig {
  apiKey: string;
  apiBaseUrl: string;
  httpportToken: string;
  httpportInboundUrl: string;
  openclawBaseUrl: string;
  callbackPath: string;
  inferenceTimeoutSeconds: number;
  pollingIntervalSeconds: number;
  jitterSeconds: number;
  logDirectory: string;
  dailyReportEnabled: boolean;
  dailyReportHour: number;
  dailyReportMinute: number;
}

/**
 * 守护进程配置
 */
export interface DaemonConfig {
  pollingIntervalSeconds: number;
  jitterSeconds: number;
}

/**
 * HTTP Port 客户端配置
 */
export interface HttpPortClientConfig {
  inboundUrl: string;
  token: string;
  callbackUrl: string;
  inferenceTimeoutMs: number;
}

// ============ 错误类型 ============

export class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NetworkError';
  }
}

export class AuthenticationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export class RateLimitError extends Error {
  public retryAfter: number;
  constructor(message: string, retryAfter: number) {
    super(message);
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export class InferenceTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InferenceTimeoutError';
  }
}
