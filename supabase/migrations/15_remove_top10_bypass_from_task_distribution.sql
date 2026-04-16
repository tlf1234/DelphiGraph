-- Migration 15: Remove Top 10% bypass from get_smart_distributed_tasks
-- 
-- Changes:
--   1. Remove v_top_10_threshold / v_is_top_agent logic — private task access now
--      requires the agent to meet min_reputation strictly, with no Top 10% shortcut.
--   2. Fix stale table reference: FROM markets → FROM prediction_tasks
--      (markets was renamed search_tasks in 09, then prediction_tasks in 12)

CREATE OR REPLACE FUNCTION get_smart_distributed_tasks(
  p_agent_id UUID,
  p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  question TEXT,
  description TEXT,
  reward_pool DECIMAL(10, 2),
  closes_at TIMESTAMPTZ,
  visibility TEXT,
  funding_type TEXT,
  funding_goal DECIMAL(10, 2),
  funding_current DECIMAL(10, 2),
  funding_progress DECIMAL(5, 4),
  required_niche_tags TEXT[],
  requires_nda BOOLEAN,
  min_reputation INTEGER,
  match_score DECIMAL(5, 3),
  match_reason TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_agent RECORD;
BEGIN
  -- Get agent profile
  SELECT
    reputation_score,
    status,
    niche_tags
  INTO v_agent
  FROM profiles
  WHERE profiles.id = p_agent_id;

  -- Check if agent is in purgatory
  IF v_agent.status = 'restricted' THEN
    RETURN;
  END IF;

  -- Return filtered and scored tasks
  RETURN QUERY
  WITH accessible_tasks AS (
    SELECT
      m.*,
      -- Niche tag matching (30% weight)
      CASE
        WHEN m.required_niche_tags IS NOT NULL AND array_length(m.required_niche_tags, 1) > 0 THEN
          CASE
            WHEN v_agent.niche_tags IS NOT NULL THEN
              (
                SELECT COUNT(*)::DECIMAL / array_length(m.required_niche_tags, 1)
                FROM unnest(m.required_niche_tags) AS required_tag
                WHERE required_tag = ANY(v_agent.niche_tags)
              ) * 0.3
            ELSE -0.1
          END
        ELSE 0
      END AS niche_score,

      -- Reputation-based scoring (20% weight)
      CASE
        WHEN m.min_reputation > 0 THEN
          LEAST((v_agent.reputation_score / m.min_reputation) - 1, 1) * 0.2
        ELSE 0
      END AS reputation_score,

      -- Reward pool attractiveness (20% weight)
      LEAST(m.reward_pool / 5000, 1) * 0.2 AS reward_score,

      -- Urgency (10% weight)
      CASE
        WHEN EXTRACT(EPOCH FROM (m.closes_at - NOW())) / 3600 < 24 THEN 0.1
        WHEN EXTRACT(EPOCH FROM (m.closes_at - NOW())) / 3600 < 72 THEN 0.05
        ELSE 0
      END AS urgency_score,

      -- Funding progress bonus (10% weight)
      CASE
        WHEN m.funding_type = 'crowd' AND m.funding_progress IS NOT NULL THEN
          m.funding_progress * 0.1
        ELSE 0
      END AS funding_score,

      -- Match reason text
      CASE
        WHEN m.required_niche_tags IS NOT NULL AND array_length(m.required_niche_tags, 1) > 0 THEN
          CASE
            WHEN v_agent.niche_tags IS NOT NULL THEN
              CASE
                WHEN (
                  SELECT COUNT(*)
                  FROM unnest(m.required_niche_tags) AS required_tag
                  WHERE required_tag = ANY(v_agent.niche_tags)
                ) = array_length(m.required_niche_tags, 1) THEN
                  'Perfect match: ' || array_to_string(
                    ARRAY(
                      SELECT required_tag
                      FROM unnest(m.required_niche_tags) AS required_tag
                      WHERE required_tag = ANY(v_agent.niche_tags)
                    ), ', '
                  )
                WHEN (
                  SELECT COUNT(*)
                  FROM unnest(m.required_niche_tags) AS required_tag
                  WHERE required_tag = ANY(v_agent.niche_tags)
                ) > 0 THEN
                  'Partial match: ' || array_to_string(
                    ARRAY(
                      SELECT required_tag
                      FROM unnest(m.required_niche_tags) AS required_tag
                      WHERE required_tag = ANY(v_agent.niche_tags)
                    ), ', '
                  )
                ELSE 'No niche match'
              END
            ELSE 'No niche match'
          END
        ELSE 'General task'
      END AS match_reason_text

    FROM prediction_tasks m
    WHERE
      m.status IN ('pending', 'active')
      AND (
        m.visibility = 'public'
        OR m.created_by = p_agent_id
        OR p_agent_id = ANY(m.allowed_viewers)
        OR (
          -- Private tasks: strict reputation gate, no Top 10% bypass
          m.visibility = 'private'
          AND v_agent.reputation_score >= m.min_reputation
          AND (
            m.required_niche_tags IS NULL
            OR m.required_niche_tags && v_agent.niche_tags
          )
        )
      )
  )
  SELECT
    at.id,
    at.title,
    at.question,
    at.description,
    at.reward_pool,
    at.closes_at,
    at.visibility,
    at.funding_type,
    at.funding_goal,
    at.funding_current,
    at.funding_progress,
    at.required_niche_tags,
    at.requires_nda,
    at.min_reputation,
    GREATEST(0, LEAST(1,
      0.5 +
      at.niche_score +
      at.reputation_score +
      at.reward_score +
      at.urgency_score +
      at.funding_score
    ))::DECIMAL(5, 3) AS match_score,
    at.match_reason_text AS match_reason,
    at.created_at
  FROM accessible_tasks at
  ORDER BY match_score DESC, at.created_at DESC
  LIMIT p_limit;
END;
$$;

COMMENT ON FUNCTION get_smart_distributed_tasks IS
  'Smart task distribution: filters and scores prediction_tasks at DB level. '
  'Access control: public tasks open to all; private tasks require min_reputation (no Top 10% bypass). '
  'Score = 0.5 base + niche(30%) + reputation(20%) + reward(20%) + urgency(10%) + funding(10%).';
