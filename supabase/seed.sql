-- AgentOracle 种子数据
-- 用于本地开发和测试

-- ============================================================================
-- 1. 创建测试用户档案
-- ============================================================================

-- 注意：在实际环境中，用户档案应该通过认证流程自动创建
-- 这里仅用于开发测试

-- 插入测试用户（需要先在Supabase Auth中创建对应的用户）
-- INSERT INTO profiles (id, username, twitter_handle, api_key_hash, reputation_score, total_earnings)
-- VALUES
--   ('00000000-0000-0000-0000-000000000001', 'test_user_1', '@testuser1', '$2a$10$...', 50.0, 0),
--   ('00000000-0000-0000-0000-000000000002', 'test_user_2', '@testuser2', '$2a$10$...', 50.0, 0);

-- ============================================================================
-- 2. 创建测试任务
-- ============================================================================

INSERT INTO prediction_tasks (
  id,
  title,
  description,
  question,
  resolution_criteria,
  closes_at,
  status,
  reward_pool
) VALUES
  (
    '10000000-0000-0000-0000-000000000001',
    'NVIDIA股价预测',
    '预测NVIDIA股价是否会在2024年Q3达到$150',
    'Will NVIDIA stock hit $150 by Q3 2024?',
    '以NVIDIA官方收盘价为准，Q3结束时（9月30日）股价>=150美元则为真',
    NOW() + INTERVAL '30 days',
    'active',
    1000.00
  ),
  (
    '10000000-0000-0000-0000-000000000002',
    'GPT-5发布预测',
    '预测OpenAI是否会在2024年发布GPT-5',
    'Will OpenAI release GPT-5 in 2024?',
    '以OpenAI官方公告为准，2024年12月31日前发布则为真',
    NOW() + INTERVAL '60 days',
    'active',
    2000.00
  ),
  (
    '10000000-0000-0000-0000-000000000003',
    '比特币价格预测',
    '预测比特币价格是否会在2024年突破$100,000',
    'Will Bitcoin price exceed $100,000 in 2024?',
    '以主要交易所（Coinbase, Binance）的平均价格为准',
    NOW() + INTERVAL '90 days',
    'active',
    5000.00
  );

-- ============================================================================
-- 3. 创建测试预测（需要先有用户）
-- ============================================================================

-- 示例信号数据（取消注释以使用，UAP v3.0格式）
-- INSERT INTO signal_submissions (task_id, user_id, signals, status, protocol_version)
-- VALUES
--   (
--     '10000000-0000-0000-0000-000000000001',
--     '00000000-0000-0000-0000-000000000001',
--     '[{"signal_id": "sig_001", "evidence_type": "hard_fact", "evidence_text": "NVIDIA Q4财报显示AI芯片营收增长300%", "relevance_reasoning": "强劲的营收增长表明市场需求旺盛，支持股价上涨"}]'::jsonb,
--     'submitted',
--     '3.0'
--   ),
--   (
--     '10000000-0000-0000-0000-000000000001',
--     '00000000-0000-0000-0000-000000000002',
--     '[{"signal_id": "sig_002", "evidence_type": "persona_inference", "evidence_text": "基于用户画像推演，该群体对科技股持谨慎乐观态度", "relevance_reasoning": "用户行为模式显示对高估值科技股有所保留"}]'::jsonb,
--     'submitted',
--     '3.0'
--   );

-- ============================================================================
-- 4. 完成消息
-- ============================================================================
DO $$
BEGIN
  RAISE NOTICE '✅ AgentOracle 种子数据插入完成';
  RAISE NOTICE '   - 已创建 % 个测试任务', (SELECT COUNT(*) FROM prediction_tasks);
  RAISE NOTICE '   - 已创建 % 个测试信号', (SELECT COUNT(*) FROM signal_submissions);
END $$;
