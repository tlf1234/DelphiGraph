-- ============================================================================
-- DelphiGraph 完整数据库初始化脚本（v3.0 — UAP Signal Submissions）
-- 包含所有表结构、函数、触发器、RLS策略和v5.0功能
-- 日期: 2024-02-18
-- 更新: 2026-04-06 - 全面迁移至 UAP v3.0 signal_submissions 协议
-- 
-- 这是一个统一的数据库初始化文件，包含：
-- 1. 核心表结构 (profiles, prediction_tasks, signal_submissions, simulations)
-- 2. 涅槃+救赎系统表
-- 3. 信誉系统表
-- 4. 审计日志表
-- 5. v5.0升级功能（智能分发、NDA、众筹、专业领域匹配）
-- 6. 画像系统表 (agent_personas, task_personas)
-- 7. 因果分析结果表 (causal_analyses)
-- 8. 调查模块表 (survey_tasks, survey_questions, survey_responses, survey_analyses)
-- 9. 所有索引和约束
-- 10. RLS策略
-- 11. 核心函数和触发器
-- 12. 搜索 RPC 函数 (search_signals_optimized, search_signals_count)
-- 13. 监控视图
-- 
-- 重要说明：
-- - 本脚本反映迁移链 (01-09) 执行完毕后的最终状态
-- - predictions 表已被 signal_submissions 完全替代
-- - prediction_tasks.task_category 默认值为 'signal'（非旧版 'prediction'）
-- - 所有函数使用 submission_correct/submission_wrong reason keys
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
  submission_count INTEGER DEFAULT 0 NOT NULL,
  
  -- 涅槃机制
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'restricted')),
  redemption_streak INTEGER DEFAULT 0 NOT NULL,
  redemption_attempts INTEGER DEFAULT 0 NOT NULL,
  purgatory_entered_at TIMESTAMPTZ,
  purgatory_reason TEXT,
  
  -- 信誉系统
  reputation_level TEXT DEFAULT 'apprentice' NOT NULL,
  win_streak INTEGER DEFAULT 0 NOT NULL,
  total_submissions INTEGER DEFAULT 0 NOT NULL,
  correct_submissions INTEGER DEFAULT 0 NOT NULL,
  is_banned BOOLEAN DEFAULT false NOT NULL,
  ban_reason TEXT,
  recovery_tasks_completed INTEGER DEFAULT 0 NOT NULL,
  last_submission_at TIMESTAMPTZ,
  daily_submission_count INTEGER DEFAULT 0 NOT NULL,
  daily_reset_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  
  -- v5.0: 专业领域标签
  niche_tags TEXT[],
  
  -- v4.0: 用户画像字段
  persona_region TEXT,
  persona_gender TEXT CHECK (persona_gender IN ('male', 'female', 'other', 'unknown')),
  persona_age_range TEXT,
  persona_occupation TEXT,
  persona_interests TEXT[],
  
  -- 管理员
  role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  
  -- 时间戳
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  
  -- 约束
  CONSTRAINT reputation_score_positive CHECK (reputation_score >= 0),
  CONSTRAINT total_earnings_non_negative CHECK (total_earnings >= 0),
  CONSTRAINT submission_count_non_negative CHECK (submission_count >= 0)
);

-- 已存在旧表时补全 profiles 缺少的列（幂等）
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS twitter_handle TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS api_key_hash TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS reputation_score DECIMAL(10, 2) DEFAULT 100 NOT NULL;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS total_earnings DECIMAL(10, 2) DEFAULT 0 NOT NULL;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS submission_count INTEGER DEFAULT 0 NOT NULL;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS redemption_streak INTEGER DEFAULT 0 NOT NULL;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS redemption_attempts INTEGER DEFAULT 0 NOT NULL;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS purgatory_entered_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS purgatory_reason TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS reputation_level TEXT DEFAULT 'apprentice' NOT NULL;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS win_streak INTEGER DEFAULT 0 NOT NULL;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS total_submissions INTEGER DEFAULT 0 NOT NULL;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS correct_submissions INTEGER DEFAULT 0 NOT NULL;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_banned BOOLEAN DEFAULT false NOT NULL;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ban_reason TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS recovery_tasks_completed INTEGER DEFAULT 0 NOT NULL;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_submission_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS daily_submission_count INTEGER DEFAULT 0 NOT NULL;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS daily_reset_at TIMESTAMPTZ DEFAULT NOW() NOT NULL;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS niche_tags TEXT[];
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS persona_region TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS persona_gender TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS persona_age_range TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS persona_occupation TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS persona_interests TEXT[];
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user';

-- 1.2 PREDICTION_TASKS 表 - 预测任务
CREATE TABLE IF NOT EXISTS prediction_tasks (
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
  
  -- v3.0: 任务类别和客户类型
  task_category TEXT DEFAULT 'signal' CHECK (task_category IN ('signal', 'research')),
  task_type TEXT DEFAULT 'consumer' CHECK (task_type IN ('consumer', 'business')),
  result_visibility TEXT DEFAULT 'public' CHECK (result_visibility IN ('public', 'private')),
  priority_level TEXT DEFAULT 'standard' CHECK (priority_level IN ('standard', 'high', 'urgent')),
  
  -- v3.0: 因果分析状态追踪
  causal_analysis_status TEXT DEFAULT 'none'
    CHECK (causal_analysis_status IN ('none', 'pending', 'processing', 'completed')),
  last_analysis_at TIMESTAMPTZ,
  submission_count_at_last_analysis INTEGER DEFAULT 0,
  
  -- v3.0: 信号提交计数（由触发器自动维护）
  signal_submission_count INTEGER DEFAULT 0 NOT NULL,
  -- v3.0: 唯一参与 agent 数（由触发器自动维护）
  current_participant_count INTEGER DEFAULT 0 NOT NULL,
  
  -- 时间戳
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  
  -- 约束
  CONSTRAINT status_valid CHECK (status IN ('pending', 'active', 'closed', 'resolved')),
  CONSTRAINT actual_outcome_range CHECK (actual_outcome IS NULL OR (actual_outcome >= 0 AND actual_outcome <= 1)),
  CONSTRAINT reward_pool_positive CHECK (reward_pool > 0),
  CONSTRAINT closes_at_future CHECK (closes_at > created_at),
  CONSTRAINT signal_requires_deadline CHECK (task_category != 'signal' OR closes_at IS NOT NULL),
  CONSTRAINT signal_requires_resolution CHECK (task_category != 'signal' OR resolution_criteria IS NOT NULL)
);

-- 1.3 SIGNAL_SUBMISSIONS 表 - v3.0 信号提交
CREATE TABLE IF NOT EXISTS signal_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES prediction_tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  
  -- v3.0: 多信号数组
  signals JSONB NOT NULL DEFAULT '[]'::jsonb,
  
  -- 用户画像快照
  user_persona JSONB,
  
  -- 提交状态
  status TEXT NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted', 'abstained', 'invalidated')),
  
  -- 弃权信息
  abstain_reason TEXT,
  abstain_detail TEXT,
  
  -- 元数据
  model_name TEXT,
  plugin_version TEXT,
  privacy_cleared BOOLEAN DEFAULT true,
  protocol_version TEXT DEFAULT '3.0',
  
  -- 结算字段
  brier_score DECIMAL(5, 4),
  reward_earned DECIMAL(10, 2),
  
  -- 时间戳
  submitted_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  
  -- 约束
  CONSTRAINT brier_score_range CHECK (brier_score IS NULL OR (brier_score >= 0 AND brier_score <= 1)),
  CONSTRAINT reward_earned_non_negative CHECK (reward_earned IS NULL OR reward_earned >= 0),
  CONSTRAINT unique_signal_submission UNIQUE(task_id, user_id, submitted_at)
);

-- 1.4 SIMULATIONS 表 - 未来模拟器
CREATE TABLE IF NOT EXISTS simulations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES prediction_tasks(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  consensus_probability DECIMAL(5, 4),
  divergence_score DECIMAL(5, 4),
  submission_count INTEGER,
  generated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  
  -- 约束
  CONSTRAINT consensus_probability_range CHECK (consensus_probability IS NULL OR (consensus_probability >= 0 AND consensus_probability <= 1)),
  CONSTRAINT divergence_score_range CHECK (divergence_score IS NULL OR (divergence_score >= 0 AND divergence_score <= 1)),
  CONSTRAINT submission_count_positive CHECK (submission_count IS NULL OR submission_count > 0)
);

-- ============================================================================
-- PART 2: 涅槃+救赎系统表
-- ============================================================================

-- 2.1 CALIBRATION_TASKS 表 - 校准任务
CREATE TABLE IF NOT EXISTS calibration_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES prediction_tasks(id) ON DELETE CASCADE,
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
  task_id UUID REFERENCES prediction_tasks(id),
  submission_id UUID REFERENCES signal_submissions(id),
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
  daily_submission_limit INTEGER,
  max_task_value DECIMAL(10, 2),
  revenue_share_percent DECIMAL(5, 2),
  badge_icon TEXT,
  badge_color TEXT,
  description TEXT
);

-- 已存在旧表时补全缺少的列（幂等）
ALTER TABLE reputation_levels ADD COLUMN IF NOT EXISTS daily_submission_limit INTEGER;
ALTER TABLE reputation_levels ADD COLUMN IF NOT EXISTS max_task_value DECIMAL(10, 2);
ALTER TABLE reputation_levels ADD COLUMN IF NOT EXISTS revenue_share_percent DECIMAL(5, 2);
ALTER TABLE reputation_levels ADD COLUMN IF NOT EXISTS badge_icon TEXT;
ALTER TABLE reputation_levels ADD COLUMN IF NOT EXISTS badge_color TEXT;
ALTER TABLE reputation_levels ADD COLUMN IF NOT EXISTS description TEXT;

-- 插入等级配置
INSERT INTO reputation_levels (level_key, level_name, min_score, max_score, daily_submission_limit, max_task_value, revenue_share_percent, badge_icon, badge_color, description) VALUES
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

-- 4.2 TASK_STATUS_AUDIT 表 - 任务状态变更审计
CREATE TABLE IF NOT EXISTS task_status_audit (
  id BIGSERIAL PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES prediction_tasks(id) ON DELETE CASCADE,
  old_status TEXT NOT NULL,
  new_status TEXT NOT NULL,
  changed_by TEXT DEFAULT 'system',
  changed_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 4.3 SETTLEMENT_AUDIT 表 - 结算审计日志
CREATE TABLE IF NOT EXISTS settlement_audit (
  id BIGSERIAL PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES prediction_tasks(id) ON DELETE CASCADE,
  admin_id UUID NOT NULL REFERENCES profiles(id),
  outcome BOOLEAN NOT NULL,
  total_submissions INTEGER NOT NULL,
  correct_submissions INTEGER NOT NULL,
  incorrect_submissions INTEGER NOT NULL,
  total_rewards_distributed DECIMAL(10, 2) NOT NULL,
  settled_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ============================================================================
-- PART 5: v5.0 新增表
-- ============================================================================

-- 5.1 NDA_AGREEMENTS 表 - NDA签署记录
CREATE TABLE IF NOT EXISTS nda_agreements (
  id BIGSERIAL PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES prediction_tasks(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  agreed_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  CONSTRAINT unique_nda_agreement UNIQUE(task_id, agent_id)
);

-- 5.2 CROWDFUNDING_CONTRIBUTIONS 表 - 众筹贡献记录
CREATE TABLE IF NOT EXISTS crowdfunding_contributions (
  id BIGSERIAL PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES prediction_tasks(id) ON DELETE CASCADE,
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
-- PART 5.5: 画像系统表
-- ============================================================================

-- 5.5.1 Agent 用户画像表
CREATE TABLE IF NOT EXISTS agent_personas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  age_range TEXT,
  gender TEXT,
  location TEXT[],
  education TEXT,
  occupation_type TEXT,
  occupation TEXT,
  life_stage TEXT[],
  interests TEXT[],
  consumption_behaviors TEXT[],
  concerns TEXT[],
  experiences TEXT[],
  familiar_topics TEXT[],
  affected_by TEXT[],
  bio TEXT,
  verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(agent_id)
);

-- 5.5.2 任务目标人群画像表
CREATE TABLE IF NOT EXISTS task_personas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES prediction_tasks(id) ON DELETE CASCADE,
  target_demographic JSONB,
  target_life_experience JSONB,
  target_relevant_experience JSONB,
  diversity_requirements JSONB,
  reasoning TEXT,
  sample_personas TEXT[],
  information_types TEXT[],
  confidence TEXT,
  ai_model TEXT,
  ai_version TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(task_id)
);


-- ============================================================================
-- PART 5.6: 因果分析结果表
-- ============================================================================

CREATE TABLE IF NOT EXISTS causal_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES prediction_tasks(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'processing'
    CHECK (status IN ('pending', 'processing', 'completed', 'error')),
  signal_count INTEGER DEFAULT 0 NOT NULL,
  hard_fact_count INTEGER DEFAULT 0 NOT NULL,
  persona_count INTEGER DEFAULT 0 NOT NULL,
  graph_data JSONB,
  ontology_data JSONB,
  conclusion JSONB,
  preprocess_summary JSONB,
  newspaper_content TEXT,
  is_final BOOLEAN DEFAULT false NOT NULL,
  is_latest BOOLEAN DEFAULT true NOT NULL,
  version INTEGER DEFAULT 1 NOT NULL,
  elapsed_seconds DECIMAL(10, 2),
  error_message TEXT,
  triggered_by TEXT DEFAULT 'auto'
    CHECK (triggered_by IN ('auto', 'manual', 'schedule')),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);


-- ============================================================================
-- PART 5.7: 调查模块表
-- ============================================================================

CREATE TABLE IF NOT EXISTS survey_tasks (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title           TEXT NOT NULL,
    description     TEXT,
    survey_type     TEXT NOT NULL DEFAULT 'opinion'
                        CHECK (survey_type IN ('opinion', 'market_research', 'product_feedback', 'social')),
    target_persona_filters  JSONB DEFAULT '{}'::jsonb,
    target_agent_count      INT NOT NULL DEFAULT 0,
    status          TEXT NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft', 'running', 'completed', 'archived')),
    response_count  INT NOT NULL DEFAULT 0,
    creator_id      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS survey_questions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    survey_id       UUID NOT NULL REFERENCES survey_tasks(id) ON DELETE CASCADE,
    question_order  INT NOT NULL DEFAULT 1,
    question_text   TEXT NOT NULL,
    question_type   TEXT NOT NULL DEFAULT 'single_choice'
                        CHECK (question_type IN ('single_choice', 'multi_choice', 'rating', 'open_ended', 'comparison')),
    options         JSONB DEFAULT '[]'::jsonb,
    rating_min      INT DEFAULT 1,
    rating_max      INT DEFAULT 10,
    is_required     BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS survey_responses (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    survey_id       UUID NOT NULL REFERENCES survey_tasks(id) ON DELETE CASCADE,
    question_id     UUID NOT NULL REFERENCES survey_questions(id) ON DELETE CASCADE,
    agent_persona   JSONB NOT NULL DEFAULT '{}'::jsonb,
    answer          TEXT NOT NULL,
    rationale       TEXT,
    confidence      FLOAT DEFAULT 0.7
                        CHECK (confidence >= 0 AND confidence <= 1),
    submitted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS survey_analyses (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    survey_id               UUID NOT NULL REFERENCES survey_tasks(id) ON DELETE CASCADE,
    question_id             UUID REFERENCES survey_questions(id) ON DELETE CASCADE,
    result_distribution     JSONB DEFAULT '{}'::jsonb,
    persona_breakdown       JSONB DEFAULT '{}'::jsonb,
    consensus_answer        TEXT,
    dissent_rate            FLOAT DEFAULT 0.0,
    key_insights            TEXT[] DEFAULT ARRAY[]::TEXT[],
    full_report             TEXT,
    analyzed_response_count INT DEFAULT 0,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================================
-- PART 5.8: 列重命名（market_id → task_id）
-- 用于已存在的数据库中列名仍为 market_id 的情况，幂等执行
-- ============================================================================

DO $$
BEGIN
  -- signal_submissions
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'signal_submissions' AND column_name = 'market_id') THEN
    ALTER TABLE signal_submissions RENAME COLUMN market_id TO task_id;
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

  -- task_status_audit
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'task_status_audit' AND column_name = 'market_id') THEN
    ALTER TABLE task_status_audit RENAME COLUMN market_id TO task_id;
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

  -- task_personas
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'task_personas' AND column_name = 'market_id') THEN
    ALTER TABLE task_personas RENAME COLUMN market_id TO task_id;
  END IF;

  -- causal_analyses
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'causal_analyses' AND column_name = 'market_id') THEN
    ALTER TABLE causal_analyses RENAME COLUMN market_id TO task_id;
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
CREATE INDEX IF NOT EXISTS idx_profiles_leaderboard ON profiles(reputation_score DESC) INCLUDE (username, avatar_url, submission_count, total_earnings) WHERE status = 'active' AND reputation_score >= 200;
CREATE INDEX IF NOT EXISTS idx_profiles_niche_tags ON profiles USING GIN(niche_tags);

-- 6.2 prediction_tasks 表索引
CREATE INDEX IF NOT EXISTS idx_prediction_tasks_status ON prediction_tasks(status);
CREATE INDEX IF NOT EXISTS idx_prediction_tasks_closes_at ON prediction_tasks(closes_at);
CREATE INDEX IF NOT EXISTS idx_prediction_tasks_created_by ON prediction_tasks(created_by);
CREATE INDEX IF NOT EXISTS idx_prediction_tasks_created_at ON prediction_tasks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prediction_tasks_is_calibration ON prediction_tasks(is_calibration);
CREATE INDEX IF NOT EXISTS idx_prediction_tasks_status_created ON prediction_tasks(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prediction_tasks_status_closes ON prediction_tasks(status, closes_at);
CREATE INDEX IF NOT EXISTS idx_prediction_tasks_active ON prediction_tasks(closes_at) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_prediction_tasks_closed ON prediction_tasks(created_at DESC) WHERE status = 'closed';
CREATE INDEX IF NOT EXISTS idx_prediction_tasks_resolved ON prediction_tasks(updated_at DESC) WHERE status = 'resolved';
CREATE INDEX IF NOT EXISTS idx_prediction_tasks_card_data ON prediction_tasks(status, closes_at, created_at DESC) INCLUDE (title, reward_pool, created_by);
CREATE INDEX IF NOT EXISTS idx_prediction_tasks_search ON prediction_tasks USING GIN (to_tsvector('english', title || ' ' || description));
CREATE INDEX IF NOT EXISTS idx_prediction_tasks_visibility ON prediction_tasks(visibility);
CREATE INDEX IF NOT EXISTS idx_prediction_tasks_funding_type ON prediction_tasks(funding_type);
CREATE INDEX IF NOT EXISTS idx_prediction_tasks_required_niche_tags ON prediction_tasks USING GIN(required_niche_tags);
CREATE INDEX IF NOT EXISTS idx_prediction_tasks_min_reputation ON prediction_tasks(min_reputation);
CREATE INDEX IF NOT EXISTS idx_prediction_tasks_funding_progress ON prediction_tasks(funding_progress) WHERE funding_type = 'crowd';

-- 6.3 Signal_Submissions 表索引
CREATE INDEX IF NOT EXISTS idx_signal_submissions_task ON signal_submissions(task_id);
CREATE INDEX IF NOT EXISTS idx_signal_submissions_user ON signal_submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_signal_submissions_submitted ON signal_submissions(submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_signal_submissions_task_user ON signal_submissions(task_id, user_id);
CREATE INDEX IF NOT EXISTS idx_signal_submissions_task_submitted ON signal_submissions(task_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_signal_submissions_user_submitted ON signal_submissions(user_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_signal_submissions_status ON signal_submissions(status);
CREATE INDEX IF NOT EXISTS idx_signal_submissions_signals ON signal_submissions USING GIN(signals);
CREATE INDEX IF NOT EXISTS idx_signal_submissions_user_persona ON signal_submissions USING GIN(user_persona);

-- 6.4 prediction_tasks v3.0 额外索引
CREATE INDEX IF NOT EXISTS idx_prediction_tasks_task_category ON prediction_tasks(task_category);
CREATE INDEX IF NOT EXISTS idx_prediction_tasks_task_type ON prediction_tasks(task_type);
CREATE INDEX IF NOT EXISTS idx_prediction_tasks_result_visibility ON prediction_tasks(result_visibility);
CREATE INDEX IF NOT EXISTS idx_prediction_tasks_priority_level ON prediction_tasks(priority_level);
CREATE INDEX IF NOT EXISTS idx_prediction_tasks_causal_status ON prediction_tasks(causal_analysis_status);
CREATE INDEX IF NOT EXISTS idx_prediction_tasks_fulltext_combined
  ON prediction_tasks USING GIN (to_tsvector('english', title || ' ' || description))
  WHERE status IN ('closed', 'resolved');
CREATE INDEX IF NOT EXISTS idx_prediction_tasks_search_ordering
  ON prediction_tasks(status, created_at DESC)
  INCLUDE (title, question, description, actual_outcome, resolves_at)
  WHERE status IN ('closed', 'resolved');

-- 6.5 Simulations 表索引
CREATE INDEX IF NOT EXISTS idx_simulations_task ON simulations(task_id);
CREATE INDEX IF NOT EXISTS idx_simulations_generated ON simulations(generated_at DESC);

-- 6.6 Persona 表索引
CREATE INDEX IF NOT EXISTS idx_agent_personas_agent_id ON agent_personas(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_personas_age_range ON agent_personas(age_range);
CREATE INDEX IF NOT EXISTS idx_agent_personas_gender ON agent_personas(gender);
CREATE INDEX IF NOT EXISTS idx_agent_personas_occupation ON agent_personas(occupation);
CREATE INDEX IF NOT EXISTS idx_agent_personas_location ON agent_personas USING GIN (location);
CREATE INDEX IF NOT EXISTS idx_agent_personas_interests ON agent_personas USING GIN (interests);
CREATE INDEX IF NOT EXISTS idx_agent_personas_experiences ON agent_personas USING GIN (experiences);
CREATE INDEX IF NOT EXISTS idx_agent_personas_familiar ON agent_personas USING GIN (familiar_topics);
CREATE INDEX IF NOT EXISTS idx_task_personas_task_id ON task_personas(task_id);
CREATE INDEX IF NOT EXISTS idx_task_personas_confidence ON task_personas(confidence);
CREATE INDEX IF NOT EXISTS idx_task_personas_target_demographic ON task_personas USING GIN (target_demographic);

-- 6.7 Causal Analyses 表索引
CREATE INDEX IF NOT EXISTS idx_causal_analyses_task_id ON causal_analyses(task_id);
CREATE INDEX IF NOT EXISTS idx_causal_analyses_status ON causal_analyses(status);
CREATE INDEX IF NOT EXISTS idx_causal_analyses_latest ON causal_analyses(task_id, is_latest) WHERE is_latest = true;

-- 6.8 Survey 表索引
CREATE INDEX IF NOT EXISTS idx_survey_tasks_creator ON survey_tasks(creator_id);
CREATE INDEX IF NOT EXISTS idx_survey_tasks_status ON survey_tasks(status);
CREATE INDEX IF NOT EXISTS idx_survey_tasks_created_at ON survey_tasks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_survey_questions_survey_id ON survey_questions(survey_id, question_order);
CREATE INDEX IF NOT EXISTS idx_survey_responses_survey_id ON survey_responses(survey_id);
CREATE INDEX IF NOT EXISTS idx_survey_responses_question_id ON survey_responses(question_id);
CREATE INDEX IF NOT EXISTS idx_survey_responses_submitted_at ON survey_responses(submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_survey_analyses_survey_id ON survey_analyses(survey_id);
CREATE INDEX IF NOT EXISTS idx_survey_analyses_question_id ON survey_analyses(question_id);

-- 6.9 其他表索引
CREATE INDEX IF NOT EXISTS idx_calibration_tasks_difficulty ON calibration_tasks(difficulty);
CREATE INDEX IF NOT EXISTS idx_calibration_tasks_category ON calibration_tasks(category);
CREATE INDEX IF NOT EXISTS idx_calibration_tasks_task ON calibration_tasks(task_id);
CREATE INDEX IF NOT EXISTS idx_redemption_attempts_user ON redemption_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_redemption_attempts_created ON redemption_attempts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_redemption_attempts_task ON redemption_attempts(task_id);
CREATE INDEX IF NOT EXISTS idx_reputation_history_agent ON reputation_history(agent_id);
CREATE INDEX IF NOT EXISTS idx_reputation_history_created ON reputation_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reputation_history_task ON reputation_history(task_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_type ON audit_logs(entity_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_id ON audit_logs(entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_metadata ON audit_logs USING GIN (metadata);
CREATE INDEX IF NOT EXISTS idx_task_status_audit_task ON task_status_audit(task_id);
CREATE INDEX IF NOT EXISTS idx_task_status_audit_changed_at ON task_status_audit(changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_settlement_audit_task ON settlement_audit(task_id);
CREATE INDEX IF NOT EXISTS idx_settlement_audit_admin ON settlement_audit(admin_id);
CREATE INDEX IF NOT EXISTS idx_settlement_audit_settled_at ON settlement_audit(settled_at DESC);
CREATE INDEX IF NOT EXISTS idx_nda_agreements_task ON nda_agreements(task_id);
CREATE INDEX IF NOT EXISTS idx_nda_agreements_agent ON nda_agreements(agent_id);
CREATE INDEX IF NOT EXISTS idx_nda_agreements_agreed_at ON nda_agreements(agreed_at DESC);
CREATE INDEX IF NOT EXISTS idx_crowdfunding_task ON crowdfunding_contributions(task_id);
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

DROP TRIGGER IF EXISTS update_prediction_tasks_updated_at ON prediction_tasks;
CREATE TRIGGER update_prediction_tasks_updated_at
  BEFORE UPDATE ON prediction_tasks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 7.2 更新用户提交计数
CREATE OR REPLACE FUNCTION update_submission_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE profiles
    SET submission_count = submission_count + 1
    WHERE id = NEW.user_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE profiles
    SET submission_count = submission_count - 1
    WHERE id = OLD.user_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_user_submission_count ON signal_submissions;
CREATE TRIGGER update_user_submission_count
  AFTER INSERT OR DELETE ON signal_submissions
  FOR EACH ROW
  EXECUTE FUNCTION update_submission_count();

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

DROP TRIGGER IF EXISTS trigger_update_funding_progress ON prediction_tasks;
CREATE TRIGGER trigger_update_funding_progress
  BEFORE INSERT OR UPDATE OF funding_current, funding_goal ON prediction_tasks
  FOR EACH ROW
  EXECUTE FUNCTION update_funding_progress();

-- 7.4 众筹达标自动激活任务
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

DROP TRIGGER IF EXISTS trigger_auto_activate_crowdfunded_task ON prediction_tasks;
CREATE TRIGGER trigger_auto_activate_crowdfunded_task
  BEFORE UPDATE OF funding_current ON prediction_tasks
  FOR EACH ROW
  EXECUTE FUNCTION auto_activate_crowdfunded_task();

-- 7.5 v3.0: 唯一参与 agent 达到 target_agent_count 时标记状态（HTTP 触发由 Next.js API 层处理）
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

  -- 达到目标 agent 数时标记为 pending（供监控面板显示；HTTP 触发由 API 层完成）
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

DROP TRIGGER IF EXISTS trigger_new_signal_submission ON signal_submissions;
DROP FUNCTION IF EXISTS notify_new_signal_submission();
DROP TRIGGER IF EXISTS trigger_participant_threshold ON signal_submissions;
CREATE TRIGGER trigger_participant_threshold
  AFTER INSERT ON signal_submissions
  FOR EACH ROW
  EXECUTE FUNCTION notify_participant_threshold_reached();

-- 7.5.1: 任务关闭时自动触发最终因果分析
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

DROP TRIGGER IF EXISTS trigger_task_closed_analysis ON prediction_tasks;
CREATE TRIGGER trigger_task_closed_analysis
  BEFORE UPDATE ON prediction_tasks
  FOR EACH ROW
  EXECUTE FUNCTION notify_task_closed_trigger_analysis();

-- 7.6 v3.0: 更新 prediction_tasks.signal_submission_count
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

-- 7.7 Persona / Causal updated_at 触发器
DROP TRIGGER IF EXISTS update_agent_personas_updated_at ON agent_personas;
CREATE TRIGGER update_agent_personas_updated_at
  BEFORE UPDATE ON agent_personas
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_causal_analyses_updated_at ON causal_analyses;
CREATE TRIGGER update_causal_analyses_updated_at
  BEFORE UPDATE ON causal_analyses
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- PART 8: 市场自动关闭系统
-- ============================================================================

-- 8.1 任务自动关闭函数
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

-- 8.2 手动触发任务关闭（用于测试）
DROP FUNCTION IF EXISTS trigger_task_auto_close();
CREATE OR REPLACE FUNCTION trigger_task_auto_close()
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
  FROM prediction_tasks
  WHERE status = 'active'
    AND closes_at <= NOW()
    AND closes_at IS NOT NULL;
  
  updated_count := auto_close_expired_tasks();
  
  RETURN QUERY SELECT updated_count, task_ids;
END;
$$;

-- 8.3 任务状态变更审计触发器
CREATE OR REPLACE FUNCTION log_task_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO task_status_audit (task_id, old_status, new_status, changed_by)
    VALUES (NEW.id, OLD.status, NEW.status, 'auto_close_system');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS task_status_change_trigger ON prediction_tasks;
CREATE TRIGGER task_status_change_trigger
  AFTER UPDATE ON prediction_tasks
  FOR EACH ROW
  EXECUTE FUNCTION log_task_status_change();

-- 8.4 配置定时任务（需要pg_cron扩展）
DO $$
BEGIN
  PERFORM cron.unschedule('auto-close-tasks');
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END $$;

SELECT cron.schedule(
  'auto-close-tasks',
  '* * * * *',
  'SELECT auto_close_expired_tasks();'
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
      WHEN p_reputation_change > 0 THEN 'submission_correct'
      ELSE 'submission_wrong'
    END,
    v_old_reputation,
    v_new_reputation,
    NOW()
  );
END;
$$;

-- 9.2 事务性市场结算函数（v3.0: 基于 signal_submissions）
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
  
  IF NOT FOUND THEN
    RAISE EXCEPTION '任务不存在';
  END IF;
  
  IF v_task.status = 'resolved' THEN
    RAISE EXCEPTION '任务已经结算';
  END IF;
  
  -- v3.0: 计算参与者数量
  SELECT COUNT(DISTINCT user_id) INTO v_participant_count
  FROM signal_submissions
  WHERE task_id = p_task_id
    AND status = 'submitted';
  
  IF v_participant_count > 0 THEN
    v_reward_per_participant := v_task.reward_pool / v_participant_count;
  END IF;
  
  -- v3.0: 奖励所有参与者（信号提交无正确/错误之分）
  FOR v_submission IN
    SELECT DISTINCT user_id
    FROM signal_submissions
    WHERE task_id = p_task_id
      AND status = 'submitted'
  LOOP
    PERFORM update_user_reputation_and_earnings(
      v_submission.user_id,
      10,
      v_reward_per_participant
    );
    
    UPDATE signal_submissions
    SET reward_earned = v_reward_per_participant
    WHERE task_id = p_task_id
      AND user_id = v_submission.user_id
      AND status = 'submitted';
  END LOOP;
  
  UPDATE prediction_tasks
  SET status = 'resolved',
      actual_outcome = CASE WHEN p_outcome THEN 1 ELSE 0 END,
      updated_at = NOW()
  WHERE id = p_task_id;
  
  PERFORM log_audit(
    p_admin_id,
    'resolve',
    'task',
    p_task_id,
    to_jsonb(v_task),
    jsonb_build_object('status', 'resolved', 'outcome', p_outcome),
    jsonb_build_object(
      'total_submissions', v_participant_count,
      'reward_per_participant', v_reward_per_participant
    )
  );
  
  v_total_rewards := v_reward_per_participant * v_participant_count;
  
  v_result := jsonb_build_object(
    'success', true,
    'task_id', p_task_id,
    'outcome', p_outcome,
    'total_submissions', v_participant_count,
    'reward_per_participant', v_reward_per_participant,
    'total_rewards_distributed', v_total_rewards
  );
  
  RETURN v_result;
  
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION '任务结算失败: %', SQLERRM;
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

-- 10.3 prediction_tasks 表审计触发器
CREATE OR REPLACE FUNCTION audit_tasks_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM log_audit(
      NEW.created_by,
      'create',
      'task',
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
        'task',
        NEW.id,
        to_jsonb(OLD),
        to_jsonb(NEW),
        jsonb_build_object('trigger', 'auto', 'outcome', NEW.actual_outcome)
      );
    ELSE
      PERFORM log_audit(
        auth.uid(),
        'update',
        'task',
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
      'task',
      OLD.id,
      to_jsonb(OLD),
      NULL,
      jsonb_build_object('trigger', 'auto')
    );
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS audit_prediction_tasks_trigger ON prediction_tasks;
CREATE TRIGGER audit_prediction_tasks_trigger
  AFTER INSERT OR UPDATE OR DELETE ON prediction_tasks
  FOR EACH ROW
  EXECUTE FUNCTION audit_tasks_changes();

-- 10.4 Signal_Submissions 表审计触发器
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
-- PART 11: 事务性操作函数
-- ============================================================================

-- 11.1 事务性账号删除（v3.0）
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
  v_task RECORD;
  v_agent RECORD;
  v_top_10_threshold DECIMAL;
BEGIN
  SELECT * INTO v_task FROM prediction_tasks WHERE id = p_task_id;
  
  IF v_task.visibility = 'public' THEN
    RETURN TRUE;
  END IF;
  
  IF v_task.created_by = p_agent_id THEN
    RETURN TRUE;
  END IF;
  
  IF p_agent_id = ANY(v_task.allowed_viewers) THEN
    RETURN TRUE;
  END IF;
  
  SELECT * INTO v_agent FROM profiles WHERE id = p_agent_id;
  
  IF v_agent.reputation_score < v_task.min_reputation THEN
    v_top_10_threshold := get_top_10_percent_threshold();
    IF v_agent.reputation_score < v_top_10_threshold THEN
      RETURN FALSE;
    END IF;
  END IF;
  
  IF v_task.required_niche_tags IS NOT NULL THEN
    IF NOT (v_task.required_niche_tags && v_agent.niche_tags) THEN
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
DROP VIEW IF EXISTS public_task_stats;
CREATE OR REPLACE VIEW public_task_stats AS
SELECT
  m.id AS task_id,
  m.title,
  m.question,
  m.description,
  m.status,
  m.closes_at,
  m.signal_submission_count,
  COUNT(ss.id) AS submission_count,
  MAX(ss.submitted_at) AS latest_submission_at
FROM prediction_tasks m
LEFT JOIN signal_submissions ss ON m.id = ss.task_id AND ss.status = 'submitted'
GROUP BY m.id, m.title, m.question, m.description, m.status, m.closes_at, m.signal_submission_count;

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
ALTER TABLE prediction_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE signal_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE simulations ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE nda_agreements ENABLE ROW LEVEL SECURITY;
ALTER TABLE crowdfunding_contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE calibration_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE redemption_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE reputation_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_status_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE settlement_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_personas ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_personas ENABLE ROW LEVEL SECURITY;
ALTER TABLE causal_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE survey_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE survey_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE survey_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE survey_analyses ENABLE ROW LEVEL SECURITY;

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

-- 14.3 prediction_tasks 表策略（支持v5.0私密任务）
DROP POLICY IF EXISTS "v5_tasks_select_policy" ON prediction_tasks;
CREATE POLICY "v5_tasks_select_policy"
  ON prediction_tasks FOR SELECT
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
          reputation_score >= prediction_tasks.min_reputation
          OR reputation_score >= (
            SELECT PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY reputation_score)
            FROM profiles
            WHERE status = 'active'
          )
        )
        AND (
          prediction_tasks.required_niche_tags IS NULL
          OR prediction_tasks.required_niche_tags && profiles.niche_tags
        )
      )
    )
  );

DROP POLICY IF EXISTS "认证用户可以创建任务" ON prediction_tasks;
CREATE POLICY "认证用户可以创建任务" ON prediction_tasks FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
DROP POLICY IF EXISTS "创建者可以更新任务" ON prediction_tasks;
CREATE POLICY "创建者可以更新任务" ON prediction_tasks FOR UPDATE USING (auth.uid() = created_by) WITH CHECK (auth.uid() = created_by);
DROP POLICY IF EXISTS "创建者可以删除任务" ON prediction_tasks;
CREATE POLICY "创建者可以删除任务" ON prediction_tasks FOR DELETE USING (auth.uid() = created_by);
DROP POLICY IF EXISTS "服务角色可以管理所有prediction_tasks" ON prediction_tasks;
CREATE POLICY "服务角色可以管理所有prediction_tasks" ON prediction_tasks FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 14.4 Signal_Submissions 表策略（v3.0）
DROP POLICY IF EXISTS "认证用户可以查看所有信号提交" ON signal_submissions;
CREATE POLICY "认证用户可以查看所有信号提交" ON signal_submissions FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "v3_signal_submissions_insert_policy" ON signal_submissions;
CREATE POLICY "v3_signal_submissions_insert_policy"
  ON signal_submissions FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM prediction_tasks
      WHERE id = task_id
      AND (
        (visibility = 'public' AND NOT requires_nda)
        OR (requires_nda AND EXISTS (
          SELECT 1 FROM nda_agreements
          WHERE task_id = prediction_tasks.id
          AND agent_id = auth.uid()
        ))
        OR created_by = auth.uid()
      )
    )
  );
DROP POLICY IF EXISTS "用户可以删除自己的未结算信号" ON signal_submissions;
CREATE POLICY "用户可以删除自己的未结算信号" ON signal_submissions FOR DELETE USING (
  auth.uid() = user_id AND reward_earned IS NULL AND EXISTS (
    SELECT 1 FROM prediction_tasks WHERE prediction_tasks.id = signal_submissions.task_id AND prediction_tasks.status = 'active'
  )
);
DROP POLICY IF EXISTS "服务角色可以管理所有signal_submissions" ON signal_submissions;
CREATE POLICY "服务角色可以管理所有signal_submissions" ON signal_submissions FOR ALL TO service_role USING (true) WITH CHECK (true);

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
      SELECT 1 FROM prediction_tasks
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
      SELECT 1 FROM prediction_tasks
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

-- 14.12 task_status_audit 表策略
DROP POLICY IF EXISTS "管理员可以查看任务状态审计" ON task_status_audit;
CREATE POLICY "管理员可以查看任务状态审计" ON task_status_audit FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
);
DROP POLICY IF EXISTS "管理员可以插入任务状态审计" ON task_status_audit;
CREATE POLICY "管理员可以插入任务状态审计" ON task_status_audit FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
);
DROP POLICY IF EXISTS "服务角色可以管理所有task_status_audit" ON task_status_audit;
CREATE POLICY "服务角色可以管理所有task_status_audit" ON task_status_audit FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 14.13 Settlement_audit 表策略
DROP POLICY IF EXISTS "管理员可以查看结算审计" ON settlement_audit;
CREATE POLICY "管理员可以查看结算审计" ON settlement_audit FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
);
DROP POLICY IF EXISTS "服务角色可以管理所有settlement_audit" ON settlement_audit;
CREATE POLICY "服务角色可以管理所有settlement_audit" ON settlement_audit FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 14.14 Agent_personas 表策略
DROP POLICY IF EXISTS "Agents can view own persona" ON agent_personas;
CREATE POLICY "Agents can view own persona" ON agent_personas FOR SELECT USING (auth.uid() = agent_id);
DROP POLICY IF EXISTS "Agents can insert own persona" ON agent_personas;
CREATE POLICY "Agents can insert own persona" ON agent_personas FOR INSERT WITH CHECK (auth.uid() = agent_id);
DROP POLICY IF EXISTS "Agents can update own persona" ON agent_personas;
CREATE POLICY "Agents can update own persona" ON agent_personas FOR UPDATE USING (auth.uid() = agent_id);
DROP POLICY IF EXISTS "服务角色可以管理所有agent_personas" ON agent_personas;
CREATE POLICY "服务角色可以管理所有agent_personas" ON agent_personas FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 14.15 Task_personas 表策略
DROP POLICY IF EXISTS "认证用户可以查看任务画像" ON task_personas;
CREATE POLICY "认证用户可以查看任务画像" ON task_personas FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "服务角色可以管理所有task_personas" ON task_personas;
CREATE POLICY "服务角色可以管理所有task_personas" ON task_personas FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 14.16 Causal_analyses 表策略
DROP POLICY IF EXISTS "认证用户可以查看因果分析" ON causal_analyses;
CREATE POLICY "认证用户可以查看因果分析" ON causal_analyses FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "服务角色可以管理所有causal_analyses" ON causal_analyses;
CREATE POLICY "服务角色可以管理所有causal_analyses" ON causal_analyses FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 14.17 Survey 表策略
DROP POLICY IF EXISTS "survey_tasks_select" ON survey_tasks;
CREATE POLICY "survey_tasks_select" ON survey_tasks FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "survey_tasks_insert" ON survey_tasks;
CREATE POLICY "survey_tasks_insert" ON survey_tasks FOR INSERT TO authenticated WITH CHECK (auth.uid() = creator_id);
DROP POLICY IF EXISTS "survey_tasks_update" ON survey_tasks;
CREATE POLICY "survey_tasks_update" ON survey_tasks FOR UPDATE TO authenticated USING (auth.uid() = creator_id);
DROP POLICY IF EXISTS "survey_questions_select" ON survey_questions;
CREATE POLICY "survey_questions_select" ON survey_questions FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "survey_questions_insert" ON survey_questions;
CREATE POLICY "survey_questions_insert" ON survey_questions FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM survey_tasks WHERE id = survey_id AND creator_id = auth.uid()));
DROP POLICY IF EXISTS "survey_responses_select" ON survey_responses;
CREATE POLICY "survey_responses_select" ON survey_responses FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "survey_analyses_select" ON survey_analyses;
CREATE POLICY "survey_analyses_select" ON survey_analyses FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "survey_responses_service_insert" ON survey_responses;
CREATE POLICY "survey_responses_service_insert" ON survey_responses FOR INSERT TO service_role WITH CHECK (true);
DROP POLICY IF EXISTS "survey_analyses_service_insert" ON survey_analyses;
CREATE POLICY "survey_analyses_service_insert" ON survey_analyses FOR INSERT TO service_role WITH CHECK (true);
DROP POLICY IF EXISTS "survey_analyses_service_update" ON survey_analyses;
CREATE POLICY "survey_analyses_service_update" ON survey_analyses FOR UPDATE TO service_role USING (true);

-- ============================================================================
-- PART 14.5: 搜索 RPC 函数（v3.0）
-- ============================================================================

-- 搜索信号提交统计
DROP FUNCTION IF EXISTS search_signals_optimized(TEXT, INTEGER, INTEGER);
CREATE OR REPLACE FUNCTION search_signals_optimized(
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
  submission_count BIGINT,
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
    FROM prediction_tasks m
    WHERE 
      m.status IN ('closed', 'resolved')
      AND (
        to_tsvector('english', m.title || ' ' || m.description) @@ 
        websearch_to_tsquery('english', p_query)
      )
  ),
  submission_stats AS (
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
    COALESCE(sub_s.sub_count, 0) AS submission_count,
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

-- 搜索结果计数
DROP FUNCTION IF EXISTS search_signals_count(TEXT);
CREATE OR REPLACE FUNCTION search_signals_count(
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
  FROM prediction_tasks m
  WHERE 
    m.status IN ('closed', 'resolved')
    AND (
      to_tsvector('english', m.title || ' ' || m.description) @@ 
      websearch_to_tsquery('english', p_query)
    );
  RETURN v_count;
END;
$$;

-- 搜索日志记录
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
  INSERT INTO audit_logs (user_id, action, entity_type, entity_id, metadata)
  VALUES (p_user_id, 'search', 'task', NULL,
    jsonb_build_object('query', p_query, 'result_count', p_result_count, 'searched_at', NOW()));
END;
$$;

-- 搜索建议
DROP FUNCTION IF EXISTS get_search_suggestions(TEXT, INTEGER);
CREATE OR REPLACE FUNCTION get_search_suggestions(
  p_prefix TEXT,
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (suggestion TEXT, task_count BIGINT)
LANGUAGE plpgsql
STABLE
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

-- 热门搜索词物化视图
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

-- ============================================================================
-- PART 14.6: 待分析任务视图（v3.0）
-- ============================================================================

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
FROM prediction_tasks m
LEFT JOIN signal_submissions ss ON ss.task_id = m.id AND ss.status = 'submitted'
WHERE m.status = 'active'
  AND m.causal_analysis_status = 'pending'
GROUP BY m.id
ORDER BY new_submission_count DESC;

-- ============================================================================
-- PART 15: 表和字段注释
-- ============================================================================

-- 表注释
COMMENT ON TABLE profiles IS '用户档案表，存储用户基本信息、信誉分和收益';
COMMENT ON TABLE prediction_tasks IS '信号任务表，存储所有分析任务（含v5.0私密任务和众筹功能）';
COMMENT ON TABLE signal_submissions IS 'v3.0 信号提交表，存储所有Agent的信号记录';
COMMENT ON TABLE simulations IS '未来模拟器表，存储AI生成的未来新闻报道';
COMMENT ON TABLE calibration_tasks IS '校准任务表，存储已知答案的历史问题供涅槃用户使用';
COMMENT ON TABLE redemption_attempts IS '救赎尝试记录表，记录涅槃用户的每次答题尝试';
COMMENT ON TABLE reputation_history IS '信誉分历史记录表，记录所有信誉分变化';
COMMENT ON TABLE reputation_levels IS '信誉等级配置表，定义各等级的权限和特权';
COMMENT ON TABLE audit_logs IS '审计日志表，记录所有重要的数据修改操作';
COMMENT ON TABLE task_status_audit IS '任务状态变更审计日志';
COMMENT ON TABLE settlement_audit IS '任务结算审计日志（ℹ️ total_predictions等列名保留为历史兼容，语义已变为 submissions）';
COMMENT ON TABLE nda_agreements IS 'NDA签署记录表，记录Agent对私密任务的保密协议签署';
COMMENT ON TABLE crowdfunding_contributions IS '众筹贡献记录表，记录用户对众筹任务的资金贡献';
COMMENT ON TABLE niche_tags_reference IS '专业领域标签参考表，存储预定义的领域分类';
COMMENT ON TABLE agent_personas IS 'Agent用户画像表，存储AI生成的用户属性画像';
COMMENT ON TABLE task_personas IS '任务目标人群画像表，存储AI分析的目标人群画像';
COMMENT ON TABLE causal_analyses IS '因果分析结果表，存储因果推理引擎的分析结果';
COMMENT ON TABLE survey_tasks IS '调查主表，存储调查任务配置';
COMMENT ON TABLE survey_questions IS '调查题目表，存储多题问卷的题目';
COMMENT ON TABLE survey_responses IS '调查回答表，存储Agent的回答记录';
COMMENT ON TABLE survey_analyses IS '调查分析结果表，存储聚合分析结果';

-- 字段注释
COMMENT ON COLUMN profiles.api_key_hash IS 'API密钥的哈希值（bcrypt加密）';
COMMENT ON COLUMN profiles.reputation_score IS '用户信誉分数，基于信号提交质量计算';
COMMENT ON COLUMN profiles.total_earnings IS '用户累计收益';
COMMENT ON COLUMN profiles.status IS '用户状态：active(正常), restricted(涅槃模式)';
COMMENT ON COLUMN profiles.redemption_streak IS '救赎连胜数，连续答对5题可出狱';
COMMENT ON COLUMN profiles.reputation_level IS '信誉等级：apprentice, intermediate, advanced, expert, master, legend';
COMMENT ON COLUMN profiles.role IS '用户角色：user(普通用户), admin(管理员)';
COMMENT ON COLUMN profiles.niche_tags IS '专业领域标签：Tech, Finance, Healthcare, Legal, Marketing等';
COMMENT ON COLUMN prediction_tasks.status IS '任务状态：pending(等待), active(活跃), closed(已关闭), resolved(已解决)';
COMMENT ON COLUMN prediction_tasks.actual_outcome IS '实际结果，0或1（二元市场）';
COMMENT ON COLUMN prediction_tasks.reward_pool IS '奖金池金额';
COMMENT ON COLUMN prediction_tasks.is_calibration IS '是否为校准任务（涅槃模式用户专用）';
COMMENT ON COLUMN prediction_tasks.task_category IS '任务类别：signal(信号任务) 或 research(调查任务)';
COMMENT ON COLUMN prediction_tasks.task_type IS '客户类型：consumer(C端) 或 business(B端)';
COMMENT ON COLUMN prediction_tasks.causal_analysis_status IS '因果分析状态：none/pending/processing/completed';
COMMENT ON COLUMN prediction_tasks.signal_submission_count IS '信号提交总数（触发器自动维护）';
COMMENT ON COLUMN signal_submissions.signals IS 'v3.0 多信号 JSONB 数组，每个信号包含 direction/confidence/evidence 等';
COMMENT ON COLUMN signal_submissions.status IS '提交状态：submitted/abstained/invalidated';
COMMENT ON COLUMN signal_submissions.protocol_version IS 'UAP 协议版本，默认 3.0';
COMMENT ON COLUMN nda_agreements.ip_address IS '签署时的IP地址';
COMMENT ON COLUMN nda_agreements.user_agent IS '签署时的浏览器User-Agent';
COMMENT ON COLUMN crowdfunding_contributions.amount IS '贡献金额，最小$1';
COMMENT ON COLUMN crowdfunding_contributions.payment_status IS '支付状态：pending/completed/failed/refunded';
COMMENT ON COLUMN crowdfunding_contributions.transaction_id IS '支付交易ID';

-- 函数注释
COMMENT ON FUNCTION auto_close_expired_tasks IS '自动关闭已过期的活跃任务';
COMMENT ON FUNCTION trigger_task_auto_close IS '手动触发任务自动关闭（用于测试）';
COMMENT ON FUNCTION update_user_reputation_and_earnings IS '更新用户信誉分和收益（v3.0: 使用 submission_correct/submission_wrong）';
COMMENT ON FUNCTION resolve_task_transaction IS 'v3.0 事务性任务结算，基于 signal_submissions';
COMMENT ON FUNCTION delete_user_account IS 'v3.0 事务性删除用户账号及所有关联数据';
COMMENT ON FUNCTION calculate_brier_score IS '计算Brier Score: (probability - outcome)^2';
COMMENT ON FUNCTION is_admin IS '检查用户是否为管理员';
COMMENT ON FUNCTION get_top_10_percent_threshold IS '计算活跃Agent的信誉分第90百分位数（Top 10%阈值）';
COMMENT ON FUNCTION can_access_private_task IS '检查Agent是否可以访问指定的私密任务';
COMMENT ON FUNCTION update_funding_progress IS '众筹达标时自动更新众筹进度';
COMMENT ON FUNCTION notify_participant_threshold_reached IS 'v3.0 当唯一参与 agent 数达到 target_agent_count 时触发因果分析（替代旧的每5条信号触发逻辑）';
COMMENT ON FUNCTION notify_task_closed_trigger_analysis IS 'v3.0 任务关闭时自动将 causal_analysis_status 设为 pending，触发最终因果分析';
COMMENT ON FUNCTION update_task_signal_submission_count IS 'v3.0 自动维护 prediction_tasks.signal_submission_count';
COMMENT ON FUNCTION search_signals_optimized IS 'v3.0 任务搜索函数，基于 signal_submissions 统计';
COMMENT ON FUNCTION search_signals_count IS 'v3.0 搜索结果计数函数';
COMMENT ON FUNCTION log_search_query IS '记录搜索查询日志';
COMMENT ON FUNCTION get_search_suggestions IS '搜索建议自动补全函数';
COMMENT ON VIEW public_task_stats IS '任务信号提交统计视图（v3.0）';
COMMENT ON VIEW tasks_pending_analysis IS '待因果分析的任务视图（v3.0）';
COMMENT ON VIEW index_usage IS '索引使用情况监控视图';
COMMENT ON VIEW table_bloat IS '表膨胀监控视图，显示死元组比例';

-- ============================================================================
-- PART 16: 更新统计信息
-- ============================================================================

ANALYZE profiles;
ANALYZE prediction_tasks;
ANALYZE signal_submissions;
ANALYZE simulations;
ANALYZE audit_logs;

-- ============================================================================
-- 状态字段说明
-- ============================================================================

-- prediction_tasks.status 字段说明：
-- - pending: 等待中（众筹未完成或等待agent参与）
-- - active: 活跃中（可以提交信号）
-- - closed: 已关闭（不再接受信号提交）
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

UNION ALL SELECT '✓ 核心表', 'profiles, prediction_tasks, signal_submissions, simulations'
UNION ALL SELECT '✓ 涅槃系统', 'calibration_tasks, redemption_attempts'
UNION ALL SELECT '✓ 信誉系统', 'reputation_history, reputation_levels'
UNION ALL SELECT '✓ 审计系统', 'audit_logs, task_status_audit, settlement_audit'
UNION ALL SELECT '✓ v5.0功能', 'nda_agreements, crowdfunding_contributions, niche_tags_reference'
UNION ALL SELECT '✓ 画像系统', 'agent_personas, task_personas'
UNION ALL SELECT '✓ 因果分析', 'causal_analyses'
UNION ALL SELECT '✓ 调查模块', 'survey_tasks, survey_questions, survey_responses, survey_analyses'
UNION ALL SELECT '✓ 索引', '所有性能优化索引已创建'
UNION ALL SELECT '✓ RLS策略', '支持私密任务 + 信号提交 + 画像 + 因果 + 调查'
UNION ALL SELECT '✓ 函数和触发器', 'v3.0 signal_submissions 核心业务逻辑'
UNION ALL SELECT '✓ 搜索RPC', 'search_signals_optimized, search_signals_count'
UNION ALL SELECT '✓ 监控视图', 'public_task_stats, tasks_pending_analysis'

UNION ALL SELECT '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
UNION ALL SELECT '🎯 包含功能', ''
UNION ALL SELECT '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'

UNION ALL SELECT '1. MVP核心功能', '完整的信号任务系统（UAP v3.0）'
UNION ALL SELECT '2. 涅槃+救赎机制', '用户信誉恢复系统'
UNION ALL SELECT '3. 信誉系统', '8级信誉等级体系'
UNION ALL SELECT '4. Search the Future', 'v5.0 搜索引擎架构（search_signals_*）'
UNION ALL SELECT '5. 智能分发系统', 'v5.0 The Iceberg'
UNION ALL SELECT '6. NDA保密机制', 'v5.0 私密任务保护'
UNION ALL SELECT '7. 双模式资金', 'v5.0 众筹 + 直接付费'
UNION ALL SELECT '8. 专业领域匹配', 'v5.0 Niche Match'
UNION ALL SELECT '9. 画像系统', 'Agent + Task persona'
UNION ALL SELECT '10. 因果分析', '因果推理引擎结果存储'
UNION ALL SELECT '11. 调查模块', '多题问卷 + 聚合分析';
