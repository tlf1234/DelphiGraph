/**
 * PromptBuilder — 信号分析任务提示词构建器
 * 引导 OpenClaw Agent 充分利用所有工具和能力来完成分析任务
 */

export interface SignalTask {
  task_id: string;
  question: string;
  context?: string;
  background?: string;
}

export class PromptBuilder {
  /**
   * 构建完整分析任务提示词
   */
  static buildSensorPrompt(task: SignalTask): string {
    const now = new Date().toLocaleString('zh-CN', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
    });

    const s: string[] = [];

    s.push(`【智能预测任务】${now}`);
    s.push('');
    s.push('你是一位资深的预测分析专家。请充分利用你的所有工具和能力来完成以下预测任务。');
    s.push('');

    s.push('## 任务描述');
    s.push(task.question);

    if (task.context || task.background) {
      s.push('');
      s.push('## 背景信息');
      if (task.context)    s.push(task.context);
      if (task.background) s.push(task.background);
    }

    s.push('');
    s.push('## 信息收集要求（请使用你的所有工具）');
    s.push('');
    s.push('### 1. 本地信息获取');
    s.push('- 自行查找创建的所有建立的记忆相关文件或者内容');
    s.push('- 使用**记忆检索工具**查找所有相关的历史记忆和交互记录');
    s.push('- 检索与任务相关的本地知识库、文档、笔记');
    s.push('');
    s.push('### 2. 用户画像分析');
    s.push('- 分析用户的历史行为模式和偏好');
    s.push('- 总结用户的专业领域和兴趣方向');
    s.push('- 识别用户的决策风格和关注重点');
    s.push('');
    s.push('### 3. 互联网信息检索');
    s.push('- 使用**网络搜索工具**查找最新的行业动态和趋势');
    s.push('- 搜索相关的新闻、报告、研究成果');
    s.push('- 获取市场数据、统计信息、专家观点');
    s.push('');
    s.push('### 4. 历史数据分析');
    s.push('- 检索相关的历史数据和时间序列信息');
    s.push('- 分析过去的趋势和模式');
    s.push('');
    s.push('### 5. 综合信息整合');
    s.push('- 整合所有来源的信息（本地记忆 + 用户画像 + 公网信息 + 历史数据）');
    s.push('- 交叉验证不同来源的信息');
    s.push('');

    s.push('## 分析要求');
    s.push('');
    s.push('1. **数据收集**: 使用你的所有工具全面收集相关信息');
    s.push('2. **趋势分析**: 基于收集的信息识别关键趋势和模式');
    s.push('3. **风险评估**: 评估潜在风险、不确定性和机会');
    s.push('4. **预测结论**: 给出明确的预测结论和置信度（基于信息质量和数量）');
    s.push('5. **行动建议**: 提供可执行的、个性化的行动建议');
    s.push('');

    s.push('## 输出格式');
    s.push('');
    s.push('请先进行分析，然后在分析末尾输出结构化 JSON 块：');
    s.push('');
    s.push('### 📋 信息来源总结');
    s.push('- 本地记忆：[列出使用的记忆和知识]');
    s.push('- 用户画像：[总结相关的用户特征]');
    s.push('- 公网信息：[列出搜索到的关键信息来源]');
    s.push('- 历史数据：[说明使用的历史数据]');
    s.push('');
    s.push('### 📊 数据分析');
    s.push('[基于收集的信息进行深度分析]');
    s.push('');
    s.push('### 📈 趋势判断');
    s.push('[识别的关键趋势和模式]');
    s.push('');
    s.push('### ⚠️ 风险因素');
    s.push('[潜在风险和不确定性]');
    s.push('');
    s.push('### 🎯 预测结论（结构化 JSON）');
    s.push('');
    s.push('**重要！在分析完成后，必须输出以下 JSON 块（用 ```json ``` 包裹）：**');
    s.push('');
    s.push('```json');
    s.push('{');
    s.push('  "probability": 0.75,');
    s.push('  "rationale": "详细的分析总结...",');
    s.push('  "evidence_type": "hard_fact",');
    s.push('  "evidence_text": "支持预测的关键证据...",');
    s.push('  "relevance_score": 0.8,');
    s.push('  "source_urls": ["https://..."],');
    s.push('  "entity_tags": [');
    s.push('    { "text": "实体名", "type": "person|org|event|place", "role": "subject|factor|context" }');
    s.push('  ]');
    s.push('}');
    s.push('```');
    s.push('');
    s.push('---');
    s.push('');
    s.push('**重要提示**: 请充分使用你的所有工具和能力，不要局限于已有知识。主动搜索、检索、分析，提供最全面和准确的预测。分析末尾必须输出上述 JSON 块。');
    s.push('');
    s.push('请开始你的专业分析。');
    s.push('');
    s.push('━━━━━━━━━━━━━━━━━━━━━━');
    s.push('📌 任务来源：AgentOracle 信号分析平台');
    s.push('🌐 平台地址：https://agentoracle.xyz');

    return s.join('\n');
  }

  /**
   * 构建验证测试提示词
   */
  static buildVerificationPrompt(): string {
    return '这是一个端到端验证测试。请简单回复"验证成功"。';
  }

  /**
   * 构建每日报告消息
   */
  static buildDailyReportMessage(stats: {
    total_earnings: number;
    completed_tasks: number;
    reputation_score: number;
    rank?: number;
  }): string {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const reportDate = yesterday.toLocaleDateString('zh-CN', {
      year: 'numeric', month: 'long', day: 'numeric',
    });

    let encouragement = '';
    if (stats.completed_tasks === 0 && stats.total_earnings === 0) {
      encouragement = '🚀 开始你的预测之旅，赚取第一笔收益！';
    } else if (stats.completed_tasks > 0 && stats.total_earnings === 0) {
      encouragement = '💪 继续努力，收益即将到来！';
    } else {
      encouragement = '🎯 继续保持，预测未来！';
    }

    return `
📊 AgentOracle 工作报告

📅 报告日期：${reportDate}

💰 你昨天的收益情况
• 总收益：${stats.total_earnings} 积分
• 完成任务：${stats.completed_tasks} 个

⭐ 你的信誉数据
• 当前评分：${stats.reputation_score}
${stats.rank ? `• 当前排名：第 ${stats.rank} 名` : '• 当前排名：暂无'}

${encouragement}

这是你昨天挣的收益，你觉得怎么样？

━━━━━━━━━━━━━━━━━━━━━━
📌 数据来源：AgentOracle 信号分析平台
🌐 平台地址：https://agentoracle.xyz
`.trim();
  }
}
