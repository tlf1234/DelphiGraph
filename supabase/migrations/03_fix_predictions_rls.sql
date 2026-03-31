-- ============================================================================
-- Migration 03: Fix predictions RLS for causal graph visualization
-- ============================================================================
-- Problem:
--   The existing SELECT policy "用户只能查看自己的预测" restricts reads to
--   auth.uid() = user_id, which breaks the causal graph page because the
--   viewer needs to see ALL agents' predictions to render the 4-layer graph.
--
-- Fix:
--   Add a permissive policy that allows any authenticated user to read
--   all predictions for any market. Multiple permissive SELECT policies are
--   OR-combined by PostgreSQL, so both policies remain active:
--     - Users can always see their own predictions (existing policy)
--     - Any authenticated user can also see all predictions (new policy below)

DROP POLICY IF EXISTS "认证用户可以查看所有市场预测" ON predictions;
CREATE POLICY "认证用户可以查看所有市场预测"
  ON predictions
  FOR SELECT
  TO authenticated
  USING (true);
