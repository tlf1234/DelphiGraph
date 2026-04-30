import axios, { AxiosInstance, AxiosError } from 'axios';
import {
  Task,
  SignalSubmission,
  Stats,
  NetworkError,
  AuthenticationError,
  RateLimitError,
  PluginLogger
} from './types';
/**
 * APIClient 类
 * 封装所有与 AgentOracle API 的 HTTP 通信
 */
export class APIClient {
  private axiosInstance: AxiosInstance;
  constructor(private apiKey: string, private baseUrl: string, private logger: PluginLogger) {
    this.axiosInstance = axios.create({
      baseURL: baseUrl,
      timeout: 30000,
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
        'User-Agent': 'agentoracle-native-plugin/1.0.0'
      }
    });
    this.logger.info(`[agentoracle-native-plugin] APIClient initialized: baseURL=${baseUrl}`);
    this.logger.info(`[agentoracle-native-plugin] APIClient apiKey=${apiKey.substring(0, 8)}...`);
  }
  /**
   * 获取待处理任务
   * @returns 任务对象，如果无可用任务则返回 null
   * @throws NetworkError 网络连接失败
   * @throws AuthenticationError API Key 无效
   * @throws RateLimitError 请求频率超限
   */
  async fetchTask(): Promise<Task | null> {
    const url = `${this.baseUrl}/api/agent/tasks`;
    this.logger.info(`[agentoracle-native-plugin] Fetching task: GET ${url}`);
    this.logger.info(`[agentoracle-native-plugin] Request headers: x-api-key=${this.apiKey.substring(0, 8)}..., baseURL=${this.baseUrl}`);
    try {
      const response = await this.axiosInstance.get('/api/agent/tasks');
      this.logger.info(`[agentoracle-native-plugin] fetchTask response: status=${response.status}`);

      // 204 = 无可用任务，读取后端返回的原因 header
      if (response.status === 204) {
        const reason = response.headers?.['x-no-task-reason'] || 'unknown';
        const detailRaw = response.headers?.['x-no-task-detail'] || '';
        let detail = detailRaw;
        try { detail = decodeURIComponent(detailRaw); } catch (_) {}
        this.logger.info(`[agentoracle-native-plugin] 📋 无可用任务 (204)`);
        this.logger.info(`[agentoracle-native-plugin]   reason: ${reason}`);
        this.logger.info(`[agentoracle-native-plugin]   detail: ${detail}`);
        if (reason === 'no_active_tasks') {
          this.logger.info(`[agentoracle-native-plugin]   → 平台上没有 pending/active 状态的任务，等待新任务发布`);
        } else if (reason === 'all_submitted') {
          this.logger.info(`[agentoracle-native-plugin]   → 所有活跃任务均已提交过，等待新任务`);
        } else if (reason === 'filtered_out') {
          this.logger.info(`[agentoracle-native-plugin]   → 有活跃任务但因画像/信誉/标签不匹配而被过滤`);
        }
        return null;
      }

      this.logger.info(`[agentoracle-native-plugin] fetchTask response body: ${JSON.stringify(response.data)}`);

      // 返回 { tasks: [...], agent_reputation: ... }
      if (response.data && response.data.tasks && response.data.tasks.length > 0) {
        const raw = response.data.tasks[0];
        // 后端 UAP v3.0 返回 task_id，插件内部统一使用 id
        raw.id = raw.task_id || raw.id;
        const task = raw as Task;
        this.logger.info(`[agentoracle-native-plugin] ✅ 获取到任务: id=${task.id}, question=${(task.question || '').substring(0, 80)}...`);
        return task;
      }

      this.logger.info(`[agentoracle-native-plugin] ⚠️ 状态 200 但 tasks 数组为空`);
      return null;
    } catch (error) {
      return this.handleError(error);
    }
  }
  /**
   * 提交数据因子信号 (v3.0)
   * @param submission 信号提交数据
   * @throws NetworkError 网络连接失败
   * @throws AuthenticationError API Key 无效
   * @throws RateLimitError 请求频率超限
   */
  async submitSignals(submission: SignalSubmission): Promise<void> {
    try {
      // 【UAP v3.0 调试】打印即将发送的完整 POST body
      try {
        const bodyPreview = JSON.stringify(submission, null, 2);
        this.logger.info(
          `[agentoracle-native-plugin] 📤 POST /api/agent/signals ` +
          `- body 长度=${bodyPreview.length} chars, 信号数=${submission.signals?.length ?? 0}`
        );
        this.logger.info('[agentoracle-native-plugin] ---- POST body BEGIN ----');
        for (const line of bodyPreview.split('\n')) {
          this.logger.info(`[agentoracle-native-plugin] > ${line}`);
        }
        this.logger.info('[agentoracle-native-plugin] ---- POST body END ----');
      } catch (dbgErr) {
        this.logger.warn(`[agentoracle-native-plugin] 打印 POST body 失败: ${dbgErr}`);
      }
      
      await this.axiosInstance.post('/api/agent/signals', submission);
    } catch (error) {
      this.handleError(error);
    }
  }
  /**
   * 查询统计数据
   * @returns 统计数据对象，如果无法获取则返回默认值对象
   * @throws NetworkError 网络连接失败
   * @throws AuthenticationError API Key 无效
   * @throws RateLimitError 请求频率超限
   */
  async getStats(): Promise<Stats> {
    const defaultStats: Stats = {
      total_earnings: 0,
      completed_tasks: 0,
      reputation_score: 0,
      rank: undefined
    };
    try {
      const response = await this.axiosInstance.get('/api/agent/stats');
      if (response.data) {
        return {
          total_earnings: 0,
          completed_tasks: response.data.completed_tasks || 0,
          reputation_score: response.data.reputation_score || 0,
          rank: undefined
        };
      }
      return defaultStats;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return defaultStats;
      }
      return this.handleError(error);
    }
  }
  /**
   * 统一错误处理
   * @param error Axios 错误对象
   * @throws NetworkError, AuthenticationError, RateLimitError
   */
  private handleError(error: any): never {
    // 处理 Axios 错误
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      // 网络错误
      if (!axiosError.response) {
        this.logger.error(`[agentoracle-native-plugin] API network error: code=${axiosError.code} message=${axiosError.message}`);
        if (axiosError.code === 'ECONNREFUSED' || axiosError.code === 'ETIMEDOUT') {
          throw new NetworkError('无法连接到 AgentOracle API');
        }
        throw new NetworkError(`网络错误: ${axiosError.message}`);
      }
      // HTTP 错误
      const status = axiosError.response.status;
      const responseBody = JSON.stringify(axiosError.response.data);
      this.logger.error(`[agentoracle-native-plugin] API HTTP error: status=${status} body=${responseBody}`);
      if (status === 404) {
        // 404 表示无可用任务，返回 null
        return null as never;
      }
      if (status === 401) {
        throw new AuthenticationError('API Key 无效或已过期');
      }
      if (status === 429) {
        const retryAfter = parseInt(
          axiosError.response.headers['retry-after'] || '60',
          10
        );
        throw new RateLimitError(
          `请求过于频繁，请等待 ${retryAfter} 秒`,
          retryAfter
        );
      }
      throw new NetworkError(
        `HTTP 错误 ${status}: ${axiosError.response.statusText}`
      );
    }
    // 其他未知错误
    this.logger.error(`[agentoracle-native-plugin] API unknown error: ${error.message || error}`);
    throw new NetworkError(`未知错误: ${error.message || error}`);
  }
}
