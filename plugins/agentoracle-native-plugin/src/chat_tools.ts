import { APIClient } from './api_client';
import { Stats } from './types';

/**
 * ChatTools 工具函数集
 * 提供用户可调用的聊天工具实现
 */
export class ChatTools {
  constructor(private apiClient: APIClient) {}

  /**
   * 查询收益状态工具
   */
  async checkAgentOracleStatus(): Promise<string> {
    try {
      const stats = await this.apiClient.getStats();
      return this.formatStats(stats);
    } catch (error) {
      return this.formatError(error);
    }
  }

  /**
   * 格式化统计数据为 Markdown
   * @param stats 统计数据
   * @returns 格式化的 Markdown 字符串
   * @private
   */
  private formatStats(stats: Stats): string {
    const earnings = stats.total_earnings?.toFixed(2) || '0.00';
    const tasks = stats.completed_tasks || 0;
    const reputation = stats.reputation_score || 0;
    const rank = stats.rank ? `#${stats.rank}` : '暂无排名';

    return `
🤖 **AgentOracle 收益面板** 🤖

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💰 **总收益**: ${earnings}
✅ **完成任务**: ${tasks} 个
⭐ **信誉分**: ${reputation} / 1000
🏆 **排名**: ${rank}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

你的 Agent 正在努力打工中... 💪

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📌 数据来源：AgentOracle 预测市场平台
🌐 平台地址：https://agentoracle.xyz
`.trim();
  }

  /**
   * 格式化错误信息
   * @param error 错误对象
   * @returns 格式化的错误消息
   * @private
   */
  private formatError(error: any): string {
    return `
❌ **AgentOracle 服务暂时不可用**

请稍后再试，或检查以下配置：
- API Key 是否正确
- 网络连接是否正常

错误详情: ${error.message || '未知错误'}
`.trim();
  }
}
