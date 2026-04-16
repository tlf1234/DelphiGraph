-- Migration 16: Drop get_smart_distributed_tasks DB function
--
-- All filtering logic (already-submitted check, niche/reputation matching,
-- match scoring) has been moved to the API layer (route.ts + Edge Function).
-- The DB function is no longer called from any application code.
--
-- Also drops the now-unused get_cached_top_10_threshold and
-- get_top_10_percent_threshold helpers that only existed to support
-- the removed Top 10% bypass logic.

DROP FUNCTION IF EXISTS get_smart_distributed_tasks(UUID, INTEGER);
DROP FUNCTION IF EXISTS get_cached_top_10_threshold();
DROP FUNCTION IF EXISTS get_top_10_percent_threshold();
-- can_access_private_task depended on get_top_10_percent_threshold and duplicated
-- access-control logic that is now handled in the Next.js API layer (route.ts).
DROP FUNCTION IF EXISTS can_access_private_task(UUID, UUID);
