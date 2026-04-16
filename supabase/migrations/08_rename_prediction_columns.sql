-- ============================================================================
-- Migration 08: Rename all prediction references to submission/signal (v3.0)
--
-- 前置条件：已运行 migration 07（predictions 表已删除）
-- 此迁移合并了原 08（列名重命名）和原 09（枚举/约束/RPC/函数 重命名），
-- 将所有遗留的 prediction 引用统一为 submission/signal。
--
-- 变更内容：
-- PART A: 列名重命名
--   A1: profiles 表列
--   A2: profiles 表约束
--   A3: profiles 排行榜索引
--   A4: reputation_levels 列
--   A5: simulations 列和约束
--   A6: markets 列
-- PART B: 枚举/约束/数据重命名
--   B1: task_category 枚举值 prediction → signal
--   B2: markets 约束名重命名
--   B3: reputation_history reason 键值
-- PART C: 函数/视图/RPC 重建
--   C1: notify_new_signal_submission 函数（使用新列名）
--   C2: markets_pending_analysis 视图
--   C3: update_user_reputation_and_earnings 函数（使用新 reason 键）
--   C4: search_signals_optimized / search_signals_count RPC
--   C5: 删除旧 search_predictions_* 函数
-- ============================================================================


-- ============================================================================
-- PART A1: 重命名 profiles 表的列
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'prediction_count') THEN
    ALTER TABLE profiles RENAME COLUMN prediction_count TO submission_count;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'total_predictions') THEN
    ALTER TABLE profiles RENAME COLUMN total_predictions TO total_submissions;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'correct_predictions') THEN
    ALTER TABLE profiles RENAME COLUMN correct_predictions TO correct_submissions;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'daily_prediction_count') THEN
    ALTER TABLE profiles RENAME COLUMN daily_prediction_count TO daily_submission_count;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'last_prediction_at') THEN
    ALTER TABLE profiles RENAME COLUMN last_prediction_at TO last_submission_at;
  END IF;
END $$;


-- ============================================================================
-- PART A2: 重命名 profiles 表的约束
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'prediction_count_non_negative' AND table_name = 'profiles'
  ) THEN
    ALTER TABLE profiles DROP CONSTRAINT prediction_count_non_negative;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'submission_count_non_negative' AND table_name = 'profiles'
  ) THEN
    ALTER TABLE profiles ADD CONSTRAINT submission_count_non_negative CHECK (submission_count >= 0);
  END IF;
END $$;


-- ============================================================================
-- PART A3: 重建 profiles 排行榜索引（使用新列名）
-- ============================================================================

DROP INDEX IF EXISTS idx_profiles_leaderboard;
CREATE INDEX IF NOT EXISTS idx_profiles_leaderboard
  ON profiles(reputation_score DESC)
  INCLUDE (username, avatar_url, submission_count, total_earnings)
  WHERE status = 'active' AND reputation_score >= 200;


-- ============================================================================
-- PART A4: 重命名 reputation_levels 表的列
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'reputation_levels' AND column_name = 'daily_prediction_limit') THEN
    ALTER TABLE reputation_levels RENAME COLUMN daily_prediction_limit TO daily_submission_limit;
  END IF;
END $$;


-- ============================================================================
-- PART A5: 重命名 simulations 表的列和约束
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'simulations' AND column_name = 'prediction_count') THEN
    ALTER TABLE simulations RENAME COLUMN prediction_count TO submission_count;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'prediction_count_positive' AND table_name = 'simulations'
  ) THEN
    ALTER TABLE simulations DROP CONSTRAINT prediction_count_positive;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'submission_count_positive' AND table_name = 'simulations'
  ) THEN
    ALTER TABLE simulations ADD CONSTRAINT submission_count_positive CHECK (submission_count IS NULL OR submission_count > 0);
  END IF;
END $$;


-- ============================================================================
-- PART A6: 重命名 markets 表的列
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'markets' AND column_name = 'prediction_count_at_last_analysis') THEN
    ALTER TABLE markets RENAME COLUMN prediction_count_at_last_analysis TO submission_count_at_last_analysis;
  END IF;
END $$;


-- ============================================================================
-- PART B1: 重命名 task_category 枚举值 prediction → signal
-- ============================================================================

UPDATE markets SET task_category = 'signal' WHERE task_category = 'prediction';

ALTER TABLE markets DROP CONSTRAINT IF EXISTS markets_task_category_check;
ALTER TABLE markets ADD CONSTRAINT markets_task_category_check
  CHECK (task_category IN ('signal', 'research'));

ALTER TABLE markets ALTER COLUMN task_category SET DEFAULT 'signal';
COMMENT ON COLUMN markets.task_category IS '任务类别：signal(信号分析任务) 或 research(调查任务)';


-- ============================================================================
-- PART B2: 重命名 markets 约束名
-- ============================================================================

ALTER TABLE markets DROP CONSTRAINT IF EXISTS prediction_requires_deadline;
ALTER TABLE markets ADD CONSTRAINT signal_requires_deadline
  CHECK (task_category != 'signal' OR closes_at IS NOT NULL);

ALTER TABLE markets DROP CONSTRAINT IF EXISTS prediction_requires_resolution;
ALTER TABLE markets ADD CONSTRAINT signal_requires_resolution
  CHECK (task_category != 'signal' OR resolution_criteria IS NOT NULL);


-- ============================================================================
-- PART B3: 重命名 reputation_history reason 键值
-- ============================================================================

UPDATE reputation_history SET reason = 'submission_correct' WHERE reason = 'prediction_correct';
UPDATE reputation_history SET reason = 'submission_wrong' WHERE reason = 'prediction_wrong';


-- ============================================================================
-- PART C1: 重建 notify_new_signal_submission 函数（使用新列名）
-- ============================================================================

CREATE OR REPLACE FUNCTION notify_new_signal_submission()
RETURNS TRIGGER AS $$
DECLARE
  current_count INTEGER;
  last_count INTEGER;
BEGIN
  IF NEW.status != 'submitted' THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO current_count
  FROM signal_submissions
  WHERE task_id = NEW.task_id AND status = 'submitted';

  SELECT COALESCE(submission_count_at_last_analysis, 0) INTO last_count
  FROM markets
  WHERE id = NEW.task_id;

  -- 每5条新数据触发一次因果分析
  IF current_count - last_count >= 5 OR last_count = 0 THEN
    UPDATE markets
    SET causal_analysis_status = 'pending',
        updated_at = NOW()
    WHERE id = NEW.task_id
      AND status = 'active'
      AND causal_analysis_status != 'processing';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ============================================================================
-- PART C2: 重建 markets_pending_analysis 视图（使用新列名）
-- ============================================================================

DROP VIEW IF EXISTS markets_pending_analysis CASCADE;
CREATE VIEW markets_pending_analysis AS
SELECT
  m.id,
  m.title,
  m.question,
  m.description,
  m.status,
  m.causal_analysis_status,
  m.last_analysis_at,
  m.submission_count_at_last_analysis,
  m.signal_submission_count,
  COUNT(ss.id) AS current_submission_count,
  COUNT(ss.id) - COALESCE(m.submission_count_at_last_analysis, 0) AS new_submission_count,
  MAX(ss.submitted_at) AS latest_submission_at
FROM markets m
LEFT JOIN signal_submissions ss ON ss.task_id = m.id AND ss.status = 'submitted'
WHERE m.status = 'active'
  AND m.causal_analysis_status = 'pending'
GROUP BY m.id
ORDER BY new_submission_count DESC;


-- ============================================================================
-- PART C3: 重建 update_user_reputation_and_earnings（使用新 reason 键）
-- ============================================================================

CREATE OR REPLACE FUNCTION update_user_reputation_and_earnings(
  p_user_id UUID,
  p_reputation_change INTEGER,
  p_earnings_change DECIMAL(10, 2) DEFAULT 0
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_old_reputation DECIMAL(10, 2);
  v_new_reputation DECIMAL(10, 2);
BEGIN
  SELECT reputation_score INTO v_old_reputation
  FROM profiles
  WHERE id = p_user_id;

  v_new_reputation := GREATEST(0, v_old_reputation + p_reputation_change);

  UPDATE profiles
  SET reputation_score = v_new_reputation,
      total_earnings = total_earnings + COALESCE(p_earnings_change, 0)
  WHERE id = p_user_id;

  INSERT INTO reputation_history (agent_id, change_amount, reason, old_score, new_score)
  VALUES (
    p_user_id,
    p_reputation_change,
    CASE 
      WHEN p_reputation_change > 0 THEN 'submission_correct'
      ELSE 'submission_wrong'
    END,
    v_old_reputation,
    v_new_reputation
  );
END;
$$;

COMMENT ON FUNCTION update_user_reputation_and_earnings IS
  '更新用户信誉分和收益。reason 使用 submission_correct/submission_wrong（v3.0）。';


-- ============================================================================
-- PART C4: 重建搜索 RPC 函数 search_signals_*
-- ============================================================================

DROP FUNCTION IF EXISTS search_signals_optimized(TEXT, INTEGER, INTEGER);
CREATE OR REPLACE FUNCTION search_signals_optimized(
  p_query TEXT,
  p_limit INTEGER DEFAULT 20,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE(
  task_id UUID,
  title TEXT,
  question TEXT,
  description TEXT,
  status TEXT,
  created_at TIMESTAMPTZ,
  closes_at TIMESTAMPTZ,
  reward_pool NUMERIC,
  visibility TEXT,
  task_category TEXT,
  task_type TEXT,
  submission_count BIGINT,
  consensus_probability NUMERIC,
  relevance_score REAL
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id AS task_id,
    m.title,
    m.question,
    m.description,
    m.status,
    m.created_at,
    m.closes_at,
    m.reward_pool,
    m.visibility,
    m.task_category,
    m.task_type,
    COALESCE(m.signal_submission_count, 0)::BIGINT AS submission_count,
    NULL::NUMERIC AS consensus_probability,
    ts_rank_cd(
      to_tsvector('english', COALESCE(m.title, '') || ' ' || COALESCE(m.question, '') || ' ' || COALESCE(m.description, '')),
      plainto_tsquery('english', p_query)
    ) AS relevance_score
  FROM markets m
  WHERE
    to_tsvector('english', COALESCE(m.title, '') || ' ' || COALESCE(m.question, '') || ' ' || COALESCE(m.description, ''))
    @@ plainto_tsquery('english', p_query)
  ORDER BY
    CASE WHEN m.status = 'resolved' THEN 0
         WHEN m.status = 'active'   THEN 1
         WHEN m.status = 'closed'   THEN 2
         ELSE 3
    END,
    relevance_score DESC,
    m.signal_submission_count DESC NULLS LAST,
    m.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

COMMENT ON FUNCTION search_signals_optimized IS
  'v3.0: 市场搜索函数，基于 signal_submissions 统计。';

DROP FUNCTION IF EXISTS search_signals_count(TEXT);
CREATE OR REPLACE FUNCTION search_signals_count(
  p_query TEXT
)
RETURNS BIGINT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_count BIGINT;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM markets m
  WHERE
    to_tsvector('english', COALESCE(m.title, '') || ' ' || COALESCE(m.question, '') || ' ' || COALESCE(m.description, ''))
    @@ plainto_tsquery('english', p_query);

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION search_signals_count IS
  '搜索结果计数函数（v3.0）。';


-- ============================================================================
-- PART C5: 删除旧 search_predictions_* 函数
-- ============================================================================

DROP FUNCTION IF EXISTS search_predictions_optimized(TEXT, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS search_predictions_count(TEXT);


-- ============================================================================
-- 确认完成
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Migration 08: All prediction references renamed to submission/signal (v3.0)';
  RAISE NOTICE '   列名: profiles(5列), reputation_levels(1列), simulations(1列), markets(1列)';
  RAISE NOTICE '   约束: profiles(1), simulations(1), markets(3)';
  RAISE NOTICE '   枚举: task_category prediction→signal';
  RAISE NOTICE '   数据: reputation_history reason 键值';
  RAISE NOTICE '   函数: notify_new_signal_submission, update_user_reputation_and_earnings';
  RAISE NOTICE '   RPC:  search_signals_optimized, search_signals_count';
  RAISE NOTICE '   视图: markets_pending_analysis';
END;
$$;
