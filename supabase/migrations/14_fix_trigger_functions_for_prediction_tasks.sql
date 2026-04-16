-- ============================================================================
-- Migration 14: Fix ALL trigger/utility functions to use prediction_tasks
-- Date: 2026-04-09
--
-- Background:
--   Migration 09 created functions referencing search_tasks (renamed from markets).
--   Migration 11 created notify_participant_threshold_reached() referencing search_tasks.
--   Migration 12 renamed search_tasks → prediction_tasks (TABLE ONLY, not functions).
--   This migration recreates ALL affected functions with the correct table name.
--
-- Root cause of "relation search_tasks does not exist" on DELETE signal_submissions:
--   update_task_signal_submission_count() fires AFTER INSERT OR DELETE and runs
--   UPDATE search_tasks — which no longer exists after migration 12.
-- ============================================================================

-- ============================================================================
-- FIX 1 (CRITICAL): update_task_signal_submission_count
-- Fires: AFTER INSERT OR DELETE ON signal_submissions
-- Bug:   UPDATE search_tasks (should be prediction_tasks)
-- ============================================================================
CREATE OR REPLACE FUNCTION update_task_signal_submission_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE prediction_tasks
    SET signal_submission_count = signal_submission_count + 1
    WHERE id = NEW.task_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE prediction_tasks
    SET signal_submission_count = GREATEST(signal_submission_count - 1, 0)
    WHERE id = OLD.task_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_task_signal_submission_count ON signal_submissions;
CREATE TRIGGER trigger_update_task_signal_submission_count
  AFTER INSERT OR DELETE ON signal_submissions
  FOR EACH ROW
  EXECUTE FUNCTION update_task_signal_submission_count();

-- ============================================================================
-- FIX 2: notify_participant_threshold_reached
-- Fires: AFTER INSERT ON signal_submissions
-- Bug:   UPDATE/SELECT search_tasks (should be prediction_tasks)
-- ============================================================================
CREATE OR REPLACE FUNCTION notify_participant_threshold_reached()
RETURNS TRIGGER AS $$
DECLARE
  v_target          INTEGER;
  v_new_count       INTEGER;
  v_analysis_status TEXT;
  v_is_first_sub    BOOLEAN;
BEGIN
  SELECT NOT EXISTS (
    SELECT 1 FROM signal_submissions
    WHERE task_id = NEW.task_id
      AND user_id = NEW.user_id
      AND id <> NEW.id
  ) INTO v_is_first_sub;

  IF v_is_first_sub THEN
    UPDATE prediction_tasks
    SET current_participant_count = current_participant_count + 1,
        updated_at = NOW()
    WHERE id = NEW.task_id
    RETURNING current_participant_count, target_agent_count, causal_analysis_status
      INTO v_new_count, v_target, v_analysis_status;
  ELSE
    SELECT current_participant_count, target_agent_count, causal_analysis_status
    INTO v_new_count, v_target, v_analysis_status
    FROM prediction_tasks
    WHERE id = NEW.task_id;
  END IF;

  IF v_target IS NOT NULL
     AND v_new_count >= v_target
     AND v_analysis_status NOT IN ('pending', 'processing')
  THEN
    UPDATE prediction_tasks
    SET causal_analysis_status = 'pending',
        updated_at = NOW()
    WHERE id = NEW.task_id
      AND status = 'active';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_participant_threshold ON signal_submissions;
CREATE TRIGGER trigger_participant_threshold
  AFTER INSERT ON signal_submissions
  FOR EACH ROW
  EXECUTE FUNCTION notify_participant_threshold_reached();

-- ============================================================================
-- FIX 3: Ensure trigger_task_closed_analysis is on prediction_tasks
-- ============================================================================
DROP TRIGGER IF EXISTS trigger_task_closed_analysis ON prediction_tasks;
CREATE TRIGGER trigger_task_closed_analysis
  BEFORE UPDATE ON prediction_tasks
  FOR EACH ROW
  EXECUTE FUNCTION notify_task_closed_trigger_analysis();

-- ============================================================================
-- FIX 4: auto_close_expired_tasks
-- Bug: UPDATE search_tasks (should be prediction_tasks)
-- ============================================================================
CREATE OR REPLACE FUNCTION auto_close_expired_tasks()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  updated_count INTEGER;
BEGIN
  UPDATE prediction_tasks
  SET
    status = 'closed',
    updated_at = NOW()
  WHERE
    status = 'active'
    AND closes_at <= NOW()
    AND closes_at IS NOT NULL;

  GET DIAGNOSTICS updated_count = ROW_COUNT;

  IF updated_count > 0 THEN
    RAISE NOTICE '自动关闭了 % 个过期任务', updated_count;
  END IF;

  RETURN updated_count;
END;
$$;

-- ============================================================================
-- FIX 5: trigger_task_auto_close
-- Bug: FROM search_tasks (should be prediction_tasks)
-- ============================================================================
DROP FUNCTION IF EXISTS trigger_task_auto_close();
CREATE OR REPLACE FUNCTION trigger_task_auto_close()
RETURNS TABLE(closed_count INTEGER, closed_task_ids UUID[])
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  updated_count INTEGER;
  task_ids UUID[];
BEGIN
  SELECT ARRAY_AGG(id) INTO task_ids
  FROM prediction_tasks
  WHERE status = 'active'
    AND closes_at <= NOW()
    AND closes_at IS NOT NULL;

  updated_count := auto_close_expired_tasks();

  RETURN QUERY SELECT updated_count, task_ids;
END;
$$;

-- ============================================================================
-- FIX 6: resolve_task_transaction
-- Bug: SELECT/UPDATE search_tasks (should be prediction_tasks)
-- ============================================================================
DROP FUNCTION IF EXISTS resolve_task_transaction(UUID, BOOLEAN, UUID);
CREATE OR REPLACE FUNCTION resolve_task_transaction(
  p_task_id UUID,
  p_outcome BOOLEAN,
  p_admin_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_task RECORD;
  v_submission RECORD;
  v_participant_count INT := 0;
  v_reward_per_participant NUMERIC := 0;
  v_total_rewards NUMERIC := 0;
  v_result JSONB;
BEGIN
  SELECT * INTO v_task
  FROM prediction_tasks
  WHERE id = p_task_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION '任务不存在'; END IF;
  IF v_task.status = 'resolved' THEN RAISE EXCEPTION '任务已经结算'; END IF;

  SELECT COUNT(DISTINCT user_id) INTO v_participant_count
  FROM signal_submissions
  WHERE task_id = p_task_id AND status = 'submitted';

  IF v_participant_count > 0 THEN
    v_reward_per_participant := v_task.reward_pool / v_participant_count;
  END IF;

  FOR v_submission IN
    SELECT DISTINCT user_id FROM signal_submissions
    WHERE task_id = p_task_id AND status = 'submitted'
  LOOP
    PERFORM update_user_reputation_and_earnings(
      v_submission.user_id, 10, v_reward_per_participant
    );
    UPDATE signal_submissions
    SET reward_earned = v_reward_per_participant
    WHERE task_id = p_task_id AND user_id = v_submission.user_id AND status = 'submitted';
  END LOOP;

  UPDATE prediction_tasks
  SET status = 'resolved',
      actual_outcome = CASE WHEN p_outcome THEN 1 ELSE 0 END,
      updated_at = NOW()
  WHERE id = p_task_id;

  PERFORM log_audit(
    p_admin_id, 'resolve', 'task', p_task_id,
    to_jsonb(v_task),
    jsonb_build_object('status', 'resolved', 'outcome', p_outcome),
    jsonb_build_object('total_submissions', v_participant_count, 'reward_per_participant', v_reward_per_participant)
  );

  v_total_rewards := v_reward_per_participant * v_participant_count;
  v_result := jsonb_build_object(
    'success', true, 'task_id', p_task_id, 'outcome', p_outcome,
    'total_submissions', v_participant_count,
    'reward_per_participant', v_reward_per_participant,
    'total_rewards_distributed', v_total_rewards
  );

  RETURN v_result;

EXCEPTION
  WHEN OTHERS THEN RAISE EXCEPTION '任务结算失败: %', SQLERRM;
END;
$$;

-- ============================================================================
-- FIX 7: delete_user_account
-- Bug: DELETE FROM simulations WHERE task_id IN (SELECT id FROM search_tasks ...)
-- ============================================================================
CREATE OR REPLACE FUNCTION delete_user_account(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deleted_submissions INT;
  v_deleted_simulations INT;
  v_deleted_redemptions INT;
  v_result JSONB;
BEGIN
  PERFORM log_audit(
    p_user_id, 'delete', 'account', p_user_id,
    jsonb_build_object('user_id', p_user_id), NULL,
    jsonb_build_object('deleted_at', NOW())
  );

  DELETE FROM signal_submissions WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_deleted_submissions = ROW_COUNT;

  DELETE FROM simulations WHERE task_id IN (
    SELECT id FROM prediction_tasks WHERE created_by = p_user_id
  );
  GET DIAGNOSTICS v_deleted_simulations = ROW_COUNT;

  DELETE FROM redemption_attempts WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_deleted_redemptions = ROW_COUNT;

  DELETE FROM profiles WHERE id = p_user_id;

  v_result := jsonb_build_object(
    'success', true,
    'deleted_submissions', v_deleted_submissions,
    'deleted_simulations', v_deleted_simulations,
    'deleted_redemptions', v_deleted_redemptions,
    'deleted_at', NOW()
  );

  RETURN v_result;

EXCEPTION
  WHEN OTHERS THEN RAISE EXCEPTION '删除账号失败: %', SQLERRM;
END;
$$;

-- ============================================================================
-- FIX 8: search_signals_optimized
-- Bug: FROM search_tasks m (should be prediction_tasks)
-- ============================================================================
DROP FUNCTION IF EXISTS search_signals_optimized(TEXT, INTEGER, INTEGER);
CREATE OR REPLACE FUNCTION search_signals_optimized(
  p_query TEXT,
  p_limit INTEGER DEFAULT 20,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  task_id UUID, title TEXT, question TEXT, description TEXT,
  status TEXT, actual_outcome DECIMAL(3, 2), submission_count BIGINT,
  created_at TIMESTAMPTZ, resolved_at TIMESTAMPTZ, relevance_score DECIMAL(5, 3)
)
LANGUAGE plpgsql STABLE
AS $$
BEGIN
  RETURN QUERY
  WITH search_results AS (
    SELECT m.id, m.title, m.question, m.description, m.status, m.actual_outcome,
           m.created_at, m.resolves_at,
           ts_rank(to_tsvector('english', m.title || ' ' || m.description),
                   websearch_to_tsquery('english', p_query)) AS text_rank
    FROM prediction_tasks m
    WHERE m.status IN ('closed', 'resolved')
      AND to_tsvector('english', m.title || ' ' || m.description) @@
          websearch_to_tsquery('english', p_query)
  ),
  submission_stats AS (
    SELECT ss.task_id, COUNT(*) AS sub_count
    FROM signal_submissions ss
    WHERE ss.task_id IN (SELECT id FROM search_results) AND ss.status = 'submitted'
    GROUP BY ss.task_id
  )
  SELECT sr.id AS task_id, sr.title, sr.question, sr.description, sr.status,
         sr.actual_outcome, COALESCE(sub_s.sub_count, 0) AS submission_count,
         sr.created_at, sr.resolves_at AS resolved_at,
         ((sr.text_rank * 0.5) +
          (LEAST(COALESCE(sub_s.sub_count, 0) / 100.0, 1) * 0.3) +
          (CASE WHEN sr.status = 'resolved' THEN 0.2 ELSE 0 END))::DECIMAL(5, 3) AS relevance_score
  FROM search_results sr
  LEFT JOIN submission_stats sub_s ON sr.id = sub_s.task_id
  ORDER BY relevance_score DESC, sr.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

-- ============================================================================
-- FIX 9: search_signals_count
-- Bug: FROM search_tasks m (should be prediction_tasks)
-- ============================================================================
DROP FUNCTION IF EXISTS search_signals_count(TEXT);
CREATE OR REPLACE FUNCTION search_signals_count(p_query TEXT)
RETURNS BIGINT
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_count BIGINT;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM prediction_tasks m
  WHERE m.status IN ('closed', 'resolved')
    AND to_tsvector('english', m.title || ' ' || m.description) @@
        websearch_to_tsquery('english', p_query);
  RETURN v_count;
END;
$$;

-- ============================================================================
-- FIX 10: get_search_suggestions
-- Bug: FROM search_tasks m (should be prediction_tasks)
-- ============================================================================
DROP FUNCTION IF EXISTS get_search_suggestions(TEXT, INTEGER);
CREATE OR REPLACE FUNCTION get_search_suggestions(
  p_prefix TEXT,
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (suggestion TEXT, task_count BIGINT)
LANGUAGE plpgsql STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT m.title AS suggestion, COUNT(*) AS task_count
  FROM prediction_tasks m
  WHERE m.status IN ('closed', 'resolved') AND m.title ILIKE p_prefix || '%'
  GROUP BY m.title
  ORDER BY task_count DESC, m.title
  LIMIT p_limit;
END;
$$;

-- ============================================================================
-- Comments
-- ============================================================================
COMMENT ON FUNCTION update_task_signal_submission_count
  IS 'v3.0 自动维护 prediction_tasks.signal_submission_count（已从search_tasks更新）';
COMMENT ON FUNCTION notify_participant_threshold_reached
  IS 'v3.0 当唯一参与 agent 数达到 target_agent_count 时触发因果分析（已从search_tasks更新）';
