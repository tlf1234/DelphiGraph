-- ============================================================================
-- Migration 06: UAP v3.0 Signal Submissions & Deprecate Predictions
-- 
-- 替换 predictions 表，建立完整的 v3.0 数据因子信号链路
-- 同时更新结算函数、账号删除函数、统计视图，并标记 predictions 为弃用
--
-- 变更内容：
-- PART 1:  创建 signal_submissions 表（替代 predictions）
-- PART 2:  索引
-- PART 3:  触发器（计数、因果分析 pending、自动关闭）
-- PART 4:  markets 表新增 signal_submission_count 列
-- PART 5:  reputation_history 新增 submission_id 列
-- PART 6:  辅助视图（markets_pending_analysis）
-- PART 7:  RLS 策略
-- PART 8:  回填 signal_submission_count
-- PART 9:  更新 resolve_market_transaction() 使用 signal_submissions
-- PART 10: 更新 delete_user_account() 增加 signal_submissions 删除
-- PART 11: 更新 public_market_stats 视图
-- PART 12: 添加 signal_submissions 审计触发器
-- PART 13: 添加 predictions 表弃用注释
-- ============================================================================


-- ============================================================================
-- PART 1: signal_submissions 表
-- ============================================================================

CREATE TABLE IF NOT EXISTS signal_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- ========== v3.0 提交状态 ==========
  status TEXT NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted', 'abstained')),

  -- ========== 数据因子信号（JSONB 数组） ==========
  -- 每个元素结构:
  -- {
  --   "signal_id": "sig_abc123",
  --   "evidence_type": "hard_fact" | "persona_inference",
  --   "source_type": "local_chat" | "local_memory" | ...,
  --   "data_exclusivity": "private" | "semi_private" | "public",
  --   "source_description": "用户与AI助手的对话记录",
  --   "observed_at": "2026-04-01",
  --   "evidence_text": "用户近7天搜索特斯拉相关内容12次",
  --   "relevance_reasoning": "频繁搜索特定车型是购买意愿的强指标",
  --   "relevance_score": 0.9,
  --   "source_urls": ["https://..."],
  --   "entity_tags": [{"text": "Tesla", "type": "brand", "role": "target"}]
  -- }
  signals JSONB DEFAULT '[]'::jsonb,

  -- ========== 用户画像（端侧脱敏后） ==========
  user_persona JSONB,

  -- ========== 弃权信息 ==========
  abstain_reason TEXT,
  abstain_detail TEXT,

  -- ========== 元数据 ==========
  model_name TEXT,
  plugin_version TEXT,
  privacy_cleared BOOLEAN DEFAULT true,
  protocol_version TEXT DEFAULT '3.0',

  -- ========== 评分（后续结算时填充） ==========
  brier_score DECIMAL(5, 4),
  reward_earned DECIMAL(10, 2),

  -- ========== 时间戳 ==========
  submitted_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

  -- ========== 约束 ==========
  CONSTRAINT brier_score_range CHECK (brier_score IS NULL OR (brier_score >= 0 AND brier_score <= 1)),
  CONSTRAINT reward_earned_non_negative CHECK (reward_earned IS NULL OR reward_earned >= 0),
  CONSTRAINT unique_signal_submission UNIQUE(task_id, user_id, submitted_at)
);

COMMENT ON TABLE signal_submissions IS 'UAP v3.0 数据因子信号提交表 - 替代 predictions 表';
COMMENT ON COLUMN signal_submissions.status IS '提交状态：submitted=已提交信号, abstained=弃权';
COMMENT ON COLUMN signal_submissions.signals IS '数据因子信号 JSONB 数组，每个元素为一条 signal';
COMMENT ON COLUMN signal_submissions.user_persona IS '端侧脱敏后的用户画像（JSONB）';
COMMENT ON COLUMN signal_submissions.abstain_reason IS '弃权原因码：no_relevant_data / insufficient_confidence / privacy_concern';
COMMENT ON COLUMN signal_submissions.abstain_detail IS '弃权详细说明';
COMMENT ON COLUMN signal_submissions.protocol_version IS 'UAP 协议版本号';


-- ============================================================================
-- PART 2: 索引
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_signal_submissions_task_id
  ON signal_submissions(task_id);

CREATE INDEX IF NOT EXISTS idx_signal_submissions_user_id
  ON signal_submissions(user_id);

CREATE INDEX IF NOT EXISTS idx_signal_submissions_status
  ON signal_submissions(status);

CREATE INDEX IF NOT EXISTS idx_signal_submissions_submitted_at
  ON signal_submissions(submitted_at DESC);

CREATE INDEX IF NOT EXISTS idx_signal_submissions_task_status
  ON signal_submissions(task_id, status);

-- GIN 索引用于 JSONB 字段查询
CREATE INDEX IF NOT EXISTS idx_signal_submissions_signals
  ON signal_submissions USING gin(signals);

CREATE INDEX IF NOT EXISTS idx_signal_submissions_user_persona
  ON signal_submissions USING gin(user_persona);


-- ============================================================================
-- PART 3: 触发器
-- ============================================================================

-- 3.1 新信号提交时标记 market 为 pending（触发因果分析）
CREATE OR REPLACE FUNCTION notify_new_signal_submission()
RETURNS TRIGGER AS $$
DECLARE
  current_count INTEGER;
  last_count INTEGER;
BEGIN
  -- 仅对 submitted 状态触发（弃权不触发分析）
  IF NEW.status != 'submitted' THEN
    RETURN NEW;
  END IF;

  -- 获取当前 signal_submission 计数
  SELECT COUNT(*) INTO current_count
  FROM signal_submissions
  WHERE task_id = NEW.task_id AND status = 'submitted';

  -- 获取上次分析时的计数
  SELECT COALESCE(prediction_count_at_last_analysis, 0) INTO last_count
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

DROP TRIGGER IF EXISTS trigger_new_signal_submission ON signal_submissions;
CREATE TRIGGER trigger_new_signal_submission
  AFTER INSERT ON signal_submissions
  FOR EACH ROW
  EXECUTE FUNCTION notify_new_signal_submission();


-- 3.2 signal_submission 计数自增/自减（更新 markets.signal_submission_count）
-- 注意：仅统计 status='submitted' 的提交，弃权不计入
CREATE OR REPLACE FUNCTION update_market_signal_submission_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'submitted' THEN
    UPDATE markets
    SET signal_submission_count = signal_submission_count + 1
    WHERE id = NEW.task_id;
  ELSIF TG_OP = 'DELETE' AND OLD.status = 'submitted' THEN
    UPDATE markets
    SET signal_submission_count = GREATEST(signal_submission_count - 1, 0)
    WHERE id = OLD.task_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_market_signal_submission_count ON signal_submissions;
CREATE TRIGGER trigger_update_market_signal_submission_count
  AFTER INSERT OR DELETE ON signal_submissions
  FOR EACH ROW
  EXECUTE FUNCTION update_market_signal_submission_count();


-- 3.3 target_agent_count 达标自动关闭（基于 signal_submission_count）
CREATE OR REPLACE FUNCTION auto_close_on_signal_target_reached()
RETURNS TRIGGER AS $$
DECLARE
  v_target INTEGER;
  v_status TEXT;
  v_new_count INTEGER;
BEGIN
  -- 仅在 signal_submission_count 更新时触发
  IF NEW.signal_submission_count IS NOT DISTINCT FROM OLD.signal_submission_count THEN
    RETURN NEW;
  END IF;

  v_target := NEW.target_agent_count;
  v_status := NEW.status;
  v_new_count := NEW.signal_submission_count;

  -- 仅当市场处于 active 状态且设置了目标数量时检查
  IF v_status = 'active' AND v_target IS NOT NULL AND v_target > 0 THEN
    IF v_new_count >= v_target THEN
      NEW.status := 'closed';
      NEW.updated_at := NOW();
      RAISE NOTICE '市场 % 已达到目标信号提交数 %/%, 自动关闭', NEW.id, v_new_count, v_target;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_auto_close_on_signal_target_reached ON markets;
CREATE TRIGGER trigger_auto_close_on_signal_target_reached
  BEFORE UPDATE ON markets
  FOR EACH ROW
  EXECUTE FUNCTION auto_close_on_signal_target_reached();


-- ============================================================================
-- PART 4: markets 表新增 signal_submission_count 列
-- ============================================================================

ALTER TABLE markets ADD COLUMN IF NOT EXISTS signal_submission_count INTEGER DEFAULT 0 NOT NULL;
COMMENT ON COLUMN markets.signal_submission_count IS '当前已收到的信号提交数量（通过触发器自动维护）';


-- ============================================================================
-- PART 5: reputation_history 新增 submission_id 列
-- ============================================================================

ALTER TABLE reputation_history
  ADD COLUMN IF NOT EXISTS submission_id UUID REFERENCES signal_submissions(id);

COMMENT ON COLUMN reputation_history.submission_id IS 'v3.0 信号提交 ID（替代 prediction_id）';


-- ============================================================================
-- PART 6: 辅助视图 - 待分析的市场（v3.0 版本）
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
  m.prediction_count_at_last_analysis,
  m.signal_submission_count,
  COUNT(ss.id) AS current_submission_count,
  COUNT(ss.id) - COALESCE(m.prediction_count_at_last_analysis, 0) AS new_submission_count,
  MAX(ss.submitted_at) AS latest_submission_at
FROM markets m
LEFT JOIN signal_submissions ss ON ss.task_id = m.id AND ss.status = 'submitted'
WHERE m.status = 'active'
  AND m.causal_analysis_status = 'pending'
GROUP BY m.id
ORDER BY new_submission_count DESC;


-- ============================================================================
-- PART 7: RLS 策略
-- ============================================================================

ALTER TABLE signal_submissions ENABLE ROW LEVEL SECURITY;

-- 用户可以查看自己的提交
DROP POLICY IF EXISTS "Users can view own signal submissions" ON signal_submissions;
CREATE POLICY "Users can view own signal submissions"
  ON signal_submissions
  FOR SELECT
  USING (auth.uid() = user_id);

-- 服务角色可以完全访问（API 路由使用 service_role key）
DROP POLICY IF EXISTS "Service role full access on signal_submissions" ON signal_submissions;
CREATE POLICY "Service role full access on signal_submissions"
  ON signal_submissions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 认证用户可以查看同一任务的其他提交（用于市场详情页）
DROP POLICY IF EXISTS "Authenticated users can view task signal submissions" ON signal_submissions;
CREATE POLICY "Authenticated users can view task signal submissions"
  ON signal_submissions
  FOR SELECT
  TO authenticated
  USING (true);


-- ============================================================================
-- PART 8: 回填 signal_submission_count
-- ============================================================================

DO $$
BEGIN
  UPDATE markets m
  SET signal_submission_count = (
    SELECT COUNT(*)
    FROM signal_submissions ss
    WHERE ss.task_id = m.id AND ss.status = 'submitted'
  );
  RAISE NOTICE '已回填所有市场的 signal_submission_count';
END;
$$;


-- ============================================================================
-- PART 9: 更新结算函数（基于 signal_submissions）
-- ============================================================================

DROP FUNCTION IF EXISTS resolve_market_transaction(UUID, BOOLEAN, UUID);
CREATE OR REPLACE FUNCTION resolve_market_transaction(
  p_task_id UUID,
  p_outcome BOOLEAN,
  p_admin_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_market RECORD;
  v_submission RECORD;
  v_participant_count INT := 0;
  v_reward_per_participant NUMERIC := 0;
  v_total_rewards NUMERIC := 0;
  v_result JSONB;
BEGIN
  SELECT * INTO v_market
  FROM markets
  WHERE id = p_task_id
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION '市场不存在';
  END IF;
  
  IF v_market.status = 'resolved' THEN
    RAISE EXCEPTION '市场已经结算';
  END IF;
  
  -- v3.0: 统计所有已提交的信号（非弃权）
  SELECT COUNT(*) INTO v_participant_count
  FROM signal_submissions
  WHERE task_id = p_task_id
    AND status = 'submitted';
  
  IF v_participant_count > 0 THEN
    v_reward_per_participant := v_market.reward_pool / v_participant_count;
  END IF;
  
  -- v3.0: 为所有提交信号的参与者发放奖励和信誉变更
  FOR v_submission IN
    SELECT user_id
    FROM signal_submissions
    WHERE task_id = p_task_id
      AND status = 'submitted'
  LOOP
    PERFORM update_user_reputation_and_earnings(
      v_submission.user_id,
      10,
      v_reward_per_participant
    );
  END LOOP;
  
  UPDATE markets
  SET status = 'resolved',
      actual_outcome = CASE WHEN p_outcome THEN 1 ELSE 0 END,
      updated_at = NOW()
  WHERE id = p_task_id;
  
  PERFORM log_audit(
    p_admin_id,
    'resolve',
    'market',
    p_task_id,
    to_jsonb(v_market),
    jsonb_build_object('status', 'resolved', 'outcome', p_outcome),
    jsonb_build_object(
      'participant_count', v_participant_count,
      'reward_per_participant', v_reward_per_participant
    )
  );
  
  v_total_rewards := v_reward_per_participant * v_participant_count;
  
  v_result := jsonb_build_object(
    'success', true,
    'task_id', p_task_id,
    'outcome', p_outcome,
    'participant_count', v_participant_count,
    'reward_per_participant', v_reward_per_participant,
    'total_rewards_distributed', v_total_rewards
  );
  
  RETURN v_result;
  
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION '市场结算失败: %', SQLERRM;
END;
$$;

COMMENT ON FUNCTION resolve_market_transaction IS '事务性市场结算（v3.0: 基于 signal_submissions），确保原子性';


-- ============================================================================
-- PART 10: 更新账号删除函数（增加 signal_submissions）
-- ============================================================================

CREATE OR REPLACE FUNCTION delete_user_account(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deleted_submissions INT;
  v_deleted_predictions INT;
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
  
  -- v2.0 遗留: 删除旧预测数据
  DELETE FROM predictions WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_deleted_predictions = ROW_COUNT;
  
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
    'deleted_predictions', v_deleted_predictions,
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
-- PART 11: 更新市场统计视图（基于 signal_submissions）
-- ============================================================================

DO $$
BEGIN
  EXECUTE 'DROP VIEW IF EXISTS public_market_stats CASCADE';
  EXECUTE '
    CREATE VIEW public_market_stats AS
    SELECT
      m.id AS task_id,
      m.title,
      m.question,
      m.status,
      m.closes_at,
      m.signal_submission_count,
      COUNT(ss.id) AS submission_count,
      MAX(ss.submitted_at) AS latest_submission_at
    FROM markets m
    LEFT JOIN signal_submissions ss ON m.id = ss.task_id AND ss.status = ''submitted''
    GROUP BY m.id, m.title, m.question, m.status, m.closes_at, m.signal_submission_count
  ';
END;
$$;

COMMENT ON VIEW public_market_stats IS '市场信号提交统计视图（v3.0）';


-- ============================================================================
-- PART 12: 添加 signal_submissions 审计触发器
-- ============================================================================

CREATE OR REPLACE FUNCTION audit_signal_submissions_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM log_audit(
      NEW.user_id,
      'create',
      'signal_submission',
      NEW.id,
      NULL,
      to_jsonb(NEW),
      jsonb_build_object('trigger', 'auto')
    );
  ELSIF TG_OP = 'UPDATE' THEN
    PERFORM log_audit(
      NEW.user_id,
      'update',
      'signal_submission',
      NEW.id,
      to_jsonb(OLD),
      to_jsonb(NEW),
      jsonb_build_object('trigger', 'auto')
    );
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM log_audit(
      OLD.user_id,
      'delete',
      'signal_submission',
      OLD.id,
      to_jsonb(OLD),
      NULL,
      jsonb_build_object('trigger', 'auto')
    );
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS audit_signal_submissions_trigger ON signal_submissions;
CREATE TRIGGER audit_signal_submissions_trigger
  AFTER INSERT OR UPDATE OR DELETE ON signal_submissions
  FOR EACH ROW
  EXECUTE FUNCTION audit_signal_submissions_changes();


-- ============================================================================
-- PART 13: 添加弃用注释
-- ============================================================================

COMMENT ON TABLE predictions IS '⚠️ DEPRECATED: v2.0 预测提交表，已被 signal_submissions 替代';
