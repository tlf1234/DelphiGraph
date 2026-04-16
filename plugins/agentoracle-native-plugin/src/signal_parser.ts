import { Signal, ParsedSignalResponse, UserPersona } from './types';

/**
 * SignalParser
 * 从 OpenClaw 响应中解析 UAP v3.0 结构化信号数据
 *
 * 支持两种格式：
 * 1. JSON 块：响应包含 ```json ... ``` 的结构化数据
 * 2. 纯 JSON：响应本身就是 JSON 对象
 *
 * v3.0 不再有纯文本兜底（不再提取 probability/rationale），
 * 如果无法解析出有效 signals，视为弃权。
 */
export class SignalParser {

  /** 信号数量上限 */
  private static readonly MAX_SIGNALS = 10;

  /** evidence_text 最大长度 */
  private static readonly MAX_EVIDENCE_TEXT = 5000;

  /** relevance_reasoning 最大长度 */
  private static readonly MAX_RELEVANCE_REASONING = 1000;

  /** 有效的 evidence_type 值 */
  private static readonly VALID_EVIDENCE_TYPES = new Set(['hard_fact', 'persona_inference']);

  /** 有效的 source_type 值 */
  private static readonly VALID_SOURCE_TYPES = new Set([
    'local_chat', 'local_email', 'local_document', 'local_transaction',
    'local_browsing', 'local_memory', 'web_search', 'web_news',
    'user_profile', 'behavior_pattern', 'other'
  ]);

  /** 有效的 data_exclusivity 值 */
  private static readonly VALID_DATA_EXCLUSIVITY = new Set(['private', 'semi_private', 'public']);

  /**
   * 解析 OpenClaw 响应为结构化信号数据
   * @param response OpenClaw 原始响应文本
   * @returns ParsedSignalResponse
   */
  static parse(response: string): ParsedSignalResponse {
    const jsonResult = SignalParser.tryExtractJson(response);

    if (jsonResult) {
      return jsonResult;
    }

    // v3.0 无法解析时视为弃权
    return {
      status: 'abstained',
      signals: [],
      abstain_reason: 'parse_failure',
      abstain_detail: '无法从 OpenClaw 响应中解析出结构化 JSON 数据',
    };
  }

  /**
   * 尝试从响应中提取并验证 JSON
   */
  private static tryExtractJson(response: string): ParsedSignalResponse | null {
    // 1. 匹配 ```json ... ``` 代码块
    const jsonBlockRegex = /```(?:json)?\s*\n?([\s\S]*?)\n?```/;
    const match = response.match(jsonBlockRegex);

    if (match && match[1]) {
      const result = SignalParser.tryParseAndValidate(match[1].trim());
      if (result) return result;
    }

    // 2. 尝试直接解析整个响应
    const trimmed = response.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      const result = SignalParser.tryParseAndValidate(trimmed);
      if (result) return result;
    }

    return null;
  }

  /**
   * 尝试解析 JSON 字符串并验证
   */
  private static tryParseAndValidate(jsonStr: string): ParsedSignalResponse | null {
    try {
      const raw = JSON.parse(jsonStr);
      return SignalParser.validateAndNormalize(raw);
    } catch {
      return null;
    }
  }

  /**
   * 验证并标准化解析结果
   */
  private static validateAndNormalize(raw: any): ParsedSignalResponse | null {
    if (!raw || typeof raw !== 'object') return null;

    const status = raw.status;

    // 弃权路径
    if (status === 'abstained') {
      return {
        status: 'abstained',
        signals: [],
        abstain_reason: typeof raw.abstain_reason === 'string' ? raw.abstain_reason : 'unknown',
        abstain_detail: typeof raw.abstain_detail === 'string'
          ? raw.abstain_detail.substring(0, 500)
          : undefined,
      };
    }

    // 提交路径
    if (status !== 'submitted') return null;

    if (!Array.isArray(raw.signals) || raw.signals.length === 0) return null;

    const signals = raw.signals
      .map((s: any) => SignalParser.validateSignal(s))
      .filter((s: Signal | null): s is Signal => s !== null)
      .slice(0, SignalParser.MAX_SIGNALS);

    if (signals.length === 0) return null;

    const userPersona = SignalParser.validateUserPersona(raw.user_persona);

    return {
      status: 'submitted',
      signals,
      user_persona: userPersona || undefined,
    };
  }

  /**
   * 验证单条信号
   */
  private static validateSignal(raw: any): Signal | null {
    if (!raw || typeof raw !== 'object') return null;

    // 必填字段检查
    const evidenceText = typeof raw.evidence_text === 'string' ? raw.evidence_text.trim() : '';
    const relevanceReasoning = typeof raw.relevance_reasoning === 'string' ? raw.relevance_reasoning.trim() : '';

    if (!evidenceText || evidenceText.length < 5) return null;
    if (!relevanceReasoning || relevanceReasoning.length < 5) return null;

    // evidence_type 标准化
    const evidenceType = SignalParser.VALID_EVIDENCE_TYPES.has(raw.evidence_type)
      ? raw.evidence_type as 'hard_fact' | 'persona_inference'
      : 'persona_inference';

    // source_type 标准化
    const sourceType = SignalParser.VALID_SOURCE_TYPES.has(raw.source_type)
      ? raw.source_type
      : 'other';

    // signal_id：接受 LLM 给的，或自动生成
    const signalId = typeof raw.signal_id === 'string' && raw.signal_id.length > 0
      ? raw.signal_id
      : `sig_${Math.random().toString(36).substring(2, 8)}`;

    // 构建信号对象
    const signal: Signal = {
      signal_id: signalId,
      evidence_type: evidenceType,
      source_type: sourceType,
      evidence_text: evidenceText.substring(0, SignalParser.MAX_EVIDENCE_TEXT),
      relevance_reasoning: relevanceReasoning.substring(0, SignalParser.MAX_RELEVANCE_REASONING),
    };

    // 可选字段
    if (SignalParser.VALID_DATA_EXCLUSIVITY.has(raw.data_exclusivity)) {
      signal.data_exclusivity = raw.data_exclusivity as 'private' | 'semi_private' | 'public';
    }

    if (typeof raw.source_description === 'string' && raw.source_description.trim()) {
      signal.source_description = raw.source_description.trim().substring(0, 200);
    }

    if (typeof raw.observed_at === 'string' && raw.observed_at.trim()) {
      signal.observed_at = raw.observed_at.trim();
    }

    if (typeof raw.relevance_score === 'number' && !isNaN(raw.relevance_score)) {
      signal.relevance_score = SignalParser.clamp(raw.relevance_score, 0, 1);
    }

    if (Array.isArray(raw.source_urls)) {
      signal.source_urls = raw.source_urls
        .filter((u: any) => typeof u === 'string' && u.startsWith('http'))
        .slice(0, 10);
    }

    if (Array.isArray(raw.entity_tags)) {
      signal.entity_tags = raw.entity_tags
        .filter((t: any) => t && typeof t === 'object' && typeof t.text === 'string')
        .map((t: any) => ({
          text: String(t.text),
          type: String(t.type || 'unknown'),
          role: String(t.role || 'context'),
        }))
        .slice(0, 20);
    }

    return signal;
  }

  /**
   * 验证用户画像
   */
  private static validateUserPersona(raw: any): UserPersona | null {
    if (!raw || typeof raw !== 'object') return null;

    const persona: UserPersona = {};
    let hasField = false;

    const stringFields = ['occupation', 'age_range', 'region', 'income_level', 'consumption_style', 'risk_appetite'] as const;
    for (const field of stringFields) {
      if (typeof raw[field] === 'string' && raw[field].trim()) {
        persona[field] = raw[field].trim();
        hasField = true;
      }
    }

    if (Array.isArray(raw.interests) && raw.interests.length > 0) {
      const filtered = raw.interests
        .filter((i: any) => typeof i === 'string' && i.trim())
        .map((i: string) => i.trim())
        .slice(0, 20);
      if (filtered.length > 0) {
        persona.interests = filtered;
        hasField = true;
      }
    }

    return hasField ? persona : null;
  }

  /**
   * 数值限制
   */
  private static clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }
}
