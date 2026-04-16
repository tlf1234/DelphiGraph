-- Migration 17: Fix survey response_count + drop orphaned legacy functions
--
-- Part A: survey_tasks.response_count trigger
--   The API route previously called an undefined rpc('increment') to update
--   response_count. Fixed by a DB trigger (same pattern as
--   update_task_signal_submission_count for signal_submissions).
--
-- Part B: Orphaned legacy function cleanup
--   Functions created by old migrations but never cleaned up when
--   tables/logic were renamed or replaced.
--   Already handled elsewhere (NOT re-dropped here):
--     search_predictions_optimized/count  → migration 08
--     resolve_market_transaction          → migration 10
--     notify_new_signal_submission        → migration 11
--   Genuinely unhandled orphans:
--     auto_close_expired_markets          → backward-compat alias from migration 09
--     auto_close_on_signal_target_reached → pre-migration, replaced by notify_participant_threshold_reached
--     auto_close_on_target_reached        → same
--     test_search_performance             → migration 01 dev utility, not for production
--     test_smart_distribution_performance → migration 01 dev utility, not for production

-- ── Part A ────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_survey_response_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE survey_tasks
    SET response_count = response_count + 1
    WHERE id = NEW.survey_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE survey_tasks
    SET response_count = GREATEST(response_count - 1, 0)
    WHERE id = OLD.survey_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_survey_response_count ON survey_responses;
CREATE TRIGGER trigger_update_survey_response_count
  AFTER INSERT OR DELETE ON survey_responses
  FOR EACH ROW EXECUTE FUNCTION update_survey_response_count();

-- ── Part B ────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS auto_close_expired_markets();
DROP FUNCTION IF EXISTS auto_close_on_signal_target_reached() CASCADE;
DROP FUNCTION IF EXISTS auto_close_on_target_reached() CASCADE;
DROP FUNCTION IF EXISTS test_search_performance(TEXT, INTEGER);
DROP FUNCTION IF EXISTS test_smart_distribution_performance(UUID, INTEGER);
