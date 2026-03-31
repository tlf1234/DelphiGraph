-- ============================================================================
-- DelphiGraph 扩展迁移：搜索优化 + 智能分发优化 + 状态扩展 + 任务类别
-- 整合自：
--   20260218_optimize_search.sql
--   20260218_optimize_smart_distribution.sql
--   20260221_add_pending_status.sql
--   20260315_add_task_category.sql
--
-- 变更内容：
-- PART 1: 搜索性能优化（搜索函数、全文索引、搜索建议、搜索分析）
-- PART 2: 智能分发优化（分发函数、Top10%缓存、分发索引、慢查询监控）
-- PART 3: markets 表增加 pending 状态支持
-- PART 4: markets 表增加任务类别和客户类型字段
-- PART 5: 性能测试函数
-- PART 6: 统计信息更新
-- ============================================================================


-- ============================================================================
-- PART 1: 搜索性能优化
-- ============================================================================

-- 1.1 优化的搜索函数（全文搜索 + 聚合）
DROP FUNCTION IF EXISTS search_predictions_optimized(TEXT, INTEGER, INTEGER);
CREATE OR REPLACE FUNCTION search_predictions_optimized(
  p_query TEXT,
  p_limit INTEGER DEFAULT 20,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  task_id UUID,
  title TEXT,
  question TEXT,
  description TEXT,
  status TEXT,
  actual_outcome DECIMAL(3, 2),
  consensus_probability DECIMAL(5, 4),
  prediction_count BIGINT,
  created_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  relevance_score DECIMAL(5, 3)
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  WITH search_results AS (
    -- Full-text search on title and description
    SELECT 
      m.id,
      m.title,
      m.question,
      m.description,
      m.status,
      m.actual_outcome,
      m.created_at,
      m.resolves_at,
      -- Calculate text search rank
      ts_rank(
        to_tsvector('english', m.title || ' ' || m.description),
        websearch_to_tsquery('english', p_query)
      ) AS text_rank
    FROM markets m
    WHERE 
      m.status IN ('closed', 'resolved')
      AND (
        to_tsvector('english', m.title || ' ' || m.description) @@ 
        websearch_to_tsquery('english', p_query)
      )
  ),
  prediction_stats AS (
    -- Aggregate prediction statistics
    SELECT 
      p.task_id,
      AVG(p.probability) AS consensus_prob,
      COUNT(*) AS pred_count
    FROM predictions p
    WHERE p.task_id IN (SELECT id FROM search_results)
    GROUP BY p.task_id
  )
  SELECT 
    sr.id AS task_id,
    sr.title,
    sr.question,
    sr.description,
    sr.status,
    sr.actual_outcome,
    COALESCE(ps.consensus_prob, 0)::DECIMAL(5, 4) AS consensus_probability,
    COALESCE(ps.pred_count, 0) AS prediction_count,
    sr.created_at,
    sr.resolves_at AS resolved_at,
    -- Calculate relevance score
    (
      -- Text rank (50% weight)
      (sr.text_rank * 0.5) +
      -- Prediction count (30% weight)
      (LEAST(COALESCE(ps.pred_count, 0) / 100.0, 1) * 0.3) +
      -- Resolved bonus (20% weight)
      (CASE WHEN sr.status = 'resolved' THEN 0.2 ELSE 0 END)
    )::DECIMAL(5, 3) AS relevance_score
  FROM search_results sr
  LEFT JOIN prediction_stats ps ON sr.id = ps.task_id
  ORDER BY relevance_score DESC, sr.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

COMMENT ON FUNCTION search_predictions_optimized IS 
  'Optimized search function that performs full-text search and aggregates prediction statistics at database level. Returns results sorted by relevance score (text rank + prediction count + resolved status).';

-- 1.2 搜索结果计数函数（用于分页）
CREATE OR REPLACE FUNCTION search_predictions_count(
  p_query TEXT
)
RETURNS BIGINT
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_count BIGINT;
BEGIN
  SELECT COUNT(*)
  INTO v_count
  FROM markets m
  WHERE 
    m.status IN ('closed', 'resolved')
    AND (
      to_tsvector('english', m.title || ' ' || m.description) @@ 
      websearch_to_tsquery('english', p_query)
    );
  
  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION search_predictions_count IS 
  'Returns total count of search results for pagination. Optimized to use covering index.';

-- 1.3 全文搜索增强索引
-- 组合全文搜索 GIN 索引
CREATE INDEX IF NOT EXISTS idx_markets_fulltext_combined 
  ON markets USING GIN (
    to_tsvector('english', title || ' ' || description)
  )
  WHERE status IN ('closed', 'resolved');

-- 搜索结果排序索引
CREATE INDEX IF NOT EXISTS idx_markets_search_ordering 
  ON markets(status, created_at DESC)
  INCLUDE (title, question, description, actual_outcome, resolves_at)
  WHERE status IN ('closed', 'resolved');

-- 预测聚合索引
CREATE INDEX IF NOT EXISTS idx_predictions_market_aggregation 
  ON predictions(task_id)
  INCLUDE (probability);

-- 1.4 热门搜索词物化视图（可选，用于缓存优化）
CREATE MATERIALIZED VIEW IF NOT EXISTS popular_search_terms AS
SELECT 
  query_term,
  search_count,
  last_searched_at
FROM (
  SELECT 
    'future' AS query_term,
    0 AS search_count,
    NOW() AS last_searched_at
) AS placeholder;

CREATE UNIQUE INDEX IF NOT EXISTS idx_popular_search_terms_query 
  ON popular_search_terms(query_term);

COMMENT ON MATERIALIZED VIEW popular_search_terms IS 
  'Tracks popular search terms for analytics and caching optimization. Can be used to pre-cache common searches.';

-- 1.5 搜索分析日志函数
CREATE OR REPLACE FUNCTION log_search_query(
  p_query TEXT,
  p_result_count INTEGER,
  p_user_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Insert into audit_logs for search analytics
  INSERT INTO audit_logs (
    user_id,
    action,
    entity_type,
    entity_id,
    metadata
  ) VALUES (
    p_user_id,
    'search',
    'market',
    NULL,
    jsonb_build_object(
      'query', p_query,
      'result_count', p_result_count,
      'searched_at', NOW()
    )
  );
END;
$$;

COMMENT ON FUNCTION log_search_query IS 
  'Logs search queries for analytics. Helps identify popular search terms and improve search relevance.';

-- 1.6 搜索建议函数（自动补全）
CREATE OR REPLACE FUNCTION get_search_suggestions(
  p_prefix TEXT,
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  suggestion TEXT,
  market_count BIGINT
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    m.title AS suggestion,
    COUNT(*) AS market_count
  FROM markets m
  WHERE 
    m.status IN ('closed', 'resolved')
    AND m.title ILIKE p_prefix || '%'
  GROUP BY m.title
  ORDER BY market_count DESC, m.title
  LIMIT p_limit;
END;
$$;

COMMENT ON FUNCTION get_search_suggestions IS 
  'Returns search suggestions based on market titles. Used for autocomplete functionality.';


-- ============================================================================
-- PART 2: 智能分发优化
-- ============================================================================

-- 2.1 智能任务分发函数（过滤 + 评分）
CREATE OR REPLACE FUNCTION get_smart_distributed_tasks(
  p_agent_id UUID,
  p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  question TEXT,
  description TEXT,
  reward_pool DECIMAL(10, 2),
  closes_at TIMESTAMPTZ,
  visibility TEXT,
  funding_type TEXT,
  funding_goal DECIMAL(10, 2),
  funding_current DECIMAL(10, 2),
  funding_progress DECIMAL(5, 4),
  required_niche_tags TEXT[],
  requires_nda BOOLEAN,
  min_reputation INTEGER,
  match_score DECIMAL(5, 3),
  match_reason TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_agent RECORD;
  v_top_10_threshold DECIMAL;
  v_is_top_agent BOOLEAN;
BEGIN
  -- Get agent profile
  SELECT 
    reputation_score,
    status,
    niche_tags
  INTO v_agent
  FROM profiles
  WHERE profiles.id = p_agent_id;
  
  -- Check if agent is in purgatory
  IF v_agent.status = 'restricted' THEN
    RETURN;
  END IF;
  
  -- Calculate Top 10% threshold (cached via STABLE function)
  v_top_10_threshold := get_top_10_percent_threshold();
  v_is_top_agent := v_agent.reputation_score >= v_top_10_threshold;
  
  -- Return filtered and scored tasks
  RETURN QUERY
  WITH accessible_markets AS (
    SELECT 
      m.*,
      -- Calculate match score components
      CASE 
        -- Niche tag matching (30% weight)
        WHEN m.required_niche_tags IS NOT NULL AND array_length(m.required_niche_tags, 1) > 0 THEN
          CASE 
            WHEN v_agent.niche_tags IS NOT NULL THEN
              (
                SELECT COUNT(*)::DECIMAL / array_length(m.required_niche_tags, 1)
                FROM unnest(m.required_niche_tags) AS required_tag
                WHERE required_tag = ANY(v_agent.niche_tags)
              ) * 0.3
            ELSE -0.1
          END
        ELSE 0
      END AS niche_score,
      
      -- Reputation-based scoring (20% weight)
      CASE 
        WHEN m.min_reputation > 0 THEN
          LEAST((v_agent.reputation_score / m.min_reputation) - 1, 1) * 0.2
        ELSE 0
      END AS reputation_score,
      
      -- Reward pool attractiveness (20% weight)
      LEAST(m.reward_pool / 5000, 1) * 0.2 AS reward_score,
      
      -- Urgency (10% weight)
      CASE 
        WHEN EXTRACT(EPOCH FROM (m.closes_at - NOW())) / 3600 < 24 THEN 0.1
        WHEN EXTRACT(EPOCH FROM (m.closes_at - NOW())) / 3600 < 72 THEN 0.05
        ELSE 0
      END AS urgency_score,
      
      -- Funding progress bonus (10% weight)
      CASE 
        WHEN m.funding_type = 'crowd' AND m.funding_progress IS NOT NULL THEN
          m.funding_progress * 0.1
        ELSE 0
      END AS funding_score,
      
      -- Match reason
      CASE 
        WHEN m.required_niche_tags IS NOT NULL AND array_length(m.required_niche_tags, 1) > 0 THEN
          CASE 
            WHEN v_agent.niche_tags IS NOT NULL THEN
              CASE 
                WHEN (
                  SELECT COUNT(*)
                  FROM unnest(m.required_niche_tags) AS required_tag
                  WHERE required_tag = ANY(v_agent.niche_tags)
                ) = array_length(m.required_niche_tags, 1) THEN
                  'Perfect match: ' || array_to_string(
                    ARRAY(
                      SELECT required_tag
                      FROM unnest(m.required_niche_tags) AS required_tag
                      WHERE required_tag = ANY(v_agent.niche_tags)
                    ),
                    ', '
                  )
                WHEN (
                  SELECT COUNT(*)
                  FROM unnest(m.required_niche_tags) AS required_tag
                  WHERE required_tag = ANY(v_agent.niche_tags)
                ) > 0 THEN
                  'Partial match: ' || array_to_string(
                    ARRAY(
                      SELECT required_tag
                      FROM unnest(m.required_niche_tags) AS required_tag
                      WHERE required_tag = ANY(v_agent.niche_tags)
                    ),
                    ', '
                  )
                ELSE 'No niche match'
              END
            ELSE 'No niche match'
          END
        ELSE 'General task'
      END AS match_reason_text
      
    FROM markets m
    WHERE 
      -- Include both pending (waiting for agent) and active (agent working) tasks
      m.status IN ('pending', 'active')
      -- Filter by visibility and access rights
      AND (
        m.visibility = 'public'
        OR m.created_by = p_agent_id
        OR p_agent_id = ANY(m.allowed_viewers)
        OR (
          m.visibility = 'private'
          AND (
            v_agent.reputation_score >= m.min_reputation
            OR v_is_top_agent
          )
          AND (
            m.required_niche_tags IS NULL
            OR m.required_niche_tags && v_agent.niche_tags
          )
        )
      )
  )
  SELECT 
    am.id,
    am.title,
    am.question,
    am.description,
    am.reward_pool,
    am.closes_at,
    am.visibility,
    am.funding_type,
    am.funding_goal,
    am.funding_current,
    am.funding_progress,
    am.required_niche_tags,
    am.requires_nda,
    am.min_reputation,
    -- Calculate total match score (base 0.5 + all components)
    GREATEST(0, LEAST(1, 
      0.5 + 
      am.niche_score + 
      am.reputation_score + 
      am.reward_score + 
      am.urgency_score + 
      am.funding_score
    ))::DECIMAL(5, 3) AS match_score,
    am.match_reason_text AS match_reason,
    am.created_at
  FROM accessible_markets am
  ORDER BY match_score DESC, am.created_at DESC
  LIMIT p_limit;
END;
$$;

COMMENT ON FUNCTION get_smart_distributed_tasks IS 
  'Optimized smart task distribution function that filters and scores tasks at database level. Returns tasks with status IN (pending, active) sorted by match score based on agent reputation, niche tags, urgency, and other factors.';

-- 2.2 Top 10% 阈值缓存物化视图
CREATE MATERIALIZED VIEW IF NOT EXISTS cached_top_10_threshold AS
SELECT 
  PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY reputation_score) AS threshold,
  COUNT(*) AS active_agent_count,
  NOW() AS calculated_at
FROM profiles
WHERE status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS idx_cached_top_10_threshold_singleton 
  ON cached_top_10_threshold ((1));

COMMENT ON MATERIALIZED VIEW cached_top_10_threshold IS 
  'Cached Top 10% reputation threshold. Refreshed every 5 minutes to reduce computation overhead.';

-- 2.3 缓存阈值获取函数
CREATE OR REPLACE FUNCTION get_cached_top_10_threshold()
RETURNS DECIMAL
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_threshold DECIMAL;
BEGIN
  -- Just return cached value (no refresh)
  SELECT threshold 
  INTO v_threshold
  FROM cached_top_10_threshold;
  
  RETURN COALESCE(v_threshold, 0);
END;
$$;

COMMENT ON FUNCTION get_cached_top_10_threshold IS 
  'Returns cached Top 10% threshold. Cache is refreshed by scheduled job, not on-demand.';

-- 2.4 更新 get_top_10_percent_threshold 使用缓存
CREATE OR REPLACE FUNCTION get_top_10_percent_threshold()
RETURNS DECIMAL
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN get_cached_top_10_threshold();
END;
$$;

-- 2.5 智能分发性能索引
-- 复合索引
CREATE INDEX IF NOT EXISTS idx_markets_smart_distribution 
  ON markets(status, visibility, closes_at DESC, title, question, description, reward_pool, funding_type, funding_goal, funding_current, funding_progress, required_niche_tags, requires_nda, min_reputation, created_by, allowed_viewers, created_at)
  WHERE status IN ('pending', 'active');

-- 领域标签重叠查询索引
CREATE INDEX IF NOT EXISTS idx_markets_niche_overlap 
  ON markets USING GIN(required_niche_tags)
  WHERE status IN ('pending', 'active') AND required_niche_tags IS NOT NULL;

-- 私密任务访问检查索引
CREATE INDEX IF NOT EXISTS idx_markets_private_access 
  ON markets(visibility, min_reputation, status)
  WHERE visibility = 'private' AND status IN ('pending', 'active');

-- 2.6 慢查询监控视图
CREATE OR REPLACE VIEW slow_queries AS
SELECT 
  query,
  calls,
  total_exec_time,
  mean_exec_time,
  max_exec_time,
  stddev_exec_time,
  rows
FROM pg_stat_statements
WHERE mean_exec_time > 100 -- queries taking more than 100ms on average
ORDER BY mean_exec_time DESC
LIMIT 20;

COMMENT ON VIEW slow_queries IS 
  'Monitors slow queries (>100ms average). Requires pg_stat_statements extension.';

-- 2.7 初始刷新物化视图
REFRESH MATERIALIZED VIEW cached_top_10_threshold;


-- ============================================================================
-- PART 3: markets 表增加 pending 状态支持
-- ============================================================================

-- 修改 status 字段的约束，添加 'pending' 状态
ALTER TABLE markets 
DROP CONSTRAINT IF EXISTS status_valid;

ALTER TABLE markets 
ADD CONSTRAINT status_valid CHECK (status IN ('pending', 'active', 'closed', 'resolved'));

-- 添加注释说明各状态含义
COMMENT ON COLUMN markets.status IS '
任务状态：
- pending: 等待中（众筹未完成或等待agent参与）
- active: 活跃中（可以提交预言）
- closed: 已关闭（不再接受预言提交）
- resolved: 已兑现（结果已确定）
';


-- ============================================================================
-- PART 4: markets 表增加任务类别和客户类型字段
-- ============================================================================

-- 4.1 添加新字段
ALTER TABLE markets ADD COLUMN IF NOT EXISTS task_category TEXT DEFAULT 'prediction' CHECK (task_category IN ('prediction', 'research'));
ALTER TABLE markets ADD COLUMN IF NOT EXISTS task_type TEXT DEFAULT 'consumer' CHECK (task_type IN ('consumer', 'business'));
ALTER TABLE markets ADD COLUMN IF NOT EXISTS result_visibility TEXT DEFAULT 'public' CHECK (result_visibility IN ('public', 'private'));
ALTER TABLE markets ADD COLUMN IF NOT EXISTS priority_level TEXT DEFAULT 'standard' CHECK (priority_level IN ('standard', 'high', 'urgent'));

-- 4.2 添加索引
CREATE INDEX IF NOT EXISTS idx_markets_task_category ON markets(task_category);
CREATE INDEX IF NOT EXISTS idx_markets_task_type ON markets(task_type);
CREATE INDEX IF NOT EXISTS idx_markets_result_visibility ON markets(result_visibility);
CREATE INDEX IF NOT EXISTS idx_markets_priority_level ON markets(priority_level);

-- 4.3 调整字段约束：closes_at 和 resolution_criteria 改为可选
ALTER TABLE markets ALTER COLUMN closes_at DROP NOT NULL;
ALTER TABLE markets ALTER COLUMN resolution_criteria DROP NOT NULL;

-- 4.4 添加条件约束：预言任务必须有截止时间和兑现标准
ALTER TABLE markets DROP CONSTRAINT IF EXISTS prediction_requires_deadline;
ALTER TABLE markets ADD CONSTRAINT prediction_requires_deadline 
  CHECK (task_category != 'prediction' OR closes_at IS NOT NULL);

ALTER TABLE markets DROP CONSTRAINT IF EXISTS prediction_requires_resolution;
ALTER TABLE markets ADD CONSTRAINT prediction_requires_resolution 
  CHECK (task_category != 'prediction' OR resolution_criteria IS NOT NULL);

-- 4.5 更新现有数据：将所有现有任务标记为预言任务和C端任务
UPDATE markets 
SET task_category = 'prediction', 
    task_type = 'consumer'
WHERE task_category IS NULL OR task_type IS NULL;

-- 4.6 添加注释
COMMENT ON COLUMN markets.task_category IS '任务类别：prediction(预言任务) 或 research(调查任务)';
COMMENT ON COLUMN markets.task_type IS '客户类型：consumer(C端个人用户) 或 business(B端企业客户)';
COMMENT ON COLUMN markets.result_visibility IS '结果可见性：public(公开) 或 private(私密)';
COMMENT ON COLUMN markets.priority_level IS '优先级：standard(标准) / high(高) / urgent(紧急)';


-- ============================================================================
-- PART 5: 性能测试函数
-- ============================================================================

-- 5.1 搜索性能测试
CREATE OR REPLACE FUNCTION test_search_performance(
  p_query TEXT,
  p_iterations INTEGER DEFAULT 10
)
RETURNS TABLE (
  iteration INTEGER,
  execution_time_ms DECIMAL,
  results_returned BIGINT
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_start_time TIMESTAMPTZ;
  v_end_time TIMESTAMPTZ;
  v_result_count BIGINT;
  v_iteration INTEGER;
BEGIN
  FOR v_iteration IN 1..p_iterations LOOP
    v_start_time := clock_timestamp();
    
    SELECT COUNT(*) INTO v_result_count
    FROM search_predictions_optimized(p_query, 20, 0);
    
    v_end_time := clock_timestamp();
    
    RETURN QUERY SELECT 
      v_iteration,
      EXTRACT(MILLISECONDS FROM (v_end_time - v_start_time))::DECIMAL,
      v_result_count;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION test_search_performance IS 
  'Performance testing function for search. Runs multiple iterations and returns execution time for each.';

-- 5.2 智能分发性能测试
CREATE OR REPLACE FUNCTION test_smart_distribution_performance(
  p_agent_id UUID,
  p_iterations INTEGER DEFAULT 10
)
RETURNS TABLE (
  iteration INTEGER,
  execution_time_ms DECIMAL,
  tasks_returned INTEGER
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_start_time TIMESTAMPTZ;
  v_end_time TIMESTAMPTZ;
  v_task_count INTEGER;
  v_iteration INTEGER;
BEGIN
  FOR v_iteration IN 1..p_iterations LOOP
    v_start_time := clock_timestamp();
    
    SELECT COUNT(*) INTO v_task_count
    FROM get_smart_distributed_tasks(p_agent_id, 50);
    
    v_end_time := clock_timestamp();
    
    RETURN QUERY SELECT 
      v_iteration,
      EXTRACT(MILLISECONDS FROM (v_end_time - v_start_time))::DECIMAL,
      v_task_count;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION test_smart_distribution_performance IS 
  'Performance testing function for smart distribution. Runs multiple iterations and returns execution time for each.';


-- ============================================================================
-- PART 6: 统计信息更新
-- ============================================================================

ANALYZE markets;
ANALYZE predictions;
