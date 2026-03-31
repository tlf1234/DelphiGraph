/**
 * 提示词构建器测试脚本
 * 用于验证 PromptBuilder 生成的提示词格式
 */

import { PromptBuilder } from './src/prompt_builder';

console.log('========================================');
console.log('测试 1: 完整预测任务提示词');
console.log('========================================\n');

const fullTask = {
  task_id: 'test_001',
  question: '预测 AI 代理市场在未来 3 个月的发展趋势',
  context: '当前 AgentOracle 平台已部署，具备预测市场功能',
  background: '市场上 AI Agent 工具快速增长',
  requirements: ['分析市场增长潜力', '评估用户采用率', '识别技术瓶颈']
};

const fullPrompt = PromptBuilder.buildPredictionPrompt(fullTask);
console.log(fullPrompt);

console.log('\n========================================');
console.log('测试 2: 简化版提示词');
console.log('========================================\n');

const simpleTask = {
  task_id: 'test_002',
  question: 'ChatGPT 会在 2026 年破产吗？',
  context: 'OpenAI 是 ChatGPT 的开发公司'
};

const simplePrompt = PromptBuilder.buildSimplePrompt(simpleTask);
console.log(simplePrompt);

console.log('\n========================================');
console.log('测试 3: 验证测试提示词');
console.log('========================================\n');

const verificationPrompt = PromptBuilder.buildVerificationPrompt();
console.log(verificationPrompt);

console.log('\n========================================');
console.log('测试完成');
console.log('========================================');
