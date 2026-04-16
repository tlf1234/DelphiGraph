import { APIClient } from './api_client';
import { WebSocketClient } from './websocket_client';
import { Sanitizer } from './sanitizer';
import { AuditLogger } from './audit_logger';
import { PromptBuilder } from './prompt_builder';
import { SignalParser } from './signal_parser';
import {
  DaemonConfig,
  Task,
  Signal,
  SignalSubmission,
  ParsedSignalResponse,
  PluginLogger,
  NetworkError,
  AuthenticationError,
  RateLimitError
} from './types';
import packageJson from '../package.json';

// UAP v3.0 运维字段（协议 §4.4）
const PLUGIN_VERSION = `${packageJson.name}/${packageJson.version}`;
const MODEL_NAME = 'openclaw-gateway';

/**
 * Daemon 类
 * 周期性轮询云端任务，编排完整的任务处理流水线
 */
export class Daemon {
  private isRunning: boolean = false;
  private timerId: NodeJS.Timeout | null = null;
  private isPaused: boolean = false;
  private hasRunVerification: boolean = false;
  private onVerificationSuccess?: () => void;
  private processingTaskIds: Set<string> = new Set();

  constructor(
    private config: DaemonConfig,
    private apiClient: APIClient,
    private wsClient: WebSocketClient,
    private sanitizer: Sanitizer,
    private auditLogger: AuditLogger,
    private logger: PluginLogger
  ) {}

  /**
   * 设置验证成功回调
   * 用于在 WebSocket 验证成功后通知其他模块（如 DailyReporter）
   */
  setOnVerificationSuccess(callback: () => void): void {
    this.onVerificationSuccess = callback;
  }

  /**
   * 重新运行验证
   * 当检测到 Gateway 重启时调用，重新执行验证流程并触发回调
   */
  async rerunVerification(): Promise<void> {
    this.logger.info('[agentoracle-native-plugin] ========================================');
    this.logger.info('[agentoracle-native-plugin] 🔄 Re-running verification after Gateway restart...');
    this.logger.info('[agentoracle-native-plugin] ========================================');
    
    await this.runBuiltInVerification();
  }

  /**
   * 启动守护进程
   */
  start(): void {
    if (this.isRunning) {
      this.logger.warn('[agentoracle-native-plugin] Daemon is already running');
      return;
    }

    this.isRunning = true;
    this.isPaused = false;
    this.logger.info('[agentoracle-native-plugin] Daemon started');

    // 立即执行第一次轮询
    this.scheduleNextPoll(0);
  }

  /**
   * 停止守护进程（优雅关闭）
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }

    this.logger.info('[agentoracle-native-plugin] Daemon stopped');
  }

  /**
   * 调度下一次轮询
   * @param delay 延迟时间（毫秒）
   */
  private scheduleNextPoll(delay: number): void {
    if (!this.isRunning) {
      return;
    }

    this.timerId = setTimeout(async () => {
      await this.pollOnce();

      // 计算下一次轮询延迟（带抖动）
      const nextDelay = this.calculateNextDelay();
      this.scheduleNextPoll(nextDelay);
    }, delay);
  }

  /**
   * 单次轮询周期
   */
  private async pollOnce(): Promise<void> {
    // 如果已暂停，跳过本次轮询
    if (this.isPaused) {
      this.logger.info('[agentoracle-native-plugin] Polling paused due to authentication error');
      return;
    }

    // 首次运行时执行内置验证
    if (!this.hasRunVerification) {
      await this.runBuiltInVerification();
      this.hasRunVerification = true;
    }

    this.logger.info('[agentoracle-native-plugin] Starting polling cycle');

    let task: Task | null = null;
    try {
      // 1. 获取任务
      task = await this.apiClient.fetchTask();

      if (!task) {
        this.logger.info('[agentoracle-native-plugin] No available tasks');
        return;
      }

      this.logger.info(`[agentoracle-native-plugin] Fetched task: ${task.id}`);

      // 防止同一任务并发处理（多实例或快速重试）
      if (this.processingTaskIds.has(task.id)) {
        this.logger.warn(`[agentoracle-native-plugin] Task ${task.id} is already being processed, skipping`);
        return;
      }
      this.processingTaskIds.add(task.id);

      // 2. 构建 v3.0 数据因子构造 Prompt 并发送到 OpenClaw
      const prompt = this.buildPrompt(task);
      const llmResult = await this.wsClient.sendMessage(prompt);

      if (!llmResult) {
        this.logger.error(`[agentoracle-native-plugin] WebSocket reasoning failed for task: ${task.id}`);
        this.processingTaskIds.delete(task.id);
        return;
      }

      this.logger.info(`[agentoracle-native-plugin] WebSocket reasoning completed for task: ${task.id}`);
      this.logger.info('[agentoracle-native-plugin] ========================================');
      this.logger.info(`[agentoracle-native-plugin] 🤖 AI RESPONSE for task ${task.id}:`);
      this.logger.info(`[agentoracle-native-plugin] ${llmResult}`);
      this.logger.info('[agentoracle-native-plugin] ━━━━━━━━━━━━━━━━━━━━━━');
      this.logger.info('[agentoracle-native-plugin] ========================================');

      // 3. 脱敏处理（对原始响应整体脱敏）
      const sanitizationResult = this.sanitizer.sanitize(llmResult);
      this.logger.info(`[agentoracle-native-plugin] Sanitization completed for task: ${task.id}`);

      // 4. 审计日志（脱敏前后对比）
      await this.auditLogger.log({
        timestamp: this.formatTimestamp(new Date()),
        taskId: task.id,
        original: sanitizationResult.original,
        sanitized: sanitizationResult.sanitized
      });
      this.logger.info(`[agentoracle-native-plugin] Audit log written for task: ${task.id}`);

      // 5. 解析脱敏后的响应为 v3.0 结构化信号数据
      let parsed = SignalParser.parse(sanitizationResult.sanitized);
      this.logger.info(`[agentoracle-native-plugin] Parsed signals: status=${parsed.status}, signals=${parsed.signals.length}`);

      // 5.5 ========== 【TEMP DEBUG】abstained → 二次请求 mock 数据 ==========
      // 与 Python 插件 skill.py::process_task 的 mock debug 流程对齐。
      // 正式上线前可移除本段。
      if (parsed.status === 'abstained') {
        const mockParsed = await this.handleAbstainMockDebug(task, parsed);
        if (mockParsed) {
          parsed = mockParsed;
        } else {
          // mock 失败，提交原始 abstained
          this.logger.info(`[agentoracle-native-plugin] [MOCK-DEBUG] 使用原始 abstained 继续提交`);
        }
      }
      // ========== END TEMP DEBUG ==========

      // 6. 对每条 signal 的文本字段再次脱敏
      const sanitizedSignals: Signal[] = parsed.signals.map(sig => ({
        ...sig,
        evidence_text: this.sanitizer.sanitize(sig.evidence_text).sanitized,
        relevance_reasoning: this.sanitizer.sanitize(sig.relevance_reasoning).sanitized,
        source_description: sig.source_description
          ? this.sanitizer.sanitize(sig.source_description).sanitized
          : undefined,
      }));

      // 7. 构建两份 UAP v3.0 payload（原始未脱敏 / 最终脱敏）
      const originalPayload = this.buildUapPayload(task.id, parsed, parsed.signals);
      const sanitizedPayload = this.buildUapPayload(task.id, parsed, sanitizedSignals);

      // 调试：打印完整 UAP v3.0 JSON（api_client.submitSignals 里也有一份，这里提前打印便于对齐）
      this.logger.info('[agentoracle-native-plugin] ========================================');
      this.logger.info(`[agentoracle-native-plugin] 📤 正在提交信号数据 (task ${task.id}):`);
      this.logger.info(`[agentoracle-native-plugin]   - status: ${sanitizedPayload.status}`);
      this.logger.info(`[agentoracle-native-plugin]   - signal_count: ${sanitizedPayload.signals?.length ?? 0}`);
      this.logger.info(`[agentoracle-native-plugin]   - model_name: ${sanitizedPayload.model_name}`);
      this.logger.info(`[agentoracle-native-plugin]   - plugin_version: ${sanitizedPayload.plugin_version}`);
      try {
        const fullJson = JSON.stringify(sanitizedPayload, null, 2);
        this.logger.info('[agentoracle-native-plugin] 📦 完整提交 JSON (UAP v3.0):');
        for (const line of fullJson.split('\n')) {
          this.logger.info(`[agentoracle-native-plugin] | ${line}`);
        }
      } catch (dbgErr) {
        this.logger.warn(`[agentoracle-native-plugin] 打印完整 payload 失败: ${dbgErr}`);
      }
      this.logger.info('[agentoracle-native-plugin] ========================================');

      // 8. 记录提交数据日志（UAP v3.0：原始 + 脱敏双份）
      await this.auditLogger.logSubmission({
        timestamp: this.formatTimestamp(new Date()),
        taskId: task.id,
        taskQuestion: task.question,
        taskContext: task.description,
        aiResponse: llmResult,
        sanitizedResponse: sanitizationResult.sanitized,
        originalPayload: { ...originalPayload },
        sanitizedPayload: { ...sanitizedPayload },
      });
      this.logger.info(`[agentoracle-native-plugin] Submission log written for task: ${task.id}`);

      // 9. 提交信号到平台 (v3.0 endpoint)
      await this.apiClient.submitSignals(sanitizedPayload);

      this.logger.info(`[agentoracle-native-plugin] Signals submitted for task: ${task.id} (status=${parsed.status}, signals=${sanitizedSignals.length})`);
      this.processingTaskIds.delete(task.id);

    } catch (error) {
      if (task) this.processingTaskIds.delete(task.id);
      this.handleError(error);
    }
  }

  /**
   * 构建 LLM 提示词
   * 使用 PromptBuilder 构建 v3.0 数据因子构造提示词
   * @param task 任务对象
   * @returns 提示词字符串
   */
  private buildPrompt(task: Task | { id: string; question: string; description: string; title?: string }): string {
    return PromptBuilder.buildSensorPrompt({
      task_id: task.id,
      question: task.question,
      context: task.description,
      background: (task as Task).title && (task as Task).title !== task.question ? (task as Task).title : undefined,
    });
  }

  /**
   * 构建 UAP v3.0 提交 payload
   * 与 openclaw_agentoracle_plugin/src/skill.py::_build_uap_payload 对齐
   *
   * - 为每条 signal 自动补 signal_id 和 observed_at（若缺失）
   * - 附上 model_name / plugin_version 运维字段
   * - 当 status=abstained 时携带 abstain_reason / abstain_detail
   */
  private buildUapPayload(
    taskId: string,
    parsed: ParsedSignalResponse,
    signals: Signal[]
  ): SignalSubmission {
    const nowIso = new Date().toISOString();
    const nowSec = Math.floor(Date.now() / 1000);
    const shortTaskId = taskId.slice(0, 8);

    const builtSignals: Signal[] = signals.map((sig, idx) => ({
      ...sig,
      signal_id: sig.signal_id || `sig_${shortTaskId}_${nowSec}_${idx}`,
      observed_at: sig.observed_at || nowIso,
    }));

    const payload: SignalSubmission = {
      task_id: taskId,
      status: parsed.status,
      privacy_cleared: true,
      protocol_version: '3.0',
      model_name: MODEL_NAME,
      plugin_version: PLUGIN_VERSION,
    };

    if (parsed.status === 'submitted') {
      payload.signals = builtSignals;
    }
    if (parsed.user_persona) {
      payload.user_persona = parsed.user_persona;
    }
    // 协议 §4.3：弃权时携带 abstain_reason / abstain_detail
    if (parsed.status === 'abstained') {
      if (parsed.abstain_reason) payload.abstain_reason = parsed.abstain_reason;
      if (parsed.abstain_detail) payload.abstain_detail = parsed.abstain_detail;
    }
    return payload;
  }

  /**
   * 【TEMP DEBUG】abstained 二次请求 mock 数据
   * 与 openclaw_agentoracle_plugin/src/skill.py::process_task 中 mock debug 流程对齐
   *
   * 当 agent 首轮返回 abstained 时，发起二次请求使用专门的 mock 提示词，
   * 让 agent 自己根据任务信息合理构造模拟数据。
   *
   * 所有 mock 生成的信号会被强制打上 [MOCK-DEBUG] 标签。
   */
  private async handleAbstainMockDebug(
    task: Task,
    originalParsed: ParsedSignalResponse
  ): Promise<ParsedSignalResponse | null> {
    const abstainReason = originalParsed.abstain_reason || 'no_relevant_data';
    const abstainDetail = originalParsed.abstain_detail || '';

    this.logger.warn('[agentoracle-native-plugin] ⚠️ [MOCK-DEBUG] ============================================');
    this.logger.warn(`[agentoracle-native-plugin] ⚠️ [MOCK-DEBUG] Agent 首轮返回 abstained`);
    this.logger.warn(`[agentoracle-native-plugin] ⚠️ [MOCK-DEBUG]   reason: ${abstainReason}`);
    this.logger.warn(`[agentoracle-native-plugin] ⚠️ [MOCK-DEBUG]   detail: ${abstainDetail.slice(0, 200)}`);
    this.logger.warn('[agentoracle-native-plugin] ⚠️ [MOCK-DEBUG] 发起二次请求，让 agent 模拟构造数据...');
    this.logger.warn('[agentoracle-native-plugin] ⚠️ [MOCK-DEBUG] ============================================');

    try {
      const mockPrompt = PromptBuilder.buildMockSignalPrompt({
        question: task.question,
        context: task.description,
        abstainReason,
        abstainDetail,
      });
      this.logger.info(`[agentoracle-native-plugin] [MOCK-DEBUG] 📝 Mock 提示词长度: ${mockPrompt.length} 字符`);
      this.logger.info('[agentoracle-native-plugin] [MOCK-DEBUG] 📤 发送 mock 请求到 OpenClaw Gateway...');

      const mockResponse = await this.wsClient.sendMessage(mockPrompt);
      if (!mockResponse) {
        this.logger.error('[agentoracle-native-plugin] [MOCK-DEBUG] ❌ Mock 请求通信失败');
        return null;
      }

      this.logger.info(`[agentoracle-native-plugin] [MOCK-DEBUG] 📥 Mock 响应长度: ${mockResponse.length} 字符`);
      this.logger.info('[agentoracle-native-plugin] ========================================');
      this.logger.info('[agentoracle-native-plugin] 📝 [MOCK-DEBUG] AI 模拟构造结果:');
      this.logger.info(`[agentoracle-native-plugin] ${mockResponse}`);
      this.logger.info('[agentoracle-native-plugin] ========================================');

      // 对 mock 响应也走一遍脱敏 + 解析
      const mockSanitized = this.sanitizer.sanitize(mockResponse);
      const mockParsed = SignalParser.parse(mockSanitized.sanitized);

      if (mockParsed.status === 'abstained' || mockParsed.signals.length === 0) {
        this.logger.error('[agentoracle-native-plugin] [MOCK-DEBUG] ❌ Mock 响应解析失败或仍为 abstained');
        return null;
      }

      // 给 mock 生成的每条信号强制打上 [MOCK-DEBUG] 标签
      mockParsed.signals = mockParsed.signals.map(sig => ({
        ...sig,
        source_description: sig.source_description?.includes('[MOCK-DEBUG]')
          ? sig.source_description
          : `[MOCK-DEBUG] ${sig.source_description ?? ''}`.trim(),
      }));

      this.logger.info(`[agentoracle-native-plugin] [MOCK-DEBUG] ✅ Agent 成功模拟构造 ${mockParsed.signals.length} 条信号，继续正常提交流程`);
      return mockParsed;
    } catch (mockErr) {
      this.logger.error('[agentoracle-native-plugin] [MOCK-DEBUG] 二次请求异常', mockErr as Error);
      return null;
    }
  }

  /**
   * 格式化时间戳
   * @param date 日期对象
   * @returns YYYY-MM-DD HH:mm:ss 格式的字符串
   */
  private formatTimestamp(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }

  /**
   * 计算下一次轮询延迟（带抖动）
   * @returns 延迟时间（毫秒）
   */
  private calculateNextDelay(): number {
    const baseInterval = this.config.pollingIntervalSeconds * 1000;
    const jitter = this.config.jitterSeconds * 1000;

    // 生成 [-jitter, +jitter] 范围内的随机抖动
    const randomJitter = Math.random() * (2 * jitter) - jitter;

    return baseInterval + randomJitter;
  }

  /**
   * 错误处理
   * @param error 错误对象
   */
  private handleError(error: any): void {
    if (error instanceof NetworkError) {
      this.logger.error('[agentoracle-native-plugin] Network error', error);
      // 网络错误：记录日志，继续下一轮
    } else if (error instanceof AuthenticationError) {
      this.logger.error('[agentoracle-native-plugin] Authentication error', error);
      // 认证错误：暂停轮询
      this.isPaused = true;
    } else if (error instanceof RateLimitError) {
      this.logger.error('[agentoracle-native-plugin] Rate limit error', error);
      // 限流错误：等待 retry-after 时间
    } else {
      this.logger.error('[agentoracle-native-plugin] Unknown error', error);
      // 其他错误：记录日志，继续下一轮
    }
  }

  /**
   * 运行内置端到端验证
   * 在插件启动后第一次轮询时自动执行
   * 创建模拟任务，走完整的处理流程以验证 WebSocket 交互功能
   * @private
   */
  private async runBuiltInVerification(): Promise<void> {
    this.logger.info('[agentoracle-native-plugin] ========================================');
    this.logger.info('[agentoracle-native-plugin] Running built-in verification test...');
    this.logger.info('[agentoracle-native-plugin] ========================================');

    try {
      // 创建模拟任务
      const mockTask = {
        id: 'verification_test',
        title: 'Verification Test',
        question: PromptBuilder.buildVerificationPrompt(),
        description: '',
      };

      this.logger.info(`[agentoracle-native-plugin] Created mock task: ${mockTask.id}`);

      // 1. WebSocket 推理
      const prompt = this.buildPrompt(mockTask);
      this.logger.info('[agentoracle-native-plugin] Sending verification message to OpenClaw Gateway...');
      
      const llmResult = await this.wsClient.sendMessage(prompt);

      if (!llmResult) {
        this.logger.error('[agentoracle-native-plugin] ❌ Verification test failed: WebSocket reasoning returned null');
        return;
      }

      this.logger.info(`[agentoracle-native-plugin] ✅ WebSocket reasoning completed (${llmResult.length} characters)`);
      this.logger.info('[agentoracle-native-plugin] ========================================');
      this.logger.info(`[agentoracle-native-plugin] 🤖 AI RESPONSE:`);
      this.logger.info(`[agentoracle-native-plugin] ${llmResult}`);
      this.logger.info('[agentoracle-native-plugin] ━━━━━━━━━━━━━━━━━━━━━━');
      this.logger.info('[agentoracle-native-plugin] ========================================');

      // 2. 脱敏处理
      const sanitizationResult = this.sanitizer.sanitize(llmResult);
      this.logger.info('[agentoracle-native-plugin] ✅ Sanitization completed');

      // 3. 审计日志
      await this.auditLogger.log({
        timestamp: this.formatTimestamp(new Date()),
        taskId: mockTask.id,
        original: sanitizationResult.original,
        sanitized: sanitizationResult.sanitized
      });

      this.logger.info('[agentoracle-native-plugin] ✅ Audit log written');

      // 注意：验证任务不提交到 API（跳过步骤 4）

      this.logger.info('[agentoracle-native-plugin] ========================================');
      this.logger.info('[agentoracle-native-plugin] ✅ Verification test passed');
      this.logger.info('[agentoracle-native-plugin] All components working correctly:');
      this.logger.info('[agentoracle-native-plugin]   - WebSocket connection to OpenClaw Gateway');
      this.logger.info('[agentoracle-native-plugin]   - AI inference and response handling');
      this.logger.info('[agentoracle-native-plugin]   - Data sanitization pipeline');
      this.logger.info('[agentoracle-native-plugin]   - Audit logging system');
      this.logger.info('[agentoracle-native-plugin] ========================================');

      // 触发验证成功回调（通知 DailyReporter 可以发送启动报告）
      if (this.onVerificationSuccess) {
        this.logger.info('[agentoracle-native-plugin] Triggering verification success callback...');
        try {
          this.onVerificationSuccess();
          this.logger.info('[agentoracle-native-plugin] Verification success callback completed');
        } catch (callbackError) {
          this.logger.error('[agentoracle-native-plugin] Error in verification success callback', callbackError as Error);
        }
      } else {
        this.logger.warn('[agentoracle-native-plugin] No verification success callback registered');
      }

    } catch (error) {
      this.logger.error('[agentoracle-native-plugin] ========================================');
      this.logger.error('[agentoracle-native-plugin] ❌ Verification test failed', error as Error);
      this.logger.error('[agentoracle-native-plugin] ========================================');
      
      // 验证失败不影响后续正常轮询
      // 只记录错误，不抛出异常
    }
  }
}
