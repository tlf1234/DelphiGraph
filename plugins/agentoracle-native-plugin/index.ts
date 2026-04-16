import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
import * as pluginSdk from 'openclaw/plugin-sdk';
import * as path from 'path';
import { APIClient } from './src/api_client';
import { WebSocketClient } from './src/websocket_client';
import { Sanitizer } from './src/sanitizer';
import { AuditLogger } from './src/audit_logger';
import { ChatTools } from './src/chat_tools';
import { Daemon } from './src/daemon';
import { DailyReporter } from './src/daily_reporter';
import {
  AgentOraclePluginModule,
  ConfigError,
  PluginConfig
} from './src/types';

/**
 * Gateway Method 上下文类型
 * 与 OpenClaw Plugin SDK registerGatewayMethod 回调参数兼容
 */
interface GatewayMethodContext {
  params: Record<string, unknown>;
  respond: (ok: boolean, data?: unknown) => unknown;
}

/**
 * AgentOracle Native Plugin
 * 遵循 OpenClaw Plugin SDK 标准的插件模块定义
 *
 * 功能：
 * - 后台守护进程：轮询 AgentOracle API 获取预测任务
 * - WebSocket 推理：通过 Gateway Protocol v3 调用 Agent 全能力处理任务
 * - 每日报告：定时发送收益统计报告给 Agent
 * - 聊天工具：注册 agentoracle.status 网关方法供查询收益
 */
const plugin: AgentOraclePluginModule = {
  id: 'agentoracle-native',
  name: 'AgentOracle Native',
  description: 'Automated signal analysis task processing with privacy protection and WebSocket integration',
  configSchema: pluginSdk.emptyPluginConfigSchema(),

  register(api: OpenClawPluginApi): void {
    const logger = api.logger;

    logger.info('[agentoracle-native] Initializing plugin');

    let daemon: Daemon | null = null;
    let dailyReporter: DailyReporter | null = null;

    try {
      // 从 OpenClaw 标准配置系统读取插件配置
      const rawConfig = api.config?.plugins?.entries?.['agentoracle-native']?.config ?? api.config ?? {};

      // 1. 加载配置
      const pluginConfig: PluginConfig = {
        apiKey: (rawConfig as any).api_key || '',
        apiBaseUrl: (rawConfig as any).api_base_url || '',
        gatewayUrl: (rawConfig as any).gateway_url || 'ws://localhost:18789',
        gatewayToken: (rawConfig as any).gateway_token || '',
        pollingIntervalSeconds: (rawConfig as any).polling_interval_seconds ?? 180,
        jitterSeconds: (rawConfig as any).jitter_seconds ?? 30,
        logDirectory: (rawConfig as any).log_directory || `${process.env.HOME}/.openclaw/logs/agentoracle`,
        dailyReportEnabled: (rawConfig as any).daily_report_enabled ?? true,
        dailyReportHour: (rawConfig as any).daily_report_hour ?? 2,
        dailyReportMinute: (rawConfig as any).daily_report_minute ?? 0
      };

      // Validate required fields
      if (!pluginConfig.apiKey) {
        throw new ConfigError('api_key is required');
      }

      if (!pluginConfig.gatewayToken) {
        throw new ConfigError('gateway_token is required');
      }

      if (!pluginConfig.apiBaseUrl) {
        throw new ConfigError('api_base_url is required');
      }

      logger.info('[agentoracle-native] Configuration loaded');
      logger.info(`[agentoracle-native] API Key: ${pluginConfig.apiKey.substring(0, 8)}...`);
      logger.info(`[agentoracle-native] Gateway URL: ${pluginConfig.gatewayUrl}`);

      // 2. 初始化所有模块
      const apiClient = new APIClient(pluginConfig.apiKey, pluginConfig.apiBaseUrl, logger);
      const sanitizer = new Sanitizer();
      const auditLogger = new AuditLogger(pluginConfig.logDirectory);
      const chatTools = new ChatTools(apiClient);

      // 3. 初始化 WebSocket Client
      const wsClient = new WebSocketClient({
        gatewayUrl: pluginConfig.gatewayUrl,
        gatewayToken: pluginConfig.gatewayToken,
        timeout: 300,
        maxRetries: 3,
        retryDelayBase: 2,
        connectTimeout: 10,
        messageTimeout: 20,
        deviceIdentityFile: path.join(__dirname, 'device_identity.json')
      }, logger);

      logger.info('[agentoracle-native] WebSocket client initialized');

      // 4. 注册网关方法（通过 OpenClaw Plugin SDK 标准 API）
      api.registerGatewayMethod('agentoracle.status', async ({ respond, params }: GatewayMethodContext) => {
        logger.info('[agentoracle-native] ========================================');
        logger.info('[agentoracle-native] Gateway method "agentoracle.status" called');
        logger.info('[agentoracle-native] ========================================');

        const result = await chatTools.checkAgentOracleStatus();

        logger.info('[agentoracle-native] ========================================');
        logger.info('[agentoracle-native] Tool execution result:');
        logger.info(`[agentoracle-native] ${result}`);
        logger.info('[agentoracle-native] ========================================');

        return respond(true, { content: result });
      });

      logger.info('[agentoracle-native] Gateway method "agentoracle.status" registered');

      // 5. 创建守护进程
      daemon = new Daemon({
        pollingIntervalSeconds: pluginConfig.pollingIntervalSeconds,
        jitterSeconds: pluginConfig.jitterSeconds
      }, apiClient, wsClient, sanitizer, auditLogger, logger);

      // 6. 启动每日报告服务（如果启用）
      if (pluginConfig.dailyReportEnabled) {
        dailyReporter = new DailyReporter(
          apiClient,
          wsClient,
          logger,
          pluginConfig.dailyReportHour,
          pluginConfig.dailyReportMinute
        );

        dailyReporter.start();
        logger.info('[agentoracle-native] DailyReporter started');

        // 启动报告在验证测试通过后发送，避免并发 WebSocket 连接干扰验证
        daemon.setOnVerificationSuccess(() => {
          dailyReporter!.sendStartupReport().catch((error) => {
            logger.error('[agentoracle-native] Failed to send startup report', error as Error);
          });
        });
      } else {
        logger.info('[agentoracle-native] DailyReporter disabled in configuration');
      }

      // 7. 启动守护进程
      daemon.start();
      logger.info('[agentoracle-native] Daemon started');

    } catch (error) {
      if (error instanceof ConfigError) {
        logger.error('[agentoracle-native] Configuration error', error);
        // 如果是 API Key 或 Gateway Token 缺失，记录警告但不启动守护进程
        if (error.message.includes('api_key') || error.message.includes('gateway_token')) {
          logger.warn('[agentoracle-native] Required configuration missing, background polling disabled');
        } else {
          throw error;
        }
      } else {
        logger.error('[agentoracle-native] Initialization failed', error as Error);
        throw error;
      }
    }
  },
};

export default plugin;

// 导出所有类型供外部使用
export * from './src/types';
