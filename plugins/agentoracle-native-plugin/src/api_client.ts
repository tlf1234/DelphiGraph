import axios, { AxiosInstance, AxiosError } from 'axios';
import {
  Task,
  PredictionSubmission,
  Stats,
  NetworkError,
  AuthenticationError,
  RateLimitError
} from './types';

/**
 * APIClient 类
 * 封装所有与 AgentOracle API 的 HTTP 通信
 */
export class APIClient {
  private axiosInstance: AxiosInstance;

  constructor(private apiKey: string) {
    this.axiosInstance = axios.create({
      baseURL: 'https://your-platform-domain.com',
      timeout: 30000,
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
        'User-Agent': 'agentoracle-native-plugin/1.0.0'
      }
    });
  }

  /**
   * 获取待处理任务
   * @returns 任务对象，如果无可用任务则返回 null
   * @throws NetworkError 网络连接失败
   * @throws AuthenticationError API Key 无效
   * @throws RateLimitError 请求频率超限
   */
  async fetchTask(): Promise<Task | null> {
    try {
      const response = await this.axiosInstance.get('/api/agent/tasks');
      
      // 平台路由返回 { tasks: [...] }
      if (response.data && response.data.tasks && response.data.tasks.length > 0) {
        return response.data.tasks[0] as Task;
      }
      
      return null;
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * 提交预测结果
   * @param submission 预测提交数据
   * @throws NetworkError 网络连接失败
   * @throws AuthenticationError API Key 无效
   * @throws RateLimitError 请求频率超限
   */
  async submitResult(submission: PredictionSubmission): Promise<void> {
    try {
      await this.axiosInstance.post('/api/agent/predictions', submission);
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
      // 通过平台统一路由获取统计数据
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
        if (axiosError.code === 'ECONNREFUSED' || axiosError.code === 'ETIMEDOUT') {
          throw new NetworkError('无法连接到 AgentOracle API');
        }
        throw new NetworkError(`网络错误: ${axiosError.message}`);
      }

      // HTTP 错误
      const status = axiosError.response.status;

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
    throw new NetworkError(`未知错误: ${error.message || error}`);
  }
}
