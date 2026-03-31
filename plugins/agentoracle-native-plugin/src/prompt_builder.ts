/**
 * Prompt Builder - 预测任务提示词构建器
 * 
 * 基于 openclaw_daily_elf 的提示词规范，构建高质量的预测任务提示词
 * 让 OpenClaw Agent 充分利用其所有工具和能力来完成预测任务
 */

export interface PredictionTask {
  task_id: string;
  question: string;
  context?: string;
  background?: string;
  requirements?: string[];
}

export class PromptBuilder {
  /**
   * 构建完整的预测任务提示词
   * 
   * @param task 预测任务对象
   * @returns 格式化的提示词字符串
   */
  static buildPredictionPrompt(task: PredictionTask): string {
    const now = new Date().toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });

    const sections: string[] = [];

    // 标题和时间
    sections.push(`【智能预测任务】${now}`);
    sections.push('');
    sections.push('你是一位资深的预测分析专家。请充分利用你的所有工具和能力来完成以下预测任务。');
    sections.push('');

    // 任务描述
    sections.push('## 任务描述');
    sections.push(task.question);
    
    // 背景信息（如果有）
    if (task.context || task.background) {
      sections.push('');
      sections.push('## 背景信息');
      if (task.context) {
        sections.push(task.context);
      }
      if (task.background) {
        sections.push(task.background);
      }
    }

    sections.push('');

    // 信息收集要求
    sections.push('## 信息收集要求（请使用你的所有工具）');
    sections.push('');
    sections.push('### 1. 本地信息获取');
    sections.push('- 自行查找创建的所有建立的记忆相关文件或者内容');
    sections.push('- 使用**记忆检索工具**查找所有相关的历史记忆和交互记录');
    sections.push('- 检索与任务相关的本地知识库、文档、笔记');
    sections.push('- 查找历史对话中的相关讨论和结论');
    sections.push('');
    sections.push('### 2. 用户画像分析');
    sections.push('- 分析用户的历史行为模式和偏好');
    sections.push('- 总结用户的专业领域和兴趣方向');
    sections.push('- 识别用户的决策风格和关注重点');
    sections.push('');
    sections.push('### 3. 互联网信息检索');
    sections.push('- 使用**网络搜索工具**查找最新的行业动态和趋势');
    sections.push('- 搜索相关的新闻、报告、研究成果');
    sections.push('- 获取市场数据、统计信息、专家观点');
    sections.push('');
    sections.push('### 4. 历史数据分析');
    sections.push('- 检索相关的历史数据和时间序列信息');
    sections.push('- 分析过去的趋势和模式');
    sections.push('- 识别周期性规律和异常事件');
    sections.push('');
    sections.push('### 5. 综合信息整合');
    sections.push('- 整合所有来源的信息（本地记忆 + 用户画像 + 公网信息 + 历史数据）');
    sections.push('- 交叉验证不同来源的信息');
    sections.push('- 识别信息的可靠性和时效性');
    sections.push('');

    // 分析要求
    sections.push('## 分析要求');
    sections.push('');
    sections.push('1. **数据收集**: 使用你的所有工具全面收集相关信息');
    sections.push('2. **趋势分析**: 基于收集的信息识别关键趋势和模式');
    sections.push('3. **风险评估**: 评估潜在风险、不确定性和机会');
    sections.push('4. **预测结论**: 给出明确的预测结论和置信度（基于信息质量和数量）');
    sections.push('5. **行动建议**: 提供可执行的、个性化的行动建议');
    sections.push('');

    // 输出格式
    sections.push('## 输出格式');
    sections.push('');
    sections.push('请先进行分析，然后在分析末尾输出结构化 JSON 块：');
    sections.push('');
    sections.push('### 📋 信息来源总结');
    sections.push('- 本地记忆：[列出使用的记忆和知识]');
    sections.push('- 用户画像：[总结相关的用户特征]');
    sections.push('- 公网信息：[列出搜索到的关键信息来源]');
    sections.push('- 历史数据：[说明使用的历史数据]');
    sections.push('');
    sections.push('### 📊 数据分析');
    sections.push('[基于收集的信息进行深度分析]');
    sections.push('');
    sections.push('### 📈 趋势判断');
    sections.push('[识别的关键趋势和模式]');
    sections.push('');
    sections.push('### ⚠️ 风险因素');
    sections.push('[潜在风险和不确定性]');
    sections.push('');
    sections.push('### 🎯 预测结论（结构化 JSON）');
    sections.push('');
    sections.push('**重要！在分析完成后，必须输出以下 JSON 块（用 ```json ``` 包裹）：**');
    sections.push('');
    sections.push('```json');
    sections.push('{');
    sections.push('  "probability": 0.75,        // 0-1 之间的数值，表示预测为"Yes"的概率');
    sections.push('  "rationale": "详细的分析总结...",  // 完整的分析推理过程');
    sections.push('  "evidence_type": "hard_fact",  // "hard_fact" 或 "persona_inference"');
    sections.push('  "evidence_text": "支持预测的关键证据...",  // 核心证据摘要');
    sections.push('  "relevance_score": 0.8,    // 0-1，信息与问题的相关性');
    sections.push('  "source_urls": ["https://..."],  // 信息来源URL列表（可为空数组）');
    sections.push('  "entity_tags": [            // 关键实体标签（可为空数组）');
    sections.push('    { "text": "实体名", "type": "person|org|event|place", "role": "subject|factor|context" }');
    sections.push('  ]');
    sections.push('}');
    sections.push('```');
    sections.push('');
    sections.push('---');
    sections.push('');
    sections.push('**重要提示**: 请充分使用你的所有工具和能力，不要局限于已有知识。主动搜索、检索、分析，提供最全面和准确的预测。分析末尾必须输出上述 JSON 块。');
    sections.push('');
    sections.push('请开始你的专业分析。');
    sections.push('');
    sections.push('━━━━━━━━━━━━━━━━━━━━━━');
    sections.push('📌 任务来源：AgentOracle 预测市场平台');
    sections.push('🌐 平台地址：https://agentoracle.xyz');

    return sections.join('\n');
  }

  /**
   * 构建简化版提示词（用于快速测试或简单任务）
   * 
   * @param task 预测任务对象
   * @returns 简化的提示词字符串
   */
  static buildSimplePrompt(task: PredictionTask): string {
    let prompt = `请回答以下预测问题：\n\n${task.question}`;

    if (task.context) {
      prompt += `\n\n背景信息：\n${task.context}`;
    }

    prompt += `\n\n请先给出分析，然后在末尾输出以下 JSON 块：

\`\`\`json
{
  "probability": 0.75,
  "rationale": "你的分析总结",
  "evidence_type": "hard_fact",
  "evidence_text": "关键证据",
  "relevance_score": 0.8,
  "source_urls": [],
  "entity_tags": []
}
\`\`\``;

    prompt += `\n\n━━━━━━━━━━━━━━━━━━━━━━\n📌 任务来源：AgentOracle 预测市场平台\n🌐 平台地址：https://agentoracle.xyz`;

    return prompt;
  }

  /**
   * 构建验证测试提示词
   * 
   * @returns 验证测试提示词
   */
  static buildVerificationPrompt(): string {
    return '这是一个端到端验证测试。请简单回复"验证成功"。';
  }
}
