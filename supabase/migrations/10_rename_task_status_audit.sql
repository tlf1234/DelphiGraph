-- ============================================================================
-- Migration 10: Rename market_status_audit → task_status_audit
--               Rename resolve_market_transaction → resolve_task_transaction
-- 将 market_status_audit 表重命名为 task_status_audit
-- 将 resolve_market_transaction 函数重命名为 resolve_task_transaction
-- ============================================================================

-- ============================================================================
-- STEP 1: Rename table
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'market_status_audit') THEN
    ALTER TABLE market_status_audit RENAME TO task_status_audit;
    RAISE NOTICE 'Renamed market_status_audit → task_status_audit';
  ELSE
    RAISE NOTICE 'Table task_status_audit already exists or market_status_audit not found, skipping.';
  END IF;
END $$;

-- ============================================================================
-- STEP 2: Rename indexes
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_market_status_audit_market') THEN
    ALTER INDEX idx_market_status_audit_market RENAME TO idx_task_status_audit_task;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_market_status_audit_changed_at') THEN
    ALTER INDEX idx_market_status_audit_changed_at RENAME TO idx_task_status_audit_changed_at;
  END IF;
END $$;

-- ============================================================================
-- STEP 3: Update RLS policies on task_status_audit
-- ============================================================================

DROP POLICY IF EXISTS "管理员可以查看市场状态审计" ON task_status_audit;
DROP POLICY IF EXISTS "管理员可以插入市场状态审计" ON task_status_audit;
DROP POLICY IF EXISTS "服务角色可以管理所有market_status_audit" ON task_status_audit;
DROP POLICY IF EXISTS "管理员可以查看任务状态审计" ON task_status_audit;
DROP POLICY IF EXISTS "管理员可以插入任务状态审计" ON task_status_audit;
DROP POLICY IF EXISTS "服务角色可以管理所有task_status_audit" ON task_status_audit;

CREATE POLICY "管理员可以查看任务状态审计" ON task_status_audit FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
);
CREATE POLICY "管理员可以插入任务状态审计" ON task_status_audit FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
);
CREATE POLICY "服务角色可以管理所有task_status_audit" ON task_status_audit FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================================
-- STEP 4: Rename resolve_market_transaction → resolve_task_transaction
-- (Drop old, the new version is defined in 00_complete_database.sql)
-- ============================================================================

DROP FUNCTION IF EXISTS resolve_market_transaction(UUID, BOOLEAN, UUID);

-- ============================================================================
-- STEP 5: Rename max_market_value → max_task_value in reputation_levels
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'reputation_levels'
             AND column_name = 'max_market_value') THEN
    ALTER TABLE reputation_levels RENAME COLUMN max_market_value TO max_task_value;
    RAISE NOTICE 'Renamed reputation_levels.max_market_value → max_task_value';
  END IF;
END $$;

-- ============================================================================
-- STEP 6: Rename legacy _market index names to _task
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_simulations_market') THEN
    ALTER INDEX idx_simulations_market RENAME TO idx_simulations_task;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_calibration_tasks_market') THEN
    ALTER INDEX idx_calibration_tasks_market RENAME TO idx_calibration_tasks_task;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_reputation_history_market') THEN
    ALTER INDEX idx_reputation_history_market RENAME TO idx_reputation_history_task;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_settlement_audit_market') THEN
    ALTER INDEX idx_settlement_audit_market RENAME TO idx_settlement_audit_task;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_nda_agreements_market') THEN
    ALTER INDEX idx_nda_agreements_market RENAME TO idx_nda_agreements_task;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_crowdfunding_market') THEN
    ALTER INDEX idx_crowdfunding_market RENAME TO idx_crowdfunding_task;
  END IF;
END $$;

-- ============================================================================
-- STEP 7: Update table comment
-- ============================================================================

COMMENT ON TABLE task_status_audit IS '任务状态变更审计日志';
