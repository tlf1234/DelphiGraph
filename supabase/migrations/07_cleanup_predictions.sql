-- ============================================================================
-- Migration 07: Clean Up Legacy Predictions Objects
--
-- 前置条件：已运行 migration 06（signal_submissions 已创建）
-- 此迁移彻底清除 predictions 表及其所有关联对象
--
-- 变更内容：
-- PART 1:  删除 predictions 表上的触发器
-- PART 2:  删除 predictions 相关的函数
-- PART 3:  删除 predictions 表上的 RLS 策略
-- PART 4:  删除 predictions 表上的索引
-- PART 5:  删除 reputation_history.prediction_id 外键列
-- PART 6:  更新 delete_user_account() 移除 predictions 删除
-- PART 7:  更新 search_predictions_optimized() 使用 signal_submissions
-- PART 8:  删除 predictions 表
-- PART 9:  更新 settlement_audit 添加弃用注释
-- ============================================================================


-- ============================================================================
-- PART 1: 删除 predictions 表上的触发器
-- ============================================================================

DROP TRIGGER IF EXISTS update_user_prediction_count ON predictions;
DROP TRIGGER IF EXISTS audit_predictions_trigger ON predictions;


-- ============================================================================
-- PART 2: 删除 predictions 相关的函数
-- ============================================================================

DROP FUNCTION IF EXISTS update_prediction_count();
DROP FUNCTION IF EXISTS audit_predictions_changes();


-- ============================================================================
-- PART 3: 删除 predictions 表上的 RLS 策略
-- ============================================================================

DROP POLICY IF EXISTS "用户只能查看自己的预测" ON predictions;
DROP POLICY IF EXISTS "v5_predictions_insert_policy" ON predictions;
DROP POLICY IF EXISTS "用户可以删除自己的未结算预测" ON predictions;
DROP POLICY IF EXISTS "服务角色可以管理所有predictions" ON predictions;
DROP POLICY IF EXISTS "认证用户可以查看所有市场预测" ON predictions;


-- ============================================================================
-- PART 4: 删除 predictions 表上的索引
-- ============================================================================

DROP INDEX IF EXISTS idx_predictions_market;
DROP INDEX IF EXISTS idx_predictions_user;
DROP INDEX IF EXISTS idx_predictions_submitted;
DROP INDEX IF EXISTS idx_predictions_market_user;
DROP INDEX IF EXISTS idx_predictions_market_submitted;
DROP INDEX IF EXISTS idx_predictions_user_submitted;
DROP INDEX IF EXISTS idx_predictions_outcome;


-- ============================================================================
-- PART 5: 删除 reputation_history.prediction_id 外键列
-- ============================================================================

-- 先删除外键约束（名称可能是自动生成的，用 DROP COLUMN CASCADE 自动删除关联约束）
ALTER TABLE reputation_history DROP COLUMN IF EXISTS prediction_id;


-- ============================================================================
-- PART 6: 更新 delete_user_account() 移除 predictions 删除
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
    p_user_id,
    'delete',
    'account',
    p_user_id,
    jsonb_build_object('user_id', p_user_id),
    NULL,
    jsonb_build_object('deleted_at', NOW())
  );
  
  -- v3.0: 删除信号提交
  DELETE FROM signal_submissions WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_deleted_submissions = ROW_COUNT;
  
  DELETE FROM simulations WHERE task_id IN (
    SELECT id FROM markets WHERE created_by = p_user_id
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
  WHEN OTHERS THEN
    RAISE EXCEPTION '删除账号失败: %', SQLERRM;
END;
$$;


-- ============================================================================
-- PART 7: 更新 search_predictions_optimized() 使用 signal_submissions
-- ============================================================================

-- 保持函数名不变（Edge Function search-predictions 依赖此名称）
-- 移除 consensus_probability（v3.0 无概率字段），改为 submission_count
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
  consensus_probability DECIMAL(5, 4),  -- 保留字段名兼容前端，始终返回 NULL
  prediction_count BIGINT,              -- 保留字段名兼容前端，实际为 submission_count
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
    SELECT 
      m.id,
      m.title,
      m.question,
      m.description,
      m.status,
      m.actual_outcome,
      m.created_at,
      m.resolves_at,
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
  submission_stats AS (
    -- v3.0: 使用 signal_submissions 替代 predictions
    SELECT 
      ss.task_id,
      COUNT(*) AS sub_count
    FROM signal_submissions ss
    WHERE ss.task_id IN (SELECT id FROM search_results)
      AND ss.status = 'submitted'
    GROUP BY ss.task_id
  )
  SELECT 
    sr.id AS task_id,
    sr.title,
    sr.question,
    sr.description,
    sr.status,
    sr.actual_outcome,
    NULL::DECIMAL(5, 4) AS consensus_probability,  -- v3.0 无概率字段
    COALESCE(sub_s.sub_count, 0) AS prediction_count,
    sr.created_at,
    sr.resolves_at AS resolved_at,
    (
      (sr.text_rank * 0.5) +
      (LEAST(COALESCE(sub_s.sub_count, 0) / 100.0, 1) * 0.3) +
      (CASE WHEN sr.status = 'resolved' THEN 0.2 ELSE 0 END)
    )::DECIMAL(5, 3) AS relevance_score
  FROM search_results sr
  LEFT JOIN submission_stats sub_s ON sr.id = sub_s.task_id
  ORDER BY relevance_score DESC, sr.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

COMMENT ON FUNCTION search_predictions_optimized IS 
  'v3.0: 市场搜索函数，基于 signal_submissions 统计。consensus_probability 始终返回 NULL（v3.0 无概率字段），prediction_count 实际为 signal submission count。';


-- ============================================================================
-- PART 8: 删除 predictions 表
-- ============================================================================

DROP TABLE IF EXISTS predictions CASCADE;

DO $$
BEGIN
  RAISE NOTICE '✅ predictions 表及其所有关联对象已被彻底清除';
END;
$$;


-- ============================================================================
-- PART 9: 更新 settlement_audit 添加弃用注释
-- ============================================================================

-- settlement_audit 表中的 total_predictions / correct_predictions / incorrect_predictions
-- 列名保留（可能有历史审计数据），但添加注释说明语义变化
COMMENT ON COLUMN settlement_audit.total_predictions IS 
  '⚠️ v3.0: 此列语义变更为 total_submissions（信号提交总数）';
COMMENT ON COLUMN settlement_audit.correct_predictions IS 
  '⚠️ v3.0: 此列语义变更为参与者数量（v3.0 不再区分正确/错误）';
COMMENT ON COLUMN settlement_audit.incorrect_predictions IS 
  '⚠️ v3.0: 此列语义变更，始终为 0（v3.0 不再区分正确/错误）';
