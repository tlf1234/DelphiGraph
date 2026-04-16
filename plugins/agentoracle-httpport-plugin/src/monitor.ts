/**
 * Inbound webhook monitor for httpport channel.
 * Adapted from openclaw-httpbridge/src/monitor.ts — text-only, no media.
 *
 * This is the proven dispatch chain that httpbridge uses successfully.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { OpenClawConfig } from 'openclaw/plugin-sdk';

import { resolveHttpPortAccount } from './accounts';
import { rememberCallback, resolveCallbackUrl } from './callbacks';
import { getHttpPortRuntime } from './runtime';
import type { HttpPortInboundPayload, ResolvedHttpPortAccount } from './channel-types';

const MAX_BODY_BYTES = 1024 * 1024;

// ── Types ────────────────────────────────────────────────────────────────────

export type HttpPortRuntimeEnv = {
  log?: (message: string) => void;
  error?: (message: string) => void;
};

type WebhookTarget = {
  account: ResolvedHttpPortAccount;
  config: OpenClawConfig;
  runtime: HttpPortRuntimeEnv;
  statusSink?: (patch: { lastInboundAt?: number; lastOutboundAt?: number }) => void;
};

// ── Webhook target registry ─────────────────────────────────────────────────

let activeTarget: WebhookTarget | null = null;

export function registerHttpPortWebhookTarget(target: WebhookTarget): () => void {
  activeTarget = target;
  return () => { activeTarget = null; };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

async function readJsonBody(req: IncomingMessage, maxBytes: number) {
  const chunks: Buffer[] = [];
  let total = 0;
  return await new Promise<{ ok: boolean; value?: unknown; error?: string }>((resolve) => {
    let resolved = false;
    const doResolve = (value: { ok: boolean; value?: unknown; error?: string }) => {
      if (resolved) return;
      resolved = true;
      req.removeAllListeners();
      resolve(value);
    };
    req.on('data', (chunk: Buffer) => {
      total += chunk.length;
      if (total > maxBytes) {
        doResolve({ ok: false, error: 'payload too large' });
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        if (!raw.trim()) {
          doResolve({ ok: false, error: 'empty payload' });
          return;
        }
        doResolve({ ok: true, value: JSON.parse(raw) as unknown });
      } catch (err) {
        doResolve({ ok: false, error: err instanceof Error ? err.message : String(err) });
      }
    });
    req.on('error', (err) => {
      doResolve({ ok: false, error: err instanceof Error ? err.message : String(err) });
    });
  });
}

function extractBearerToken(req: IncomingMessage): string {
  const authHeader = String(req.headers.authorization ?? '');
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice('bearer '.length).trim();
  }
  const alt = String(req.headers['x-openclaw-token'] ?? '');
  return alt.trim();
}

function buildConversationSessionKey(params: {
  agentId: string;
  accountId: string;
  conversationId: string;
}): string {
  const agentId = params.agentId.trim().toLowerCase();
  const conversationId = params.conversationId.trim().toLowerCase();
  // conversationId 为 'main' 时，路由到主聊天会话（与网页聊天一致）
  if (conversationId === 'main') {
    return `agent:${agentId}:main`;
  }
  const accountId = params.accountId.trim().toLowerCase();
  return `agent:${agentId}:httpport:${accountId}:dm:${conversationId}`;
}

function validateCallbackUrl(url: string) {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('callbackUrl must be a valid URL');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('callbackUrl must use http or https');
  }
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

// ── Main handler (mirrors httpbridge handleHttpBridgeWebhookRequest) ────────

export async function handleHttpPortWebhookRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  if (!activeTarget) return false;

  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Allow', 'POST');
    res.end('Method Not Allowed');
    return true;
  }

  const body = await readJsonBody(req, MAX_BODY_BYTES);
  if (!body.ok) {
    res.statusCode = body.error === 'payload too large' ? 413 : 400;
    res.end(body.error ?? 'invalid payload');
    return true;
  }

  if (!body.value || typeof body.value !== 'object' || Array.isArray(body.value)) {
    res.statusCode = 400;
    res.end('invalid payload');
    return true;
  }

  const payload = body.value as HttpPortInboundPayload;
  const conversationId = payload.conversationId?.trim();
  if (!conversationId) {
    res.statusCode = 400;
    res.end('conversationId is required');
    return true;
  }

  const target = activeTarget;
  const account = target.account;

  // Token validation
  const expectedToken = account.config.token?.trim();
  if (expectedToken) {
    const provided = extractBearerToken(req);
    if (!provided || provided !== expectedToken) {
      res.statusCode = 401;
      res.end('unauthorized');
      return true;
    }
  }

  const rawText = (payload.text ?? payload.message ?? '').trim();
  if (!rawText) {
    res.statusCode = 400;
    res.end('text is required');
    return true;
  }

  // Remember callback URL
  if (payload.callbackUrl?.trim()) {
    try {
      validateCallbackUrl(payload.callbackUrl);
      rememberCallback({
        conversationId,
        callbackUrl: payload.callbackUrl.trim(),
        account,
      });
    } catch (err) {
      res.statusCode = 400;
      res.end(err instanceof Error ? err.message : String(err));
      return true;
    }
  }

  const callbackUrl = resolveCallbackUrl({ conversationId, account });
  if (!callbackUrl) {
    res.statusCode = 400;
    res.end('callbackUrl is required (or set channels.httpport.callbackDefault)');
    return true;
  }

  // ── Dispatch chain (exactly mirrors httpbridge monitor.ts lines 382-491) ──

  const core = getHttpPortRuntime();
  const config = target.config;

  const route = core.channel.routing.resolveAgentRoute({
    cfg: config,
    channel: 'httpport',
    accountId: account.accountId,
    peer: {
      kind: 'dm',
      id: conversationId,
    },
  });

  const sessionKey = buildConversationSessionKey({
    agentId: route.agentId,
    accountId: route.accountId,
    conversationId,
  });

  const fromLabel = payload.senderName?.trim() || payload.senderId?.trim() || `conv:${conversationId}`;
  const storePath = core.channel.session.resolveStorePath((config as any).session?.store, {
    agentId: route.agentId,
  });
  const envelopeOptions = core.channel.reply.resolveEnvelopeFormatOptions(config);
  const previousTimestamp = core.channel.session.readSessionUpdatedAt({
    storePath,
    sessionKey,
  });

  const bodyText = core.channel.reply.formatAgentEnvelope({
    channel: 'HTTP Port',
    from: fromLabel,
    timestamp: Date.now(),
    previousTimestamp,
    envelope: envelopeOptions,
    body: rawText,
  });

  const ctxPayload = core.channel.reply.finalizeInboundContext({
    Body: bodyText,
    RawBody: rawText,
    CommandBody: rawText,
    From: payload.senderId ? `httpport:${payload.senderId}` : `httpport:conv:${conversationId}`,
    To: `httpport:${conversationId}`,
    SessionKey: sessionKey,
    AccountId: route.accountId,
    ChatType: 'direct',
    ConversationLabel: fromLabel,
    SenderName: payload.senderName?.trim() || undefined,
    SenderId: payload.senderId?.trim() || undefined,
    Provider: 'httpport',
    Surface: 'httpport',
    OriginatingChannel: 'httpport',
    OriginatingTo: `httpport:${conversationId}`,
  });

  void core.channel.session
    .recordSessionMetaFromInbound({
      storePath,
      sessionKey: ctxPayload.SessionKey ?? sessionKey,
      ctx: ctxPayload,
    })
    .catch((err) => {
      target.runtime.error?.(`httpport: failed updating session meta: ${String(err)}`);
    });

  target.statusSink?.({ lastInboundAt: Date.now() });

  void core.channel.reply
    .dispatchReplyWithBufferedBlockDispatcher({
      ctx: ctxPayload,
      cfg: config,
      dispatcherOptions: {
        deliver: async (deliverPayload: any) => {
          try {
            const messageId = deliverPayload.messageId ?? `httpport-${Date.now()}`;
            await postCallback(callbackUrl, {
              conversationId,
              messageId,
              text: deliverPayload.text,
              mediaUrls: deliverPayload.mediaUrls ?? (deliverPayload.mediaUrl ? [deliverPayload.mediaUrl] : undefined),
              sessionKey,
              agentId: route.agentId,
              timestamp: Date.now(),
            });
            target.statusSink?.({ lastOutboundAt: Date.now() });
          } catch (err) {
            target.runtime.error?.(`httpport: callback failed: ${String(err)}`);
          }
        },
        onError: (err: any, info: any) => {
          target.runtime.error?.(`httpport ${info.kind} reply failed: ${String(err)}`);
        },
      },
    })
    .catch((err) => {
      target.runtime.error?.(`httpport: dispatch failed: ${String(err)}`);
    });

  res.statusCode = 202;
  res.end('accepted');
  return true;
}

// ── Lifecycle (mirrors httpbridge startHttpBridgeMonitor) ────────────────────

export async function startHttpPortMonitor(params: {
  account: ResolvedHttpPortAccount;
  config: OpenClawConfig;
  runtime: HttpPortRuntimeEnv;
  abortSignal: AbortSignal;
  statusSink?: (patch: { lastInboundAt?: number; lastOutboundAt?: number }) => void;
}): Promise<() => void> {
  return registerHttpPortWebhookTarget({
    account: params.account,
    config: params.config,
    runtime: params.runtime,
    statusSink: params.statusSink,
  });
}
