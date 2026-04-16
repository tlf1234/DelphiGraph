-- Migration: Rename tables for UAP v3.0 Protocol clarity
-- Date: 2026-04-09
-- Description: Rename search_tasks → prediction_tasks, surveys → survey_tasks
-- This creates a consistent naming pattern: prediction_tasks vs survey_tasks

-- ============================================================================
-- PART 1: Rename search_tasks to prediction_tasks
-- ============================================================================

-- Rename the main table
ALTER TABLE IF EXISTS search_tasks RENAME TO prediction_tasks;

-- Rename indexes
ALTER INDEX IF EXISTS idx_search_tasks_status RENAME TO idx_prediction_tasks_status;
ALTER INDEX IF EXISTS idx_search_tasks_closes_at RENAME TO idx_prediction_tasks_closes_at;
ALTER INDEX IF EXISTS idx_search_tasks_created_by RENAME TO idx_prediction_tasks_created_by;
ALTER INDEX IF EXISTS idx_search_tasks_created_at RENAME TO idx_prediction_tasks_created_at;
ALTER INDEX IF EXISTS idx_search_tasks_visibility RENAME TO idx_prediction_tasks_visibility;
ALTER INDEX IF EXISTS idx_search_tasks_funding_type RENAME TO idx_prediction_tasks_funding_type;
ALTER INDEX IF EXISTS idx_search_tasks_required_niche_tags RENAME TO idx_prediction_tasks_required_niche_tags;
ALTER INDEX IF EXISTS idx_search_tasks_calibration RENAME TO idx_prediction_tasks_calibration;

-- Update foreign key references in signal_submissions
DO $$
BEGIN
  -- Rename the constraint if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'signal_submissions_task_id_fkey' 
    AND table_name = 'signal_submissions'
  ) THEN
    ALTER TABLE signal_submissions 
    DROP CONSTRAINT signal_submissions_task_id_fkey;
    
    ALTER TABLE signal_submissions 
    ADD CONSTRAINT signal_submissions_task_id_fkey 
    FOREIGN KEY (task_id) REFERENCES prediction_tasks(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Update other tables that reference search_tasks
DO $$
BEGIN
  -- simulations table
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'simulations_task_id_fkey'
    AND table_name = 'simulations'
  ) THEN
    ALTER TABLE simulations DROP CONSTRAINT simulations_task_id_fkey;
    ALTER TABLE simulations 
    ADD CONSTRAINT simulations_task_id_fkey 
    FOREIGN KEY (task_id) REFERENCES prediction_tasks(id) ON DELETE CASCADE;
  END IF;

  -- calibration_tasks table (if exists)
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'calibration_tasks'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'calibration_tasks_task_id_fkey'
  ) THEN
    ALTER TABLE calibration_tasks DROP CONSTRAINT calibration_tasks_task_id_fkey;
    ALTER TABLE calibration_tasks 
    ADD CONSTRAINT calibration_tasks_task_id_fkey 
    FOREIGN KEY (task_id) REFERENCES prediction_tasks(id) ON DELETE CASCADE;
  END IF;

  -- redemption_attempts table (if exists)
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'redemption_attempts'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'redemption_attempts_task_id_fkey'
  ) THEN
    ALTER TABLE redemption_attempts DROP CONSTRAINT redemption_attempts_task_id_fkey;
    ALTER TABLE redemption_attempts 
    ADD CONSTRAINT redemption_attempts_task_id_fkey 
    FOREIGN KEY (task_id) REFERENCES prediction_tasks(id) ON DELETE CASCADE;
  END IF;

  -- reputation_history table (if exists)
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'reputation_history'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'reputation_history_task_id_fkey'
  ) THEN
    ALTER TABLE reputation_history DROP CONSTRAINT reputation_history_task_id_fkey;
    ALTER TABLE reputation_history 
    ADD CONSTRAINT reputation_history_task_id_fkey 
    FOREIGN KEY (task_id) REFERENCES prediction_tasks(id) ON DELETE SET NULL;
  END IF;

  -- task_status_audit table (if exists)
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'task_status_audit'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'task_status_audit_task_id_fkey'
  ) THEN
    ALTER TABLE task_status_audit DROP CONSTRAINT task_status_audit_task_id_fkey;
    ALTER TABLE task_status_audit 
    ADD CONSTRAINT task_status_audit_task_id_fkey 
    FOREIGN KEY (task_id) REFERENCES prediction_tasks(id) ON DELETE CASCADE;
  END IF;

  -- settlement_audit table (if exists)
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'settlement_audit'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'settlement_audit_task_id_fkey'
  ) THEN
    ALTER TABLE settlement_audit DROP CONSTRAINT settlement_audit_task_id_fkey;
    ALTER TABLE settlement_audit 
    ADD CONSTRAINT settlement_audit_task_id_fkey 
    FOREIGN KEY (task_id) REFERENCES prediction_tasks(id) ON DELETE CASCADE;
  END IF;

  -- nda_agreements table (if exists)
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'nda_agreements'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'nda_agreements_task_id_fkey'
  ) THEN
    ALTER TABLE nda_agreements DROP CONSTRAINT nda_agreements_task_id_fkey;
    ALTER TABLE nda_agreements 
    ADD CONSTRAINT nda_agreements_task_id_fkey 
    FOREIGN KEY (task_id) REFERENCES prediction_tasks(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ============================================================================
-- PART 2: Rename surveys to survey_tasks
-- ============================================================================

-- Rename the main table
ALTER TABLE IF EXISTS surveys RENAME TO survey_tasks;

-- Rename indexes (if they exist)
ALTER INDEX IF EXISTS idx_surveys_status RENAME TO idx_survey_tasks_status;
ALTER INDEX IF EXISTS idx_surveys_creator RENAME TO idx_survey_tasks_creator;
ALTER INDEX IF EXISTS idx_surveys_created_at RENAME TO idx_survey_tasks_created_at;

-- Update foreign key references in survey_questions
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'survey_questions_survey_id_fkey'
  ) THEN
    ALTER TABLE survey_questions DROP CONSTRAINT survey_questions_survey_id_fkey;
    ALTER TABLE survey_questions 
    ADD CONSTRAINT survey_questions_survey_id_fkey 
    FOREIGN KEY (survey_id) REFERENCES survey_tasks(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Update foreign key references in survey_responses
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'survey_responses_survey_id_fkey'
  ) THEN
    ALTER TABLE survey_responses DROP CONSTRAINT survey_responses_survey_id_fkey;
    ALTER TABLE survey_responses 
    ADD CONSTRAINT survey_responses_survey_id_fkey 
    FOREIGN KEY (survey_id) REFERENCES survey_tasks(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Update foreign key references in survey_analyses
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'survey_analyses_survey_id_fkey'
  ) THEN
    ALTER TABLE survey_analyses DROP CONSTRAINT survey_analyses_survey_id_fkey;
    ALTER TABLE survey_analyses 
    ADD CONSTRAINT survey_analyses_survey_id_fkey 
    FOREIGN KEY (survey_id) REFERENCES survey_tasks(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ============================================================================
-- PART 3: Update RPC functions and triggers
-- ============================================================================

-- Note: RPC functions that reference these tables will need to be updated
-- This is handled in the next migration (13_update_rpc_functions.sql)

-- Add comments for clarity
COMMENT ON TABLE prediction_tasks IS 'UAP v3.0: Prediction tasks for signal collection and causal inference (formerly search_tasks)';
COMMENT ON TABLE survey_tasks IS 'UAP v3.0: Survey tasks for structured questionnaire responses (formerly surveys)';
