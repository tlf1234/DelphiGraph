import { ConfigManager } from '../config';
import { ConfigError } from '../types';

describe('ConfigManager', () => {
  describe('完整配置加载', () => {
    it('应该成功加载完整配置', () => {
      const rawConfig = {
        apiKey: 'test-api-key',
        gatewayToken: 'test-gateway-token',
        pollingIntervalSeconds: 200,
        jitterSeconds: 20,
        logDirectory: '/custom/log/path'
      };

      const configManager = new ConfigManager(rawConfig);
      const config = configManager.load();

      expect(config).toEqual({
        apiKey: 'test-api-key',
        gatewayToken: 'test-gateway-token',
        gatewayUrl: 'ws://127.0.0.1:18789',
        pollingIntervalSeconds: 200,
        jitterSeconds: 20,
        logDirectory: '/custom/log/path'
      });
    });
  });

  describe('默认值应用', () => {
    it('应该为缺失的可选字段应用默认值', () => {
      const rawConfig = {
        apiKey: 'test-api-key',
        gatewayToken: 'test-gateway-token'
      };

      const configManager = new ConfigManager(rawConfig);
      const config = configManager.load();

      expect(config.pollingIntervalSeconds).toBe(180);
      expect(config.jitterSeconds).toBe(30);
      expect(config.gatewayUrl).toBe('ws://127.0.0.1:18789');
      expect(config.logDirectory).toContain('.openclaw');
      expect(config.logDirectory).toContain('agentoracle_logs');
    });

    it('应该保留用户提供的值而不使用默认值', () => {
      const rawConfig = {
        apiKey: 'test-api-key',
        gatewayToken: 'test-gateway-token',
        pollingIntervalSeconds: 300,
        jitterSeconds: 45
      };

      const configManager = new ConfigManager(rawConfig);
      const config = configManager.load();

      expect(config.pollingIntervalSeconds).toBe(300);
      expect(config.jitterSeconds).toBe(45);
    });

    it('应该处理空配置对象', () => {
      const configManager = new ConfigManager({});

      expect(() => configManager.load()).toThrow(ConfigError);
      expect(() => configManager.load()).toThrow('api_key 是必填项');
    });
  });

  describe('配置验证 - 必填字段', () => {
    it('缺少 api_key 时应该抛出错误', () => {
      const rawConfig = {
        gatewayToken: 'test-gateway-token',
        pollingIntervalSeconds: 180
      };

      const configManager = new ConfigManager(rawConfig);

      expect(() => configManager.load()).toThrow(ConfigError);
      expect(() => configManager.load()).toThrow('api_key 是必填项');
    });

    it('api_key 为空字符串时应该抛出错误', () => {
      const rawConfig = {
        apiKey: '',
        gatewayToken: 'test-gateway-token'
      };

      const configManager = new ConfigManager(rawConfig);

      expect(() => configManager.load()).toThrow(ConfigError);
      expect(() => configManager.load()).toThrow('api_key 是必填项');
    });

    it('缺少 gateway_token 时应该抛出错误', () => {
      const rawConfig = {
        apiKey: 'test-api-key',
        pollingIntervalSeconds: 180
      };

      const configManager = new ConfigManager(rawConfig);

      expect(() => configManager.load()).toThrow(ConfigError);
      expect(() => configManager.load()).toThrow('gateway_token 是必填项');
    });

    it('gateway_token 为空字符串时应该抛出错误', () => {
      const rawConfig = {
        apiKey: 'test-api-key',
        gatewayToken: ''
      };

      const configManager = new ConfigManager(rawConfig);

      expect(() => configManager.load()).toThrow(ConfigError);
      expect(() => configManager.load()).toThrow('gateway_token 是必填项');
    });
  });

  describe('配置验证 - 轮询间隔', () => {
    it('轮询间隔小于60秒时应该抛出错误', () => {
      const rawConfig = {
        apiKey: 'test-key',
        gatewayToken: 'test-gateway-token',
        pollingIntervalSeconds: 59
      };

      const configManager = new ConfigManager(rawConfig);

      expect(() => configManager.load()).toThrow(ConfigError);
      expect(() => configManager.load()).toThrow('polling_interval_seconds 必须在 60-3600 之间');
    });

    it('轮询间隔大于3600秒时应该抛出错误', () => {
      const rawConfig = {
        apiKey: 'test-key',
        gatewayToken: 'test-gateway-token',
        pollingIntervalSeconds: 3601
      };

      const configManager = new ConfigManager(rawConfig);

      expect(() => configManager.load()).toThrow(ConfigError);
      expect(() => configManager.load()).toThrow('polling_interval_seconds 必须在 60-3600 之间');
    });

    it('轮询间隔为60秒时应该通过验证（最小边界）', () => {
      const rawConfig = {
        apiKey: 'test-key',
        gatewayToken: 'test-gateway-token',
        pollingIntervalSeconds: 60
      };

      const configManager = new ConfigManager(rawConfig);

      expect(() => configManager.load()).not.toThrow();
    });

    it('轮询间隔为3600秒时应该通过验证（最大边界）', () => {
      const rawConfig = {
        apiKey: 'test-key',
        gatewayToken: 'test-gateway-token',
        pollingIntervalSeconds: 3600
      };

      const configManager = new ConfigManager(rawConfig);

      expect(() => configManager.load()).not.toThrow();
    });
  });

  describe('配置验证 - 抖动时间', () => {
    it('抖动时间小于0时应该抛出错误', () => {
      const rawConfig = {
        apiKey: 'test-key',
        gatewayToken: 'test-gateway-token',
        jitterSeconds: -1
      };

      const configManager = new ConfigManager(rawConfig);

      expect(() => configManager.load()).toThrow(ConfigError);
      expect(() => configManager.load()).toThrow('jitter_seconds 必须在 0-60 之间');
    });

    it('抖动时间大于60时应该抛出错误', () => {
      const rawConfig = {
        apiKey: 'test-key',
        gatewayToken: 'test-gateway-token',
        jitterSeconds: 61
      };

      const configManager = new ConfigManager(rawConfig);

      expect(() => configManager.load()).toThrow(ConfigError);
      expect(() => configManager.load()).toThrow('jitter_seconds 必须在 0-60 之间');
    });

    it('抖动时间为0时应该通过验证（最小边界）', () => {
      const rawConfig = {
        apiKey: 'test-key',
        gatewayToken: 'test-gateway-token',
        jitterSeconds: 0
      };

      const configManager = new ConfigManager(rawConfig);

      expect(() => configManager.load()).not.toThrow();
    });

    it('抖动时间为60时应该通过验证（最大边界）', () => {
      const rawConfig = {
        apiKey: 'test-key',
        gatewayToken: 'test-gateway-token',
        jitterSeconds: 60
      };

      const configManager = new ConfigManager(rawConfig);

      expect(() => configManager.load()).not.toThrow();
    });
  });

  describe('配置验证 - 多个错误', () => {
    it('应该优先报告 api_key 缺失错误', () => {
      const rawConfig = {
        pollingIntervalSeconds: 10,  // 无效值
        jitterSeconds: 100            // 无效值
      };

      const configManager = new ConfigManager(rawConfig);

      expect(() => configManager.load()).toThrow('api_key 是必填项');
    });
  });

  describe('边缘情况', () => {
    it('应该处理配置值为 0 的情况', () => {
      const rawConfig = {
        apiKey: 'test-key',
        gatewayToken: 'test-gateway-token',
        pollingIntervalSeconds: 0,  // 无效
        jitterSeconds: 0             // 有效
      };

      const configManager = new ConfigManager(rawConfig);

      expect(() => configManager.load()).toThrow('polling_interval_seconds 必须在 60-3600 之间');
    });

    it('应该处理配置值为负数的情况', () => {
      const rawConfig = {
        apiKey: 'test-key',
        gatewayToken: 'test-gateway-token',
        pollingIntervalSeconds: -100
      };

      const configManager = new ConfigManager(rawConfig);

      expect(() => configManager.load()).toThrow('polling_interval_seconds 必须在 60-3600 之间');
    });

    it('应该处理配置值为非常大的数字', () => {
      const rawConfig = {
        apiKey: 'test-key',
        gatewayToken: 'test-gateway-token',
        pollingIntervalSeconds: 999999
      };

      const configManager = new ConfigManager(rawConfig);

      expect(() => configManager.load()).toThrow('polling_interval_seconds 必须在 60-3600 之间');
    });
  });
});
