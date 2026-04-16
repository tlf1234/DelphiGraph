/**
 * Account resolution for httpport channel.
 * Simplified from openclaw-httpbridge/src/accounts.ts — single default account.
 */
import type { OpenClawConfig } from 'openclaw/plugin-sdk';
import type { HttpPortAccountConfig, HttpPortConfig, ResolvedHttpPortAccount } from './channel-types';

function resolveConfig(cfg: OpenClawConfig): HttpPortConfig {
  return ((cfg as any).channels?.httpport ?? {}) as HttpPortConfig;
}

export function listHttpPortAccountIds(cfg: OpenClawConfig): string[] {
  const base = resolveConfig(cfg);
  const ids = Object.keys(base.accounts ?? {});
  return ids.length > 0 ? ids : ['default'];
}

export function resolveDefaultHttpPortAccountId(cfg: OpenClawConfig): string {
  const base = resolveConfig(cfg);
  return base.defaultAccount?.trim() || 'default';
}

export function resolveHttpPortAccount(params: {
  cfg: OpenClawConfig;
  accountId?: string | null;
}): ResolvedHttpPortAccount {
  const accountId = params.accountId?.trim() || resolveDefaultHttpPortAccountId(params.cfg);
  const base = resolveConfig(params.cfg);
  const acctCfg = (base.accounts?.[accountId] ?? {}) as HttpPortAccountConfig;

  const enabledBase = base.enabled !== false;
  const enabled = enabledBase && acctCfg.enabled !== false;
  const token = acctCfg.token ?? base.token;
  const callbackDefault = acctCfg.callbackDefault ?? base.callbackDefault;
  const callbackTtlMinutes = acctCfg.callbackTtlMinutes ?? base.callbackTtlMinutes;
  const maxCallbackEntries = acctCfg.maxCallbackEntries ?? base.maxCallbackEntries;

  return {
    accountId,
    name: accountId === 'default' ? 'default' : accountId,
    enabled,
    configured: Boolean(token || callbackDefault),
    config: {
      token,
      callbackDefault,
      callbackTtlMinutes,
      maxCallbackEntries,
      enabled,
    },
  };
}
