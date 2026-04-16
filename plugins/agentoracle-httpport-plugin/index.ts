import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { homedir } from 'node:os';
import { emptyPluginConfigSchema } from 'openclaw/plugin-sdk';

import { APIClient }         from './src/api_client';
import { HttpPortClient }    from './src/http_port_client';
import { Sanitizer }         from './src/sanitizer';
import { AuditLogger }       from './src/audit_logger';
import { Daemon }            from './src/daemon';
import { DailyReporter }     from './src/daily_reporter';
import { setHttpPortRuntime, onGatewayReady } from './src/runtime';
import { httpportChannel }   from './src/channel';
import { handleHttpPortWebhookRequest } from './src/monitor';
import {
  AgentOraclePluginModule,
  ConfigError,
  PluginConfig,
} from './src/types';

/**
 * AgentOracle HTTP Port Plugin
 *
 * Architecture: based on openclaw-httpbridge's proven channel infrastructure.
 * - Channel layer (channel.ts + monitor.ts + outbound.ts + callbacks.ts + accounts.ts)
 *   is adapted directly from httpbridge, ensuring the full OpenClaw dispatch chain works.
 * - Business layer (Daemon + DailyReporter + APIClient + Sanitizer + AuditLogger)
 *   adds AgentOracle signal analysis task automation on top.
 */
const plugin: AgentOraclePluginModule = {
  id:          'agentoracle-httpport',
  name:        'AgentOracle HTTP Port',
  description: 'Automated signal analysis task processing via HTTP Port channel (no WebSocket required)',
  configSchema: emptyPluginConfigSchema(),

  register(api: OpenClawPluginApi): void {
    const logger = api.logger;
    logger.info('[agentoracle-httpport] Initializing plugin');

    try {
      // ── 1. Read config from channels.httpport (like httpbridge) ───────────
      //    Fallback: plugins.entries.agentoracle-httpport.config (backward compat)
      const channelCfg = (api.config as any)?.channels?.httpport ?? {};
      const legacyCfg  = (api.config as any)?.plugins?.entries?.['agentoracle-httpport']?.config ?? {};
      const rawConfig  = { ...legacyCfg, ...channelCfg };

      const gatewayPort = (api.config as any)?.gateway?.port ?? 18789;
      const defaultBase = `http://127.0.0.1:${gatewayPort}`;

      const pluginConfig: PluginConfig = {
        apiKey:                  rawConfig.api_key                    || '',
        apiBaseUrl:              rawConfig.api_base_url               || 'http://localhost:3000',
        httpportToken:           rawConfig.token                      || rawConfig.httpport_token || '',
        openclawBaseUrl:         defaultBase,
        callbackPath:            '/agentoracle/callback',
        httpportInboundUrl:      `${defaultBase}/httpport/inbound`,
        inferenceTimeoutSeconds: rawConfig.inference_timeout_seconds  ?? 300,
        pollingIntervalSeconds:  rawConfig.polling_interval_seconds   ?? 180,
        jitterSeconds:           rawConfig.jitter_seconds             ?? 30,
        logDirectory:            rawConfig.log_directory              ||
          homedir() + '/.openclaw/logs/agentoracle-httpport',
        dailyReportEnabled:      rawConfig.daily_report_enabled      ?? true,
        dailyReportHour:         rawConfig.daily_report_hour         ?? 2,
        dailyReportMinute:       rawConfig.daily_report_minute       ?? 0,
      };

      if (!pluginConfig.apiKey) {
        throw new ConfigError('api_key is required — set channels.httpport.api_key');
      }

      const callbackUrl = rawConfig.callbackDefault
        || `${pluginConfig.openclawBaseUrl}${pluginConfig.callbackPath}`;

      logger.info('[agentoracle-httpport] Configuration loaded');
      logger.info(`[agentoracle-httpport] Port Inbound:   ${pluginConfig.httpportInboundUrl}`);
      logger.info(`[agentoracle-httpport] Callback URL:   ${callbackUrl}`);

      // ── 2. Channel infrastructure (mirrors httpbridge index.ts exactly) ────
      setHttpPortRuntime(api.runtime);

      api.registerChannel({ plugin: httpportChannel } as any);
      logger.info('[agentoracle-httpport] Channel "httpport" registered');

      api.registerHttpRoute({
        path: '/httpport',
        auth: 'plugin',
        match: 'prefix',
        handler: handleHttpPortWebhookRequest,
      });
      logger.info('[agentoracle-httpport] Registered /httpport route');

      // ── 3. HttpPortClient + callback route ─────────────────────────────────
      const httpPortClient = new HttpPortClient(
        {
          inboundUrl:         pluginConfig.httpportInboundUrl,
          token:              pluginConfig.httpportToken,
          callbackUrl:        callbackUrl,
          inferenceTimeoutMs: pluginConfig.inferenceTimeoutSeconds * 1000,
        },
        logger
      );

      api.registerHttpRoute({
        path: '/agentoracle',
        auth: 'plugin',
        match: 'prefix',
        handler: (req: IncomingMessage, res: ServerResponse) =>
          httpPortClient.handleCallback(req, res),
      });
      logger.info('[agentoracle-httpport] Registered /agentoracle/callback route');

      // ── 4. Business modules ────────────────────────────────────────────────
      const apiClient   = new APIClient(pluginConfig.apiKey, pluginConfig.apiBaseUrl);
      const sanitizer   = new Sanitizer();
      const auditLogger = new AuditLogger(pluginConfig.logDirectory);

      api.registerGatewayMethod(
        'agentoracle.status',
        async ({ respond }: any) => {
          try {
            const stats = await apiClient.getStats();
            const earnings = (stats.total_earnings ?? 0).toFixed(2);
            const tasks    = stats.completed_tasks ?? 0;
            const rep      = stats.reputation_score ?? 0;
            const rankLine = stats.rank ? `🏆 **排名**: #${stats.rank}\n` : '';

            const content = [
              '🤖 **AgentOracle 收益面板** (HTTP Port)',
              '',
              '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
              `💰 **总收益**: ${earnings}`,
              `✅ **完成任务**: ${tasks} 个`,
              `⭐ **信誉分**: ${rep} / 1000`,
              rankLine,
              '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
              '你的 Agent 正在努力打工中... 💪',
              '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
              '📌 数据来源：AgentOracle 预测任务平台',
              '🌐 平台地址：https://agentoracle.xyz',
            ].join('\n').trim();

            return respond(true, { content });
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return respond(false, { content: `❌ AgentOracle 服务暂时不可用\n错误详情: ${msg}` });
          }
        }
      );
      logger.info('[agentoracle-httpport] Gateway method "agentoracle.status" registered');

      // ── 5. Daemon + DailyReporter (deferred until gateway starts channel) ─
      const daemon = new Daemon(
        {
          pollingIntervalSeconds: pluginConfig.pollingIntervalSeconds,
          jitterSeconds:          pluginConfig.jitterSeconds,
        },
        apiClient,
        httpPortClient,
        sanitizer,
        auditLogger,
        logger
      );

      if (pluginConfig.dailyReportEnabled) {
        const dailyReporter = new DailyReporter(
          apiClient,
          httpPortClient,
          logger,
          pluginConfig.dailyReportHour,
          pluginConfig.dailyReportMinute
        );
        daemon.setOnVerificationSuccess(() => {
          dailyReporter.sendStartupReport().catch((err: Error) => {
            logger.error('[agentoracle-httpport] Failed to send startup report', err);
          });
        });

        // Only start daemon + reporter when gateway calls startAccount.
        // In CLI contexts (e.g. `openclaw plugins list`), startAccount is
        // never called, so these background tasks won't run.
        onGatewayReady(() => {
          dailyReporter.start();
          logger.info('[agentoracle-httpport] DailyReporter started');
          daemon.start();
          logger.info('[agentoracle-httpport] Daemon started (gateway ready)');
        });
      } else {
        onGatewayReady(() => {
          daemon.start();
          logger.info('[agentoracle-httpport] Daemon started (gateway ready)');
        });
      }

      logger.info('[agentoracle-httpport] Plugin fully initialized');

    } catch (error) {
      if (error instanceof ConfigError) {
        logger.error('[agentoracle-httpport] Configuration error', error);
        if (error.message.includes('api_key') || error.message.includes('httpport_token')) {
          logger.warn(
            '[agentoracle-httpport] Required configuration missing — ' +
            'background polling disabled. Please set api_key and httpport_token.'
          );
        } else {
          throw error;
        }
      } else {
        logger.error('[agentoracle-httpport] Initialization failed', error as Error);
        throw error;
      }
    }
  },
};

export default plugin;

export * from './src/types';
