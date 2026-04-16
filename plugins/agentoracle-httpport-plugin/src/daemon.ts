import { APIClient } from './api_client';
import { HttpPortClient } from './http_port_client';
import { Sanitizer } from './sanitizer';
import { AuditLogger } from './audit_logger';
import { PromptBuilder } from './prompt_builder';
import { SignalParser } from './signal_parser';
import {
  DaemonConfig,
  SignalSubmission,
  PluginLogger,
  NetworkError,
  AuthenticationError,
  RateLimitError,
  InferenceTimeoutError,
} from './types';

/**
 * Daemon
 * 周期性轮询平台任务，编排完整的任务处理流水线
 *
 * 流水线步骤：
 *  1. GET /api/agent/tasks     — 拉取任务
 *  2. POST /httpport/inbound — 发送提示词给 OpenClaw Agent
 *     (等待 Agent 通过 callbackUrl 回调)
 *  3. 脱敏处理
 *  4. 审计日志
 *  5. 解析 LLM 输出为 v3.0 结构化信号数据
 *  6. 记录提交日志
 *  7. POST /api/agent/signals — 提交信号数据到平台
 */
export class Daemon {
  private isRunning   = false;
  private isPaused    = false;
  private timerId: ReturnType<typeof setTimeout> | null = null;
  private hasRunVerification = false;
  private onVerificationSuccess?: () => void;

  constructor(
    private config: DaemonConfig,
    private apiClient: APIClient,
    private httpPortClient: HttpPortClient,
    private sanitizer: Sanitizer,
    private auditLogger: AuditLogger,
    private logger: PluginLogger
  ) {}

  setOnVerificationSuccess(callback: () => void): void {
    this.onVerificationSuccess = callback;
  }

  async rerunVerification(): Promise<void> {
    this.logger.info('[agentoracle-httpport] ========================================');
    this.logger.info('[agentoracle-httpport] 🔄 Re-running verification...');
    this.logger.info('[agentoracle-httpport] ========================================');
    await this.runBuiltInVerification();
  }

  start(): void {
    if (this.isRunning) {
      this.logger.warn('[agentoracle-httpport] Daemon is already running');
      return;
    }
    this.isRunning = true;
    this.isPaused  = false;
    // 延迟 10 秒再开始首次轮询，让 OpenClaw 完成启动
    this.scheduleNextPoll(10_000);
  }

  stop(): void {
    if (!this.isRunning) return;
    this.isRunning = false;
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
    this.httpPortClient.clearPending();
    this.logger.info('[agentoracle-httpport] Daemon stopped');
  }

  // ─── Private ────────────────────────────────────────────────────────────────

  private scheduleNextPoll(delay: number): void {
    if (!this.isRunning) return;
    this.timerId = setTimeout(async () => {
      await this.pollOnce();
      this.scheduleNextPoll(this.calculateNextDelay());
    }, delay);
  }

  private async pollOnce(): Promise<void> {
    if (this.isPaused) {
      this.logger.info('[agentoracle-httpport] Polling paused due to authentication error');
      return;
    }

    if (!this.hasRunVerification) {
      this.hasRunVerification = true;
      try {
        await this.runBuiltInVerification();
      } catch (err) {
        this.logger.error('[agentoracle-httpport] Verification test error', err as Error);
      }
      // 验证完成后等待 5 秒再开始轮询，避免连续触发插件扫描
      await new Promise(r => setTimeout(r, 5_000));
    }

    this.logger.info('[agentoracle-httpport] Starting polling cycle');

    try {
      // 1. 获取任务
      const task = await this.apiClient.fetchTask();
      if (!task) {
        this.logger.info('[agentoracle-httpport] No available tasks');
        return;
      }
      this.logger.info(`[agentoracle-httpport] Fetched task: ${task.id}`);

      // 2. 构建提示词，通过 HTTP Port 发给 OpenClaw Agent
      const prompt = PromptBuilder.buildSensorPrompt({
        task_id:    task.id,
        question:   task.question,
        context:    task.description,
        background: task.title !== task.question ? task.title : undefined,
      });

      const conversationId = this.httpPortClient.makeConversationId(task.id);
      this.logger.info(
        `[agentoracle-httpport] Sending to Agent (conversationId: ${conversationId})`
      );

      const llmResult = await this.httpPortClient.sendMessage(conversationId, prompt);

      this.logger.info('[agentoracle-httpport] ========================================');
      this.logger.info(`[agentoracle-httpport] 🤖 AI RESPONSE for task ${task.id}:`);
      this.logger.info(`[agentoracle-httpport] ${llmResult}`);
      this.logger.info('[agentoracle-httpport] ━━━━━━━━━━━━━━━━━━━━━━');
      this.logger.info('[agentoracle-httpport] ========================================');

      // 3. 脱敏处理
      const sanitizationResult = this.sanitizer.sanitize(llmResult);
      this.logger.info(`[agentoracle-httpport] Sanitization completed for task: ${task.id}`);

      // 4. 审计日志（脱敏前后对比）
      await this.auditLogger.log({
        timestamp: this.formatTimestamp(new Date()),
        taskId:    task.id,
        original:  sanitizationResult.original,
        sanitized: sanitizationResult.sanitized,
      });
      this.logger.info(`[agentoracle-httpport] Audit log written for task: ${task.id}`);

      // 5. 解析 LLM 输出为 v3.0 结构化信号数据
      const parsed = SignalParser.parse(sanitizationResult.sanitized);
      this.logger.info(
        `[agentoracle-httpport] Parsed signal: status=${parsed.status}, ` +
        `signals=${parsed.signals.length}`
      );

      // 6. 构建提交数据
      const submissionData: SignalSubmission = {
        task_id:          task.id,
        status:           parsed.status,
        signals:          parsed.signals.length > 0 ? parsed.signals : undefined,
        user_persona:     parsed.user_persona,
        abstain_reason:   parsed.abstain_reason,
        abstain_detail:   parsed.abstain_detail,
        privacy_cleared:  true,
        protocol_version: '3.0',
      };

      // 7. 记录提交日志
      await this.auditLogger.logSubmission({
        timestamp:           this.formatTimestamp(new Date()),
        taskId:              task.id,
        taskQuestion:        task.question,
        taskContext:         task.description,
        aiResponse:          llmResult,
        sanitizedResponse:   sanitizationResult.sanitized,
        submittedData:       { ...submissionData },
      });
      this.logger.info(`[agentoracle-httpport] Submission log written for task: ${task.id}`);

      // 8. 提交结果到平台
      await this.apiClient.submitResult(submissionData);
      this.logger.info(`[agentoracle-httpport] ✅ Result submitted for task: ${task.id}`);

    } catch (error) {
      this.handleError(error);
    }
  }

  private handleError(error: unknown): void {
    if (error instanceof AuthenticationError) {
      this.logger.error('[agentoracle-httpport] Authentication error — pausing polling', error);
      this.isPaused = true;
    } else if (error instanceof RateLimitError) {
      this.logger.error(`[agentoracle-httpport] Rate limit error (retry after ${error.retryAfter}s)`, error);
    } else if (error instanceof InferenceTimeoutError) {
      this.logger.error('[agentoracle-httpport] Inference timeout — continuing next cycle', error);
    } else if (error instanceof NetworkError) {
      this.logger.error('[agentoracle-httpport] Network error — continuing next cycle', error);
    } else {
      this.logger.error('[agentoracle-httpport] Unknown error', error as Error);
    }
  }

  private calculateNextDelay(): number {
    const base   = this.config.pollingIntervalSeconds * 1000;
    const jitter = this.config.jitterSeconds * 1000;
    return base + (Math.random() * 2 * jitter - jitter);
  }

  private formatTimestamp(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return (
      `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
      `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
    );
  }

  // ─── Built-in Verification ──────────────────────────────────────────────────

  private async runBuiltInVerification(): Promise<void> {
    this.logger.info('[agentoracle-httpport] ========================================');
    this.logger.info('[agentoracle-httpport] Running built-in verification test...');
    this.logger.info('[agentoracle-httpport] ========================================');

    try {
      const verificationPrompt = PromptBuilder.buildVerificationPrompt();
      const conversationId = this.httpPortClient.makeConversationId('verification_test');

      this.logger.info('[agentoracle-httpport] Sending verification message to Agent...');

      const llmResult = await this.httpPortClient.sendMessage(conversationId, verificationPrompt);

      this.logger.info(`[agentoracle-httpport] ✅ Verification response received (${llmResult.length} chars)`);
      this.logger.info('[agentoracle-httpport] ========================================');
      this.logger.info('[agentoracle-httpport] 🤖 AI RESPONSE:');
      this.logger.info(`[agentoracle-httpport] ${llmResult}`);
      this.logger.info('[agentoracle-httpport] ━━━━━━━━━━━━━━━━━━━━━━');
      this.logger.info('[agentoracle-httpport] ========================================');

      const sanitizationResult = this.sanitizer.sanitize(llmResult);
      this.logger.info('[agentoracle-httpport] ✅ Sanitization completed');

      await this.auditLogger.log({
        timestamp: this.formatTimestamp(new Date()),
        taskId:    'verification_test',
        original:  sanitizationResult.original,
        sanitized: sanitizationResult.sanitized,
      });
      this.logger.info('[agentoracle-httpport] ✅ Audit log written');

      this.logger.info('[agentoracle-httpport] ========================================');
      this.logger.info('[agentoracle-httpport] ✅ Verification test passed');
      this.logger.info('[agentoracle-httpport] All components working correctly:');
      this.logger.info('[agentoracle-httpport]   - HTTP Port connection to OpenClaw');
      this.logger.info('[agentoracle-httpport]   - Callback route receiving responses');
      this.logger.info('[agentoracle-httpport]   - Data sanitization pipeline');
      this.logger.info('[agentoracle-httpport]   - Audit logging system');
      this.logger.info('[agentoracle-httpport] ========================================');

      if (this.onVerificationSuccess) {
        try {
          this.onVerificationSuccess();
        } catch (cbErr) {
          this.logger.error('[agentoracle-httpport] Error in verification success callback', cbErr as Error);
        }
      }
    } catch (error) {
      this.logger.error('[agentoracle-httpport] ========================================');
      this.logger.error('[agentoracle-httpport] ❌ Verification test failed', error as Error);
      this.logger.error('[agentoracle-httpport] ========================================');
    }
  }
}
