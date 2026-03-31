import { Sanitizer } from '../sanitizer';

describe('Sanitizer', () => {
  let sanitizer: Sanitizer;

  beforeEach(() => {
    sanitizer = new Sanitizer();
  });

  describe('基本功能测试', () => {
    it('应该返回包含 original 和 sanitized 字段的对象', () => {
      const input = 'Hello World';
      const result = sanitizer.sanitize(input);

      expect(result).toHaveProperty('original');
      expect(result).toHaveProperty('sanitized');
      expect(result.original).toBe(input);
    });

    it('对于不包含敏感信息的文本，应该保持不变', () => {
      const input = 'This is a normal text without sensitive data';
      const result = sanitizer.sanitize(input);

      expect(result.sanitized).toBe(input);
    });

    it('应该处理空字符串', () => {
      const result = sanitizer.sanitize('');

      expect(result.original).toBe('');
      expect(result.sanitized).toBe('');
    });
  });

  describe('11位数字脱敏（手机号）', () => {
    it('应该脱敏单个11位数字', () => {
      const input = '我的手机号是 13812345678';
      const result = sanitizer.sanitize(input);

      expect(result.sanitized).toBe('我的手机号是 [AGENTORACLE_REDACTED]');
      expect(result.original).toBe(input);
    });

    it('应该脱敏多个11位数字', () => {
      const input = '联系方式：13812345678 或 13987654321';
      const result = sanitizer.sanitize(input);

      expect(result.sanitized).toBe(
        '联系方式：[AGENTORACLE_REDACTED] 或 [AGENTORACLE_REDACTED]'
      );
    });

    it('不应该脱敏少于11位的数字', () => {
      const input = '电话：1234567890';
      const result = sanitizer.sanitize(input);

      expect(result.sanitized).toBe(input);
    });

    it('不应该脱敏超过11位但少于14位的数字', () => {
      const input = '编号：123456789012';
      const result = sanitizer.sanitize(input);

      expect(result.sanitized).toBe(input);
    });
  });

  describe('邮箱地址脱敏', () => {
    it('应该脱敏单个邮箱地址', () => {
      const input = '联系邮箱：user@example.com';
      const result = sanitizer.sanitize(input);

      expect(result.sanitized).toBe('联系邮箱：[AGENTORACLE_REDACTED]');
    });

    it('应该脱敏多个邮箱地址', () => {
      const input = 'Email: admin@test.com or support@example.org';
      const result = sanitizer.sanitize(input);

      expect(result.sanitized).toBe(
        'Email: [AGENTORACLE_REDACTED] or [AGENTORACLE_REDACTED]'
      );
    });

    it('应该脱敏各种格式的邮箱', () => {
      const testCases = [
        'simple@example.com',
        'user.name@example.com',
        'user+tag@example.co.uk',
        'admin@subdomain.example.com'
      ];

      testCases.forEach((email) => {
        const result = sanitizer.sanitize(email);
        expect(result.sanitized).toBe('[AGENTORACLE_REDACTED]');
      });
    });
  });

  describe('长数字序列脱敏（14位及以上）', () => {
    it('应该脱敏14位数字（最小边界）', () => {
      const input = '卡号：12345678901234';
      const result = sanitizer.sanitize(input);

      expect(result.sanitized).toBe('卡号：[AGENTORACLE_REDACTED]');
    });

    it('应该脱敏18位数字（身份证）', () => {
      const input = '身份证：123456789012345678';
      const result = sanitizer.sanitize(input);

      expect(result.sanitized).toBe('身份证：[AGENTORACLE_REDACTED]');
    });

    it('应该脱敏16位数字（银行卡）', () => {
      const input = '银行卡：6217012345678901';
      const result = sanitizer.sanitize(input);

      expect(result.sanitized).toBe('银行卡：[AGENTORACLE_REDACTED]');
    });

    it('应该脱敏19位数字（长银行卡号）', () => {
      const input = '卡号：6217012345678901234';
      const result = sanitizer.sanitize(input);

      expect(result.sanitized).toBe('卡号：[AGENTORACLE_REDACTED]');
    });
  });

  describe('混合敏感信息脱敏', () => {
    it('应该同时脱敏手机号和邮箱', () => {
      const input = '联系方式：13812345678，邮箱：user@example.com';
      const result = sanitizer.sanitize(input);

      expect(result.sanitized).toBe(
        '联系方式：[AGENTORACLE_REDACTED]，邮箱：[AGENTORACLE_REDACTED]'
      );
    });

    it('应该同时脱敏所有类型的敏感信息', () => {
      const input = `
        手机：13812345678
        邮箱：admin@test.com
        身份证：123456789012345678
        银行卡：6217012345678901
      `;
      const result = sanitizer.sanitize(input);

      expect(result.sanitized).toContain('[AGENTORACLE_REDACTED]');
      expect(result.sanitized).not.toContain('13812345678');
      expect(result.sanitized).not.toContain('admin@test.com');
      expect(result.sanitized).not.toContain('123456789012345678');
      expect(result.sanitized).not.toContain('6217012345678901');
    });
  });

  describe('文本结构保持', () => {
    it('应该保持非敏感内容的结构', () => {
      const input = '用户反馈：产品很好，但是价格有点贵。联系方式：13812345678';
      const result = sanitizer.sanitize(input);

      expect(result.sanitized).toContain('用户反馈：产品很好，但是价格有点贵');
      expect(result.sanitized).toContain('联系方式：');
    });

    it('应该保持换行符', () => {
      const input = '第一行\n手机：13812345678\n第三行';
      const result = sanitizer.sanitize(input);

      expect(result.sanitized).toBe(
        '第一行\n手机：[AGENTORACLE_REDACTED]\n第三行'
      );
    });

    it('应该保持特殊字符', () => {
      const input = '价格：$100，联系：user@example.com，评分：⭐⭐⭐⭐⭐';
      const result = sanitizer.sanitize(input);

      expect(result.sanitized).toContain('$100');
      expect(result.sanitized).toContain('⭐⭐⭐⭐⭐');
    });
  });

  describe('边缘情况', () => {
    it('应该处理只包含敏感信息的文本', () => {
      const input = '13812345678';
      const result = sanitizer.sanitize(input);

      expect(result.sanitized).toBe('[AGENTORACLE_REDACTED]');
    });

    it('应该处理连续的敏感信息', () => {
      const input = '13812345678user@example.com';
      const result = sanitizer.sanitize(input);

      expect(result.sanitized).toBe(
        '[AGENTORACLE_REDACTED][AGENTORACLE_REDACTED]'
      );
    });

    it('应该处理包含 Unicode 字符的文本', () => {
      const input = '联系方式：📱 13812345678 📧 user@example.com';
      const result = sanitizer.sanitize(input);

      expect(result.sanitized).toBe(
        '联系方式：📱 [AGENTORACLE_REDACTED] 📧 [AGENTORACLE_REDACTED]'
      );
    });

    it('应该处理非常长的文本', () => {
      const longText = 'a'.repeat(10000) + '13812345678' + 'b'.repeat(10000);
      const result = sanitizer.sanitize(longText);

      expect(result.sanitized).toContain('[AGENTORACLE_REDACTED]');
      expect(result.sanitized).not.toContain('13812345678');
    });
  });

  describe('脱敏规则优先级', () => {
    it('长数字应该优先于11位数字规则', () => {
      // 18位数字应该被长数字规则匹配，而不是被拆分成多个11位数字
      const input = '123456789012345678';
      const result = sanitizer.sanitize(input);

      // 应该只有一个脱敏标记
      const redactedCount = (result.sanitized.match(/\[AGENTORACLE_REDACTED\]/g) || []).length;
      expect(redactedCount).toBe(1);
    });
  });
});
