-- ============================================================================
-- DelphiGraph 扩展迁移：画像系统 + 因果逻辑图引擎
-- 整合自：
--   20260318_create_persona_tables.sql
--   20260320_add_causal_analysis.sql
--   20260322_add_user_persona.sql
--
-- 变更内容：
-- PART 1: predictions 表增加结构化信号字段 + 用户画像字段
-- PART 2: markets 表增加因果分析状态追踪字段
-- PART 3: Agent 用户画像表 (agent_personas)
-- PART 4: 任务目标人群画像表 (task_personas)
-- PART 5: 因果分析结果表 (causal_analyses)
-- PART 6: 触发器（predictions 变更通知 + agent_personas updated_at）
-- PART 7: 辅助视图 (markets_pending_analysis)
-- PART 8: RLS 策略
-- ============================================================================


-- ============================================================================
-- PART 1: predictions 表增加结构化信号字段 + 用户画像字段
-- ============================================================================

-- Agent 提交的结构化证据类型（硬事实 vs 人格推理）
ALTER TABLE predictions ADD COLUMN IF NOT EXISTS evidence_type TEXT DEFAULT 'persona_inference'
  CHECK (evidence_type IN ('hard_fact', 'persona_inference'));

-- Agent 提交的证据原文（端侧已脱敏）
ALTER TABLE predictions ADD COLUMN IF NOT EXISTS evidence_text TEXT;

-- Agent 语义相关度自评 (0-1)
ALTER TABLE predictions ADD COLUMN IF NOT EXISTS relevance_score DECIMAL(3, 2) DEFAULT 0.5
  CHECK (relevance_score >= 0 AND relevance_score <= 1);

-- Agent 提取的实体标注 JSON 数组
-- 每个元素结构: {"text": "特斯拉", "type": "brand", "role": "target"}
ALTER TABLE predictions ADD COLUMN IF NOT EXISTS entity_tags JSONB DEFAULT '[]'::jsonb;

-- Agent 端侧脱敏完成标记
ALTER TABLE predictions ADD COLUMN IF NOT EXISTS privacy_cleared BOOLEAN DEFAULT true;

-- 证据来源 URL（可选）
ALTER TABLE predictions ADD COLUMN IF NOT EXISTS source_url TEXT;

-- UAP v2.0: 端侧脱敏后的用户画像信息（职业、性别、年龄段、喜好等）
-- 结构示例:
-- {
--   "occupation": "finance",
--   "gender": "male",
--   "age_range": "30-40",
--   "interests": ["投资理财", "科技产品"],
--   "region": "east_asia",
--   "education": "bachelor",
--   "income_level": "middle",
--   "investment_experience": "5-10y",
--   "consumption_style": "rational",
--   "information_sources": ["财经媒体", "社交平台"]
-- }
ALTER TABLE predictions
  ADD COLUMN IF NOT EXISTS user_persona JSONB DEFAULT NULL;

-- 索引：按 evidence_type 查询
CREATE INDEX IF NOT EXISTS idx_predictions_evidence_type ON predictions(evidence_type);

-- 索引：entity_tags GIN 索引用于 JSON 查询
CREATE INDEX IF NOT EXISTS idx_predictions_entity_tags ON predictions USING gin(entity_tags);

-- 索引：user_persona GIN 索引用于按画像字段查询
CREATE INDEX IF NOT EXISTS idx_predictions_user_persona ON predictions USING gin(user_persona);


-- ============================================================================
-- PART 2: markets 表增加因果分析状态追踪字段
-- ============================================================================

ALTER TABLE markets ADD COLUMN IF NOT EXISTS causal_analysis_status TEXT DEFAULT 'none'
  CHECK (causal_analysis_status IN ('none', 'pending', 'processing', 'completed'));
ALTER TABLE markets ADD COLUMN IF NOT EXISTS last_analysis_at TIMESTAMPTZ;
ALTER TABLE markets ADD COLUMN IF NOT EXISTS prediction_count_at_last_analysis INTEGER DEFAULT 0;


-- ============================================================================
-- PART 3: Agent 用户画像表
-- ============================================================================

CREATE TABLE IF NOT EXISTS agent_personas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- ========== 基础人口统计 ==========
  age_range TEXT,                    -- 年龄范围，如: "26-35"
  gender TEXT,                       -- 性别，如: "female", "male", "non-binary", "prefer_not_to_say"
  location TEXT[],                   -- 地理位置，如: ["中国", "北京"]
  education TEXT,                    -- 教育背景，如: "本科", "研究生"
  occupation_type TEXT,              -- 职业类型，如: "上班族", "学生", "自由职业"
  occupation TEXT,                   -- 具体职业，如: "教师", "程序员", "医生"
  
  -- ========== 生活经验 ==========
  life_stage TEXT[],                 -- 生活阶段，如: ["已婚", "有孩子", "在职"]
  interests TEXT[],                  -- 兴趣爱好，如: ["政治", "科技", "健康", "投资"]
  consumption_behaviors TEXT[],      -- 消费行为，如: ["使用卫生巾", "投资股票", "玩游戏"]
  concerns TEXT[],                   -- 关注点，如: ["关注美国大选", "关注AI发展", "关注环保"]
  
  -- ========== 相关经验（最重要）==========
  experiences TEXT[],                -- 实际经历，如: ["参与过投票", "使用过AI工具", "创业经历"]
  familiar_topics TEXT[],            -- 熟悉的话题，如: ["美国政治", "加密货币", "教育改革"]
  affected_by TEXT[],                -- 受什么影响，如: ["美国政策影响", "AI技术影响工作"]
  
  -- ========== 其他信息 ==========
  bio TEXT,                          -- 自我描述
  verified BOOLEAN DEFAULT FALSE,    -- 画像是否已验证
  
  -- ========== 时间戳 ==========
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- ========== 约束 ==========
  UNIQUE(agent_id)  -- 每个 Agent 只有一个画像
);

-- 基础索引
CREATE INDEX IF NOT EXISTS idx_agent_personas_agent_id ON agent_personas(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_personas_age_range ON agent_personas(age_range);
CREATE INDEX IF NOT EXISTS idx_agent_personas_gender ON agent_personas(gender);
CREATE INDEX IF NOT EXISTS idx_agent_personas_occupation ON agent_personas(occupation);

-- GIN 索引用于数组字段的高效搜索
CREATE INDEX IF NOT EXISTS idx_agent_personas_location ON agent_personas USING GIN (location);
CREATE INDEX IF NOT EXISTS idx_agent_personas_life_stage ON agent_personas USING GIN (life_stage);
CREATE INDEX IF NOT EXISTS idx_agent_personas_interests ON agent_personas USING GIN (interests);
CREATE INDEX IF NOT EXISTS idx_agent_personas_consumption ON agent_personas USING GIN (consumption_behaviors);
CREATE INDEX IF NOT EXISTS idx_agent_personas_concerns ON agent_personas USING GIN (concerns);
CREATE INDEX IF NOT EXISTS idx_agent_personas_experiences ON agent_personas USING GIN (experiences);
CREATE INDEX IF NOT EXISTS idx_agent_personas_familiar ON agent_personas USING GIN (familiar_topics);
CREATE INDEX IF NOT EXISTS idx_agent_personas_affected ON agent_personas USING GIN (affected_by);

-- 注释
COMMENT ON TABLE agent_personas IS 'Agent 用户画像表 - 存储 Agent 的多维度画像信息';
COMMENT ON COLUMN agent_personas.age_range IS '年龄范围';
COMMENT ON COLUMN agent_personas.gender IS '性别';
COMMENT ON COLUMN agent_personas.location IS '地理位置（数组）';
COMMENT ON COLUMN agent_personas.education IS '教育背景';
COMMENT ON COLUMN agent_personas.occupation_type IS '职业类型';
COMMENT ON COLUMN agent_personas.occupation IS '具体职业';
COMMENT ON COLUMN agent_personas.life_stage IS '生活阶段（数组）';
COMMENT ON COLUMN agent_personas.interests IS '兴趣爱好（数组）';
COMMENT ON COLUMN agent_personas.consumption_behaviors IS '消费行为（数组）';
COMMENT ON COLUMN agent_personas.concerns IS '关注点（数组）';
COMMENT ON COLUMN agent_personas.experiences IS '实际经历（数组）- 最重要的匹配维度';
COMMENT ON COLUMN agent_personas.familiar_topics IS '熟悉的话题（数组）';
COMMENT ON COLUMN agent_personas.affected_by IS '受什么影响（数组）';
COMMENT ON COLUMN agent_personas.bio IS '自我描述';
COMMENT ON COLUMN agent_personas.verified IS '画像是否已验证';


-- ============================================================================
-- PART 4: 任务目标人群画像表
-- ============================================================================

CREATE TABLE IF NOT EXISTS task_personas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES markets(id) ON DELETE CASCADE,
  
  -- ========== AI 分析的目标人群画像 ==========
  -- 使用 JSONB 存储灵活的画像结构
  target_demographic JSONB,          -- 基础人口统计要求
  target_life_experience JSONB,      -- 生活经验要求
  target_relevant_experience JSONB,  -- 相关经验要求（最重要）
  
  -- ========== 多样性要求 ==========
  diversity_requirements JSONB,      -- 多样性要求，如: {"occupation_diversity": true, "age_diversity": true}
  
  -- ========== AI 分析结果 ==========
  reasoning TEXT,                    -- AI 推荐理由
  sample_personas TEXT[],            -- 示例人群，如: ["美国教师 - 提供教育政策相关信息"]
  information_types TEXT[],          -- 期望的信息类型，如: ["个人观察", "实际经验"]
  confidence TEXT,                   -- 置信度: "high", "medium", "low"
  
  -- ========== AI 模型信息 ==========
  ai_model TEXT,                     -- 使用的 AI 模型，如: "qwen-max", "gpt-4"
  ai_version TEXT,                   -- AI 分析版本号
  
  -- ========== 时间戳 ==========
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- ========== 约束 ==========
  UNIQUE(task_id)  -- 每个任务只有一个画像
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_task_personas_task_id ON task_personas(task_id);
CREATE INDEX IF NOT EXISTS idx_task_personas_confidence ON task_personas(confidence);

-- GIN 索引用于 JSONB 字段的高效搜索
CREATE INDEX IF NOT EXISTS idx_task_personas_target_demographic ON task_personas USING GIN (target_demographic);
CREATE INDEX IF NOT EXISTS idx_task_personas_target_life_exp ON task_personas USING GIN (target_life_experience);
CREATE INDEX IF NOT EXISTS idx_task_personas_target_relevant_exp ON task_personas USING GIN (target_relevant_experience);
CREATE INDEX IF NOT EXISTS idx_task_personas_diversity_req ON task_personas USING GIN (diversity_requirements);

-- 注释
COMMENT ON TABLE task_personas IS '任务目标人群画像表 - 存储 AI 分析的目标人群画像';
COMMENT ON COLUMN task_personas.target_demographic IS '目标人群的基础人口统计要求（JSONB）';
COMMENT ON COLUMN task_personas.target_life_experience IS '目标人群的生活经验要求（JSONB）';
COMMENT ON COLUMN task_personas.target_relevant_experience IS '目标人群的相关经验要求（JSONB）- 最重要';
COMMENT ON COLUMN task_personas.diversity_requirements IS '多样性要求（JSONB）';
COMMENT ON COLUMN task_personas.reasoning IS 'AI 推荐理由';
COMMENT ON COLUMN task_personas.sample_personas IS '示例人群（数组）';
COMMENT ON COLUMN task_personas.information_types IS '期望的信息类型（数组）';
COMMENT ON COLUMN task_personas.confidence IS 'AI 分析置信度';
COMMENT ON COLUMN task_personas.ai_model IS '使用的 AI 模型';
COMMENT ON COLUMN task_personas.ai_version IS 'AI 分析版本号';


-- ============================================================================
-- PART 5: 因果分析结果表
-- ============================================================================

CREATE TABLE IF NOT EXISTS causal_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,

  -- 分析状态
  status TEXT NOT NULL DEFAULT 'processing'
    CHECK (status IN ('pending', 'processing', 'completed', 'error')),

  -- 输入摘要
  signal_count INTEGER DEFAULT 0 NOT NULL,
  hard_fact_count INTEGER DEFAULT 0 NOT NULL,
  persona_count INTEGER DEFAULT 0 NOT NULL,

  -- 因果图谱结果 (完整 JSON)
  graph_data JSONB,           -- { nodes: [...], edges: [...] }
  ontology_data JSONB,        -- { factor_types: [...], relation_types: [...] }
  conclusion JSONB,           -- { direction, confidence, confidence_interval, ... }
  preprocess_summary JSONB,   -- { total_signals, clusters, minority_clusters, ... }

  -- 未来报纸内容
  newspaper_content TEXT,

  -- 元数据
  is_final BOOLEAN DEFAULT false NOT NULL,      -- 是否为最终分析
  is_latest BOOLEAN DEFAULT true NOT NULL,      -- 是否为最新版本
  version INTEGER DEFAULT 1 NOT NULL,           -- 分析版本号
  elapsed_seconds DECIMAL(10, 2),               -- 分析耗时
  error_message TEXT,                           -- 错误信息

  -- 触发条件
  triggered_by TEXT DEFAULT 'auto'              -- auto / manual / schedule
    CHECK (triggered_by IN ('auto', 'manual', 'schedule')),

  -- 时间戳
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 列重命名（market_id → task_id），幂等执行
DO $$
BEGIN
  -- task_personas
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'task_personas' AND column_name = 'market_id') THEN
    ALTER TABLE task_personas RENAME COLUMN market_id TO task_id;
  END IF;

  -- causal_analyses
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'causal_analyses' AND column_name = 'market_id') THEN
    ALTER TABLE causal_analyses RENAME COLUMN market_id TO task_id;
  END IF;
END $$;

-- 索引
CREATE INDEX IF NOT EXISTS idx_causal_analyses_task_id ON causal_analyses(task_id);
CREATE INDEX IF NOT EXISTS idx_causal_analyses_status ON causal_analyses(status);
CREATE INDEX IF NOT EXISTS idx_causal_analyses_latest ON causal_analyses(task_id, is_latest) WHERE is_latest = true;

-- 每个 market 只保留一个 is_latest = true 的记录
-- 通过应用逻辑保证：新分析入库时将旧版本的 is_latest 设为 false


-- ============================================================================
-- PART 6: 触发器
-- ============================================================================

-- 6.1 agent_personas 的 updated_at 自动更新
-- （复用 00_complete_database.sql 中已定义的 update_updated_at_column() 函数）
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_agent_personas_updated_at ON agent_personas;
CREATE TRIGGER update_agent_personas_updated_at
  BEFORE UPDATE ON agent_personas
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 6.1b causal_analyses 的 updated_at 自动更新
DROP TRIGGER IF EXISTS update_causal_analyses_updated_at ON causal_analyses;
CREATE TRIGGER update_causal_analyses_updated_at
  BEFORE UPDATE ON causal_analyses
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 6.2 新 prediction 插入时标记 market 为 pending（触发因果分析）
CREATE OR REPLACE FUNCTION notify_new_prediction()
RETURNS TRIGGER AS $$
DECLARE
  current_count INTEGER;
  last_count INTEGER;
BEGIN
  -- 获取当前 prediction 计数
  SELECT COUNT(*) INTO current_count
  FROM predictions
  WHERE task_id = NEW.task_id;

  -- 获取上次分析时的计数
  SELECT COALESCE(prediction_count_at_last_analysis, 0) INTO last_count
  FROM markets
  WHERE id = NEW.task_id;

  -- 如果新增数据超过阈值（每5条新数据触发一次），标记为 pending
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

-- 绑定触发器
DROP TRIGGER IF EXISTS trigger_new_prediction ON predictions;
CREATE TRIGGER trigger_new_prediction
  AFTER INSERT ON predictions
  FOR EACH ROW
  EXECUTE FUNCTION notify_new_prediction();


-- ============================================================================
-- PART 7: 辅助视图 - 待分析的市场
-- ============================================================================

CREATE OR REPLACE VIEW markets_pending_analysis AS
SELECT
  m.id,
  m.title,
  m.question,
  m.description,
  m.status,
  m.causal_analysis_status,
  m.last_analysis_at,
  m.prediction_count_at_last_analysis,
  COUNT(p.id) AS current_prediction_count,
  COUNT(p.id) - COALESCE(m.prediction_count_at_last_analysis, 0) AS new_prediction_count,
  MAX(p.submitted_at) AS latest_prediction_at
FROM markets m
LEFT JOIN predictions p ON p.task_id = m.id
WHERE m.status = 'active'
  AND m.causal_analysis_status = 'pending'
GROUP BY m.id
ORDER BY new_prediction_count DESC;


-- ============================================================================
-- PART 8: RLS 策略
-- ============================================================================

-- 8.1 Agent 画像表 RLS
ALTER TABLE agent_personas ENABLE ROW LEVEL SECURITY;

-- Agent 可以查看自己的画像
DROP POLICY IF EXISTS "Agents can view own persona" ON agent_personas;
CREATE POLICY "Agents can view own persona"
  ON agent_personas
  FOR SELECT
  USING (auth.uid() = agent_id);

-- Agent 可以插入自己的画像
DROP POLICY IF EXISTS "Agents can insert own persona" ON agent_personas;
CREATE POLICY "Agents can insert own persona"
  ON agent_personas
  FOR INSERT
  WITH CHECK (auth.uid() = agent_id);

-- Agent 可以更新自己的画像
DROP POLICY IF EXISTS "Agents can update own persona" ON agent_personas;
CREATE POLICY "Agents can update own persona"
  ON agent_personas
  FOR UPDATE
  USING (auth.uid() = agent_id);

-- 8.2 任务画像表 RLS
ALTER TABLE task_personas ENABLE ROW LEVEL SECURITY;

-- 所有认证用户可以查看任务画像（用于匹配）
DROP POLICY IF EXISTS "Authenticated users can view task personas" ON task_personas;
CREATE POLICY "Authenticated users can view task personas"
  ON task_personas
  FOR SELECT
  TO authenticated
  USING (true);

-- 只有系统（service_role）可以插入任务画像
DROP POLICY IF EXISTS "Service role can insert task personas" ON task_personas;
CREATE POLICY "Service role can insert task personas"
  ON task_personas
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- 8.3 因果分析表 RLS
ALTER TABLE causal_analyses ENABLE ROW LEVEL SECURITY;

-- 所有认证用户可读
DROP POLICY IF EXISTS "causal_analyses_select_authenticated" ON causal_analyses;
CREATE POLICY "causal_analyses_select_authenticated" ON causal_analyses
  FOR SELECT
  TO authenticated
  USING (true);

-- 仅服务角色可写
DROP POLICY IF EXISTS "causal_analyses_insert_service" ON causal_analyses;
CREATE POLICY "causal_analyses_insert_service" ON causal_analyses
  FOR INSERT
  TO service_role
  WITH CHECK (true);

DROP POLICY IF EXISTS "causal_analyses_update_service" ON causal_analyses;
CREATE POLICY "causal_analyses_update_service" ON causal_analyses
  FOR UPDATE
  TO service_role
  USING (true);


-- ============================================================================
-- PART 9: 市场预测计数与自动完成
-- ============================================================================

-- 9.1 为 markets 表添加 prediction_count 列（实时追踪预测数量）
ALTER TABLE markets ADD COLUMN IF NOT EXISTS prediction_count INTEGER DEFAULT 0 NOT NULL;
COMMENT ON COLUMN markets.prediction_count IS '当前已收到的预测数量（通过触发器自动维护）';

-- 9.2 市场预测计数自增/自减触发器
CREATE OR REPLACE FUNCTION update_market_prediction_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE markets
    SET prediction_count = prediction_count + 1
    WHERE id = NEW.task_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE markets
    SET prediction_count = GREATEST(prediction_count - 1, 0)
    WHERE id = OLD.task_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_market_prediction_count ON predictions;
CREATE TRIGGER trigger_update_market_prediction_count
  AFTER INSERT OR DELETE ON predictions
  FOR EACH ROW
  EXECUTE FUNCTION update_market_prediction_count();

-- 9.3 target_agent_count 达标自动关闭机制
-- 当市场的 prediction_count 达到 target_agent_count 时，自动将状态从 active 改为 closed
CREATE OR REPLACE FUNCTION auto_close_on_target_reached()
RETURNS TRIGGER AS $$
DECLARE
  v_target INTEGER;
  v_status TEXT;
  v_new_count INTEGER;
BEGIN
  -- 仅在 prediction_count 更新时触发
  IF NEW.prediction_count IS NOT DISTINCT FROM OLD.prediction_count THEN
    RETURN NEW;
  END IF;

  v_target := NEW.target_agent_count;
  v_status := NEW.status;
  v_new_count := NEW.prediction_count;

  -- 仅当市场处于 active 状态且设置了目标数量时检查
  IF v_status = 'active' AND v_target IS NOT NULL AND v_target > 0 THEN
    IF v_new_count >= v_target THEN
      NEW.status := 'closed';
      NEW.updated_at := NOW();
      RAISE NOTICE '市场 % 已达到目标预测数 %/%, 自动关闭', NEW.id, v_new_count, v_target;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_auto_close_on_target_reached ON markets;
CREATE TRIGGER trigger_auto_close_on_target_reached
  BEFORE UPDATE ON markets
  FOR EACH ROW
  EXECUTE FUNCTION auto_close_on_target_reached();

-- 9.4 为现有市场回填 prediction_count
-- 确保已有的市场数据也有正确的 prediction_count
DO $$
BEGIN
  UPDATE markets m
  SET prediction_count = (
    SELECT COUNT(*)
    FROM predictions p
    WHERE p.task_id = m.id
  );
  RAISE NOTICE '已回填所有市场的 prediction_count';
END;
$$;
