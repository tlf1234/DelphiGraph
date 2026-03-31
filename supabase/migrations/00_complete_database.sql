-- ============================================================================
-- DelphiGraph 完整数据库初始化脚本
-- 包含所有表结构、函数、触发器、RLS策略和v5.0功能
-- 日期: 2024-02-18
-- 更新: 2026-02-21 - 添加 pending 状态支持
-- 
-- 这是一个统一的数据库初始化文件，包含：
-- 1. 核心表结构 (profiles, markets, predictions, simulations)
-- 2. 炼狱+救赎系统表
-- 3. 信誉系统表
-- 4. 审计日志表
-- 5. v5.0升级功能（智能分发、NDA、众筹、专业领域匹配）
-- 6. 所有索引和约束
-- 7. RLS策略
-- 8. 核心函数和触发器
-- 9. 监控视图
-- 
-- 重要更新（2026-02-21）：
-- - markets.status 现在支持 'pending' 状态
-- - 允许在没有agent在线时创建任务
-- - 众筹模式任务初始状态为 'pending'
-- - 直接付费任务初始状态为 'active'
-- ============================================================================

-- ============================================================================
-- PART 1: 核心表结构
-- ============================================================================

-- 1.1 PROFILES 表 - 用户档案
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  twitter_handle TEXT UNIQUE,
  avatar_url TEXT,
  api_key_hash TEXT UNIQUE NOT NULL,
  
  -- 信誉和收益
  reputation_score DECIMAL(10, 2) DEFAULT 100 NOT NULL,
  total_earnings DECIMAL(10, 2) DEFAULT 0 NOT NULL,
  prediction_count INTEGER DEFAULT 0 NOT NULL,
  
  -- 炼狱机制
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'restricted')),
  redemption_streak INTEGER DEFAULT 0 NOT NULL,
  redemption_attempts INTEGER DEFAULT 0 NOT NULL,
  purgatory_entered_at TIMESTAMPTZ,
  purgatory_reason TEXT,
  
  -- 信誉系统
  reputation_level TEXT DEFAULT 'apprentice' NOT NULL,
  win_streak INTEGER DEFAULT 0 NOT NULL,
  total_predictions INTEGER DEFAULT 0 NOT NULL,
  correct_predictions INTEGER DEFAULT 0 NOT NULL,
  is_banned BOOLEAN DEFAULT false NOT NULL,
  ban_reason TEXT,
  recovery_tasks_completed INTEGER DEFAULT 0 NOT NULL,
  last_prediction_at TIMESTAMPTZ,
  daily_prediction_count INTEGER DEFAULT 0 NOT NULL,
  daily_reset_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  
  -- v5.0: 专业领域标签
  niche_tags TEXT[],
  
  -- 管理员
  role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  
  -- 时间戳
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  
  -- 约束
  CONSTRAINT reputation_score_positive CHECK (reputation_score >= 0),
  CONSTRAINT total_earnings_non_negative CHECK (total_earnings >= 0),
  CONSTRAINT prediction_count_non_negative CHECK (prediction_count >= 0)
);

-- 1.2 MARKETS 表 - 预测市场
CREATE TABLE IF NOT EXISTS markets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  question TEXT NOT NULL,
  resolution_criteria TEXT NOT NULL,
  closes_at TIMESTAMPTZ NOT NULL,
  resolves_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active',
  actual_outcome DECIMAL(3, 2),
  reward_pool DECIMAL(10, 2) DEFAULT 1000 NOT NULL,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  
  -- 校准任务
  is_calibration BOOLEAN DEFAULT false NOT NULL,
  calibration_answer BOOLEAN,
  calibration_difficulty TEXT CHECK (calibration_difficulty IN ('easy', 'medium', 'hard')),
  
  -- v5.0: 任务可见性和访问控制
  visibility TEXT DEFAULT 'public' CHECK (visibility IN ('public', 'private')),
  min_reputation INTEGER DEFAULT 0,
  allowed_viewers UUID[],
  
  -- v5.0: 资金模式
  funding_type TEXT DEFAULT 'crowd' CHECK (funding_type IN ('direct', 'crowd')),
  funding_goal DECIMAL(10, 2),
  funding_current DECIMAL(10, 2) DEFAULT 0,
  funding_progress DECIMAL(5, 4),
  
  -- v5.0: 报告访问权限
  report_access TEXT DEFAULT 'open' CHECK (report_access IN ('open', 'exclusive', 'subscription')),
  
  -- v5.0: 专业领域匹配
  required_niche_tags TEXT[],
  target_agent_count INTEGER,
  budget_per_agent DECIMAL(10, 2),
  
  -- v5.0: NDA保密机制
  requires_nda BOOLEAN DEFAULT false,
  nda_text TEXT,
  
  -- 时间戳
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  
  -- 约束
  CONSTRAINT status_valid CHECK (status IN ('pending', 'active', 'closed', 'resolved')),
  CONSTRAINT actual_outcome_range CHECK (actual_outcome IS NULL OR (actual_outcome >= 0 AND actual_outcome <= 1)),
  CONSTRAINT reward_pool_positive CHECK (reward_pool > 0),
  CONSTRAINT closes_at_future CHECK (closes_at > created_at)
);

-- 1.3 PREDICTIONS 表 - 预测提交
CREATE TABLE IF NOT EXISTS predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  probability DECIMAL(5, 4) NOT NULL,
  rationale TEXT NOT NULL,
  brier_score DECIMAL(5, 4),
  reward_earned DECIMAL(10, 2),
  submitted_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  
  -- 约束
  CONSTRAINT probability_range CHECK (probability >= 0 AND probability <= 1),
  CONSTRAINT rationale_length CHECK (LENGTH(rationale) > 0 AND LENGTH(rationale) <= 10000),
  CONSTRAINT brier_score_range CHECK (brier_score IS NULL OR (brier_score >= 0 AND brier_score <= 1)),
  CONSTRAINT reward_earned_non_negative CHECK (reward_earned IS NULL OR reward_earned >= 0),
  CONSTRAINT unique_prediction UNIQUE(task_id, user_id, submitted_at)
);

-- 1.4 SIMULATIONS 表 - 未来模拟器
CREATE TABLE IF NOT EXISTS simulations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  consensus_probability DECIMAL(5, 4),
  divergence_score DECIMAL(5, 4),
  prediction_count INTEGER,
  generated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  
  -- 约束
  CONSTRAINT consensus_probability_range CHECK (consensus_probability IS NULL OR (consensus_probability >= 0 AND consensus_probability <= 1)),
  CONSTRAINT divergence_score_range CHECK (divergence_score IS NULL OR (divergence_score >= 0 AND divergence_score <= 1)),
  CONSTRAINT prediction_count_positive CHECK (prediction_count IS NULL OR prediction_count > 0)
);

-- ============================================================================
-- PART 2: 炼狱+救赎系统表
-- ============================================================================

-- 2.1 CALIBRATION_TASKS 表 - 校准任务
CREATE TABLE IF NOT EXISTS calibration_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES markets(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  question TEXT NOT NULL,
  correct_answer BOOLEAN NOT NULL,
  difficulty TEXT DEFAULT 'medium' CHECK (difficulty IN ('easy', 'medium', 'hard')),
  category TEXT,
  historical_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 2.2 REDEMPTION_ATTEMPTS 表 - 救赎尝试记录
CREATE TABLE IF NOT EXISTS redemption_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES calibration_tasks(id) ON DELETE CASCADE,
  answer BOOLEAN NOT NULL,
  rationale TEXT,
  is_correct BOOLEAN NOT NULL,
  reputation_before INTEGER NOT NULL,
  reputation_after INTEGER NOT NULL,
  reputation_change INTEGER NOT NULL,
  streak_before INTEGER NOT NULL,
  streak_after INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ============================================================================
-- PART 3: 信誉系统表
-- ============================================================================

-- 3.1 REPUTATION_HISTORY 表 - 信誉分历史记录
CREATE TABLE IF NOT EXISTS reputation_history (
  id BIGSERIAL PRIMARY KEY,
  agent_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  change_amount INTEGER NOT NULL,
  reason TEXT NOT NULL,
  task_id UUID REFERENCES markets(id),
  prediction_id UUID REFERENCES predictions(id),
  old_score DECIMAL(10, 2),
  new_score DECIMAL(10, 2),
  old_level TEXT,
  new_level TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 3.2 REPUTATION_LEVELS 表 - 信誉等级配置
CREATE TABLE IF NOT EXISTS reputation_levels (
  level_key TEXT PRIMARY KEY,
  level_name TEXT NOT NULL,
  min_score INTEGER NOT NULL,
  max_score INTEGER NOT NULL,
  daily_prediction_limit INTEGER,
  max_market_value DECIMAL(10, 2),
  revenue_share_percent DECIMAL(5, 2),
  badge_icon TEXT,
  badge_color TEXT,
  description TEXT
);

-- 插入等级配置
INSERT INTO reputation_levels (level_key, level_name, min_score, max_score, daily_prediction_limit, max_market_value, revenue_share_percent, badge_icon, badge_color, description) VALUES
  ('banned', '🚫 封禁区', 0, 59, 0, 0, 0, 'ban', 'red', '账号已被封禁'),
  ('recovery', '📝 见习预言家', 60, 99, 0, 0, 0, 'recovery', 'yellow', '恢复期，仅公益任务'),
  ('apprentice', '🌱 初级预言家', 100, 199, 5, 100, 50, 'seedling', 'green', '新手阶段'),
  ('intermediate', '🔰 中级预言家', 200, 299, 10, 500, 60, 'shield', 'blue', '进阶阶段'),
  ('advanced', '⭐ 高级预言家', 300, 399, 20, 1000, 70, 'star', 'purple', '高级阶段'),
  ('expert', '💎 专家预言家', 400, 499, -1, 5000, 75, 'diamond', 'pink', '专家阶段'),
  ('master', '👑 大师预言家', 500, 999, -1, -1, 85, 'crown', 'orange', 'B端定制'),
  ('legend', '🏆 传奇预言家', 1000, 999999, -1, -1, 90, 'trophy', 'gold', '平台合伙人')
ON CONFLICT (level_key) DO NOTHING;

-- ============================================================================
-- PART 4: 审计和监控表
-- ============================================================================

-- 4.1 AUDIT_LOGS 表 - 审计日志
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id UUID,
  old_data JSONB,
  new_data JSONB,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4.2 MARKET_STATUS_AUDIT 表 - 市场状态变更审计
CREATE TABLE IF NOT EXISTS market_status_audit (
  id BIGSERIAL PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  old_status TEXT NOT NULL,
  new_status TEXT NOT NULL,
  changed_by TEXT DEFAULT 'system',
  changed_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 4.3 SETTLEMENT_AUDIT 表 - 结算审计日志
CREATE TABLE IF NOT EXISTS settlement_audit (
  id BIGSERIAL PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  admin_id UUID NOT NULL REFERENCES profiles(id),
  outcome BOOLEAN NOT NULL,
  total_predictions INTEGER NOT NULL,
  correct_predictions INTEGER NOT NULL,
  incorrect_predictions INTEGER NOT NULL,
  total_rewards_distributed DECIMAL(10, 2) NOT NULL,
  settled_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ============================================================================
-- PART 5: v5.0 新增表
-- ============================================================================

-- 5.1 NDA_AGREEMENTS 表 - NDA签署记录
CREATE TABLE IF NOT EXISTS nda_agreements (
  id BIGSERIAL PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  agreed_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  CONSTRAINT unique_nda_agreement UNIQUE(task_id, agent_id)
);

-- 5.2 CROWDFUNDING_CONTRIBUTIONS 表 - 众筹贡献记录
CREATE TABLE IF NOT EXISTS crowdfunding_contributions (
  id BIGSERIAL PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  contributor_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount DECIMAL(10, 2) NOT NULL CHECK (amount >= 1),
  contributed_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN ('pending', 'completed', 'failed', 'refunded')),
  payment_method TEXT,
  transaction_id TEXT
);

-- 5.3 NICHE_TAGS_REFERENCE 表 - 专业领域标签参考
CREATE TABLE IF NOT EXISTS niche_tags_reference (
  tag_key TEXT PRIMARY KEY,
  tag_name TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 插入预定义的专业领域标签
INSERT INTO niche_tags_reference (tag_key, tag_name, description, icon) VALUES
  ('tech', 'Technology', '科技、软件、硬件、AI等', '💻'),
  ('finance', 'Finance', '金融、投资、加密货币等', '💰'),
  ('healthcare', 'Healthcare', '医疗、健康、生物科技等', '🏥'),
  ('legal', 'Legal', '法律、合规、政策等', '⚖️'),
  ('marketing', 'Marketing', '市场营销、广告、品牌等', '📢'),
  ('real_estate', 'Real Estate', '房地产、建筑、城市规划等', '🏢'),
  ('education', 'Education', '教育、培训、学术等', '📚'),
  ('entertainment', 'Entertainment', '娱乐、影视、游戏等', '🎬'),
  ('sports', 'Sports', '体育、竞技、健身等', '⚽'),
  ('politics', 'Politics', '政治、选举、国际关系等', '🏛️'),
  ('environment', 'Environment', '环境、气候、能源等', '🌍'),
  ('science', 'Science', '科学研究、学术、创新等', '🔬')
ON CONFLICT (tag_key) DO NOTHING;

-- ============================================================================
-- PART 5.5: 列重命名（market_id → task_id）
-- 用于已存在的数据库中列名仍为 market_id 的情况，幂等执行
-- ============================================================================

DO $$
BEGIN
  -- predictions
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'predictions' AND column_name = 'market_id') THEN
    ALTER TABLE predictions RENAME COLUMN market_id TO task_id;
  END IF;

  -- simulations
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'simulations' AND column_name = 'market_id') THEN
    ALTER TABLE simulations RENAME COLUMN market_id TO task_id;
  END IF;

  -- calibration_tasks
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'calibration_tasks' AND column_name = 'market_id') THEN
    ALTER TABLE calibration_tasks RENAME COLUMN market_id TO task_id;
  END IF;

  -- redemption_attempts
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'redemption_attempts' AND column_name = 'market_id') THEN
    ALTER TABLE redemption_attempts RENAME COLUMN market_id TO task_id;
  END IF;

  -- reputation_history
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'reputation_history' AND column_name = 'market_id') THEN
    ALTER TABLE reputation_history RENAME COLUMN market_id TO task_id;
  END IF;

  -- market_status_audit
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'market_status_audit' AND column_name = 'market_id') THEN
    ALTER TABLE market_status_audit RENAME COLUMN market_id TO task_id;
  END IF;

  -- settlement_audit
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'settlement_audit' AND column_name = 'market_id') THEN
    ALTER TABLE settlement_audit RENAME COLUMN market_id TO task_id;
  END IF;

  -- nda_agreements
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'nda_agreements' AND column_name = 'market_id') THEN
    ALTER TABLE nda_agreements RENAME COLUMN market_id TO task_id;
  END IF;

  -- crowdfunding_contributions
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'crowdfunding_contributions' AND column_name = 'market_id') THEN
    ALTER TABLE crowdfunding_contributions RENAME COLUMN market_id TO task_id;
  END IF;
END $$;


-- ============================================================================
-- PART 6: 索引
-- ============================================================================

-- 6.1 Profiles 表索引
CREATE INDEX IF NOT EXISTS idx_profiles_reputation ON profiles(reputation_score DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_api_key ON profiles(api_key_hash);
CREATE INDEX IF NOT EXISTS idx_profiles_twitter ON profiles(twitter_handle) WHERE twitter_handle IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_created_at ON profiles(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_status ON profiles(status);
CREATE INDEX IF NOT EXISTS idx_profiles_level ON profiles(reputation_level);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_is_banned ON profiles(is_banned);
CREATE INDEX IF NOT EXISTS idx_profiles_reputation_status ON profiles(reputation_score DESC, status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_profiles_purgatory ON profiles(purgatory_entered_at DESC) WHERE status = 'restricted';
CREATE INDEX IF NOT EXISTS idx_profiles_leaderboard ON profiles(reputation_score DESC) INCLUDE (username, avatar_url, prediction_count, total_earnings) WHERE status = 'active' AND reputation_score >= 200;
CREATE INDEX IF NOT EXISTS idx_profiles_niche_tags ON profiles USING GIN(niche_tags);

-- 6.2 Markets 表索引
CREATE INDEX IF NOT EXISTS idx_markets_status ON markets(status);
CREATE INDEX IF NOT EXISTS idx_markets_closes_at ON markets(closes_at);
CREATE INDEX IF NOT EXISTS idx_markets_created_by ON markets(created_by);
CREATE INDEX IF NOT EXISTS idx_markets_created_at ON markets(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_markets_is_calibration ON markets(is_calibration);
CREATE INDEX IF NOT EXISTS idx_markets_status_created ON markets(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_markets_status_closes ON markets(status, closes_at);
CREATE INDEX IF NOT EXISTS idx_markets_active ON markets(closes_at) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_markets_closed ON markets(created_at DESC) WHERE status = 'closed';
CREATE INDEX IF NOT EXISTS idx_markets_resolved ON markets(updated_at DESC) WHERE status = 'resolved';
CREATE INDEX IF NOT EXISTS idx_markets_card_data ON markets(status, closes_at, created_at DESC) INCLUDE (title, reward_pool, created_by);
CREATE INDEX IF NOT EXISTS idx_markets_search ON markets USING GIN (to_tsvector('english', title || ' ' || description));
CREATE INDEX IF NOT EXISTS idx_markets_visibility ON markets(visibility);
CREATE INDEX IF NOT EXISTS idx_markets_funding_type ON markets(funding_type);
CREATE INDEX IF NOT EXISTS idx_markets_required_niche_tags ON markets USING GIN(required_niche_tags);
CREATE INDEX IF NOT EXISTS idx_markets_min_reputation ON markets(min_reputation);
CREATE INDEX IF NOT EXISTS idx_markets_funding_progress ON markets(funding_progress) WHERE funding_type = 'crowd';

-- 6.3 Predictions 表索引
CREATE INDEX IF NOT EXISTS idx_predictions_market ON predictions(task_id);
CREATE INDEX IF NOT EXISTS idx_predictions_user ON predictions(user_id);
CREATE INDEX IF NOT EXISTS idx_predictions_submitted ON predictions(submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_predictions_market_user ON predictions(task_id, user_id);
CREATE INDEX IF NOT EXISTS idx_predictions_market_submitted ON predictions(task_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_predictions_user_submitted ON predictions(user_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_predictions_outcome ON predictions(task_id, (probability >= 0.5));

-- 6.4 Simulations 表索引
CREATE INDEX IF NOT EXISTS idx_simulations_market ON simulations(task_id);
CREATE INDEX IF NOT EXISTS idx_simulations_generated ON simulations(generated_at DESC);

-- 6.5 其他表索引
CREATE INDEX IF NOT EXISTS idx_calibration_tasks_difficulty ON calibration_tasks(difficulty);
CREATE INDEX IF NOT EXISTS idx_calibration_tasks_category ON calibration_tasks(category);
CREATE INDEX IF NOT EXISTS idx_calibration_tasks_market ON calibration_tasks(task_id);
CREATE INDEX IF NOT EXISTS idx_redemption_attempts_user ON redemption_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_redemption_attempts_created ON redemption_attempts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_redemption_attempts_task ON redemption_attempts(task_id);
CREATE INDEX IF NOT EXISTS idx_reputation_history_agent ON reputation_history(agent_id);
CREATE INDEX IF NOT EXISTS idx_reputation_history_created ON reputation_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reputation_history_market ON reputation_history(task_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_type ON audit_logs(entity_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_id ON audit_logs(entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_metadata ON audit_logs USING GIN (metadata);
CREATE INDEX IF NOT EXISTS idx_market_status_audit_market ON market_status_audit(task_id);
CREATE INDEX IF NOT EXISTS idx_market_status_audit_changed_at ON market_status_audit(changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_settlement_audit_market ON settlement_audit(task_id);
CREATE INDEX IF NOT EXISTS idx_settlement_audit_admin ON settlement_audit(admin_id);
CREATE INDEX IF NOT EXISTS idx_settlement_audit_settled_at ON settlement_audit(settled_at DESC);
CREATE INDEX IF NOT EXISTS idx_nda_agreements_market ON nda_agreements(task_id);
CREATE INDEX IF NOT EXISTS idx_nda_agreements_agent ON nda_agreements(agent_id);
CREATE INDEX IF NOT EXISTS idx_nda_agreements_agreed_at ON nda_agreements(agreed_at DESC);
CREATE INDEX IF NOT EXISTS idx_crowdfunding_market ON crowdfunding_contributions(task_id);
CREATE INDEX IF NOT EXISTS idx_crowdfunding_contributor ON crowdfunding_contributions(contributor_id);
CREATE INDEX IF NOT EXISTS idx_crowdfunding_contributed_at ON crowdfunding_contributions(contributed_at DESC);
CREATE INDEX IF NOT EXISTS idx_crowdfunding_payment_status ON crowdfunding_contributions(payment_status);

-- ============================================================================
-- PART 7: 基础触发器和函数
-- ============================================================================

-- 7.1 自动更新 updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_markets_updated_at ON markets;
CREATE TRIGGER update_markets_updated_at
  BEFORE UPDATE ON markets
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 7.2 更新用户预测计数
CREATE OR REPLACE FUNCTION update_prediction_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE profiles
    SET prediction_count = prediction_count + 1
    WHERE id = NEW.user_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE profiles
    SET prediction_count = prediction_count - 1
    WHERE id = OLD.user_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_user_prediction_count ON predictions;
CREATE TRIGGER update_user_prediction_count
  AFTER INSERT OR DELETE ON predictions
  FOR EACH ROW
  EXECUTE FUNCTION update_prediction_count();

-- 7.3 众筹进度自动计算
CREATE OR REPLACE FUNCTION update_funding_progress()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.funding_goal > 0 THEN
    NEW.funding_progress := NEW.funding_current / NEW.funding_goal;
  ELSE
    NEW.funding_progress := 0;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_funding_progress ON markets;
CREATE TRIGGER trigger_update_funding_progress
  BEFORE INSERT OR UPDATE OF funding_current, funding_goal ON markets
  FOR EACH ROW
  EXECUTE FUNCTION update_funding_progress();

-- 7.4 众筹达标自动激活任务
CREATE OR REPLACE FUNCTION auto_activate_crowdfunded_market()
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

DROP TRIGGER IF EXISTS trigger_auto_activate_crowdfunded_market ON markets;
CREATE TRIGGER trigger_auto_activate_crowdfunded_market
  BEFORE UPDATE OF funding_current ON markets
  FOR EACH ROW
  EXECUTE FUNCTION auto_activate_crowdfunded_market();

-- ============================================================================
-- PART 8: 市场自动关闭系统
-- ============================================================================

-- 8.1 市场自动关闭函数
CREATE OR REPLACE FUNCTION auto_close_expired_markets()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  updated_count INTEGER;
BEGIN
  UPDATE markets
  SET 
    status = 'closed',
    updated_at = NOW()
  WHERE 
    status = 'active'
    AND closes_at <= NOW()
    AND closes_at IS NOT NULL;
  
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  
  IF updated_count > 0 THEN
    RAISE NOTICE '自动关闭了 % 个过期市场', updated_count;
  END IF;
  
  RETURN updated_count;
END;
$$;

-- 8.2 手动触发市场关闭（用于测试）
DROP FUNCTION IF EXISTS trigger_market_auto_close();
CREATE OR REPLACE FUNCTION trigger_market_auto_close()
RETURNS TABLE(
  closed_count INTEGER,
  closed_task_ids UUID[]
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  updated_count INTEGER;
  task_ids UUID[];
BEGIN
  SELECT ARRAY_AGG(id) INTO task_ids
  FROM markets
  WHERE status = 'active'
    AND closes_at <= NOW()
    AND closes_at IS NOT NULL;
  
  updated_count := auto_close_expired_markets();
  
  RETURN QUERY SELECT updated_count, task_ids;
END;
$$;

-- 8.3 市场状态变更审计触发器
CREATE OR REPLACE FUNCTION log_market_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO market_status_audit (task_id, old_status, new_status, changed_by)
    VALUES (NEW.id, OLD.status, NEW.status, 'auto_close_system');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS market_status_change_trigger ON markets;
CREATE TRIGGER market_status_change_trigger
  AFTER UPDATE ON markets
  FOR EACH ROW
  EXECUTE FUNCTION log_market_status_change();

-- 8.4 配置定时任务（需要pg_cron扩展）
DO $$
BEGIN
  PERFORM cron.unschedule('auto-close-markets');
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END $$;

SELECT cron.schedule(
  'auto-close-markets',
  '* * * * *',
  'SELECT auto_close_expired_markets();'
);

-- ============================================================================
-- PART 9: 结算系统函数
-- ============================================================================

-- 9.1 更新用户信誉分和收益
CREATE OR REPLACE FUNCTION update_user_reputation_and_earnings(
  p_user_id UUID,
  p_reputation_change INTEGER,
  p_earnings_change DECIMAL(10, 2)
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

  v_new_reputation := v_old_reputation + p_reputation_change;
  
  IF v_new_reputation < 0 THEN
    v_new_reputation := 0;
  END IF;

  UPDATE profiles
  SET 
    reputation_score = v_new_reputation,
    total_earnings = total_earnings + p_earnings_change,
    updated_at = NOW()
  WHERE id = p_user_id;

  INSERT INTO reputation_history (
    agent_id,
    change_amount,
    reason,
    old_score,
    new_score,
    created_at
  ) VALUES (
    p_user_id,
    p_reputation_change,
    CASE 
      WHEN p_reputation_change > 0 THEN 'prediction_correct'
      ELSE 'prediction_wrong'
    END,
    v_old_reputation,
    v_new_reputation,
    NOW()
  );
END;
$$;

-- 9.2 事务性市场结算函数
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
  v_prediction RECORD;
  v_correct_count INT := 0;
  v_incorrect_count INT := 0;
  v_reward_per_winner NUMERIC := 0;
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
  
  SELECT COUNT(*) INTO v_correct_count
  FROM predictions
  WHERE task_id = p_task_id
    AND (probability >= 0.5) = p_outcome;
  
  SELECT COUNT(*) INTO v_incorrect_count
  FROM predictions
  WHERE task_id = p_task_id
    AND (probability >= 0.5) != p_outcome;
  
  IF v_correct_count > 0 THEN
    v_reward_per_winner := v_market.reward_pool / v_correct_count;
  END IF;
  
  FOR v_prediction IN
    SELECT user_id
    FROM predictions
    WHERE task_id = p_task_id
      AND (probability >= 0.5) = p_outcome
  LOOP
    PERFORM update_user_reputation_and_earnings(
      v_prediction.user_id,
      10,
      v_reward_per_winner
    );
  END LOOP;
  
  FOR v_prediction IN
    SELECT user_id
    FROM predictions
    WHERE task_id = p_task_id
      AND (probability >= 0.5) != p_outcome
  LOOP
    PERFORM update_user_reputation_and_earnings(
      v_prediction.user_id,
      -20,
      0
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
      'correct_predictions', v_correct_count,
      'incorrect_predictions', v_incorrect_count,
      'reward_per_winner', v_reward_per_winner
    )
  );
  
  v_total_rewards := v_reward_per_winner * v_correct_count;
  
  v_result := jsonb_build_object(
    'success', true,
    'task_id', p_task_id,
    'outcome', p_outcome,
    'correct_predictions', v_correct_count,
    'incorrect_predictions', v_incorrect_count,
    'reward_per_winner', v_reward_per_winner,
    'total_rewards_distributed', v_total_rewards
  );
  
  RETURN v_result;
  
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION '市场结算失败: %', SQLERRM;
END;
$$;

-- ============================================================================
-- PART 10: 审计日志系统
-- ============================================================================

-- 10.1 审计日志记录函数
CREATE OR REPLACE FUNCTION log_audit(
  p_user_id UUID,
  p_action VARCHAR,
  p_entity_type VARCHAR,
  p_entity_id UUID,
  p_old_data JSONB DEFAULT NULL,
  p_new_data JSONB DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_log_id UUID;
BEGIN
  INSERT INTO audit_logs (
    user_id,
    action,
    entity_type,
    entity_id,
    old_data,
    new_data,
    metadata
  ) VALUES (
    p_user_id,
    p_action,
    p_entity_type,
    p_entity_id,
    p_old_data,
    p_new_data,
    p_metadata
  )
  RETURNING id INTO v_log_id;
  
  RETURN v_log_id;
END;
$$;

-- 10.2 Profiles 表审计触发器
CREATE OR REPLACE FUNCTION audit_profiles_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM log_audit(
      NEW.id,
      'create',
      'profile',
      NEW.id,
      NULL,
      to_jsonb(NEW),
      jsonb_build_object('trigger', 'auto')
    );
  ELSIF TG_OP = 'UPDATE' THEN
    PERFORM log_audit(
      NEW.id,
      'update',
      'profile',
      NEW.id,
      to_jsonb(OLD),
      to_jsonb(NEW),
      jsonb_build_object('trigger', 'auto')
    );
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM log_audit(
      OLD.id,
      'delete',
      'profile',
      OLD.id,
      to_jsonb(OLD),
      NULL,
      jsonb_build_object('trigger', 'auto')
    );
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS audit_profiles_trigger ON profiles;
CREATE TRIGGER audit_profiles_trigger
  AFTER INSERT OR UPDATE OR DELETE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION audit_profiles_changes();

-- 10.3 Markets 表审计触发器
CREATE OR REPLACE FUNCTION audit_markets_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM log_audit(
      NEW.created_by,
      'create',
      'market',
      NEW.id,
      NULL,
      to_jsonb(NEW),
      jsonb_build_object('trigger', 'auto')
    );
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status != NEW.status AND NEW.status = 'resolved' THEN
      PERFORM log_audit(
        auth.uid(),
        'resolve',
        'market',
        NEW.id,
        to_jsonb(OLD),
        to_jsonb(NEW),
        jsonb_build_object('trigger', 'auto', 'outcome', NEW.actual_outcome)
      );
    ELSE
      PERFORM log_audit(
        auth.uid(),
        'update',
        'market',
        NEW.id,
        to_jsonb(OLD),
        to_jsonb(NEW),
        jsonb_build_object('trigger', 'auto')
      );
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM log_audit(
      auth.uid(),
      'delete',
      'market',
      OLD.id,
      to_jsonb(OLD),
      NULL,
      jsonb_build_object('trigger', 'auto')
    );
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS audit_markets_trigger ON markets;
CREATE TRIGGER audit_markets_trigger
  AFTER INSERT OR UPDATE OR DELETE ON markets
  FOR EACH ROW
  EXECUTE FUNCTION audit_markets_changes();

-- 10.4 Predictions 表审计触发器
CREATE OR REPLACE FUNCTION audit_predictions_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM log_audit(
      NEW.user_id,
      'create',
      'prediction',
      NEW.id,
      NULL,
      to_jsonb(NEW),
      jsonb_build_object('trigger', 'auto')
    );
  ELSIF TG_OP = 'UPDATE' THEN
    PERFORM log_audit(
      NEW.user_id,
      'update',
      'prediction',
      NEW.id,
      to_jsonb(OLD),
      to_jsonb(NEW),
      jsonb_build_object('trigger', 'auto')
    );
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM log_audit(
      OLD.user_id,
      'delete',
      'prediction',
      OLD.id,
      to_jsonb(OLD),
      NULL,
      jsonb_build_object('trigger', 'auto')
    );
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS audit_predictions_trigger ON predictions;
CREATE TRIGGER audit_predictions_trigger
  AFTER INSERT OR UPDATE OR DELETE ON predictions
  FOR EACH ROW
  EXECUTE FUNCTION audit_predictions_changes();

-- ============================================================================
-- PART 11: 事务性操作函数
-- ============================================================================

-- 11.1 事务性账号删除
CREATE OR REPLACE FUNCTION delete_user_account(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
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
-- PART 12: 辅助函数
-- ============================================================================

-- 12.1 计算Brier Score
CREATE OR REPLACE FUNCTION calculate_brier_score(
  predicted_probability DECIMAL,
  actual_outcome DECIMAL
)
RETURNS DECIMAL AS $$
BEGIN
  RETURN POWER(predicted_probability - actual_outcome, 2);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 12.2 检查用户是否为管理员
CREATE OR REPLACE FUNCTION is_admin(user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = user_id AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 12.3 计算Top 10%阈值
CREATE OR REPLACE FUNCTION get_top_10_percent_threshold()
RETURNS DECIMAL AS $$
DECLARE
  threshold DECIMAL;
BEGIN
  SELECT PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY reputation_score)
  INTO threshold
  FROM profiles
  WHERE status = 'active';
  
  RETURN COALESCE(threshold, 0);
END;
$$ LANGUAGE plpgsql STABLE;

-- 12.4 检查Agent是否可访问私密任务
DROP FUNCTION IF EXISTS can_access_private_task(UUID, UUID);
CREATE OR REPLACE FUNCTION can_access_private_task(
  p_agent_id UUID,
  p_task_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  v_market RECORD;
  v_agent RECORD;
  v_top_10_threshold DECIMAL;
BEGIN
  SELECT * INTO v_market FROM markets WHERE id = p_task_id;
  
  IF v_market.visibility = 'public' THEN
    RETURN TRUE;
  END IF;
  
  IF v_market.created_by = p_agent_id THEN
    RETURN TRUE;
  END IF;
  
  IF p_agent_id = ANY(v_market.allowed_viewers) THEN
    RETURN TRUE;
  END IF;
  
  SELECT * INTO v_agent FROM profiles WHERE id = p_agent_id;
  
  IF v_agent.reputation_score < v_market.min_reputation THEN
    v_top_10_threshold := get_top_10_percent_threshold();
    IF v_agent.reputation_score < v_top_10_threshold THEN
      RETURN FALSE;
    END IF;
  END IF;
  
  IF v_market.required_niche_tags IS NOT NULL THEN
    IF NOT (v_market.required_niche_tags && v_agent.niche_tags) THEN
      RETURN FALSE;
    END IF;
  END IF;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- PART 13: 监控视图
-- ============================================================================

-- 13.1 公开市场统计视图
DROP VIEW IF EXISTS public_market_stats;
CREATE OR REPLACE VIEW public_market_stats AS
SELECT
  m.id AS task_id,
  m.title,
  m.question,
  m.status,
  m.closes_at,
  COUNT(p.id) AS prediction_count,
  AVG(p.probability) AS consensus_probability,
  STDDEV(p.probability) AS divergence_score,
  MIN(p.probability) AS min_probability,
  MAX(p.probability) AS max_probability
FROM markets m
LEFT JOIN predictions p ON m.id = p.task_id
GROUP BY m.id, m.title, m.question, m.status, m.closes_at;

-- 13.2 索引使用情况监控
CREATE OR REPLACE VIEW index_usage AS
SELECT 
  schemaname,
  relname as tablename,
  indexrelname as indexname,
  idx_scan as index_scans,
  idx_tup_read as tuples_read,
  idx_tup_fetch as tuples_fetched,
  pg_size_pretty(pg_relation_size(indexrelid)) as index_size
FROM pg_stat_user_indexes
ORDER BY idx_scan ASC;

-- 13.3 表膨胀监控
CREATE OR REPLACE VIEW table_bloat AS
SELECT 
  schemaname,
  relname as tablename,
  pg_size_pretty(pg_total_relation_size(quote_ident(schemaname)||'.'||quote_ident(relname))) as total_size,
  pg_size_pretty(pg_relation_size(quote_ident(schemaname)||'.'||quote_ident(relname))) as table_size,
  pg_size_pretty(pg_total_relation_size(quote_ident(schemaname)||'.'||quote_ident(relname)) - pg_relation_size(quote_ident(schemaname)||'.'||quote_ident(relname))) as indexes_size,
  n_live_tup as live_tuples,
  n_dead_tup as dead_tuples,
  ROUND(100 * n_dead_tup / NULLIF(n_live_tup + n_dead_tup, 0), 2) as dead_tuple_percent
FROM pg_stat_user_tables
ORDER BY pg_total_relation_size(quote_ident(schemaname)||'.'||quote_ident(relname)) DESC;

-- ============================================================================
-- PART 14: RLS策略
-- ============================================================================

-- 14.1 启用RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE markets ENABLE ROW LEVEL SECURITY;
ALTER TABLE predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE simulations ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE nda_agreements ENABLE ROW LEVEL SECURITY;
ALTER TABLE crowdfunding_contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE calibration_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE redemption_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE reputation_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_status_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE settlement_audit ENABLE ROW LEVEL SECURITY;

-- 14.2 Profiles 表策略
DROP POLICY IF EXISTS "公开查看所有用户档案" ON profiles;
CREATE POLICY "公开查看所有用户档案" ON profiles FOR SELECT USING (true);
DROP POLICY IF EXISTS "用户只能更新自己的档案" ON profiles;
CREATE POLICY "用户只能更新自己的档案" ON profiles FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
DROP POLICY IF EXISTS "用户可以创建自己的档案" ON profiles;
CREATE POLICY "用户可以创建自己的档案" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
DROP POLICY IF EXISTS "用户只能删除自己的档案" ON profiles;
CREATE POLICY "用户只能删除自己的档案" ON profiles FOR DELETE USING (auth.uid() = id);
DROP POLICY IF EXISTS "服务角色可以管理所有profiles" ON profiles;
CREATE POLICY "服务角色可以管理所有profiles" ON profiles FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 14.3 Markets 表策略（支持v5.0私密任务）
DROP POLICY IF EXISTS "v5_markets_select_policy" ON markets;
CREATE POLICY "v5_markets_select_policy"
  ON markets FOR SELECT
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
          reputation_score >= markets.min_reputation
          OR reputation_score >= (
            SELECT PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY reputation_score)
            FROM profiles
            WHERE status = 'active'
          )
        )
        AND (
          markets.required_niche_tags IS NULL
          OR markets.required_niche_tags && profiles.niche_tags
        )
      )
    )
  );

DROP POLICY IF EXISTS "认证用户可以创建市场" ON markets;
CREATE POLICY "认证用户可以创建市场" ON markets FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
DROP POLICY IF EXISTS "创建者可以更新市场" ON markets;
CREATE POLICY "创建者可以更新市场" ON markets FOR UPDATE USING (auth.uid() = created_by) WITH CHECK (auth.uid() = created_by);
DROP POLICY IF EXISTS "创建者可以删除市场" ON markets;
CREATE POLICY "创建者可以删除市场" ON markets FOR DELETE USING (auth.uid() = created_by);
DROP POLICY IF EXISTS "服务角色可以管理所有markets" ON markets;
CREATE POLICY "服务角色可以管理所有markets" ON markets FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 14.4 Predictions 表策略（支持v5.0 NDA验证）
DROP POLICY IF EXISTS "用户只能查看自己的预测" ON predictions;
CREATE POLICY "用户只能查看自己的预测" ON predictions FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "v5_predictions_insert_policy" ON predictions;
CREATE POLICY "v5_predictions_insert_policy"
  ON predictions FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM markets
      WHERE id = task_id
      AND (
        (visibility = 'public' AND NOT requires_nda)
        OR (requires_nda AND EXISTS (
          SELECT 1 FROM nda_agreements
          WHERE task_id = markets.id
          AND agent_id = auth.uid()
        ))
        OR created_by = auth.uid()
      )
    )
  );
DROP POLICY IF EXISTS "用户可以删除自己的未结算预测" ON predictions;
CREATE POLICY "用户可以删除自己的未结算预测" ON predictions FOR DELETE USING (
  auth.uid() = user_id AND brier_score IS NULL AND EXISTS (
    SELECT 1 FROM markets WHERE markets.id = predictions.task_id AND markets.status = 'active'
  )
);
DROP POLICY IF EXISTS "服务角色可以管理所有predictions" ON predictions;
CREATE POLICY "服务角色可以管理所有predictions" ON predictions FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 14.5 Simulations 表策略
DROP POLICY IF EXISTS "所有人可以查看模拟内容" ON simulations;
CREATE POLICY "所有人可以查看模拟内容" ON simulations FOR SELECT USING (true);
DROP POLICY IF EXISTS "服务角色可以管理所有simulations" ON simulations;
CREATE POLICY "服务角色可以管理所有simulations" ON simulations FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 14.6 Audit_logs 表策略
DROP POLICY IF EXISTS "管理员可以查看所有审计日志" ON audit_logs;
CREATE POLICY "管理员可以查看所有审计日志" ON audit_logs FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
);
DROP POLICY IF EXISTS "系统可以插入审计日志" ON audit_logs;
CREATE POLICY "系统可以插入审计日志" ON audit_logs FOR INSERT WITH CHECK (true);

-- 14.7 NDA_agreements 表策略
DROP POLICY IF EXISTS "v5_nda_agreements_select_policy" ON nda_agreements;
CREATE POLICY "v5_nda_agreements_select_policy"
  ON nda_agreements FOR SELECT
  USING (
    agent_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM markets
      WHERE id = task_id
      AND created_by = auth.uid()
    )
  );
DROP POLICY IF EXISTS "v5_nda_agreements_insert_policy" ON nda_agreements;
CREATE POLICY "v5_nda_agreements_insert_policy"
  ON nda_agreements FOR INSERT
  WITH CHECK (agent_id = auth.uid());

-- 14.8 Crowdfunding_contributions 表策略
DROP POLICY IF EXISTS "v5_crowdfunding_select_policy" ON crowdfunding_contributions;
CREATE POLICY "v5_crowdfunding_select_policy"
  ON crowdfunding_contributions FOR SELECT
  USING (
    contributor_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM markets
      WHERE id = task_id
      AND created_by = auth.uid()
    )
  );
DROP POLICY IF EXISTS "v5_crowdfunding_insert_policy" ON crowdfunding_contributions;
CREATE POLICY "v5_crowdfunding_insert_policy"
  ON crowdfunding_contributions FOR INSERT
  WITH CHECK (contributor_id = auth.uid());

-- 14.9 Calibration_tasks 表策略
DROP POLICY IF EXISTS "认证用户可以查看校准任务" ON calibration_tasks;
CREATE POLICY "认证用户可以查看校准任务" ON calibration_tasks FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "服务角色可以管理所有calibration_tasks" ON calibration_tasks;
CREATE POLICY "服务角色可以管理所有calibration_tasks" ON calibration_tasks FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 14.10 Redemption_attempts 表策略
DROP POLICY IF EXISTS "用户只能查看自己的救赎记录" ON redemption_attempts;
CREATE POLICY "用户只能查看自己的救赎记录" ON redemption_attempts FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "公开查看成功救赎记录" ON redemption_attempts;
CREATE POLICY "公开查看成功救赎记录" ON redemption_attempts FOR SELECT USING (is_correct = true AND streak_after >= 5);
DROP POLICY IF EXISTS "服务角色可以管理所有redemption_attempts" ON redemption_attempts;
CREATE POLICY "服务角色可以管理所有redemption_attempts" ON redemption_attempts FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 14.11 Reputation_history 表策略
DROP POLICY IF EXISTS "用户只能查看自己的信誉历史" ON reputation_history;
CREATE POLICY "用户只能查看自己的信誉历史" ON reputation_history FOR SELECT USING (auth.uid() = agent_id);
DROP POLICY IF EXISTS "服务角色可以管理所有reputation_history" ON reputation_history;
CREATE POLICY "服务角色可以管理所有reputation_history" ON reputation_history FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 14.12 Market_status_audit 表策略
DROP POLICY IF EXISTS "管理员可以查看市场状态审计" ON market_status_audit;
CREATE POLICY "管理员可以查看市场状态审计" ON market_status_audit FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
);
DROP POLICY IF EXISTS "管理员可以插入市场状态审计" ON market_status_audit;
CREATE POLICY "管理员可以插入市场状态审计" ON market_status_audit FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
);
DROP POLICY IF EXISTS "服务角色可以管理所有market_status_audit" ON market_status_audit;
CREATE POLICY "服务角色可以管理所有market_status_audit" ON market_status_audit FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 14.13 Settlement_audit 表策略
DROP POLICY IF EXISTS "管理员可以查看结算审计" ON settlement_audit;
CREATE POLICY "管理员可以查看结算审计" ON settlement_audit FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
);
DROP POLICY IF EXISTS "服务角色可以管理所有settlement_audit" ON settlement_audit;
CREATE POLICY "服务角色可以管理所有settlement_audit" ON settlement_audit FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================================
-- PART 15: 表和字段注释
-- ============================================================================

-- 表注释
COMMENT ON TABLE profiles IS '用户档案表，存储用户基本信息、信誉分和收益';
COMMENT ON TABLE markets IS '预测市场表，存储所有预测问题（含v5.0私密任务和众筹功能）';
COMMENT ON TABLE predictions IS '预测提交表，存储所有用户的预测记录';
COMMENT ON TABLE simulations IS '未来模拟器表，存储AI生成的未来新闻报道';
COMMENT ON TABLE calibration_tasks IS '校准任务表，存储已知答案的历史问题供炼狱用户使用';
COMMENT ON TABLE redemption_attempts IS '救赎尝试记录表，记录炼狱用户的每次答题尝试';
COMMENT ON TABLE reputation_history IS '信誉分历史记录表，记录所有信誉分变化';
COMMENT ON TABLE reputation_levels IS '信誉等级配置表，定义各等级的权限和特权';
COMMENT ON TABLE audit_logs IS '审计日志表，记录所有重要的数据修改操作';
COMMENT ON TABLE market_status_audit IS '市场状态变更审计日志';
COMMENT ON TABLE settlement_audit IS '市场结算审计日志';
COMMENT ON TABLE nda_agreements IS 'NDA签署记录表，记录Agent对私密任务的保密协议签署';
COMMENT ON TABLE crowdfunding_contributions IS '众筹贡献记录表，记录用户对众筹任务的资金贡献';
COMMENT ON TABLE niche_tags_reference IS '专业领域标签参考表，存储预定义的领域分类';

-- 字段注释
COMMENT ON COLUMN profiles.api_key_hash IS 'API密钥的哈希值（bcrypt加密）';
COMMENT ON COLUMN profiles.reputation_score IS '用户信誉分数，基于预测准确度计算';
COMMENT ON COLUMN profiles.total_earnings IS '用户累计收益';
COMMENT ON COLUMN profiles.status IS '用户状态：active(正常), restricted(炼狱模式)';
COMMENT ON COLUMN profiles.redemption_streak IS '救赎连胜数，连续答对5题可出狱';
COMMENT ON COLUMN profiles.reputation_level IS '信誉等级：apprentice, intermediate, advanced, expert, master, legend';
COMMENT ON COLUMN profiles.role IS '用户角色：user(普通用户), admin(管理员)';
COMMENT ON COLUMN profiles.niche_tags IS '专业领域标签：Tech, Finance, Healthcare, Legal, Marketing等';
COMMENT ON COLUMN markets.status IS '市场状态：active(活跃), closed(已关闭), resolved(已解决)';
COMMENT ON COLUMN markets.actual_outcome IS '实际结果，0或1（二元市场）';
COMMENT ON COLUMN markets.reward_pool IS '奖金池金额';
COMMENT ON COLUMN markets.is_calibration IS '是否为校准任务（炼狱模式用户专用）';
COMMENT ON COLUMN markets.visibility IS '任务可见性：public(公开), private(私密，仅高信誉Agent可见)';
COMMENT ON COLUMN markets.min_reputation IS '最低信誉要求，私密任务专用';
COMMENT ON COLUMN markets.allowed_viewers IS '允许查看的用户ID列表（白名单）';
COMMENT ON COLUMN markets.funding_type IS '资金模式：crowd(众筹), direct(直接付费)';
COMMENT ON COLUMN markets.funding_goal IS '众筹目标金额（$50-200）';
COMMENT ON COLUMN markets.funding_current IS '当前众筹金额';
COMMENT ON COLUMN markets.funding_progress IS '众筹进度（0-1），自动计算';
COMMENT ON COLUMN markets.report_access IS '报告访问权限：open(公开), exclusive(独家), subscription(订阅)';
COMMENT ON COLUMN markets.required_niche_tags IS '所需专业领域标签';
COMMENT ON COLUMN markets.target_agent_count IS '目标Agent数量';
COMMENT ON COLUMN markets.budget_per_agent IS '每个Agent的预算';
COMMENT ON COLUMN markets.requires_nda IS '是否需要签署NDA';
COMMENT ON COLUMN markets.nda_text IS 'NDA协议文本';
COMMENT ON COLUMN predictions.probability IS '预测概率，范围0-1';
COMMENT ON COLUMN predictions.rationale IS '预测推理理由，最多10000字符';
COMMENT ON COLUMN predictions.brier_score IS 'Brier Score，市场解决后计算';
COMMENT ON COLUMN predictions.reward_earned IS '获得的奖励金额';
COMMENT ON COLUMN nda_agreements.ip_address IS '签署时的IP地址';
COMMENT ON COLUMN nda_agreements.user_agent IS '签署时的浏览器User-Agent';
COMMENT ON COLUMN crowdfunding_contributions.amount IS '贡献金额，最小$1';
COMMENT ON COLUMN crowdfunding_contributions.payment_status IS '支付状态：pending(待处理), completed(已完成), failed(失败), refunded(已退款)';
COMMENT ON COLUMN crowdfunding_contributions.transaction_id IS '支付交易ID';

-- 函数注释
COMMENT ON FUNCTION auto_close_expired_markets IS '自动关闭已过期的活跃市场';
COMMENT ON FUNCTION trigger_market_auto_close IS '手动触发市场自动关闭（用于测试）';
COMMENT ON FUNCTION update_user_reputation_and_earnings IS '更新用户信誉分和收益（用于市场结算）';
COMMENT ON FUNCTION resolve_market_transaction IS '事务性市场结算，确保原子性';
COMMENT ON FUNCTION delete_user_account IS '事务性删除用户账号及所有关联数据';
COMMENT ON FUNCTION calculate_brier_score IS '计算Brier Score: (probability - outcome)^2';
COMMENT ON FUNCTION is_admin IS '检查用户是否为管理员';
COMMENT ON FUNCTION get_top_10_percent_threshold IS '计算活跃Agent的信誉分第90百分位数（Top 10%阈值）';
COMMENT ON FUNCTION can_access_private_task IS '检查Agent是否可以访问指定的私密任务';
COMMENT ON FUNCTION update_funding_progress IS '众筹达标时自动将任务状态从pending更新为active';
COMMENT ON VIEW public_market_stats IS '市场预测统计视图，不包含敏感的rationale信息';
COMMENT ON VIEW index_usage IS '索引使用情况监控视图，帮助识别未使用的索引';
COMMENT ON VIEW table_bloat IS '表膨胀监控视图，显示死元组比例';

-- ============================================================================
-- PART 16: 更新统计信息
-- ============================================================================

ANALYZE profiles;
ANALYZE markets;
ANALYZE predictions;
ANALYZE simulations;
ANALYZE audit_logs;

-- ============================================================================
-- 状态字段说明
-- ============================================================================

-- markets.status 字段说明：
-- - pending: 等待中（众筹未完成或等待agent参与）
-- - active: 活跃中（可以提交预言）
-- - closed: 已关闭（不再接受预言提交）
-- - resolved: 已兑现（结果已确定）
--
-- 状态转换流程：
-- [众筹模式] pending → active → closed → resolved
-- [直接付费] active → closed → resolved
--
-- 注意：即使没有agent在线，用户也可以创建任务（状态为pending）

-- ============================================================================
-- 完成消息
-- ============================================================================

-- 返回数据库初始化完成信息
SELECT 
  '✅ DelphiGraph 完整数据库初始化完成' as 状态,
  '数据库已成功创建并配置' as 说明

UNION ALL SELECT '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
UNION ALL SELECT '📊 数据库摘要', ''
UNION ALL SELECT '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'

UNION ALL SELECT '✓ 核心表', 'profiles, markets, predictions, simulations'
UNION ALL SELECT '✓ 炼狱系统', 'calibration_tasks, redemption_attempts'
UNION ALL SELECT '✓ 信誉系统', 'reputation_history, reputation_levels'
UNION ALL SELECT '✓ 审计系统', 'audit_logs, market_status_audit, settlement_audit'
UNION ALL SELECT '✓ v5.0功能', 'nda_agreements, crowdfunding_contributions, niche_tags_reference'
UNION ALL SELECT '✓ 索引', '所有性能优化索引已创建'
UNION ALL SELECT '✓ RLS策略', '支持私密任务访问控制'
UNION ALL SELECT '✓ 函数和触发器', '核心业务逻辑已配置'
UNION ALL SELECT '✓ 监控视图', '数据库监控视图已创建'

UNION ALL SELECT '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
UNION ALL SELECT '🎯 包含功能', ''
UNION ALL SELECT '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'

UNION ALL SELECT '1. MVP核心功能', '完整的预测市场系统'
UNION ALL SELECT '2. 炼狱+救赎机制', '用户信誉恢复系统'
UNION ALL SELECT '3. 信誉系统', '8级信誉等级体系'
UNION ALL SELECT '4. Search the Future', 'v5.0 搜索引擎架构'
UNION ALL SELECT '5. 智能分发系统', 'v5.0 The Iceberg'
UNION ALL SELECT '6. NDA保密机制', 'v5.0 私密任务保护'
UNION ALL SELECT '7. 双模式资金', 'v5.0 众筹 + 直接付费'
UNION ALL SELECT '8. 专业领域匹配', 'v5.0 Niche Match'

UNION ALL SELECT '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
UNION ALL SELECT '📝 下一步', ''
UNION ALL SELECT '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'

UNION ALL SELECT '→ 验证数据库', '运行README.md中的验证脚本'
UNION ALL SELECT '→ 后端API', '开始实现Task 35-39'
UNION ALL SELECT '→ 前端组件', '开始实现Task 41-45';
