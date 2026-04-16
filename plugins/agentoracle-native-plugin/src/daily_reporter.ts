import * as cron from 'node-cron';
import { APIClient } from './api_client';
import { WebSocketClient } from './websocket_client';
import { PluginLogger } from './types';

/**
 * DailyReporter 类
 * 使用 node-cron 定时发送每日报告到 OpenClaw Agent
 * 
 * 功能：
 * - 每天凌晨 2:00 自动发送报告（使用 node-cron）
 * - 插件启动时等待 WebSocket 验证成功后发送一次报告（事件驱动）
 * - 通过 WebSocket 发送结构化数据给 Agent
 * - Agent 将数据渲染为 UI 面板并推送给用户客户端（微信、Facebook、飞书等）
 */
export class DailyReporter {
  private cronTask: cron.ScheduledTask | null = null;
  private isRunning: boolean = false;
  private startupReportSent: boolean = false;

  constructor(
    private apiClient: APIClient,
    private wsClient: WebSocketClient,
    private logger: PluginLogger,
    private reportHour: number = 2, // 默认凌晨 2 点
    private reportMinute: number = 0
  ) {}

  /**
   * 启动每日报告服务
   * 不立即发送报告，等待外部调用 sendStartupReport() 触发首次报告
   * 然后使用 node-cron 调度每日定时报告
   */
  start(): void {
    if (this.isRunning) {
      this.logger.warn('[agentoracle-native-plugin] DailyReporter is already running');
      return;
    }

    this.isRunning = true;
    this.logger.info('[agentoracle-native-plugin] DailyReporter started');
    this.logger.info('[agentoracle-native-plugin] Waiting for WebSocket verification to complete before sending startup report...');

    // 使用 node-cron 调度每日报告
    // Cron 表达式格式: 分 时 日 月 星期
    // 例如: "0 2 * * *" 表示每天凌晨 2:00
    const cronExpression = `${this.reportMinute} ${this.reportHour} * * *`;
    
    this.logger.info(
      `[agentoracle-native-plugin] Scheduling daily report with cron: ${cronExpression} ` +
      `(${this.reportHour}:${String(this.reportMinute).padStart(2, '0')})`
    );

    this.cronTask = cron.schedule(cronExpression, async () => {
      this.logger.info('[agentoracle-native-plugin] Cron job triggered, sending daily report...');
      await this.sendDailyReport();
    }, {
      scheduled: true,
      timezone: 'Asia/Shanghai' // 使用中国时区
    });

    this.logger.info('[agentoracle-native-plugin] Daily report cron job scheduled successfully');
  }

  /**
   * 发送启动报告
   * 由外部在 WebSocket 验证成功后调用，确保连接已就绪
   */
  async sendStartupReport(): Promise<void> {
    if (this.startupReportSent) {
      this.logger.warn('[agentoracle-native-plugin] Startup report already sent, skipping');
      return;
    }

    this.logger.info('[agentoracle-native-plugin] ========================================');
    this.logger.info('[agentoracle-native-plugin] WebSocket verification completed, sending startup report...');
    this.logger.info('[agentoracle-native-plugin] ========================================');
    
    try {
      await this.sendDailyReport();
      this.startupReportSent = true;
      this.logger.info('[agentoracle-native-plugin] ✅ Startup report sent successfully');
    } catch (error) {
      this.logger.error('[agentoracle-native-plugin] ❌ Failed to send startup report');
      this.logger.error('[agentoracle-native-plugin] Error details:', error as Error);
      
      // Log stack trace if available
      if (error instanceof Error && error.stack) {
        this.logger.error('[agentoracle-native-plugin] Stack trace:');
        this.logger.error(`[agentoracle-native-plugin] ${error.stack}`);
      }
      
      // Don't re-throw - we don't want startup report failure to break the plugin
      // Just log the error and continue
    }
  }

  /**
   * 停止每日报告服务
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    if (this.cronTask) {
      this.cronTask.stop();
      this.cronTask = null;
      this.logger.info('[agentoracle-native-plugin] Cron job stopped');
    }

    this.logger.info('[agentoracle-native-plugin] DailyReporter stopped');
  }

  /**
   * 发送每日报告
   * 获取昨天的任务和收益数据，通过 WebSocket 发送给 Agent
   * Agent 会对工作成果发表看法，形成互动对话
   * @private
   */
  private async sendDailyReport(): Promise<void> {
    this.logger.info('[agentoracle-native-plugin] ========================================');
    this.logger.info('[agentoracle-native-plugin] Generating daily report...');
    this.logger.info('[agentoracle-native-plugin] ========================================');

    try {
      // 1. 获取用户统计数据
      const stats = await this.apiClient.getStats();

      // 如果 stats 为 null，使用默认值创建一个空的统计对象
      const safeStats = stats || {
        total_earnings: 0,
        completed_tasks: 0,
        reputation_score: 0,
        rank: undefined
      };

      this.logger.info('[agentoracle-native-plugin] Stats fetched successfully');
      this.logger.info(`[agentoracle-native-plugin]   - Total Earnings: ${safeStats.total_earnings ?? 0}`);
      this.logger.info(`[agentoracle-native-plugin]   - Completed Tasks: ${safeStats.completed_tasks ?? 0}`);
      this.logger.info(`[agentoracle-native-plugin]   - Reputation Score: ${safeStats.reputation_score ?? 0}`);

      // 2. 构建报告消息
      const reportMessage = this.buildReportMessage(safeStats);

      // 3. 通过 WebSocket 发送给 Agent，等待 Agent 的回复
      this.logger.info('[agentoracle-native-plugin] Sending daily report to Agent via WebSocket...');
      
      const response = await this.wsClient.sendMessage(reportMessage);

      // 检查 response 是否为 null（连接失败）
      if (response === null) {
        throw new Error('WebSocket sendMessage returned null - connection or authentication failed');
      }

      this.logger.info('[agentoracle-native-plugin] ✅ Daily report sent successfully');
      this.logger.info('[agentoracle-native-plugin] ========================================');
      this.logger.info(`[agentoracle-native-plugin] Agent Response:`);
      if (response && response.length > 0) {
        this.logger.info(`[agentoracle-native-plugin] ${response}`);
      } else {
        this.logger.info(`[agentoracle-native-plugin] (Empty response)`);
      }
      this.logger.info('[agentoracle-native-plugin] ========================================');

    } catch (error) {
      this.logger.error('[agentoracle-native-plugin] ❌ Failed to generate/send daily report');
      this.logger.error('[agentoracle-native-plugin] Error details:', error as Error);
      
      // Log stack trace if available
      if (error instanceof Error && error.stack) {
        this.logger.error('[agentoracle-native-plugin] Stack trace:', new Error(error.stack));
      }
      
      // Re-throw to propagate error to caller
      throw error;
    }
  }

  /**
   * 构建报告消息
   * 格式化为结构化数据，供 Agent 渲染为 UI 面板
   * 
   * 注意：即使数据为 0 或空，也会生成完整的报告消息
   * 这确保用户始终能看到统计面板，了解当前状态
   * 
   * @param stats 统计数据
   * @returns 格式化的报告消息
   * @private
   */
  private buildReportMessage(stats: any): string {
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);

    const reportDate = yesterday.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    // 安全地提取数据，使用默认值 0 处理 null/undefined
    const totalEarnings = stats?.total_earnings ?? 0;
    const completedTasks = stats?.completed_tasks ?? 0;
    const reputationScore = stats?.reputation_score ?? 0;
    const rank = stats?.rank;

    // 根据数据状态生成不同的鼓励语
    let encouragementMessage = '';
    if (completedTasks === 0 && totalEarnings === 0) {
      encouragementMessage = '🚀 开始你的预测之旅，赚取第一笔收益！';
    } else if (completedTasks > 0 && totalEarnings === 0) {
      encouragementMessage = '💪 继续努力，收益即将到来！';
    } else {
      encouragementMessage = '🎯 继续保持，预测未来！';
    }

    // 构建结构化报告消息
    // 以互动的方式呈现，让 Agent 对自己的工作成果发表看法
    const message = `
📊 AgentOracle 工作报告

📅 报告日期：${reportDate}

💰 你昨天的收益情况
• 总收益：${totalEarnings} 积分
• 完成任务：${completedTasks} 个

⭐ 你的信誉数据
• 当前评分：${reputationScore}
${rank ? `• 当前排名：第 ${rank} 名` : '• 当前排名：暂无'}

${encouragementMessage}

这是你昨天挣的收益，你觉得怎么样？

━━━━━━━━━━━━━━━━━━━━━━
📌 数据来源：AgentOracle 预测任务平台
🌐 平台地址：https://agentoracle.xyz
`.trim();

    return message;
  }
}
