import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  HttpPortClientConfig,
  PluginLogger,
  NetworkError,
  InferenceTimeoutError,
} from './types';

/**
 * 等待中的推理请求
 */
interface PendingRequest {
  resolve: (text: string) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  debounceTimer?: ReturnType<typeof setTimeout>;
  taskId: string;
  startedAt: number;
  accumulatedTexts: string[];
  callbackCount: number;
}

/**
 * OpenClaw HTTP Port 回调 payload 格式
 * 由 openclaw-httpport 频道发出
 */
interface BridgeCallbackPayload {
  conversationId: string;
  messageId: string;
  text?: string;
  mediaUrls?: string[];
  sessionKey: string;
  agentId: string;
  timestamp: number;
}

/**
 * HttpPortClient
 * 替代 WebSocketClient — 使用 HTTP Port 频道与 OpenClaw Agent 交互
 *
 * 工作原理：
 *  1. sendMessage(conversationId, prompt) — POST 到 /httpport/inbound，立刻返回 202
 *  2. OpenClaw Agent 推理完成后 POST 回调到本插件注册的 callbackUrl
 *  3. handleCallback(req, res) — 解析回调 payload，resolve 对应的 Promise
 *
 * 注意：需要在 OpenClaw 中配置 openclaw-httpport 频道（channels.httpport.token 需与
 * 本客户端的 token 一致）。
 */
export class HttpPortClient {
  private static readonly CALLBACK_SETTLE_MS = 3000;
  private pendingRequests = new Map<string, PendingRequest>();
  private recentCallbacks = new Map<string, number>();
  private readonly recentCallbackTtlMs = 10 * 60 * 1000;
  private sendLock: Promise<void> = Promise.resolve();

  constructor(
    private config: HttpPortClientConfig,
    private logger: PluginLogger
  ) {}

  /**
   * 生成 conversationId
   * 统一使用 'main'，复用用户的主会话，让 Agent 拥有完整上下文
   */
  makeConversationId(_taskId: string): string {
    return 'main';
  }

  /**
   * 向 OpenClaw Agent 发送消息并等待回调响应
   *
   * @param conversationId  唯一会话 ID（用于匹配回调）
   * @param prompt          发送给 Agent 的完整提示词
   * @returns               Agent 的响应文本
   * @throws NetworkError           无法到达 httpport inbound 端点
   * @throws InferenceTimeoutError  超过推理超时时间
   */
  async sendMessage(conversationId: string, prompt: string): Promise<string> {
    // 串行化发送：所有消息都用同一个 conversationId ('main')，
    // 必须等上一条完成后再发下一条，防止 pendingRequests 冲突
    let releaseLock!: () => void;
    const gate = new Promise<void>(r => { releaseLock = r; });
    const prevLock = this.sendLock;
    this.sendLock = gate;
    await prevLock;

    return new Promise<string>((resolve, reject) => {
      const wrappedResolve = (v: string) => { releaseLock(); resolve(v); };
      const wrappedReject  = (e: Error)  => { releaseLock(); reject(e); };
      const timer = setTimeout(() => {
        const p = this.pendingRequests.get(conversationId);
        if (p) {
          if (p.debounceTimer) clearTimeout(p.debounceTimer);
          this.pendingRequests.delete(conversationId);
          this.logger.error(
            `[agentoracle-httpport] ⏰ Inference timeout for conversationId: ${conversationId}`
          );
          wrappedReject(new InferenceTimeoutError(
            `推理超时（${this.config.inferenceTimeoutMs / 1000}s），conversationId: ${conversationId}`
          ));
        }
      }, this.config.inferenceTimeoutMs);

      this.pendingRequests.set(conversationId, {
        resolve: wrappedResolve,
        reject: wrappedReject,
        timer,
        taskId: conversationId,
        startedAt: Date.now(),
        accumulatedTexts: [],
        callbackCount: 0,
      });

      // 发出 HTTP 请求，失败时清理 pending 并 reject
      this._postToInbound(conversationId, prompt).catch((err: Error) => {
        if (this.pendingRequests.has(conversationId)) {
          clearTimeout(timer);
          this.pendingRequests.delete(conversationId);
          wrappedReject(err);
        }
      });
    });
  }

  /**
   * 处理来自 openclaw-httpport 的回调请求
   * 应由 api.registerHttpRoute 注册的路由处理器调用
   *
   * @returns true（始终消费该请求）
   */
  async handleCallback(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    if (req.method !== 'POST') {
      res.statusCode = 405;
      res.setHeader('Allow', 'POST');
      res.end('Method Not Allowed');
      return true;
    }

    let payload: BridgeCallbackPayload;
    try {
      payload = await this._readJsonBody(req) as BridgeCallbackPayload;
    } catch (err) {
      this.logger.error(`[agentoracle-httpport] Callback parse error: ${String(err)}`);
      res.statusCode = 400;
      res.end('invalid payload');
      return true;
    }

    const conversationId = payload?.conversationId?.trim();
    if (!conversationId) {
      res.statusCode = 400;
      res.end('missing conversationId');
      return true;
    }

    this.pruneRecentCallbacks();

    const pending = this.pendingRequests.get(conversationId);
    if (!pending) {
      const recentAt = this.recentCallbacks.get(conversationId);
      if (recentAt) {
        this.logger.info(
          `[agentoracle-httpport] Ignoring post-settle callback for conversationId: ${conversationId}`
        );
      } else {
        this.logger.warn(
          `[agentoracle-httpport] Received callback for unknown/expired conversationId: ${conversationId}`
        );
      }
      res.statusCode = 200;
      res.end('ok');
      return true;
    }

    // Accumulate callback text
    const responseText = payload.text?.trim() ?? '';
    pending.callbackCount++;
    if (responseText) {
      pending.accumulatedTexts.push(responseText);
    }

    this.logger.info(
      `[agentoracle-httpport] 📨 Callback #${pending.callbackCount} for conversationId: ${conversationId} ` +
      `(chars: ${responseText.length})`
    );

    // Reset debounce — resolve after CALLBACK_SETTLE_MS of quiet
    if (pending.debounceTimer) clearTimeout(pending.debounceTimer);
    pending.debounceTimer = setTimeout(() => {
      if (!this.pendingRequests.has(conversationId)) return;

      clearTimeout(pending.timer);
      this.pendingRequests.delete(conversationId);
      this.recentCallbacks.set(conversationId, Date.now());

      // Use the LAST callback text (most likely the final Agent response)
      const finalText = pending.accumulatedTexts[pending.accumulatedTexts.length - 1] || '';
      const elapsedMs = Date.now() - pending.startedAt;

      this.logger.info(
        `[agentoracle-httpport] ✅ Final response for conversationId: ${conversationId} ` +
        `(${pending.callbackCount} callbacks, elapsed: ${(elapsedMs / 1000).toFixed(1)}s, chars: ${finalText.length})`
      );

      if (!finalText) {
        pending.reject(new Error('Agent 回调响应为空'));
      } else {
        pending.resolve(finalText);
      }
    }, HttpPortClient.CALLBACK_SETTLE_MS);

    res.statusCode = 200;
    res.end('ok');
    return true;
  }

  private pruneRecentCallbacks(): void {
    const now = Date.now();
    for (const [key, ts] of this.recentCallbacks.entries()) {
      if (now - ts > this.recentCallbackTtlMs) this.recentCallbacks.delete(key);
    }
  }

  /**
   * 当前等待中的请求数
   */
  get pendingCount(): number {
    return this.pendingRequests.size;
  }

  /**
   * 清空所有等待中的请求（插件停止时调用）
   */
  clearPending(): void {
    for (const [conversationId, pending] of this.pendingRequests.entries()) {
      clearTimeout(pending.timer);
      if (pending.debounceTimer) clearTimeout(pending.debounceTimer);
      pending.reject(new Error('插件停止，推理请求已取消'));
      this.logger.warn(`[agentoracle-httpport] Cancelled pending request: ${conversationId}`);
    }
    this.pendingRequests.clear();
  }

  // ─── Private Helpers ────────────────────────────────────────────────────────

  /**
   * POST 到 openclaw-httpport 的 inbound 端点
   */
  private async _postToInbound(conversationId: string, text: string): Promise<void> {
    this.logger.info(
      `[agentoracle-httpport] → POST ${this.config.inboundUrl} ` +
      `(conversationId: ${conversationId}, promptLen: ${text.length})`
    );

    let res: Response;
    try {
      res = await fetch(this.config.inboundUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.token}`,
        },
        body: JSON.stringify({
          conversationId,
          text,
          callbackUrl: this.config.callbackUrl,
        }),
        signal: AbortSignal.timeout(30_000),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new NetworkError(`无法连接到 OpenClaw HTTP Port inbound: ${msg}`);
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new NetworkError(
        `HTTP Port inbound 请求失败 (${res.status}): ${body || res.statusText}`
      );
    }

    // 202 Accepted — OpenClaw 已接收，等待回调
    this.logger.info(
      `[agentoracle-httpport] ↩ ${res.status} Accepted, waiting for callback...`
    );
  }

  /**
   * 从 IncomingMessage 读取并解析 JSON body
   */
  private _readJsonBody(req: IncomingMessage): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let total = 0;
      const MAX_BYTES = 512 * 1024;

      req.on('data', (chunk: Buffer) => {
        total += chunk.length;
        if (total > MAX_BYTES) {
          req.destroy();
          reject(new Error('callback payload too large'));
          return;
        }
        chunks.push(chunk);
      });

      req.on('end', () => {
        try {
          const raw = Buffer.concat(chunks).toString('utf8');
          resolve(JSON.parse(raw));
        } catch (err) {
          reject(err);
        }
      });

      req.on('error', reject);
    });
  }
}
