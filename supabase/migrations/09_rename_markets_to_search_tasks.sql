-- ============================================================================
-- Migration 09: Rename markets table → search_tasks
-- 将 markets 表重命名为 search_tasks，并同步更新所有关联对象
-- ============================================================================

-- ============================================================================
-- STEP 1: Rename table (FK constraints using OID update automatically)
-- ============================================================================

ALTER TABLE markets RENAME TO search_tasks;

-- ============================================================================
-- STEP 2: Rename indexes
-- ============================================================================

ALTER INDEX IF EXISTS idx_markets_status                RENAME TO idx_search_tasks_status;
ALTER INDEX IF EXISTS idx_markets_closes_at             RENAME TO idx_search_tasks_closes_at;
ALTER INDEX IF EXISTS idx_markets_created_by            RENAME TO idx_search_tasks_created_by;
ALTER INDEX IF EXISTS idx_markets_created_at            RENAME TO idx_search_tasks_created_at;
ALTER INDEX IF EXISTS idx_markets_is_calibration        RENAME TO idx_search_tasks_is_calibration;
ALTER INDEX IF EXISTS idx_markets_status_created        RENAME TO idx_search_tasks_status_created;
ALTER INDEX IF EXISTS idx_markets_status_closes         RENAME TO idx_search_tasks_status_closes;
ALTER INDEX IF EXISTS idx_markets_active                RENAME TO idx_search_tasks_active;
ALTER INDEX IF EXISTS idx_markets_closed                RENAME TO idx_search_tasks_closed;
ALTER INDEX IF EXISTS idx_markets_resolved              RENAME TO idx_search_tasks_resolved;
ALTER INDEX IF EXISTS idx_markets_card_data             RENAME TO idx_search_tasks_card_data;
ALTER INDEX IF EXISTS idx_markets_search                RENAME TO idx_search_tasks_search;
ALTER INDEX IF EXISTS idx_markets_visibility            RENAME TO idx_search_tasks_visibility;
ALTER INDEX IF EXISTS idx_markets_funding_type          RENAME TO idx_search_tasks_funding_type;
ALTER INDEX IF EXISTS idx_markets_required_niche_tags   RENAME TO idx_search_tasks_required_niche_tags;
ALTER INDEX IF EXISTS idx_markets_min_reputation        RENAME TO idx_search_tasks_min_reputation;
ALTER INDEX IF EXISTS idx_markets_funding_progress      RENAME TO idx_search_tasks_funding_progress;
ALTER INDEX IF EXISTS idx_markets_task_category         RENAME TO idx_search_tasks_task_category;
ALTER INDEX IF EXISTS idx_markets_task_type             RENAME TO idx_search_tasks_task_type;
ALTER INDEX IF EXISTS idx_markets_result_visibility     RENAME TO idx_search_tasks_result_visibility;
ALTER INDEX IF EXISTS idx_markets_priority_level        RENAME TO idx_search_tasks_priority_level;
ALTER INDEX IF EXISTS idx_markets_causal_status         RENAME TO idx_search_tasks_causal_status;
ALTER INDEX IF EXISTS idx_markets_fulltext_combined     RENAME TO idx_search_tasks_fulltext_combined;
ALTER INDEX IF EXISTS idx_markets_search_ordering       RENAME TO idx_search_tasks_search_ordering;

-- ============================================================================
-- STEP 3: Rename triggers
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_markets_updated_at') THEN
    ALTER TRIGGER update_markets_updated_at ON search_tasks RENAME TO update_search_tasks_updated_at;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_auto_activate_crowdfunded_market') THEN
    ALTER TRIGGER trigger_auto_activate_crowdfunded_market ON search_tasks RENAME TO trigger_auto_activate_crowdfunded_task;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'market_status_change_trigger') THEN
    ALTER TRIGGER market_status_change_trigger ON search_tasks RENAME TO task_status_change_trigger;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'audit_markets_trigger') THEN
    ALTER TRIGGER audit_markets_trigger ON search_tasks RENAME TO audit_search_tasks_trigger;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_update_market_signal_submission_count') THEN
    ALTER TRIGGER trigger_update_market_signal_submission_count ON signal_submissions
      RENAME TO trigger_update_task_signal_submission_count;
  END IF;
END $$;

-- ============================================================================
-- STEP 4: Recreate functions whose SQL body references 'markets'
-- ============================================================================

-- 4.1 notify_new_signal_submission
CREATE OR REPLACE FUNCTION notify_new_signal_submission()
RETURNS TRIGGER AS $$
DECLARE
  current_count INTEGER;
  last_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO current_count
  FROM signal_submissions
  WHERE task_id = NEW.task_id;

  SELECT COALESCE(submission_count_at_last_analysis, 0) INTO last_count
  FROM search_tasks
  WHERE id = NEW.task_id;

  IF current_count - last_count >= 5 OR last_count = 0 THEN
    UPDATE search_tasks
    SET causal_analysis_status = 'pending',
        updated_at = NOW()
    WHERE id = NEW.task_id
      AND status = 'active'
      AND causal_analysis_status != 'processing';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4.2 update_task_signal_submission_count (renamed from update_market_signal_submission_count)
CREATE OR REPLACE FUNCTION update_task_signal_submission_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE search_tasks
    SET signal_submission_count = signal_submission_count + 1
    WHERE id = NEW.task_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE search_tasks
    SET signal_submission_count = GREATEST(signal_submission_count - 1, 0)
    WHERE id = OLD.task_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_market_signal_submission_count ON signal_submissions;
DROP TRIGGER IF EXISTS trigger_update_task_signal_submission_count ON signal_submissions;
CREATE TRIGGER trigger_update_task_signal_submission_count
  AFTER INSERT OR DELETE ON signal_submissions
  FOR EACH ROW
  EXECUTE FUNCTION update_task_signal_submission_count();

DROP FUNCTION IF EXISTS update_market_signal_submission_count();

-- 4.3 auto_close_expired_tasks (renamed)
CREATE OR REPLACE FUNCTION auto_close_expired_tasks()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  updated_count INTEGER;
BEGIN
  UPDATE search_tasks
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

-- Keep old name as backward-compat alias
CREATE OR REPLACE FUNCTION auto_close_expired_markets()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN RETURN auto_close_expired_tasks(); END; $$;

-- 4.4 trigger_task_auto_close (renamed from trigger_market_auto_close)
DROP FUNCTION IF EXISTS trigger_market_auto_close();
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
  FROM search_tasks
  WHERE status = 'active'
    AND closes_at <= NOW()
    AND closes_at IS NOT NULL;

  updated_count := auto_close_expired_tasks();
  RETURN QUERY SELECT updated_count, task_ids;
END;
$$;

-- 4.5 log_task_status_change (renamed from log_market_status_change)
CREATE OR REPLACE FUNCTION log_task_status_change()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO market_status_audit (task_id, old_status, new_status, changed_by)
    VALUES (NEW.id, OLD.status, NEW.status, 'auto_close_system');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS task_status_change_trigger ON search_tasks;
CREATE TRIGGER task_status_change_trigger
  AFTER UPDATE ON search_tasks
  FOR EACH ROW
  EXECUTE FUNCTION log_task_status_change();

DROP FUNCTION IF EXISTS log_market_status_change();

-- 4.6 audit_tasks_changes (renamed from audit_markets_changes)
CREATE OR REPLACE FUNCTION audit_tasks_changes()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM log_audit(NEW.created_by, 'create', 'task', NEW.id, NULL, to_jsonb(NEW), jsonb_build_object('trigger', 'auto'));
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status != NEW.status AND NEW.status = 'resolved' THEN
      PERFORM log_audit(auth.uid(), 'resolve', 'task', NEW.id, to_jsonb(OLD), to_jsonb(NEW),
        jsonb_build_object('trigger', 'auto', 'outcome', NEW.actual_outcome));
    ELSE
      PERFORM log_audit(auth.uid(), 'update', 'task', NEW.id, to_jsonb(OLD), to_jsonb(NEW),
        jsonb_build_object('trigger', 'auto'));
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM log_audit(auth.uid(), 'delete', 'task', OLD.id, to_jsonb(OLD), NULL,
      jsonb_build_object('trigger', 'auto'));
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS audit_search_tasks_trigger ON search_tasks;
CREATE TRIGGER audit_search_tasks_trigger
  AFTER INSERT OR UPDATE OR DELETE ON search_tasks
  FOR EACH ROW
  EXECUTE FUNCTION audit_tasks_changes();

DROP FUNCTION IF EXISTS audit_markets_changes();

-- 4.7 auto_activate_crowdfunded_task (renamed from auto_activate_crowdfunded_market)
CREATE OR REPLACE FUNCTION auto_activate_crowdfunded_task()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.funding_type = 'crowd'
     AND NEW.funding_current >= NEW.funding_goal
     AND NEW.status = 'pending' THEN
    NEW.status := 'active';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_auto_activate_crowdfunded_task ON search_tasks;
CREATE TRIGGER trigger_auto_activate_crowdfunded_task
  BEFORE UPDATE OF funding_current ON search_tasks
  FOR EACH ROW
  EXECUTE FUNCTION auto_activate_crowdfunded_task();

DROP FUNCTION IF EXISTS auto_activate_crowdfunded_market();

-- 4.8 can_access_private_task
DROP FUNCTION IF EXISTS can_access_private_task(UUID, UUID);
CREATE OR REPLACE FUNCTION can_access_private_task(p_agent_id UUID, p_task_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_task RECORD;
  v_agent RECORD;
  v_top_10_threshold DECIMAL;
BEGIN
  SELECT * INTO v_task FROM search_tasks WHERE id = p_task_id;

  IF v_task.visibility = 'public' THEN RETURN TRUE; END IF;
  IF v_task.created_by = p_agent_id THEN RETURN TRUE; END IF;
  IF p_agent_id = ANY(v_task.allowed_viewers) THEN RETURN TRUE; END IF;

  SELECT * INTO v_agent FROM profiles WHERE id = p_agent_id;

  IF v_agent.reputation_score < v_task.min_reputation THEN
    v_top_10_threshold := get_top_10_percent_threshold();
    IF v_agent.reputation_score < v_top_10_threshold THEN RETURN FALSE; END IF;
  END IF;

  IF v_task.required_niche_tags IS NOT NULL THEN
    IF NOT (v_task.required_niche_tags && v_agent.niche_tags) THEN RETURN FALSE; END IF;
  END IF;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql STABLE;

-- 4.9 resolve_market_transaction
DROP FUNCTION IF EXISTS resolve_market_transaction(UUID, BOOLEAN, UUID);
CREATE OR REPLACE FUNCTION resolve_market_transaction(
  p_task_id UUID,
  p_outcome BOOLEAN,
  p_admin_id UUID
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_task RECORD;
  v_submission RECORD;
  v_participant_count INT := 0;
  v_reward_per_participant NUMERIC := 0;
  v_total_rewards NUMERIC := 0;
  v_result JSONB;
BEGIN
  SELECT * INTO v_task FROM search_tasks WHERE id = p_task_id FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION '任务不存在'; END IF;
  IF v_task.status = 'resolved' THEN RAISE EXCEPTION '任务已经结算'; END IF;

  SELECT COUNT(DISTINCT user_id) INTO v_participant_count
  FROM signal_submissions WHERE task_id = p_task_id AND status = 'submitted';

  IF v_participant_count > 0 THEN
    v_reward_per_participant := v_task.reward_pool / v_participant_count;
  END IF;

  FOR v_submission IN
    SELECT DISTINCT user_id FROM signal_submissions
    WHERE task_id = p_task_id AND status = 'submitted'
  LOOP
    PERFORM update_user_reputation_and_earnings(v_submission.user_id, 10, v_reward_per_participant);
    UPDATE signal_submissions SET reward_earned = v_reward_per_participant
    WHERE task_id = p_task_id AND user_id = v_submission.user_id AND status = 'submitted';
  END LOOP;

  UPDATE search_tasks
  SET status = 'resolved',
      actual_outcome = CASE WHEN p_outcome THEN 1 ELSE 0 END,
      updated_at = NOW()
  WHERE id = p_task_id;

  PERFORM log_audit(p_admin_id, 'resolve', 'task', p_task_id, to_jsonb(v_task),
    jsonb_build_object('status', 'resolved', 'outcome', p_outcome),
    jsonb_build_object('total_submissions', v_participant_count, 'reward_per_participant', v_reward_per_participant));

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

-- 4.10 delete_user_account
CREATE OR REPLACE FUNCTION delete_user_account(p_user_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_deleted_submissions INT;
  v_deleted_simulations INT;
  v_deleted_redemptions INT;
  v_result JSONB;
BEGIN
  PERFORM log_audit(p_user_id, 'delete', 'account', p_user_id,
    jsonb_build_object('user_id', p_user_id), NULL,
    jsonb_build_object('deleted_at', NOW()));

  DELETE FROM signal_submissions WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_deleted_submissions = ROW_COUNT;

  DELETE FROM simulations WHERE task_id IN (
    SELECT id FROM search_tasks WHERE created_by = p_user_id
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
-- STEP 5: Recreate search functions
-- ============================================================================

DROP FUNCTION IF EXISTS search_signals_optimized(TEXT, INTEGER, INTEGER);
CREATE OR REPLACE FUNCTION search_signals_optimized(
  p_query TEXT,
  p_limit INTEGER DEFAULT 20,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  task_id UUID, title TEXT, question TEXT, description TEXT, status TEXT,
  actual_outcome DECIMAL(3, 2), submission_count BIGINT,
  created_at TIMESTAMPTZ, resolved_at TIMESTAMPTZ, relevance_score DECIMAL(5, 3)
)
LANGUAGE plpgsql STABLE AS $$
BEGIN
  RETURN QUERY
  WITH search_results AS (
    SELECT m.id, m.title, m.question, m.description, m.status, m.actual_outcome,
      m.created_at, m.resolves_at,
      ts_rank(to_tsvector('english', m.title || ' ' || m.description),
        websearch_to_tsquery('english', p_query)) AS text_rank
    FROM search_tasks m
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
    ((sr.text_rank * 0.5) + (LEAST(COALESCE(sub_s.sub_count, 0) / 100.0, 1) * 0.3) +
    (CASE WHEN sr.status = 'resolved' THEN 0.2 ELSE 0 END))::DECIMAL(5, 3) AS relevance_score
  FROM search_results sr
  LEFT JOIN submission_stats sub_s ON sr.id = sub_s.task_id
  ORDER BY relevance_score DESC, sr.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

DROP FUNCTION IF EXISTS search_signals_count(TEXT);
CREATE OR REPLACE FUNCTION search_signals_count(p_query TEXT)
RETURNS BIGINT LANGUAGE plpgsql STABLE AS $$
DECLARE v_count BIGINT;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM search_tasks m
  WHERE m.status IN ('closed', 'resolved')
    AND to_tsvector('english', m.title || ' ' || m.description) @@
      websearch_to_tsquery('english', p_query);
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION get_search_suggestions(p_prefix TEXT, p_limit INTEGER DEFAULT 10)
RETURNS TABLE (suggestion TEXT, market_count BIGINT) LANGUAGE plpgsql STABLE AS $$
BEGIN
  RETURN QUERY
  SELECT m.title AS suggestion, COUNT(*) AS market_count
  FROM search_tasks m
  WHERE m.status IN ('closed', 'resolved') AND m.title ILIKE p_prefix || '%'
  GROUP BY m.title ORDER BY market_count DESC, m.title LIMIT p_limit;
END;
$$;

-- ============================================================================
-- STEP 6: Recreate views
-- ============================================================================

DROP VIEW IF EXISTS public_market_stats;
DROP VIEW IF EXISTS public_task_stats;
CREATE OR REPLACE VIEW public_task_stats AS
SELECT
  m.id AS task_id,
  m.title,
  m.question,
  m.status,
  m.closes_at,
  m.signal_submission_count,
  COUNT(ss.id) AS submission_count,
  MAX(ss.submitted_at) AS latest_submission_at
FROM search_tasks m
LEFT JOIN signal_submissions ss ON m.id = ss.task_id AND ss.status = 'submitted'
GROUP BY m.id, m.title, m.question, m.status, m.closes_at, m.signal_submission_count;

DROP VIEW IF EXISTS markets_pending_analysis;
DROP VIEW IF EXISTS tasks_pending_analysis;
CREATE OR REPLACE VIEW tasks_pending_analysis AS
SELECT
  m.id,
  m.title,
  m.question,
  m.description,
  m.status,
  m.causal_analysis_status,
  m.last_analysis_at,
  m.submission_count_at_last_analysis,
  COUNT(ss.id) AS current_submission_count,
  COUNT(ss.id) - COALESCE(m.submission_count_at_last_analysis, 0) AS new_submission_count,
  MAX(ss.submitted_at) AS latest_submission_at
FROM search_tasks m
LEFT JOIN signal_submissions ss ON ss.task_id = m.id AND ss.status = 'submitted'
WHERE m.status = 'active'
  AND m.causal_analysis_status = 'pending'
GROUP BY m.id
ORDER BY new_submission_count DESC;

-- ============================================================================
-- STEP 7: Update RLS policies (policies whose SQL body references 'markets')
-- ============================================================================

-- 7.1 search_tasks SELECT policy
DROP POLICY IF EXISTS "v5_markets_select_policy" ON search_tasks;
DROP POLICY IF EXISTS "v5_tasks_select_policy" ON search_tasks;
CREATE POLICY "v5_tasks_select_policy"
  ON search_tasks FOR SELECT
  USING (
    visibility = 'public'
    OR created_by = auth.uid()
    OR auth.uid() = ANY(allowed_viewers)
    OR (
      visibility = 'private'
      AND EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND (
          reputation_score >= search_tasks.min_reputation
          OR reputation_score >= (
            SELECT PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY reputation_score)
            FROM profiles WHERE status = 'active'
          )
        )
        AND (
          search_tasks.required_niche_tags IS NULL
          OR search_tasks.required_niche_tags && profiles.niche_tags
        )
      )
    )
  );

DROP POLICY IF EXISTS "认证用户可以创建市场" ON search_tasks;
CREATE POLICY "认证用户可以创建任务" ON search_tasks FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS "创建者可以更新市场" ON search_tasks;
CREATE POLICY "创建者可以更新任务" ON search_tasks FOR UPDATE USING (auth.uid() = created_by) WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS "创建者可以删除市场" ON search_tasks;
CREATE POLICY "创建者可以删除任务" ON search_tasks FOR DELETE USING (auth.uid() = created_by);

DROP POLICY IF EXISTS "服务角色可以管理所有markets" ON search_tasks;
CREATE POLICY "服务角色可以管理所有search_tasks" ON search_tasks FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 7.2 signal_submissions INSERT policy (references search_tasks by name)
DROP POLICY IF EXISTS "v3_signal_submissions_insert_policy" ON signal_submissions;
CREATE POLICY "v3_signal_submissions_insert_policy"
  ON signal_submissions FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM search_tasks
      WHERE id = task_id
      AND (
        (visibility = 'public' AND NOT requires_nda)
        OR (requires_nda AND EXISTS (
          SELECT 1 FROM nda_agreements
          WHERE task_id = search_tasks.id
          AND agent_id = auth.uid()
        ))
        OR created_by = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "用户可以删除自己的未结算信号" ON signal_submissions;
CREATE POLICY "用户可以删除自己的未结算信号" ON signal_submissions FOR DELETE USING (
  auth.uid() = user_id AND reward_earned IS NULL AND EXISTS (
    SELECT 1 FROM search_tasks
    WHERE search_tasks.id = signal_submissions.task_id AND search_tasks.status = 'active'
  )
);

-- 7.3 nda_agreements policy
DROP POLICY IF EXISTS "v5_nda_agreements_select_policy" ON nda_agreements;
CREATE POLICY "v5_nda_agreements_select_policy"
  ON nda_agreements FOR SELECT
  USING (
    agent_id = auth.uid()
    OR EXISTS (SELECT 1 FROM search_tasks WHERE id = task_id AND created_by = auth.uid())
  );

-- 7.4 crowdfunding_contributions policy
DROP POLICY IF EXISTS "v5_crowdfunding_select_policy" ON crowdfunding_contributions;
CREATE POLICY "v5_crowdfunding_select_policy"
  ON crowdfunding_contributions FOR SELECT
  USING (
    contributor_id = auth.uid()
    OR EXISTS (SELECT 1 FROM search_tasks WHERE id = task_id AND created_by = auth.uid())
  );

-- ============================================================================
-- STEP 8: Update cron job
-- ============================================================================

DO $$
BEGIN
  PERFORM cron.unschedule('auto-close-markets');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('auto-close-tasks');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'auto-close-tasks',
  '* * * * *',
  'SELECT auto_close_expired_tasks();'
);

-- ============================================================================
-- STEP 9: Finalize
-- ============================================================================

ANALYZE search_tasks;

DO $$
BEGIN
  RAISE NOTICE '✅ Migration 09 完成: markets → search_tasks';
  RAISE NOTICE '   ✓ 表名已重命名';
  RAISE NOTICE '   ✓ 24 个索引已重命名 (idx_markets_* → idx_search_tasks_*)';
  RAISE NOTICE '   ✓ 5 个触发器已重命名';
  RAISE NOTICE '   ✓ 10 个函数体已更新';
  RAISE NOTICE '   ✓ 视图 public_market_stats → public_task_stats';
  RAISE NOTICE '   ✓ 视图 markets_pending_analysis → tasks_pending_analysis';
  RAISE NOTICE '   ✓ RLS 策略已同步更新';
  RAISE NOTICE '   ✓ 定时任务 auto-close-markets → auto-close-tasks';
END $$;
