/**
 * ChannelPlugin for "httpport" — adapted directly from openclaw-httpbridge/src/channel.ts.
 *
 * This uses the exact same structure that httpbridge uses successfully,
 * with our simplified account/outbound/monitor modules.
 */
import type { OpenClawConfig } from 'openclaw/plugin-sdk';

import {
  resolveHttpPortAccount,
  listHttpPortAccountIds,
  resolveDefaultHttpPortAccountId,
} from './accounts';
import { httpportOutbound } from './outbound';
import { startHttpPortMonitor } from './monitor';
import { setHttpPortRuntime, getHttpPortRuntime, notifyGatewayReady } from './runtime';
import type { ResolvedHttpPortAccount } from './channel-types';

const meta = {
  id: 'httpport',
  label: 'HTTP Port',
  selectionLabel: 'HTTP Port (AgentOracle)',
  detailLabel: 'HTTP Port',
  blurb: 'HTTP inbound channel for AgentOracle signal submissions.',
  order: 91,
} as const;

const HttpPortChannelSchema = {
  type: 'object',
  additionalProperties: true,
  properties: {
    // ── httpport channel fields (same as httpbridge) ──
    enabled: { type: 'boolean' },
    token: { type: 'string' },
    callbackDefault: { type: 'string' },
    callbackTtlMinutes: { type: 'number' },
    maxCallbackEntries: { type: 'number' },
    defaultAccount: { type: 'string' },
    accounts: {
      type: 'object',
      additionalProperties: {
        type: 'object',
        additionalProperties: false,
        properties: {
          enabled: { type: 'boolean' },
          token: { type: 'string' },
          callbackDefault: { type: 'string' },
          callbackTtlMinutes: { type: 'number' },
          maxCallbackEntries: { type: 'number' },
        },
      },
    },
    // ── AgentOracle business fields ──
    api_key: { type: 'string' },
    api_base_url: { type: 'string' },
    polling_interval_seconds: { type: 'number' },
    jitter_seconds: { type: 'number' },
    inference_timeout_seconds: { type: 'number' },
    log_directory: { type: 'string' },
    daily_report_enabled: { type: 'boolean' },
    daily_report_hour: { type: 'number' },
    daily_report_minute: { type: 'number' },
  },
};

export const httpportChannel = {
  id: 'httpport',
  meta,
  capabilities: {
    chatTypes: ['direct'] as const,
    media: false,
    threads: false,
  },
  reload: { configPrefixes: ['channels.httpport'] },
  configSchema: { schema: HttpPortChannelSchema },
  config: {
    listAccountIds: (cfg: any) => listHttpPortAccountIds(cfg as OpenClawConfig),
    resolveAccount: (cfg: any, accountId: string) =>
      resolveHttpPortAccount({ cfg: cfg as OpenClawConfig, accountId }),
    defaultAccountId: (cfg: any) => resolveDefaultHttpPortAccountId(cfg as OpenClawConfig),
    isConfigured: (account: ResolvedHttpPortAccount) =>
      Boolean(account.config.token || account.config.callbackDefault),
    describeAccount: (account: ResolvedHttpPortAccount) => ({
      accountId: account.accountId,
      name: account.name,
      enabled: account.enabled,
      configured: account.configured,
    }),
  },
  outbound: httpportOutbound,
  messaging: {
    normalizeTarget: (raw: string | undefined) => raw?.trim() || undefined,
    targetResolver: {
      looksLikeId: (raw: string) => Boolean(raw.trim()),
      hint: 'conversationId',
    },
  },
  status: {
    defaultRuntime: {
      accountId: 'default',
      running: false,
      lastStartAt: null,
      lastStopAt: null,
      lastError: null,
    },
    buildChannelSummary: ({ snapshot }: any) => ({
      configured: snapshot?.configured ?? false,
      running: snapshot?.running ?? false,
      lastStartAt: snapshot?.lastStartAt ?? null,
      lastStopAt: snapshot?.lastStopAt ?? null,
      lastError: snapshot?.lastError ?? null,
    }),
    buildAccountSnapshot: ({ account, runtime }: any) => ({
      accountId: account.accountId,
      name: account.name,
      enabled: account.enabled,
      configured: account.configured,
      running: runtime?.running ?? false,
      lastStartAt: runtime?.lastStartAt ?? null,
      lastStopAt: runtime?.lastStopAt ?? null,
      lastError: runtime?.lastError ?? null,
    }),
  },
  gateway: {
    startAccount: async (ctx: any) => {
      const account = ctx.account as ResolvedHttpPortAccount;
      ctx.log?.info(`[${account.accountId}] starting httpport channel`);
      ctx.setStatus({
        accountId: account.accountId,
        running: true,
        lastStartAt: Date.now(),
      });
      const unregister = await startHttpPortMonitor({
        account,
        config: ctx.cfg as OpenClawConfig,
        runtime: ctx.runtime,
        abortSignal: ctx.abortSignal,
        statusSink: (patch: any) => ctx.setStatus({ accountId: account.accountId, ...patch }),
      });
      ctx.log?.info(`[${account.accountId}] httpport channel ready — holding promise until abort`);
      notifyGatewayReady();
      // Gateway treats Promise resolution as "channel exited" → auto-restart.
      // Keep the promise pending until abortSignal fires.
      await new Promise<void>((resolve) => {
        if (ctx.abortSignal?.aborted) {
          resolve();
          return;
        }
        ctx.abortSignal?.addEventListener('abort', () => resolve(), { once: true });
      });
      // Cleanup after abort
      ctx.log?.info(`[${account.accountId}] abortSignal received — cleaning up httpport channel`);
      unregister?.();
      ctx.setStatus({
        accountId: account.accountId,
        running: false,
        lastStopAt: Date.now(),
      });
    },
  },
};
