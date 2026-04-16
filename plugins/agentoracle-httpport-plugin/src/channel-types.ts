/**
 * Channel infrastructure types for httpport.
 * Adapted from openclaw-httpbridge/src/types.ts
 */

export type HttpPortInboundPayload = {
  conversationId: string;
  text?: string;
  message?: string;
  senderId?: string;
  senderName?: string;
  callbackUrl?: string;
  accountId?: string;
  metadata?: Record<string, unknown>;
};

export type HttpPortCallbackPayload = {
  conversationId: string;
  messageId: string;
  text?: string;
  mediaUrls?: string[];
  sessionKey: string;
  agentId: string;
  timestamp: number;
};

export type HttpPortAccountConfig = {
  enabled?: boolean;
  token?: string;
  callbackDefault?: string;
  callbackTtlMinutes?: number;
  maxCallbackEntries?: number;
};

export type HttpPortConfig = HttpPortAccountConfig & {
  defaultAccount?: string;
  accounts?: Record<string, HttpPortAccountConfig>;
};

export type ResolvedHttpPortAccount = {
  accountId: string;
  name?: string;
  enabled: boolean;
  configured: boolean;
  config: HttpPortAccountConfig;
};
