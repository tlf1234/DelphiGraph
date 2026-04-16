import nock from 'nock';
import { APIClient } from '../api_client';
import { NetworkError, AuthenticationError, RateLimitError } from '../types';

describe('APIClient', () => {
  const API_BASE_URL = 'https://your-platform-domain.com';
  const API_PATH_PREFIX = '';
  const TEST_API_KEY = 'test-api-key-12345';
  let apiClient: APIClient;

  beforeEach(() => {
    apiClient = new APIClient(TEST_API_KEY);
    nock.cleanAll();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  describe('构造函数和配置', () => {
    it('应该使用正确的 baseURL', async () => {
      const scope = nock(API_BASE_URL)
        .get(`${API_PATH_PREFIX}/api/agent/tasks`)
        .reply(200, { tasks: [], total: 0 });

      await apiClient.fetchTask();

      expect(scope.isDone()).toBe(true);
    });

    it('应该在请求头中包含 x-api-key', async () => {
      const scope = nock(API_BASE_URL, {
        reqheaders: {
          'x-api-key': TEST_API_KEY
        }
      })
        .get(`${API_PATH_PREFIX}/api/agent/tasks`)
        .reply(200, { tasks: [], total: 0 });

      await apiClient.fetchTask();

      expect(scope.isDone()).toBe(true);
    });

    it('应该在请求头中包含 User-Agent', async () => {
      const scope = nock(API_BASE_URL, {
        reqheaders: {
          'user-agent': 'agentoracle-native-plugin/1.0.0'
        }
      })
        .get(`${API_PATH_PREFIX}/api/agent/tasks`)
        .reply(200, { tasks: [], total: 0 });

      await apiClient.fetchTask();

      expect(scope.isDone()).toBe(true);
    });
  });

  describe('fetchTask()', () => {
    it('应该成功获取任务', async () => {
      const mockTask = {
        id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        title: 'Weather Analysis',
        question: 'What is the weather?',
        description: 'Weather analysis task',
        reward_pool: 100,
        closes_at: '2024-12-31T23:59:59Z',
        visibility: 'public',
        funding_type: 'direct',
        funding_goal: null,
        funding_current: null,
        funding_progress: null,
        required_niche_tags: null,
        requires_nda: false,
        min_reputation: 0,
        match_score: 0.75,
        match_reason: 'General task',
        created_at: '2024-01-01T00:00:00Z'
      };

      nock(API_BASE_URL)
        .get(`${API_PATH_PREFIX}/api/agent/tasks`)
        .reply(200, { tasks: [mockTask], total: 1 });

      const task = await apiClient.fetchTask();

      expect(task).toEqual(mockTask);
      expect(task!.id).toBe('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
    });

    it('当无可用任务时应该返回 null (空数组)', async () => {
      nock(API_BASE_URL)
        .get(`${API_PATH_PREFIX}/api/agent/tasks`)
        .reply(200, { tasks: [], total: 0 });

      const task = await apiClient.fetchTask();

      expect(task).toBeNull();
    });

    it('当认证失败时应该抛出 AuthenticationError (401)', async () => {
      nock(API_BASE_URL)
        .get(`${API_PATH_PREFIX}/api/agent/tasks`)
        .times(2)
        .reply(401);

      await expect(apiClient.fetchTask()).rejects.toThrow(AuthenticationError);
      await expect(apiClient.fetchTask()).rejects.toThrow('API Key 无效或已过期');
    });

    it('当请求频率超限时应该抛出 RateLimitError (429)', async () => {
      nock(API_BASE_URL)
        .get(`${API_PATH_PREFIX}/api/agent/tasks`)
        .times(2)
        .reply(429, {}, { 'retry-after': '120' });

      await expect(apiClient.fetchTask()).rejects.toThrow(RateLimitError);

      try {
        await apiClient.fetchTask();
      } catch (error) {
        expect(error).toBeInstanceOf(RateLimitError);
        expect((error as RateLimitError).retryAfter).toBe(120);
      }
    });

    it('当没有 retry-after 头时应该使用默认值 60', async () => {
      nock(API_BASE_URL)
        .get(`${API_PATH_PREFIX}/api/agent/tasks`)
        .reply(429);

      try {
        await apiClient.fetchTask();
      } catch (error) {
        expect(error).toBeInstanceOf(RateLimitError);
        expect((error as RateLimitError).retryAfter).toBe(60);
      }
    });

    it('当网络连接失败时应该抛出 NetworkError', async () => {
      nock(API_BASE_URL)
        .get(`${API_PATH_PREFIX}/api/agent/tasks`)
        .times(2)
        .replyWithError({ code: 'ECONNREFUSED' });

      await expect(apiClient.fetchTask()).rejects.toThrow(NetworkError);
      await expect(apiClient.fetchTask()).rejects.toThrow('无法连接到 AgentOracle API');
    });

    it('当请求超时时应该抛出 NetworkError', async () => {
      nock(API_BASE_URL)
        .get(`${API_PATH_PREFIX}/api/agent/tasks`)
        .replyWithError({ code: 'ETIMEDOUT' });

      await expect(apiClient.fetchTask()).rejects.toThrow(NetworkError);
    });
  });

  describe('submitSignals()', () => {
    it('应该成功提交信号数据', async () => {
      const submission = {
        task_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        status: 'submitted' as const,
        signals: [{
          signal_id: 'sig_test1',
          evidence_type: 'hard_fact' as const,
          source_type: 'web_news',
          evidence_text: 'Based on analysis, the outcome is likely positive.',
          relevance_reasoning: 'Directly related to the question.',
        }],
        privacy_cleared: true,
        protocol_version: '3.0' as const,
      };

      const scope = nock(API_BASE_URL)
        .post(`${API_PATH_PREFIX}/api/agent/signals`, submission)
        .reply(200, { success: true, submissionId: 'sub-123' });

      await expect(apiClient.submitSignals(submission)).resolves.not.toThrow();
      expect(scope.isDone()).toBe(true);
    });

    it('应该处理包含完整结构化信号字段的提交', async () => {
      const submission = {
        task_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        status: 'submitted' as const,
        signals: [{
          signal_id: 'sig_test2',
          evidence_type: 'hard_fact' as const,
          source_type: 'web_search',
          evidence_text: 'Key evidence text with detailed analysis.',
          relevance_reasoning: 'High relevance due to direct market impact.',
          relevance_score: 0.9,
          entity_tags: [{ text: 'Bitcoin', type: 'asset', role: 'subject' }],
          source_urls: ['https://example.com/source'],
        }],
        privacy_cleared: true,
        protocol_version: '3.0' as const,
      };

      const scope = nock(API_BASE_URL)
        .post(`${API_PATH_PREFIX}/api/agent/signals`, submission)
        .reply(200, { success: true, submissionId: 'sub-456' });

      await expect(apiClient.submitSignals(submission)).resolves.not.toThrow();
      expect(scope.isDone()).toBe(true);
    });

    it('当认证失败时应该抛出 AuthenticationError', async () => {
      const submission = {
        task_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        status: 'submitted' as const,
        signals: [],
        privacy_cleared: true,
        protocol_version: '3.0' as const,
      };

      nock(API_BASE_URL)
        .post(`${API_PATH_PREFIX}/api/agent/signals`)
        .reply(401);

      await expect(apiClient.submitSignals(submission)).rejects.toThrow(AuthenticationError);
    });

    it('当请求参数错误时应该抛出 NetworkError (400)', async () => {
      const submission = {
        task_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        status: 'submitted' as const,
        signals: [],
        privacy_cleared: true,
        protocol_version: '3.0' as const,
      };

      nock(API_BASE_URL)
        .post(`${API_PATH_PREFIX}/api/agent/signals`)
        .reply(400);

      await expect(apiClient.submitSignals(submission)).rejects.toThrow(NetworkError);
    });
  });

  describe('getStats()', () => {
    it('应该成功获取统计数据', async () => {
      nock(API_BASE_URL)
        .get(`${API_PATH_PREFIX}/api/agent/stats`)
        .reply(200, { completed_tasks: 127, reputation_score: 850 });

      const stats = await apiClient.getStats();

      expect(stats.completed_tasks).toBe(127);
      expect(stats.reputation_score).toBe(850);
      expect(stats.total_earnings).toBe(0);
    });

    it('应该在端点返回空数据时返回默认值', async () => {
      nock(API_BASE_URL)
        .get(`${API_PATH_PREFIX}/api/agent/stats`)
        .reply(200, {});

      const stats = await apiClient.getStats();

      expect(stats.total_earnings).toBe(0);
      expect(stats.completed_tasks).toBe(0);
      expect(stats.reputation_score).toBe(0);
      expect(stats.rank).toBeUndefined();
    });

    it('应该在端点返回 404 时返回默认值', async () => {
      nock(API_BASE_URL)
        .get(`${API_PATH_PREFIX}/api/agent/stats`)
        .reply(404);

      const stats = await apiClient.getStats();

      expect(stats.completed_tasks).toBe(0);
      expect(stats.reputation_score).toBe(0);
    });
  });

  describe('错误处理', () => {
    it('应该处理 500 服务器错误', async () => {
      nock(API_BASE_URL)
        .get(`${API_PATH_PREFIX}/api/agent/tasks`)
        .times(2)
        .reply(500, 'Internal Server Error');

      await expect(apiClient.fetchTask()).rejects.toThrow(NetworkError);
      await expect(apiClient.fetchTask()).rejects.toThrow('HTTP 错误 500');
    });

    it('应该处理 503 服务不可用错误', async () => {
      nock(API_BASE_URL)
        .get(`${API_PATH_PREFIX}/api/agent/tasks`)
        .reply(503);

      await expect(apiClient.fetchTask()).rejects.toThrow(NetworkError);
    });

    it('应该处理未知的 HTTP 状态码', async () => {
      nock(API_BASE_URL)
        .get(`${API_PATH_PREFIX}/api/agent/tasks`)
        .reply(418);  // I'm a teapot

      await expect(apiClient.fetchTask()).rejects.toThrow(NetworkError);
    });
  });

  describe('Content-Type 头', () => {
    it('应该在 POST 请求中设置 Content-Type', async () => {
      const scope = nock(API_BASE_URL, {
        reqheaders: {
          'content-type': 'application/json'
        }
      })
        .post(`${API_PATH_PREFIX}/api/agent/signals`)
        .reply(200);

      await apiClient.submitSignals({
        task_id: 'test-task-id',
        status: 'submitted',
        signals: [],
        privacy_cleared: true,
        protocol_version: '3.0',
      });

      expect(scope.isDone()).toBe(true);
    });
  });
});
