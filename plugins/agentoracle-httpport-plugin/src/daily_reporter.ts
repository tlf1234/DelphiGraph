import { APIClient } from './api_client';
import { HttpPortClient } from './http_port_client';
import { PromptBuilder } from './prompt_builder';
import { PluginLogger } from './types';

/**
 * DailyReporter
 * 定时通过 HTTP Port 向 OpenClaw Agent 发送每日工作报告
 * 使用 setTimeout 实现定时调度（无外部依赖）
 */
export class DailyReporter {
  private timerId: ReturnType<typeof setTimeout> | null = null;
  private isRunning        = false;
  private startupReportSent = false;

  constructor(
    private apiClient: APIClient,
    private httpPortClient: HttpPortClient,
    private logger: PluginLogger,
    private reportHour:   number = 2,
    private reportMinute: number = 0
  ) {}

  start(): void {
    if (this.isRunning) {
      this.logger.warn('[agentoracle-httpport] DailyReporter is already running');
      return;
    }
    this.isRunning = true;
    this.logger.info(
      `[agentoracle-httpport] DailyReporter started — daily at ` +
      `${this.reportHour}:${String(this.reportMinute).padStart(2, '0')} Asia/Shanghai`
    );
    this.scheduleNext();
  }

  async sendStartupReport(): Promise<void> {
    if (this.startupReportSent) {
      this.logger.warn('[agentoracle-httpport] Startup report already sent, skipping');
      return;
    }
    this.logger.info('[agentoracle-httpport] ========================================');
    this.logger.info('[agentoracle-httpport] HTTP Port verified — sending startup report...');
    this.logger.info('[agentoracle-httpport] ========================================');

    try {
      await this.sendDailyReport();
      this.startupReportSent = true;
      this.logger.info('[agentoracle-httpport] ✅ Startup report sent successfully');
    } catch (error) {
      this.logger.error('[agentoracle-httpport] ❌ Failed to send startup report', error as Error);
    }
  }

  stop(): void {
    if (!this.isRunning) return;
    this.isRunning = false;
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
    this.logger.info('[agentoracle-httpport] DailyReporter stopped');
  }

  private scheduleNext(): void {
    if (!this.isRunning) return;
    const delayMs = this.msUntilNext(this.reportHour, this.reportMinute);
    this.logger.info(
      `[agentoracle-httpport] Next daily report in ${Math.round(delayMs / 60_000)} minutes`
    );
    this.timerId = setTimeout(async () => {
      this.logger.info('[agentoracle-httpport] Timer triggered — sending daily report...');
      await this.sendDailyReport();
      this.scheduleNext();
    }, delayMs);
  }

  /**
   * 计算距离下次 Asia/Shanghai hour:minute 还有多少毫秒
   * UTC+8 固定偏移，无夏令时
   */
  private msUntilNext(hour: number, minute: number): number {
    const shanghaiOffsetMs = 8 * 60 * 60 * 1000;
    const now = Date.now();
    // 将 now 偏移到上海时区，用 getUTC* 读取上海本地日期
    const shanghaiDate = new Date(now + shanghaiOffsetMs);
    // 上海当天 0:00 对应的 UTC 时间戳
    const shanghaiMidnightUtc = Date.UTC(
      shanghaiDate.getUTCFullYear(),
      shanghaiDate.getUTCMonth(),
      shanghaiDate.getUTCDate()
    ) - shanghaiOffsetMs;
    // 目标时刻 = 当天 0:00 UTC + 小时偏移
    let targetUtc = shanghaiMidnightUtc + (hour * 3600 + minute * 60) * 1000;
    // 如果今天的时刻已过，顺延到明天
    if (targetUtc <= now) targetUtc += 86_400_000;
    return targetUtc - now;
  }

  private async sendDailyReport(): Promise<void> {
    this.logger.info('[agentoracle-httpport] Generating daily report...');

    try {
      const rawStats = await this.apiClient.getStats();
      const stats = rawStats || { total_earnings: 0, completed_tasks: 0, reputation_score: 0, rank: undefined };

      this.logger.info(`[agentoracle-httpport]   Total Earnings:   ${stats.total_earnings}`);
      this.logger.info(`[agentoracle-httpport]   Completed Tasks:  ${stats.completed_tasks}`);
      this.logger.info(`[agentoracle-httpport]   Reputation Score: ${stats.reputation_score}`);

      const reportMessage = PromptBuilder.buildDailyReportMessage(stats);

      const conversationId = this.httpPortClient.makeConversationId('daily_report');
      this.logger.info('[agentoracle-httpport] Sending daily report to Agent...');

      const response = await this.httpPortClient.sendMessage(conversationId, reportMessage);

      this.logger.info('[agentoracle-httpport] ✅ Daily report sent');
      this.logger.info('[agentoracle-httpport] ========================================');
      this.logger.info('[agentoracle-httpport] Agent Response:');
      this.logger.info(`[agentoracle-httpport] ${response || '(empty)'}`);
      this.logger.info('[agentoracle-httpport] ========================================');
    } catch (error) {
      this.logger.error('[agentoracle-httpport] ❌ Daily report failed', error as Error);
      throw error;
    }
  }
}
