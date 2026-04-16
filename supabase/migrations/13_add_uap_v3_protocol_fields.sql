-- Migration: Add UAP v3.0 Protocol Fields
-- Date: 2026-04-09
-- Description: Add search_directives and constraints fields to support UAP v3.0 prediction task protocol
-- Note: This migration runs AFTER table renaming (migration 12)

-- Add search_directives and constraints to prediction_tasks table
ALTER TABLE prediction_tasks
ADD COLUMN IF NOT EXISTS search_directives TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS constraints JSONB DEFAULT '{
  "min_signals": 1,
  "max_signals": 10,
  "allow_persona_inference": true,
  "allow_abstain": true,
  "required_evidence_types": []
}'::jsonb;

-- Add comment for clarity
COMMENT ON COLUMN prediction_tasks.search_directives IS 'UAP v3.0: Search directive keywords to guide agent local search';
COMMENT ON COLUMN prediction_tasks.constraints IS 'UAP v3.0: Task constraints (min_signals, max_signals, allow_persona_inference, allow_abstain, required_evidence_types)';

-- Note: The existing task_type column (line 164 in 00_complete_database.sql) is for client type (consumer/business)
-- It is NOT the protocol task_type field which was removed in UAP v3.0
-- Protocol now uses is_calibration boolean instead

-- Add missing fields to survey_tasks table for UAP v3.0 Survey Protocol
ALTER TABLE survey_tasks
ADD COLUMN IF NOT EXISTS closes_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS max_length INT;

-- Add missing fields to survey_responses table
ALTER TABLE survey_responses
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS model_name TEXT,
ADD COLUMN IF NOT EXISTS plugin_version TEXT,
ADD COLUMN IF NOT EXISTS protocol_version TEXT DEFAULT '3.0-survey';

-- Add unique constraint to prevent duplicate responses
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'unique_user_question_survey_response'
  ) THEN
    ALTER TABLE survey_responses
    ADD CONSTRAINT unique_user_question_survey_response 
    UNIQUE (survey_id, question_id, user_id);
  END IF;
END $$;

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_survey_responses_survey ON survey_responses(survey_id);
CREATE INDEX IF NOT EXISTS idx_survey_responses_question ON survey_responses(question_id);
CREATE INDEX IF NOT EXISTS idx_survey_responses_user ON survey_responses(user_id);
CREATE INDEX IF NOT EXISTS idx_survey_responses_persona ON survey_responses USING GIN (agent_persona);

-- Add comments
COMMENT ON COLUMN survey_tasks.closes_at IS 'UAP v3.0 Survey Protocol: Survey deadline';
COMMENT ON COLUMN survey_responses.user_id IS 'UAP v3.0 Survey Protocol: User/Agent who submitted the response';
COMMENT ON COLUMN survey_responses.model_name IS 'UAP v3.0 Survey Protocol: LLM model used by agent';
COMMENT ON COLUMN survey_responses.plugin_version IS 'UAP v3.0 Survey Protocol: Plugin version';
COMMENT ON COLUMN survey_responses.protocol_version IS 'UAP v3.0 Survey Protocol: Protocol version (e.g., "3.0-survey")';
