-- ══════════════════════════════════════════════════════════════════════
-- Migration 06: Survey Module Tables
-- 调查模块独立表结构，与预测模块（markets/predictions/causal_analyses）完全隔离
-- ══════════════════════════════════════════════════════════════════════

-- ── 1. survey_tasks（调查主表）──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS survey_tasks (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title           TEXT NOT NULL,
    description     TEXT,
    -- 调查类型：opinion=意见调查 | market_research=市场研究 | product_feedback=产品反馈 | social=社会研究
    survey_type     TEXT NOT NULL DEFAULT 'opinion'
                        CHECK (survey_type IN ('opinion', 'market_research', 'product_feedback', 'social')),
    -- 目标画像筛选条件，JSON格式
    -- 示例：{"region": ["north_america", "east_asia"], "occupation": ["finance", "technology"]}
    target_persona_filters  JSONB DEFAULT '{}'::jsonb,
    -- 目标Agent数量（0=全量）
    target_agent_count      INT NOT NULL DEFAULT 0,
    -- 状态：draft=草稿 | running=进行中 | completed=已完成 | archived=已归档
    status          TEXT NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft', 'running', 'completed', 'archived')),
    -- 实际收到的回答数
    response_count  INT NOT NULL DEFAULT 0,
    creator_id      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ
);

-- ── 2. survey_questions（调查题目，支持多题问卷）──────────────────────
CREATE TABLE IF NOT EXISTS survey_questions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    survey_id       UUID NOT NULL REFERENCES survey_tasks(id) ON DELETE CASCADE,
    -- 题目顺序（从1开始）
    question_order  INT NOT NULL DEFAULT 1,
    question_text   TEXT NOT NULL,
    -- 题目类型：
    -- single_choice=单选 | multi_choice=多选 | rating=评分(1-10) | open_ended=开放问答 | comparison=对比选择
    question_type   TEXT NOT NULL DEFAULT 'single_choice'
                        CHECK (question_type IN ('single_choice', 'multi_choice', 'rating', 'open_ended', 'comparison')),
    -- 选项列表（single_choice/multi_choice/comparison 类型使用）
    -- 格式：[{"id": "a", "text": "选项A"}, {"id": "b", "text": "选项B"}]
    options         JSONB DEFAULT '[]'::jsonb,
    -- 评分范围（rating 类型使用）
    rating_min      INT DEFAULT 1,
    rating_max      INT DEFAULT 10,
    is_required     BOOLEAN NOT NULL DEFAULT TRUE
);

-- ── 3. survey_responses（Agent 回答，独立存储）────────────────────────
CREATE TABLE IF NOT EXISTS survey_responses (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    survey_id       UUID NOT NULL REFERENCES survey_tasks(id) ON DELETE CASCADE,
    question_id     UUID NOT NULL REFERENCES survey_questions(id) ON DELETE CASCADE,
    -- Agent 画像快照（回答时刻的完整画像，不依赖 profiles 表）
    agent_persona   JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- 回答内容（选项id、评分数字、或开放文本）
    answer          TEXT NOT NULL,
    -- Agent 推理说明
    rationale       TEXT,
    -- Agent 对自己回答的置信度 (0.0–1.0)
    confidence      FLOAT DEFAULT 0.7
                        CHECK (confidence >= 0 AND confidence <= 1),
    submitted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 4. survey_analyses（聚合分析结果，独立于 causal_analyses）─────────
CREATE TABLE IF NOT EXISTS survey_analyses (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    survey_id               UUID NOT NULL REFERENCES survey_tasks(id) ON DELETE CASCADE,
    -- 每道题单独一条分析记录（NULL 表示全卷汇总）
    question_id             UUID REFERENCES survey_questions(id) ON DELETE CASCADE,
    -- 回答分布，格式：{"option_a": 0.45, "option_b": 0.32, "option_c": 0.23}
    result_distribution     JSONB DEFAULT '{}'::jsonb,
    -- 按画像维度分组结果
    -- 格式：{"region": {"north_america": {"option_a": 0.6}, ...}, "occupation": {...}}
    persona_breakdown       JSONB DEFAULT '{}'::jsonb,
    -- 主流答案
    consensus_answer        TEXT,
    -- 分歧率（0.0–1.0，越高表示回答越分散）
    dissent_rate            FLOAT DEFAULT 0.0,
    -- 关键洞察列表
    key_insights            TEXT[] DEFAULT ARRAY[]::TEXT[],
    -- LLM 生成的完整调查报告
    full_report             TEXT,
    -- 参与分析的回答总数
    analyzed_response_count INT DEFAULT 0,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 索引 ──────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_survey_tasks_creator      ON survey_tasks(creator_id);
CREATE INDEX IF NOT EXISTS idx_survey_tasks_status       ON survey_tasks(status);
CREATE INDEX IF NOT EXISTS idx_survey_tasks_created_at   ON survey_tasks(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_survey_questions_survey_id
    ON survey_questions(survey_id, question_order);

CREATE INDEX IF NOT EXISTS idx_survey_responses_survey_id
    ON survey_responses(survey_id);
CREATE INDEX IF NOT EXISTS idx_survey_responses_question_id
    ON survey_responses(question_id);
CREATE INDEX IF NOT EXISTS idx_survey_responses_submitted_at
    ON survey_responses(submitted_at DESC);

CREATE INDEX IF NOT EXISTS idx_survey_analyses_survey_id
    ON survey_analyses(survey_id);
CREATE INDEX IF NOT EXISTS idx_survey_analyses_question_id
    ON survey_analyses(question_id);

-- ── RLS（Row Level Security）──────────────────────────────────────────
ALTER TABLE survey_tasks          ENABLE ROW LEVEL SECURITY;
ALTER TABLE survey_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE survey_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE survey_analyses  ENABLE ROW LEVEL SECURITY;

-- survey_tasks: 所有已登录用户可读；只有创建者可修改
CREATE POLICY "survey_tasks_select" ON survey_tasks
    FOR SELECT TO authenticated USING (true);
CREATE POLICY "survey_tasks_insert" ON survey_tasks
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = creator_id);
CREATE POLICY "survey_tasks_update" ON survey_tasks
    FOR UPDATE TO authenticated USING (auth.uid() = creator_id);

-- survey_questions: 跟随所属 survey 的权限
CREATE POLICY "survey_questions_select" ON survey_questions
    FOR SELECT TO authenticated USING (true);
CREATE POLICY "survey_questions_insert" ON survey_questions
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (SELECT 1 FROM survey_tasks WHERE id = survey_id AND creator_id = auth.uid())
    );

-- survey_responses / survey_analyses: 所有登录用户可读（分析结果公开）
CREATE POLICY "survey_responses_select" ON survey_responses
    FOR SELECT TO authenticated USING (true);
CREATE POLICY "survey_analyses_select" ON survey_analyses
    FOR SELECT TO authenticated USING (true);

-- service role 可写入回答和分析（后端通过 service role 插入）
CREATE POLICY "survey_responses_service_insert" ON survey_responses
    FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "survey_analyses_service_insert" ON survey_analyses
    FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "survey_analyses_service_update" ON survey_analyses
    FOR UPDATE TO service_role USING (true);
