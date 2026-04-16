/**
 * Outbound adapter for httpport channel.
 * Adapted from openclaw-httpbridge/src/outbound.ts
 */
import { resolveHttpPortAccount } from './accounts';
import { resolveCallbackUrl } from './callbacks';

function ensureTarget(to: string | undefined): string {
  const trimmed = to?.trim();
  if (trimmed) return trimmed;
  throw new Error('httpport: missing conversationId target');
}

async function postCallback(url: string, payload: unknown) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`callback failed (${res.status})`);
  }
}

export const httpportOutbound = {
  deliveryMode: 'direct' as const,

  resolveTarget: ({ to }: any) => {
    const trimmed = to?.trim();
    if (!trimmed) return { ok: false, error: 'missing conversationId' };
    return { ok: true, to: trimmed };
  },

  sendText: async (ctx: any) => {
    const account = resolveHttpPortAccount({ cfg: ctx.cfg, accountId: ctx.accountId });
    const conversationId = ensureTarget(ctx.to);
    const callbackUrl = resolveCallbackUrl({ conversationId, account });
    if (!callbackUrl) {
      throw new Error('callbackUrl is required (or set channels.httpport.callbackDefault)');
    }
    const messageId = `httpport-${Date.now()}`;
    await postCallback(callbackUrl, {
      conversationId,
      messageId,
      text: ctx.text,
      mediaUrls: [],
      sessionKey: ctx.sessionKey ?? conversationId,
      agentId: ctx.agentId ?? 'main',
      timestamp: Date.now(),
    });
    return {
      channel: 'httpport',
      messageId,
      chatId: conversationId,
      timestamp: Date.now(),
      to: conversationId,
    };
  },

  sendPayload: async (ctx: any) => {
    const account = resolveHttpPortAccount({ cfg: ctx.cfg, accountId: ctx.accountId });
    const conversationId = ensureTarget(ctx.to);
    const callbackUrl = resolveCallbackUrl({ conversationId, account });
    if (!callbackUrl) {
      throw new Error('callbackUrl is required (or set channels.httpport.callbackDefault)');
    }
    const messageId = `httpport-${Date.now()}`;
    await postCallback(callbackUrl, {
      conversationId,
      messageId,
      text: ctx.payload?.text,
      mediaUrls: [],
      sessionKey: ctx.sessionKey ?? conversationId,
      agentId: ctx.agentId ?? 'main',
      timestamp: Date.now(),
    });
    return {
      channel: 'httpport',
      messageId,
      chatId: conversationId,
      timestamp: Date.now(),
      to: conversationId,
    };
  },

  sendMedia: async (ctx: any) => {
    const account = resolveHttpPortAccount({ cfg: ctx.cfg, accountId: ctx.accountId });
    const conversationId = ensureTarget(ctx.to);
    const callbackUrl = resolveCallbackUrl({ conversationId, account });
    if (!callbackUrl) {
      throw new Error('callbackUrl is required (or set channels.httpport.callbackDefault)');
    }
    const messageId = `httpport-${Date.now()}`;
    await postCallback(callbackUrl, {
      conversationId,
      messageId,
      text: ctx.text,
      mediaUrls: ctx.mediaUrl ? [ctx.mediaUrl] : [],
      sessionKey: ctx.sessionKey ?? conversationId,
      agentId: ctx.agentId ?? 'main',
      timestamp: Date.now(),
    });
    return {
      channel: 'httpport',
      messageId,
      chatId: conversationId,
      timestamp: Date.now(),
      to: conversationId,
    };
  },
};
