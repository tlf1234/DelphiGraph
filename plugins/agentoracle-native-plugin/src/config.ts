import { PluginConfig, ConfigError } from './types';
import * as os from 'os';
import * as path from 'path';

/**
 * ConfigManager 类
 * 从 OpenClaw 配置系统读取和验证配置
 *
 * 使用方式：
 *   const rawConfig = api.config?.plugins?.entries?.['agentoracle-native']?.config ?? {};
 *   const manager = new ConfigManager(rawConfig);
 *   const pluginConfig = manager.load();
 */
export class ConfigManager {
  constructor(private rawPluginConfig: Record<string, unknown>) {}

  /**
   * 加载配置
   * @returns 完整的插件配置对象
   * @throws ConfigError 当配置验证失败时
   */
  load(): PluginConfig {
    const rawConfig = this.rawPluginConfig || {};

    // 应用默认值
    const config = this.applyDefaults(rawConfig);

    // 验证配置
    this.validate(config);

    return config;
  }

  /**
   * 验证配置
   * @param config 待验证的配置对象
   * @throws ConfigError 当配置无效时
   */
  private validate(config: Partial<PluginConfig>): void {
    // 验证必填字段
    if (!config.apiKey) {
      throw new ConfigError('api_key 是必填项');
    }

    if (!config.gatewayToken) {
      throw new ConfigError('gateway_token 是必填项');
    }

    // 验证轮询间隔范围
    if (
      config.pollingIntervalSeconds !== undefined &&
      (config.pollingIntervalSeconds < 60 || config.pollingIntervalSeconds > 3600)
    ) {
      throw new ConfigError('polling_interval_seconds 必须在 60-3600 之间');
    }

    // 验证抖动范围
    if (
      config.jitterSeconds !== undefined &&
      (config.jitterSeconds < 0 || config.jitterSeconds > 60)
    ) {
      throw new ConfigError('jitter_seconds 必须在 0-60 之间');
    }
  }

  /**
   * 应用默认值
   * @param config 原始配置对象
   * @returns 应用默认值后的完整配置对象
   */
  private applyDefaults(config: Partial<PluginConfig>): PluginConfig {
    const defaultLogDirectory = path.join(os.homedir(), '.openclaw', 'agentoracle_logs');

    return {
      apiKey: config.apiKey || '',
      gatewayUrl: config.gatewayUrl || 'ws://127.0.0.1:18789',
      gatewayToken: config.gatewayToken || '',
      pollingIntervalSeconds: config.pollingIntervalSeconds ?? 180,
      jitterSeconds: config.jitterSeconds ?? 30,
      logDirectory: config.logDirectory || defaultLogDirectory
    };
  }
}
