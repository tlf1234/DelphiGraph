import { APIClient } from './api_client';
import { WebSocketClient } from './websocket_client';
import { Sanitizer } from './sanitizer';
import { AuditLogger } from './audit_logger';
import { PromptBuilder } from './prompt_builder';
import { PredictionParser } from './prediction_parser';
import {
  DaemonConfig,
  PredictionSubmission,
  PluginLogger,
  NetworkError,
  AuthenticationError,
  RateLimitError
} from './types';

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

    try {
      // 1. 获取任务
      const task = await this.apiClient.fetchTask();

      if (!task) {
        this.logger.info('[agentoracle-native-plugin] No available tasks');
        return;
      }

      this.logger.info(`[agentoracle-native-plugin] Fetched task: ${task.id}`);

      // 2. WebSocket 推理
      const prompt = this.buildPrompt(task);
      const llmResult = await this.wsClient.sendMessage(prompt);

      if (!llmResult) {
        this.logger.error(`[agentoracle-native-plugin] WebSocket reasoning failed for task: ${task.id}`);
        return;
      }

      this.logger.info(`[agentoracle-native-plugin] WebSocket reasoning completed for task: ${task.id}`);
      this.logger.info('[agentoracle-native-plugin] ========================================');
      this.logger.info(`[agentoracle-native-plugin] 🤖 AI RESPONSE for task ${task.id}:`);
      this.logger.info(`[agentoracle-native-plugin] ${llmResult}`);
      this.logger.info('[agentoracle-native-plugin] ━━━━━━━━━━━━━━━━━━━━━━');
      this.logger.info('[agentoracle-native-plugin] ========================================');

      // 3. 脱敏处理
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

      // 5. 解析 LLM 输出为结构化预测数据
      const parsed = PredictionParser.parse(sanitizationResult.sanitized);

      this.logger.info(`[agentoracle-native-plugin] Parsed prediction: probability=${parsed.probability}, evidence_type=${parsed.evidence_type}`);

      // 6. 构建提交数据（与 /api/agent/predictions 平台路由的 PredictionRequest 接口对齐）
      const submissionData: PredictionSubmission = {
        taskId: task.id,
        probability: parsed.probability,
        rationale: parsed.rationale,
        evidence_type: parsed.evidence_type,
        evidence_text: parsed.evidence_text || undefined,
        relevance_score: parsed.relevance_score,
        entity_tags: parsed.entity_tags.length > 0 ? parsed.entity_tags : undefined,
        source_url: parsed.source_urls.length > 0 ? parsed.source_urls[0] : undefined,
      };

      // 7. 记录提交数据日志（发送到平台的完整数据）
      await this.auditLogger.logSubmission({
        timestamp: this.formatTimestamp(new Date()),
        taskId: task.id,
        taskQuestion: task.question,
        taskContext: task.description,
        aiResponse: llmResult,
        sanitizedPrediction: sanitizationResult.sanitized,
        submittedData: { ...submissionData }
      });

      this.logger.info(`[agentoracle-native-plugin] Submission log written for task: ${task.id}`);

      // 8. 提交结果到平台
      await this.apiClient.submitResult(submissionData);

      this.logger.info(`[agentoracle-native-plugin] Result submitted for task: ${task.id}`);

    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * 构建 LLM 提示词
   * 使用 PromptBuilder 构建高质量的预测任务提示词
   * @param task 任务对象
   * @returns 提示词字符串
   */
  private buildPrompt(task: any): string {
    return PromptBuilder.buildPredictionPrompt({
      task_id: task.id,
      question: task.question,
      context: task.description,
      background: task.title !== task.question ? task.title : undefined,
    });
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
      // 注意：这里简化处理，实际应该调整下次轮询时间
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
