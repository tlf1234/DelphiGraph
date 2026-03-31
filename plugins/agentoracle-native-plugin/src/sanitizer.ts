import { SanitizationResult } from './types';

/**
 * Sanitizer 类
 * 使用正则表达式移除敏感信息，保护用户隐私
 * 
 * 脱敏规则：
 * - 11位连续数字（手机号）
 * - 邮箱地址
 * - 14位及以上连续数字（身份证、银行卡）
 */
export class Sanitizer {
  private readonly REDACTION_MARKER = '[AGENTORACLE_REDACTED]';

  // 脱敏规则
  private readonly patterns = {
    phone: /(?<!\d)\d{11}(?!\d)/g,       // 恰好11位连续数字 (手机号) - 使用负向前瞻和后顾
    email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,  // 邮箱格式 - 只匹配标准邮箱字符
    longNumber: /\d{14,}/g               // 14位及以上连续数字 (身份证、银行卡)
  };

  /**
   * 执行脱敏处理
   * @param text 原始文本
   * @returns 包含原始文本和脱敏后文本的结果对象
   */
  sanitize(text: string): SanitizationResult {
    const original = text;
    let sanitized = text;

    // 按顺序应用所有脱敏规则
    // 注意：先处理长数字，避免被11位数字规则误匹配
    sanitized = this.applyPattern(sanitized, this.patterns.longNumber);
    sanitized = this.applyPattern(sanitized, this.patterns.phone);
    sanitized = this.applyPattern(sanitized, this.patterns.email);

    return {
      original,
      sanitized
    };
  }

  /**
   * 应用单个脱敏规则
   * @param text 待处理文本
   * @param pattern 正则表达式模式
   * @returns 处理后的文本
   */
  private applyPattern(text: string, pattern: RegExp): string {
    return text.replace(pattern, this.REDACTION_MARKER);
  }
}
