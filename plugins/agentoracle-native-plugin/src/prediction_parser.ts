import { ParsedPrediction } from './types';

/**
 * PredictionParser
 * 从 LLM 响应中解析结构化预测数据
 *
 * 支持两种格式：
 * 1. JSON 块：LLM 返回包含 ```json ... ``` 的结构化数据
 * 2. 纯文本兜底：从自由文本中启发式提取概率和分析内容
 */
export class PredictionParser {
  /**
   * 解析 LLM 响应为结构化预测数据
   * @param llmResponse LLM 原始响应文本
   * @returns ParsedPrediction 结构化预测数据
   */
  static parse(llmResponse: string): ParsedPrediction {
    // 尝试从 JSON 块中提取
    const jsonResult = PredictionParser.tryParseJson(llmResponse);
    if (jsonResult) {
      return jsonResult;
    }

    // 兜底：从纯文本中启发式提取
    return PredictionParser.parseFromText(llmResponse);
  }

  /**
   * 尝试从 LLM 响应中提取 JSON 块
   */
  private static tryParseJson(response: string): ParsedPrediction | null {
    // 匹配 ```json ... ``` 或 ``` ... ``` 代码块
    const jsonBlockRegex = /```(?:json)?\s*\n?([\s\S]*?)\n?```/;
    const match = response.match(jsonBlockRegex);

    if (match && match[1]) {
      try {
        const parsed = JSON.parse(match[1].trim());
        return PredictionParser.validateAndNormalize(parsed);
      } catch {
        // JSON 解析失败，继续尝试其他方式
      }
    }

    // 尝试直接解析整个响应（如果 LLM 只返回了 JSON）
    const trimmed = response.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        const parsed = JSON.parse(trimmed);
        return PredictionParser.validateAndNormalize(parsed);
      } catch {
        // 解析失败，使用兜底逻辑
      }
    }

    return null;
  }

  /**
   * 验证并标准化 JSON 解析结果
   */
  private static validateAndNormalize(raw: any): ParsedPrediction | null {
    if (!raw || typeof raw !== 'object') return null;

    const probability = PredictionParser.extractProbability(raw.probability);
    if (probability === null) return null;

    const rationale = raw.rationale || raw.reasoning || raw.analysis || '';
    if (!rationale || typeof rationale !== 'string' || rationale.length < 10) return null;

    return {
      probability,
      rationale: rationale.substring(0, 10000),
      evidence_type: PredictionParser.normalizeEvidenceType(raw.evidence_type),
      evidence_text: (raw.evidence_text || raw.evidence || '').substring(0, 5000),
      relevance_score: PredictionParser.clamp(
        parseFloat(raw.relevance_score) || 0.5,
        0, 1
      ),
      source_urls: Array.isArray(raw.source_urls) ? raw.source_urls.filter((u: any) => typeof u === 'string') : [],
      entity_tags: PredictionParser.normalizeEntityTags(raw.entity_tags),
    };
  }

  /**
   * 从纯文本中启发式提取预测数据
   */
  private static parseFromText(response: string): ParsedPrediction {
    return {
      probability: PredictionParser.extractProbabilityFromText(response),
      rationale: PredictionParser.extractRationale(response),
      evidence_type: 'persona_inference',
      evidence_text: PredictionParser.extractEvidenceFromText(response),
      relevance_score: 0.5,
      source_urls: PredictionParser.extractUrls(response),
      entity_tags: [],
    };
  }

  /**
   * 从文本中提取概率值
   * 支持格式：70%、0.7、概率：70%、置信度：0.7 等
   */
  private static extractProbabilityFromText(text: string): number {
    // 优先匹配明确的概率/置信度标记
    const patterns = [
      /(?:概率|置信度|可能性|probability|confidence)\s*[:：]\s*([\d.]+)\s*%/i,
      /(?:概率|置信度|可能性|probability|confidence)\s*[:：]\s*(0?\.\d+)/i,
      /(?:概率|置信度|可能性|probability|confidence)\s*[:：]\s*(\d{1,3})\s*%/i,
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        const val = parseFloat(match[1]);
        if (val > 1) return PredictionParser.clamp(val / 100, 0.01, 0.99);
        return PredictionParser.clamp(val, 0.01, 0.99);
      }
    }

    // 次优匹配：文本中出现的百分比
    const percentMatch = text.match(/(\d{1,3})\s*%/);
    if (percentMatch) {
      const val = parseInt(percentMatch[1], 10);
      if (val > 0 && val < 100) {
        return PredictionParser.clamp(val / 100, 0.01, 0.99);
      }
    }

    // 兜底：默认 0.5 表示无法判断
    return 0.5;
  }

  /**
   * 从文本中提取分析理由
   */
  private static extractRationale(text: string): string {
    // 尝试提取"预测结论"或"分析"段落
    const sections = [
      /(?:预测结论|结论|分析结果|总结)\s*[:：\n]\s*([\s\S]{50,}?)(?=\n#{1,3}\s|\n━|$)/i,
      /(?:🎯\s*预测结论)\s*\n([\s\S]{50,}?)(?=\n#{1,3}\s|\n━|$)/,
    ];

    for (const pattern of sections) {
      const match = text.match(pattern);
      if (match && match[1].trim().length >= 50) {
        return match[1].trim().substring(0, 10000);
      }
    }

    // 兜底：使用整个响应（截断）
    return text.substring(0, 10000);
  }

  /**
   * 从文本中提取证据文本
   */
  private static extractEvidenceFromText(text: string): string {
    const sections = [
      /(?:数据分析|📊\s*数据分析)\s*\n([\s\S]{20,}?)(?=\n#{1,3}\s|\n━|$)/,
      /(?:信息来源|📋\s*信息来源)\s*\n([\s\S]{20,}?)(?=\n#{1,3}\s|\n━|$)/,
    ];

    for (const pattern of sections) {
      const match = text.match(pattern);
      if (match && match[1].trim().length >= 20) {
        return match[1].trim().substring(0, 5000);
      }
    }

    return '';
  }

  /**
   * 从文本中提取 URL
   */
  private static extractUrls(text: string): string[] {
    const urlRegex = /https?:\/\/[^\s,)\]]+/g;
    const matches = text.match(urlRegex) || [];
    // 去重，排除平台自身链接
    return [...new Set(matches)]
      .filter(url => !url.includes('agentoracle.xyz'))
      .slice(0, 10);
  }

  /**
   * 解析概率值（支持 0-1 或 0-100）
   */
  private static extractProbability(value: any): number | null {
    if (value === undefined || value === null) return null;
    const num = parseFloat(value);
    if (isNaN(num)) return null;
    if (num > 1 && num <= 100) return PredictionParser.clamp(num / 100, 0.01, 0.99);
    if (num >= 0 && num <= 1) return PredictionParser.clamp(num, 0.01, 0.99);
    return null;
  }

  /**
   * 标准化证据类型
   */
  private static normalizeEvidenceType(value: any): 'hard_fact' | 'persona_inference' {
    if (value === 'hard_fact') return 'hard_fact';
    // Map LLM output variants to valid EF types
    if (value === 'soft_signal' || value === 'personal_opinion') return 'persona_inference';
    return 'persona_inference';
  }

  /**
   * 标准化实体标签
   */
  private static normalizeEntityTags(tags: any): Array<{ text: string; type: string; role: string }> {
    if (!Array.isArray(tags)) return [];
    return tags
      .filter((t: any) => t && typeof t === 'object' && typeof t.text === 'string')
      .map((t: any) => ({
        text: String(t.text),
        type: String(t.type || 'unknown'),
        role: String(t.role || 'related'),
      }))
      .slice(0, 20);
  }

  /**
   * 数值限制
   */
  private static clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }
}
