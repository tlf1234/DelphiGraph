import {
  Task,
  SignalSubmission,
  Stats,
  NetworkError,
  AuthenticationError,
  RateLimitError
} from './types';

/**
 * APIClient
 * 封装所有与 AgentOracle 平台的 HTTP 通信（使用原生 fetch，零外部依赖）
 * GET  /api/agent/tasks       — 获取待处理任务
 * POST /api/agent/signals    — 提交信号数据
 * GET  /api/agent/stats       — 查询统计数据
 */
export class APIClient {
  private readonly headers: Record<string, string>;

  constructor(private readonly apiKey: string, private readonly baseUrl: string = 'https://agentoracle.xyz') {
    this.headers = {
      'x-api-key': apiKey,
      'Content-Type': 'application/json',
      'User-Agent': 'agentoracle-httpport-plugin/1.0.0',
    };
  }

  /**
   * 获取待处理任务
   * @returns Task 对象，无可用任务时返回 null
   */
  async fetchTask(): Promise<Task | null> {
    const res = await this._request('GET', '/api/agent/tasks');
    if (res.status === 404) return null;
    await this._assertOk(res);
    const data = await res.json() as { tasks?: Task[] };
    return data?.tasks?.length ? data.tasks[0] : null;
  }

  /**
   * 提交信号数据
   */
  async submitResult(submission: SignalSubmission): Promise<void> {
    const res = await this._request('POST', '/api/agent/signals', submission);
    await this._assertOk(res);
  }

  /**
   * 查询统计数据
   */
  async getStats(): Promise<Stats> {
    const defaultStats: Stats = { total_earnings: 0, completed_tasks: 0, reputation_score: 0 };
    try {
      const res = await this._request('GET', '/api/agent/stats');
      if (res.status === 404) return defaultStats;
      await this._assertOk(res);
      const data = await res.json() as Partial<Stats>;
      return {
        total_earnings: data.total_earnings || 0,
        completed_tasks: data.completed_tasks || 0,
        reputation_score: data.reputation_score || 0,
        rank: data.rank,
      };
    } catch (err) {
      if (err instanceof AuthenticationError || err instanceof RateLimitError) throw err;
      return defaultStats;
    }
  }

  // ─── Private Helpers ────────────────────────────────────────────────────────

  private async _request(method: string, path: string, body?: unknown): Promise<Response> {
    try {
      return await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: this.headers,
        ...(body != null ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(30_000),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new NetworkError(`无法连接到 AgentOracle 平台: ${msg}`);
    }
  }

  private async _assertOk(res: Response): Promise<void> {
    if (res.ok) return;
    if (res.status === 401) throw new AuthenticationError('API Key 无效或已过期');
    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get('retry-after') ?? '60', 10);
      throw new RateLimitError(`请求过于频繁，请等待 ${retryAfter} 秒`, retryAfter);
    }
    throw new NetworkError(`HTTP 错误 ${res.status}: ${res.statusText}`);
  }
}
