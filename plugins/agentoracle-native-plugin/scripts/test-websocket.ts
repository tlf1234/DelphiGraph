#!/usr/bin/env node
/**
 * WebSocket 测试脚本
 * 
 * 跳过 AgentOracle API 调用，直接测试与 OpenClaw Gateway 的 WebSocket 通信
 * 参考实现：openclaw_daily_elf/daily-elf-runner.py
 */

import { WebSocketClient } from '../src/websocket_client';
import { PluginLogger } from '../src/types';

// 简单的控制台日志实现
const consoleLogger: PluginLogger = {
  info: (message: string) => console.log(`[INFO] ${message}`),
  warn: (message: string) => console.warn(`[WARN] ${message}`),
  error: (message: string, error?: Error) => {
    console.error(`[ERROR] ${message}`);
    if (error) {
      console.error(error);
    }
  }
};

// 配置（从环境变量或使用默认值）
const GATEWAY_URL = process.env.GATEWAY_URL || 'ws://127.0.0.1:18789';
const GATEWAY_TOKEN = process.env.GATEWAY_TOKEN || '74c143f4fe51a9e4caa2f4325d8fe1a8f0e216bf59a3b434';

// 测试消息（可以通过命令行参数自定义）
const TEST_MESSAGE = process.argv[2] || '你好，这是一个测试消息。请简单回复确认收到。';

async function main() {
  console.log('='.repeat(60));
  console.log('AgentOracle Native Plugin - WebSocket Test');
  console.log('='.repeat(60));
  console.log(`Gateway URL: ${GATEWAY_URL}`);
  console.log(`Test Message: ${TEST_MESSAGE}`);
  console.log('='.repeat(60));
  console.log('');

  // 创建 WebSocket 客户端
  const wsClient = new WebSocketClient(
    {
      gatewayUrl: GATEWAY_URL,
      gatewayToken: GATEWAY_TOKEN,
      timeout: 300,
      maxRetries: 3,
      retryDelayBase: 2,
      connectTimeout: 10,
      messageTimeout: 20
    },
    consoleLogger
  );

  try {
    console.log('🚀 Sending test message to OpenClaw Gateway...\n');

    // 发送测试消息
    const result = await wsClient.sendMessage(TEST_MESSAGE);

    if (result) {
      console.log('\n' + '='.repeat(60));
      console.log('✅ Test Successful!');
      console.log('='.repeat(60));
      console.log(`\n📝 Response (${result.length} characters):\n`);
      console.log(result);
      console.log('\n' + '='.repeat(60));
      process.exit(0);
    } else {
      console.log('\n' + '='.repeat(60));
      console.log('❌ Test Failed: No response received');
      console.log('='.repeat(60));
      process.exit(1);
    }
  } catch (error) {
    console.error('\n' + '='.repeat(60));
    console.error('❌ Test Failed with Error:');
    console.error('='.repeat(60));
    console.error(error);
    process.exit(1);
  }
}

// 运行测试
main();
