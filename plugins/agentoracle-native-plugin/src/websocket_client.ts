import WebSocket from 'ws';
import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import {
  WebSocketConfig,
  ConnectChallengeEvent,
  ConnectRequest,
  ConnectResponse,
  ChatSendRequest,
  ChatEvent,
  DeviceParams,
  PluginLogger,
  NetworkError,
  AuthenticationError
} from './types';

interface DeviceIdentityData {
  deviceId: string;
  publicKey: string;
  privateKey: string;
}

interface LoadedDeviceIdentity {
  deviceId: string;
  publicKeyB64: string;
  keyObject: crypto.KeyObject;
}

function loadOrCreateDeviceIdentity(identityFile: string): LoadedDeviceIdentity | null {
  try {
    let data: DeviceIdentityData;

    if (fs.existsSync(identityFile)) {
      data = JSON.parse(fs.readFileSync(identityFile, 'utf-8')) as DeviceIdentityData;
    } else {
      const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
      const pubJwk = publicKey.export({ format: 'jwk' }) as { x: string };
      const privJwk = privateKey.export({ format: 'jwk' }) as { d: string };

      const pubB64 = pubJwk.x;
      const padding = (4 - (pubB64.length % 4)) % 4;
      const pubBytes = Buffer.from(pubB64 + '='.repeat(padding), 'base64');
      const deviceId = crypto.createHash('sha256').update(pubBytes).digest('hex');

      data = { deviceId, publicKey: pubB64, privateKey: privJwk.d };
      fs.mkdirSync(path.dirname(identityFile), { recursive: true });
      fs.writeFileSync(identityFile, JSON.stringify(data, null, 2), 'utf-8');
    }

    const pubPadding = (4 - (data.publicKey.length % 4)) % 4;
    const pubBytes = Buffer.from(data.publicKey + '='.repeat(pubPadding), 'base64');
    const deviceId = crypto.createHash('sha256').update(pubBytes).digest('hex');

    const keyObject = crypto.createPrivateKey({
      key: { kty: 'OKP', crv: 'Ed25519', x: data.publicKey, d: data.privateKey },
      format: 'jwk',
    });

    return { deviceId, publicKeyB64: data.publicKey, keyObject };
  } catch (err) {
    return null;
  }
}

function buildDeviceParams(
  identity: LoadedDeviceIdentity,
  nonce: string,
  gatewayToken: string,
  platform: string
): DeviceParams {
  const signedAtMs = Date.now();
  const normalizedPlatform = platform.toLowerCase().trim();
  const payload = [
    'v3',
    identity.deviceId,
    'cli',
    'cli',
    'operator',
    'operator.read,operator.write',
    String(signedAtMs),
    gatewayToken,
    nonce,
    normalizedPlatform,
    '',
  ].join('|');

  const signature = crypto
    .sign(null, Buffer.from(payload, 'utf-8'), identity.keyObject)
    .toString('base64url')
    .replace(/=/g, '');

  return {
    id: identity.deviceId,
    publicKey: identity.publicKeyB64,
    signature,
    signedAt: signedAtMs,
    nonce,
  };
}

/**
 * WebSocketClient 类
 * 通过 WebSocket Protocol v3 与 OpenClaw Gateway 通信
 * 
 * 实现功能：
 * - 连接握手和认证
 * - 流式响应累积
 * - 自动重连（指数退避）
 * - 心跳机制
 * - 超时控制
 * - 重连事件通知
 */
export class WebSocketClient {
  private onReconnectCallback?: () => void;
  private lastSuccessfulConnection: number = 0;
  private deviceIdentity: LoadedDeviceIdentity | null = null;

  constructor(
    private config: WebSocketConfig,
    private logger: PluginLogger
  ) {
    const identityFile = config.deviceIdentityFile ??
      path.join(__dirname, '..', 'device_identity.json');
    this.deviceIdentity = loadOrCreateDeviceIdentity(identityFile);
    if (this.deviceIdentity) {
      this.logger.info(`[agentoracle-native-plugin] 🔐 Device Identity 已加载 (ID: ${this.deviceIdentity.deviceId.slice(0, 16)}...)`);
    } else {
      this.logger.warn('[agentoracle-native-plugin] ⚠️ Device Identity 加载失败，operator.write scope 可能被 Gateway 清空');
    }
  }

  /**
   * 设置重连回调
   * 当检测到 Gateway 重启并成功重连后触发
   * @param callback 重连成功后的回调函数
   */
  setOnReconnect(callback: () => void): void {
    this.onReconnectCallback = callback;
  }

  /**
   * 发送消息到 OpenClaw Gateway（不等待回复）
   * 用于发送通知类消息，发送后立即关闭连接，不等待 Agent 回复
   * @param message 要发送的消息内容
   * @returns 成功返回空字符串，失败返回 null
   */
  async sendMessageWithoutResponse(message: string): Promise<string | null> {
    try {
      this.logger.info(`[agentoracle-native-plugin] Connecting to ${this.config.gatewayUrl}...`);

      // 创建 WebSocket 连接
      const ws = await this.connect();

      try {
        // 执行认证流程
        const sessionKey = await this.authenticate(ws);

        // 更新最后成功连接时间
        this.lastSuccessfulConnection = Date.now();

        // 发送聊天消息（不等待回复）
        await this.sendChatMessageWithoutResponse(ws, sessionKey, message);

        this.logger.info(`[agentoracle-native-plugin] Message sent successfully (no response expected)`);

        return ''; // 返回空字符串表示成功
      } finally {
        // 立即关闭连接
        if (ws.readyState === WebSocket.OPEN) {
          ws.close();
        }
      }
    } catch (error) {
      this.logger.error('[agentoracle-native-plugin] WebSocket error', error as Error);
      return null;
    }
  }

  /**
   * 发送消息到 OpenClaw Gateway
   * @param message 要发送的消息内容
   * @returns 完整的响应文本，失败返回 null
   */
  async sendMessage(message: string): Promise<string | null> {
    const isReconnect = this.lastSuccessfulConnection > 0;
    
    for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          // 指数退避
          const delay = Math.pow(this.config.retryDelayBase, attempt);
          this.logger.info(`[agentoracle-native-plugin] WebSocket retry ${attempt + 1}/${this.config.maxRetries}, waiting ${delay}s...`);
          await this.sleep(delay * 1000);
        }

        this.logger.info(`[agentoracle-native-plugin] Connecting to ${this.config.gatewayUrl}...`);

        // 创建 WebSocket 连接
        const ws = await this.connect();

        try {
          // 执行认证流程
          const sessionKey = await this.authenticate(ws);

          // 检测是否为重连（Gateway 重启后的首次成功连接）
          const now = Date.now();
          const timeSinceLastConnection = now - this.lastSuccessfulConnection;
          
          // 如果距离上次成功连接超过 60 秒，且之前有过成功连接，则认为是重连
          if (isReconnect && timeSinceLastConnection > 60000) {
            this.logger.info('[agentoracle-native-plugin] ========================================');
            this.logger.info('[agentoracle-native-plugin] 🔄 Gateway reconnection detected!');
            this.logger.info(`[agentoracle-native-plugin] Time since last connection: ${Math.floor(timeSinceLastConnection / 1000)}s`);
            this.logger.info('[agentoracle-native-plugin] ========================================');
            
            // 触发重连回调
            if (this.onReconnectCallback) {
              this.logger.info('[agentoracle-native-plugin] Triggering reconnect callback...');
              try {
                this.onReconnectCallback();
              } catch (callbackError) {
                this.logger.error('[agentoracle-native-plugin] Error in reconnect callback', callbackError as Error);
              }
            }
          }
          
          // 更新最后成功连接时间
          this.lastSuccessfulConnection = now;

          // 发送聊天消息并接收响应
          const result = await this.sendChatMessage(ws, sessionKey, message);

          this.logger.info(`[agentoracle-native-plugin] Successfully received reply (${result.length} characters)`);

          return result;
        } finally {
          // 确保关闭连接
          if (ws.readyState === WebSocket.OPEN) {
            ws.close();
          }
        }
      } catch (error) {
        this.logger.error('[agentoracle-native-plugin] WebSocket error', error as Error);

        if (attempt < this.config.maxRetries - 1) {
          continue; // 重试
        }

        return null;
      }
    }

    this.logger.error(`[agentoracle-native-plugin] Max retries (${this.config.maxRetries}) reached, task failed`);
    return null;
  }

  /**
   * 测试连接并检测重连
   * 用于在 Gateway 重启后主动检测连接状态
   * @returns 连接是否成功
   */
  async testConnection(): Promise<boolean> {
    const isReconnect = this.lastSuccessfulConnection > 0;
    
    try {
      this.logger.info('[agentoracle-native-plugin] Testing WebSocket connection...');
      
      // 创建 WebSocket 连接
      const ws = await this.connect();

      try {
        // 执行认证流程
        await this.authenticate(ws);

        // 检测是否为重连
        const now = Date.now();
        const timeSinceLastConnection = now - this.lastSuccessfulConnection;
        
        // 如果距离上次成功连接超过 60 秒，且之前有过成功连接，则认为是重连
        if (isReconnect && timeSinceLastConnection > 60000) {
          this.logger.info('[agentoracle-native-plugin] ========================================');
          this.logger.info('[agentoracle-native-plugin] 🔄 Gateway reconnection detected!');
          this.logger.info(`[agentoracle-native-plugin] Time since last connection: ${Math.floor(timeSinceLastConnection / 1000)}s`);
          this.logger.info('[agentoracle-native-plugin] ========================================');
          
          // 触发重连回调
          if (this.onReconnectCallback) {
            this.logger.info('[agentoracle-native-plugin] Triggering reconnect callback...');
            try {
              this.onReconnectCallback();
            } catch (callbackError) {
              this.logger.error('[agentoracle-native-plugin] Error in reconnect callback', callbackError as Error);
            }
          }
        }
        
        // 更新最后成功连接时间
        this.lastSuccessfulConnection = now;

        this.logger.info('[agentoracle-native-plugin] Connection test successful');
        return true;
      } finally {
        // 确保关闭连接
        if (ws.readyState === WebSocket.OPEN) {
          ws.close();
        }
      }
    } catch (error) {
      this.logger.error('[agentoracle-native-plugin] Connection test failed', error as Error);
      return false;
    }
  }

  /**
   * 连接到 Gateway
   * @returns WebSocket 实例
   * @private
   */
  private async connect(): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.config.gatewayUrl, {
        handshakeTimeout: this.config.connectTimeout * 1000
      });

      // 设置心跳
      const pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.ping();
        }
      }, 30000); // 每30秒发送心跳

      ws.on('open', () => {
        this.logger.info('[agentoracle-native-plugin] WebSocket connected');
        resolve(ws);
      });

      ws.on('error', (error) => {
        clearInterval(pingInterval);
        reject(new NetworkError(`WebSocket connection failed: ${error.message}`));
      });

      ws.on('close', () => {
        clearInterval(pingInterval);
      });

      // 连接超时
      setTimeout(() => {
        if (ws.readyState !== WebSocket.OPEN) {
          clearInterval(pingInterval);
          ws.terminate();
          reject(new NetworkError('WebSocket connection timeout'));
        }
      }, this.config.connectTimeout * 1000);
    });
  }

  /**
   * 处理认证流程
   * @param ws WebSocket 实例
   * @returns sessionKey
   * @private
   */
  private async authenticate(ws: WebSocket): Promise<string> {
    // 步骤 1: 接收 connect.challenge
    this.logger.info('[agentoracle-native-plugin] Waiting for connect.challenge...');
    const challengeData = await this.receiveMessage<ConnectChallengeEvent>(
      ws,
      this.config.connectTimeout * 1000
    );

    if (challengeData.type !== 'event' || challengeData.event !== 'connect.challenge') {
      throw new Error(`Unexpected message type: ${challengeData.type}`);
    }

    const nonce = challengeData.payload?.nonce;
    if (!nonce) {
      throw new Error('No nonce in challenge');
    }

    this.logger.info('[agentoracle-native-plugin] Received challenge');

    // 步骤 2: 发送 connect 请求
    const connectId = uuidv4();
    const platform = process.platform.toLowerCase().trim();
    const connectParams: ConnectRequest['params'] = {
      minProtocol: 3,
      maxProtocol: 3,
      client: {
        id: 'cli',
        version: '1.0.0',
        platform,
        mode: 'cli'
      },
      role: 'operator',
      scopes: ['operator.read', 'operator.write'],
      caps: [],
      commands: [],
      permissions: {},
      auth: {
        token: this.config.gatewayToken
      },
      locale: 'zh-CN',
      userAgent: 'agentoracle-native-plugin/1.0.0'
    };

    if (this.deviceIdentity) {
      connectParams.device = buildDeviceParams(
        this.deviceIdentity,
        nonce,
        this.config.gatewayToken,
        platform
      );
    }

    const connectRequest: ConnectRequest = {
      type: 'req',
      id: connectId,
      method: 'connect',
      params: connectParams
    };

    this.logger.info('[agentoracle-native-plugin] Sending connect request...');
    ws.send(JSON.stringify(connectRequest));

    // 步骤 3: 接收 connect 响应
    this.logger.info('[agentoracle-native-plugin] Waiting for connect response...');
    const connectResponse = await this.receiveMessage<ConnectResponse>(
      ws,
      this.config.connectTimeout * 1000
    );

    if (connectResponse.type !== 'res' || !connectResponse.ok) {
      const error = connectResponse.error || 'Unknown error';
      const errorMessage = typeof error === 'object' ? JSON.stringify(error) : String(error);
      if (typeof error === 'object' && (error as any).code === 'NOT_PAIRED') {
        const reqId = (error as any).details?.requestId ?? 'unknown';
        this.logger.error(`[agentoracle-native-plugin] ❌ 设备配对未完成！请在 OpenClaw Control UI 中批准配对请求 ID=${reqId}，然后重启插件`);
        throw new AuthenticationError(`Device pairing required (requestId=${reqId})`);
      }
      this.logger.error(`[agentoracle-native-plugin] Authentication failed: ${errorMessage}`);
      this.logger.error(`[agentoracle-native-plugin] Full response: ${JSON.stringify(connectResponse)}`);
      throw new AuthenticationError(`Connection failed: ${errorMessage}`);
    }

    const sessionKey = connectResponse.payload?.snapshot?.sessionDefaults?.mainSessionKey || 'agent:main:main';

    this.logger.info('[agentoracle-native-plugin] Connection successful');

    return sessionKey;
  }

  /**
   * 发送聊天消息（不等待回复）
   * @param ws WebSocket 实例
   * @param sessionKey 会话密钥
   * @param message 消息内容
   * @private
   */
  private async sendChatMessageWithoutResponse(ws: WebSocket, sessionKey: string, message: string): Promise<void> {
    const chatId = uuidv4();
    const chatRequest: ChatSendRequest = {
      type: 'req',
      id: chatId,
      method: 'chat.send',
      params: {
        sessionKey,
        message,
        idempotencyKey: `agentoracle-${Date.now()}`
      }
    };

    this.logger.info('[agentoracle-native-plugin] Sending chat message (no response expected)...');
    ws.send(JSON.stringify(chatRequest));

    // 等待一小段时间确保消息发送成功，然后立即返回
    await this.sleep(500);
  }

  /**
   * 发送聊天消息
   * @param ws WebSocket 实例
   * @param sessionKey 会话密钥
   * @param message 消息内容
   * @returns 完整的响应文本
   * @private
   */
  private async sendChatMessage(ws: WebSocket, sessionKey: string, message: string): Promise<string> {
    const chatId = uuidv4();
    const chatRequest: ChatSendRequest = {
      type: 'req',
      id: chatId,
      method: 'chat.send',
      params: {
        sessionKey,
        message,
        idempotencyKey: `agentoracle-${Date.now()}`
      }
    };

    this.logger.info('[agentoracle-native-plugin] Sending chat message...');
    ws.send(JSON.stringify(chatRequest));

    // 接收流式响应
    return await this.receiveStreamingResponse(ws, chatId);
  }

  /**
   * 接收流式响应
   * @param ws WebSocket 实例
   * @param chatId 聊天请求ID
   * @returns 完整的响应文本
   * @private
   */
  private async receiveStreamingResponse(ws: WebSocket, chatId: string): Promise<string> {
    this.logger.info('[agentoracle-native-plugin] Waiting for AI response...');

    let fullReply = '';
    const startTime = Date.now();
    let chatCompleted = false;
    let lastUpdateTime = startTime;

    return new Promise((resolve, reject) => {
      const messageHandler = (data: WebSocket.Data) => {
        try {
          const response = JSON.parse(data.toString());
          const msgType = response.type || 'unknown';

          if (msgType === 'res') {
            // 响应消息
            if (response.id === chatId) {
              if (response.ok) {
                this.logger.info('[agentoracle-native-plugin] Chat request accepted');
              } else {
                const error = response.error || 'Unknown error';
                cleanup();
                reject(new Error(`Chat error: ${error}`));
              }
            }
          } else if (msgType === 'event') {
            // 事件消息
            const event = response.event || 'unknown';

            if (event === 'chat') {
              const payload = response.payload || {};
              const state = payload.state || '';

              // 提取消息内容
              const messageData = payload.message || {};
              if (messageData.content && Array.isArray(messageData.content) && messageData.content.length > 0) {
                const textContent = messageData.content[0].text || '';
                if (textContent) {
                  fullReply = textContent;
                  lastUpdateTime = Date.now();

                  // 显示进度
                  if (fullReply.length > 0) {
                    this.logger.info(`[agentoracle-native-plugin] Received update (${fullReply.length} characters, state=${state})`);
                  }
                }
              }

              // 检查是否完成
              if (['final', 'done', 'complete', 'finished'].includes(state)) {
                this.logger.info(`[agentoracle-native-plugin] Chat completed (state: ${state})`);
                chatCompleted = true;
                cleanup();
                resolve(fullReply);
              }
            }
          }
        } catch (error) {
          this.logger.error('[agentoracle-native-plugin] Error parsing message', error as Error);
        }
      };

      const errorHandler = (error: Error) => {
        cleanup();
        reject(new NetworkError(`WebSocket error: ${error.message}`));
      };

      const closeHandler = () => {
        cleanup();
        if (!chatCompleted && fullReply) {
          this.logger.info('[agentoracle-native-plugin] Connection closed, assuming completion');
          resolve(fullReply);
        } else if (!chatCompleted) {
          reject(new Error('Connection closed before completion'));
        }
      };

      // 超时检查
      const timeoutCheck = setInterval(() => {
        const elapsed = Date.now() - startTime;
        if (elapsed > this.config.timeout * 1000) {
          cleanup();
          reject(new Error(`Task timeout (${this.config.timeout}s)`));
        }

        // 检查是否长时间没有更新
        const timeSinceUpdate = Date.now() - lastUpdateTime;
        if (timeSinceUpdate > this.config.messageTimeout * 2 * 1000) {
          if (chatCompleted || fullReply) {
            this.logger.info('[agentoracle-native-plugin] No updates for a while, assuming completion');
            cleanup();
            resolve(fullReply);
          }
        }
      }, 1000);

      const cleanup = () => {
        clearInterval(timeoutCheck);
        ws.off('message', messageHandler);
        ws.off('error', errorHandler);
        ws.off('close', closeHandler);
      };

      ws.on('message', messageHandler);
      ws.on('error', errorHandler);
      ws.on('close', closeHandler);
    });
  }

  /**
   * 接收单个消息
   * @param ws WebSocket 实例
   * @param timeout 超时时间（毫秒）
   * @returns 解析后的消息对象
   * @private
   */
  private async receiveMessage<T>(ws: WebSocket, timeout: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        ws.off('message', messageHandler);
        reject(new Error('Message receive timeout'));
      }, timeout);

      const messageHandler = (data: WebSocket.Data) => {
        clearTimeout(timer);
        ws.off('message', messageHandler);
        try {
          const message = JSON.parse(data.toString());
          resolve(message as T);
        } catch (error) {
          reject(new Error('Failed to parse message'));
        }
      };

      ws.on('message', messageHandler);
    });
  }

  /**
   * 睡眠函数
   * @param ms 毫秒数
   * @private
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
