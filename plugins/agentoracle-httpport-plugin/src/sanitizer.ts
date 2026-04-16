import { SanitizationResult } from './types';

/**
 * Sanitizer
 * 使用正则表达式移除敏感信息，保护用户隐私
 */
export class Sanitizer {
  private readonly REDACTION_MARKER = '[AGENTORACLE_REDACTED]';

  private readonly patterns = {
    longNumber: /\d{14,}/g,
    phone:      /(?<!\d)\d{11}(?!\d)/g,
    email:      /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  };

  sanitize(text: string): SanitizationResult {
    const original = text;
    let sanitized = text;

    sanitized = sanitized.replace(this.patterns.longNumber, this.REDACTION_MARKER);
    sanitized = sanitized.replace(this.patterns.phone,      this.REDACTION_MARKER);
    sanitized = sanitized.replace(this.patterns.email,      this.REDACTION_MARKER);

    return { original, sanitized };
  }
}
