-- ============================================================================
-- Migration 11: 参与者阈值触发因果分析
-- 创建: 2026-04-08
--
-- 变更内容:
-- 1. search_tasks 新增 current_participant_count 列（唯一参与 agent 数）
-- 2. 用 notify_participant_threshold_reached() 替换旧的 notify_new_signal_submission()
--    旧逻辑: 每5条新信号 → pending（任意阈值，业务含义弱）
--    新逻辑: 唯一参与 agent 数 >= target_agent_count → pending（业务对齐，精准触发）
-- 3. 新增 notify_task_closed_trigger_analysis() — 任务关闭时自动触发最终分析
-- 4. 回填存量数据的 current_participant_count
-- ============================================================================

-- ── 1. 添加新列 ──────────────────────────────────────────────────────────
ALTER TABLE search_tasks
  ADD COLUMN IF NOT EXISTS current_participant_count INTEGER DEFAULT 0 NOT NULL;

COMMENT ON COLUMN search_tasks.current_participant_count
  IS '唯一参与 agent 数（由触发器 trigger_participant_threshold 自动维护）';

-- ── 2. 回填存量数据 ───────────────────────────────────────────────────────
UPDATE search_tasks t
SET current_participant_count = (
  SELECT COUNT(DISTINCT user_id)
  FROM signal_submissions
  WHERE task_id = t.id
)
WHERE current_participant_count = 0;

-- ── 3. 移除旧触发器和函数 ─────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trigger_new_signal_submission ON signal_submissions;
DROP FUNCTION IF EXISTS notify_new_signal_submission();

-- ── 4. 创建新触发器函数：参与者阈值计数 + 状态标记（HTTP 触发由 Next.js API 层处理）────
CREATE OR REPLACE FUNCTION notify_participant_threshold_reached()
RETURNS TRIGGER AS $$
DECLARE
  v_target          INTEGER;
  v_new_count       INTEGER;
  v_analysis_status TEXT;
  v_is_first_sub    BOOLEAN;
BEGIN
  -- 判断该用户是否第一次参与此任务
  SELECT NOT EXISTS (
    SELECT 1 FROM signal_submissions
    WHERE task_id = NEW.task_id
      AND user_id = NEW.user_id
      AND id <> NEW.id
  ) INTO v_is_first_sub;

  IF v_is_first_sub THEN
    -- 原子递增唯一参与数并读取目标值
    UPDATE search_tasks
    SET current_participant_count = current_participant_count + 1,
        updated_at = NOW()
    WHERE id = NEW.task_id
    RETURNING current_participant_count, target_agent_count, causal_analysis_status
      INTO v_new_count, v_target, v_analysis_status;
  ELSE
    SELECT current_participant_count, target_agent_count, causal_analysis_status
    INTO v_new_count, v_target, v_analysis_status
    FROM search_tasks
    WHERE id = NEW.task_id;
  END IF;

  -- 达到目标 agent 数时标记为 pending（供监控面板显示；HTTP 触发由 API 层完成）
  IF v_target IS NOT NULL
     AND v_new_count >= v_target
     AND v_analysis_status NOT IN ('pending', 'processing')
  THEN
    UPDATE search_tasks
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

-- ── 5. 创建任务关闭触发器 ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION notify_task_closed_trigger_analysis()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'closed' AND OLD.status = 'active'
     AND NEW.signal_submission_count > 0
     AND NEW.causal_analysis_status NOT IN ('pending', 'processing')
  THEN
    NEW.causal_analysis_status := 'pending';
    NEW.updated_at := NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_task_closed_analysis ON search_tasks;
CREATE TRIGGER trigger_task_closed_analysis
  BEFORE UPDATE ON search_tasks
  FOR EACH ROW
  EXECUTE FUNCTION notify_task_closed_trigger_analysis();

-- ── 6. 更新函数注释 ──────────────────────────────────────────────────────
COMMENT ON FUNCTION notify_participant_threshold_reached
  IS 'v3.0 当唯一参与 agent 数达到 target_agent_count 时触发因果分析（替代旧的每5条信号触发逻辑）';
COMMENT ON FUNCTION notify_task_closed_trigger_analysis
  IS 'v3.0 任务关闭时自动将 causal_analysis_status 设为 pending，触发最终因果分析';
