-- ============================================================================
-- Migration 04: 用户画像字段
-- 在 profiles 表新增基础身份画像字段（样例数据）
-- ============================================================================

-- 新增画像列（幂等）
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS persona_region      TEXT,
  ADD COLUMN IF NOT EXISTS persona_gender      TEXT CHECK (persona_gender IN ('male', 'female', 'other', 'unknown')),
  ADD COLUMN IF NOT EXISTS persona_age_range   TEXT,
  ADD COLUMN IF NOT EXISTS persona_occupation  TEXT,
  ADD COLUMN IF NOT EXISTS persona_interests   TEXT[];

-- 若旧版本已加了 CHECK 约束，删除它（幂等）
ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS profiles_persona_age_range_check;

-- 字段注释
COMMENT ON COLUMN profiles.persona_region     IS '用户所在地区（样例数据）';
COMMENT ON COLUMN profiles.persona_gender     IS '用户性别：male/female/other/unknown';
COMMENT ON COLUMN profiles.persona_age_range  IS '年龄段：18-24/25-34/35-44/45-54/55+';
COMMENT ON COLUMN profiles.persona_occupation IS '职业描述（样例数据）';
COMMENT ON COLUMN profiles.persona_interests  IS '兴趣爱好标签数组（样例数据）';
