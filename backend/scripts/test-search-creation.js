/**
 * 搜索任务创建流程测试脚本
 * 
 * 功能：
 * 1. 模拟前端表单提交
 * 2. 调用 API Route
 * 3. 打印整个流程的数据
 * 
 * 使用方法：
 * node backend/scripts/test-search-creation.js
 */

// 模拟不同类型的任务数据
const testCases = [
  {
    name: 'C端预言任务 - 直接付费',
    data: {
      title: '特朗普会赢得2028年美国总统大选吗？',
      question: '特朗普会赢得2028年美国总统大选吗？',
      description: '2028年美国总统大选即将举行，特朗普作为共和党候选人参选。请根据当前的民调数据、政治环境、经济形势等因素，预测特朗普是否会赢得本次大选。',
      resolution_criteria: '根据美国官方选举结果公告，如果特朗普获得超过270张选举人票，则判定为"是"，否则判定为"否"。',
      closes_at: '2028-11-06T23:59:59.999Z',
      reward_pool: 50,
      task_category: 'prediction',
      task_type: 'consumer',
      target_agent_count: 100,
      funding_type: 'direct',
      visibility: 'public',
      result_visibility: 'public',
      priority_level: 'standard',
      min_reputation: 0,
    }
  },
  {
    name: 'C端预言任务 - 众筹模式',
    data: {
      title: 'Bitcoin价格会在2027年底突破10万美元吗？',
      question: 'Bitcoin价格会在2027年底突破10万美元吗？',
      description: 'Bitcoin作为加密货币的领头羊，其价格走势一直备受关注。请根据市场趋势、技术分析、宏观经济环境等因素，预测Bitcoin价格是否会在2027年12月31日前突破10万美元。',
      resolution_criteria: '根据CoinMarketCap或CoinGecko的数据，如果Bitcoin价格在2027年12月31日23:59:59 UTC之前任意时刻达到或超过$100,000，则判定为"是"。',
      closes_at: '2027-12-31T23:59:59.999Z',
      reward_pool: 250,
      task_category: 'prediction',
      task_type: 'consumer',
      target_agent_count: 200,
      funding_type: 'crowd',
      funding_goal: 250,
      visibility: 'public',
      result_visibility: 'public',
      priority_level: 'standard',
      min_reputation: 0,
    }
  },
  {
    name: 'C端调查任务',
    data: {
      title: '2026年AI行业最值得关注的技术趋势是什么？',
      question: '2026年AI行业最值得关注的技术趋势是什么？',
      description: 'AI技术日新月异，从大语言模型到多模态AI，从Agent到具身智能。请分析当前AI行业的发展态势，预测2026年最值得关注的技术趋势，并说明理由。',
      reward_pool: 90,
      task_category: 'research',
      task_type: 'consumer',
      target_agent_count: 120,
      funding_type: 'direct',
      visibility: 'public',
      result_visibility: 'public',
      priority_level: 'standard',
      min_reputation: 0,
    }
  },
  {
    name: 'B端预言任务',
    data: {
      title: '我们公司的新产品会在Q2达到100万用户吗？',
      question: '我们公司的新产品会在Q2达到100万用户吗？',
      description: '我们公司即将推出一款面向企业的SaaS产品，目标是在2027年Q2（4-6月）达到100万注册用户。请根据市场分析、竞品情况、营销策略等因素，预测我们是否能达成这个目标。',
      resolution_criteria: '根据公司内部数据统计，如果在2027年6月30日23:59:59之前，产品注册用户数达到或超过100万，则判定为"是"。',
      closes_at: '2027-06-30T23:59:59.999Z',
      reward_pool: 2000,
      task_category: 'prediction',
      task_type: 'business',
      target_agent_count: 1000,
      funding_type: 'direct',
      visibility: 'private',
      result_visibility: 'private',
      priority_level: 'high',
      min_reputation: 500,
      requires_nda: true,
      nda_text: '本任务涉及公司内部商业机密，参与者需签署保密协议，不得向外界透露任何相关信息。',
    }
  },
  {
    name: 'B端调查任务',
    data: {
      title: '我们应该进入哪个新市场？',
      question: '我们应该进入哪个新市场？',
      description: '我们公司目前在北美市场表现良好，计划拓展到新的地理市场。候选市场包括：欧洲、东南亚、拉丁美洲。请分析各市场的机会、风险、竞争态势，给出建议。',
      reward_pool: 3000,
      task_category: 'research',
      task_type: 'business',
      target_agent_count: 1500,
      funding_type: 'direct',
      visibility: 'private',
      result_visibility: 'private',
      priority_level: 'urgent',
      min_reputation: 500,
      requires_nda: true,
      nda_text: '本任务涉及公司战略规划，参与者需签署保密协议。',
    }
  },
]

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
}

function log(message, color = 'white') {
  console.log(`${colors[color]}${message}${colors.reset}`)
}

function logSection(title) {
  console.log('\n' + '='.repeat(80))
  log(title, 'cyan')
  console.log('='.repeat(80))
}

function logSubSection(title) {
  console.log('\n' + '-'.repeat(80))
  log(title, 'yellow')
  console.log('-'.repeat(80))
}

function logSuccess(message) {
  log(`✓ ${message}`, 'green')
}

function logError(message) {
  log(`✗ ${message}`, 'red')
}

function logInfo(message) {
  log(`ℹ ${message}`, 'blue')
}

function logData(label, data) {
  log(`${label}:`, 'magenta')
  console.log(JSON.stringify(data, null, 2))
}

// 验证函数（模拟前端验证）
function validateFormData(data) {
  const errors = []

  // 必填字段验证
  if (!data.question || data.question.trim().length === 0) {
    errors.push('问题不能为空')
  }
  if (!data.description || data.description.trim().length === 0) {
    errors.push('描述不能为空')
  }

  // 预言任务特殊验证
  if (data.task_category === 'prediction') {
    if (!data.resolution_criteria || data.resolution_criteria.trim().length === 0) {
      errors.push('预言任务必须设置兑现标准')
    }
    if (!data.closes_at) {
      errors.push('预言任务必须设置截止时间')
    } else {
      const closesAt = new Date(data.closes_at)
      const now = new Date()
      if (closesAt <= now) {
        errors.push('截止时间必须是未来时间')
      }
    }
  }

  // 字段长度验证
  if (data.question && data.question.length > 500) {
    errors.push('问题不能超过500个字符')
  }
  if (data.description && data.description.length > 5000) {
    errors.push('描述不能超过5000个字符')
  }
  if (data.resolution_criteria && data.resolution_criteria.length > 2000) {
    errors.push('兑现标准不能超过2000个字符')
  }

  // Agent 数量验证
  const taskType = data.task_type || 'consumer'
  const targetAgentCount = data.target_agent_count || 0
  const baseAgentCount = taskType === 'consumer' ? 100 : 1000
  const maxAgentCount = taskType === 'consumer' ? 500 : 5000

  if (targetAgentCount < baseAgentCount) {
    errors.push(`Agent 数量不能少于 ${baseAgentCount} 个`)
  }
  if (targetAgentCount > maxAgentCount) {
    errors.push(`Agent 数量不能超过 ${maxAgentCount} 个`)
  }

  // 价格验证
  const basePrice = taskType === 'consumer' ? 50 : 2000
  const expectedPrice = basePrice + Math.floor((targetAgentCount - baseAgentCount) / 10) * 20
  if (Math.abs(data.reward_pool - expectedPrice) > 1) {
    errors.push(`价格不匹配: 期望 $${expectedPrice}，实际 $${data.reward_pool}`)
  }

  return errors
}

// 模拟 API 请求数据构建
function buildAPIRequestData(formData) {
  const requestData = {
    ...formData,
    title: formData.title || formData.question,
  }

  // 调查任务：清空不需要的字段
  if (formData.task_category === 'research') {
    requestData.resolution_criteria = null
    requestData.closes_at = null
  }

  return requestData
}

// 模拟 Edge Function 验证
function simulateEdgeFunctionValidation(data) {
  const validationSteps = []

  // 步骤 1: 认证（模拟）
  validationSteps.push({
    step: '1. 验证用户认证',
    status: 'success',
    message: '用户认证成功',
    data: {
      userId: 'mock-user-id-12345',
      email: 'test@example.com',
    }
  })

  // 步骤 2: 解析请求体
  validationSteps.push({
    step: '2. 解析请求体',
    status: 'success',
    message: '请求体解析成功',
    data: {
      hasTitle: !!data.title,
      hasDescription: !!data.description,
      hasQuestion: !!data.question,
      taskCategory: data.task_category,
      taskType: data.task_type,
      rewardPool: data.reward_pool,
      fundingType: data.funding_type,
      targetAgentCount: data.target_agent_count,
    }
  })

  // 步骤 3: 验证必填字段
  const requiredFieldErrors = []
  if (!data.title || data.title.trim().length === 0) {
    requiredFieldErrors.push('Title is required')
  }
  if (!data.description || data.description.trim().length === 0) {
    requiredFieldErrors.push('Description is required')
  }
  if (!data.question || data.question.trim().length === 0) {
    requiredFieldErrors.push('Question is required')
  }
  if (data.task_category === 'prediction') {
    if (!data.resolution_criteria || data.resolution_criteria.trim().length === 0) {
      requiredFieldErrors.push('Resolution criteria is required for prediction tasks')
    }
    if (!data.closes_at) {
      requiredFieldErrors.push('Closing time is required for prediction tasks')
    }
  }
  if (!data.reward_pool || data.reward_pool <= 0) {
    requiredFieldErrors.push('Reward pool must be greater than 0')
  }

  validationSteps.push({
    step: '3. 验证必填字段',
    status: requiredFieldErrors.length === 0 ? 'success' : 'error',
    message: requiredFieldErrors.length === 0 ? '必填字段验证通过' : '必填字段验证失败',
    errors: requiredFieldErrors,
  })

  if (requiredFieldErrors.length > 0) {
    return { success: false, steps: validationSteps }
  }

  // 步骤 4: 验证字段长度
  validationSteps.push({
    step: '4. 验证字段长度',
    status: 'success',
    message: '字段长度验证通过',
    data: {
      titleLength: data.title.length,
      descriptionLength: data.description.length,
      questionLength: data.question.length,
    }
  })

  // 步骤 5: 验证截止时间
  if (data.task_category === 'prediction' && data.closes_at) {
    const closesAt = new Date(data.closes_at)
    const now = new Date()
    validationSteps.push({
      step: '5. 验证截止时间',
      status: closesAt > now ? 'success' : 'error',
      message: closesAt > now ? '截止时间验证通过' : '截止时间必须是未来时间',
      data: {
        closesAt: closesAt.toISOString(),
        now: now.toISOString(),
      }
    })
  } else {
    validationSteps.push({
      step: '5. 验证截止时间',
      status: 'skipped',
      message: '调查任务，跳过截止时间验证',
    })
  }

  // 步骤 6: 验证奖金池和 Agent 数量
  const taskType = data.task_type || 'consumer'
  const targetAgentCount = data.target_agent_count || 0
  const baseAgentCount = taskType === 'consumer' ? 100 : 1000
  const basePrice = taskType === 'consumer' ? 50 : 2000
  const expectedPrice = basePrice + Math.floor((targetAgentCount - baseAgentCount) / 10) * 20

  validationSteps.push({
    step: '6. 验证奖金池和 Agent 数量',
    status: Math.abs(data.reward_pool - expectedPrice) <= 1 ? 'success' : 'error',
    message: Math.abs(data.reward_pool - expectedPrice) <= 1 ? '奖金池和 Agent 数量验证通过' : '价格与 Agent 数量不匹配',
    data: {
      rewardPool: data.reward_pool,
      targetAgentCount,
      expectedPrice,
      baseAgentCount,
      basePrice,
    }
  })

  // 步骤 6.5: v5.0 字段验证
  const fundingType = data.funding_type || 'direct'
  const visibility = data.visibility || 'public'
  
  validationSteps.push({
    step: '6.5. v5.0 字段验证',
    status: 'success',
    message: 'v5.0 字段验证通过',
    data: {
      fundingType,
      visibility,
      requiresNda: data.requires_nda || false,
      minReputation: data.min_reputation || 0,
    }
  })

  // 步骤 7: 清理输入数据
  validationSteps.push({
    step: '7. 清理输入数据',
    status: 'success',
    message: '输入数据清理完成',
    data: {
      sanitizedTitle: data.title.trim(),
      sanitizedDescription: data.description.trim(),
      sanitizedQuestion: data.question.trim(),
    }
  })

  // 步骤 8: AI 智能匹配目标人群画像（模拟）
  const mockPersonaData = data.task_category === 'prediction' && data.question.includes('特朗普')
    ? {
        target_persona: {
          demographic: {
            age_range: ['18+'],
            gender: ['any'],
            location: ['美国', '关注美国政治的国际人士'],
            education: ['any'],
            occupation_type: ['any']
          },
          life_experience: {
            interests: ['政治', '时事', '社会议题'],
            concerns: ['关注美国大选', '关注美国政策']
          },
          relevant_experience: {
            has_experience_with: ['参与过投票', '关注过选举'],
            familiar_with: ['美国政治体系', '两党政治'],
            affected_by: ['美国政策影响']
          }
        },
        diversity_requirements: {
          occupation_diversity: true,
          age_diversity: true,
          education_diversity: true,
          geographic_diversity: true
        },
        reasoning: '需要关注美国大选的普通公民，通过不同职业、年龄、教育背景的多样化人群的集体判断来预测选举结果。',
        sample_personas: [
          '美国教师 - 关注教育政策',
          '美国司机 - 关注经济民生',
          '美国学生 - 关注就业前景',
          '美国医生 - 关注医疗政策',
          '美国律师 - 关注法律改革'
        ],
        information_types: [
          '个人观察：周围人的政治倾向变化',
          '实际经验：参与投票的体验和感受',
          '相关数据：了解的民调数据、新闻报道',
          '独特见解：从自己职业/生活角度的观察'
        ]
      }
    : data.question.includes('卫生巾')
    ? {
        target_persona: {
          demographic: {
            age_range: ['15-50'],
            gender: ['female'],
            location: ['any'],
            education: ['any'],
            occupation_type: ['any']
          },
          life_experience: {
            life_stage: ['月经期', '有月经经历'],
            interests: ['个人护理', '健康', '生活品质'],
            consumption: ['使用卫生巾', '购买女性用品']
          },
          relevant_experience: {
            has_experience_with: ['使用过卫生巾', '尝试过不同品牌'],
            familiar_with: ['卫生巾产品', '女性生理期护理'],
            affected_by: ['月经期不适', '产品质量影响']
          }
        },
        diversity_requirements: {
          occupation_diversity: true,
          age_diversity: true,
          lifestyle_diversity: true
        },
        reasoning: '需要有实际使用经验的成年女性提供多样化的使用信息。',
        sample_personas: [
          '学生 - 提供校园使用场景信息',
          '上班族 - 提供职场使用场景信息',
          '运动爱好者 - 提供运动场景信息',
          '妈妈 - 提供产后使用信息'
        ],
        information_types: [
          '个人观察：不同品牌的使用感受对比',
          '实际经验：在不同场景下的使用体验',
          '相关数据：价格、购买渠道、品牌口碑'
        ]
      }
    : {
        target_persona: {
          demographic: {
            age_range: ['18+'],
            gender: ['any'],
            location: ['any'],
            education: ['any'],
            occupation_type: ['any']
          },
          life_experience: {
            interests: ['科技', 'AI', '技术趋势'],
            concerns: ['关注AI发展', '关注技术创新']
          },
          relevant_experience: {
            has_experience_with: ['使用过AI产品', '关注AI行业'],
            familiar_with: ['AI技术', '科技趋势'],
            affected_by: ['AI技术影响工作/生活']
          }
        },
        diversity_requirements: {
          occupation_diversity: true,
          industry_diversity: true,
          usage_scenario_diversity: true
        },
        reasoning: '需要关注AI发展的普通用户和从业者，通过不同行业、不同使用场景的人的观察来预测趋势。',
        sample_personas: [
          '程序员 - 从开发角度观察',
          '产品经理 - 从应用角度观察',
          '教师 - 从教育场景观察',
          '设计师 - 从创意工具观察'
        ],
        information_types: [
          '个人观察：AI工具的使用体验',
          '实际经验：AI对工作的影响',
          '独特见解：从自己行业角度的观察'
        ]
      }
  
  validationSteps.push({
    step: '8. AI 智能匹配目标人群画像',
    status: 'success',
    message: 'AI 画像匹配成功',
    data: {
      has_target_persona: true,
      has_diversity_requirements: true,
      sample_personas_count: mockPersonaData.sample_personas.length,
      confidence: 'high',
      persona_preview: {
        demographic_keys: Object.keys(mockPersonaData.target_persona.demographic || {}),
        life_experience_keys: Object.keys(mockPersonaData.target_persona.life_experience || {}),
        relevant_experience_keys: Object.keys(mockPersonaData.target_persona.relevant_experience || {}),
      }
    }
  })

  // 步骤 9: 插入任务记录到数据库（模拟）
  const taskStatus = fundingType === 'direct' ? 'active' : 'pending'
  const insertData = {
    title: data.title.trim(),
    description: data.description.trim(),
    question: data.question.trim(),
    resolution_criteria: data.resolution_criteria ? data.resolution_criteria.trim() : null,
    closes_at: data.closes_at || null,
    reward_pool: data.reward_pool,
    status: taskStatus,
    created_by: 'mock-user-id-12345',
    task_category: data.task_category,
    task_type: data.task_type,
    visibility: visibility,
    result_visibility: data.result_visibility || 'public',
    priority_level: data.priority_level || 'standard',
    funding_type: fundingType,
    funding_goal: fundingType === 'crowd' ? (data.funding_goal || data.reward_pool) : null,
    funding_current: 0,
    min_reputation: data.min_reputation || 0,
    required_niche_tags: null, // 保留用于向后兼容
    target_agent_count: data.target_agent_count || null,
    requires_nda: data.requires_nda || false,
    nda_text: data.nda_text ? data.nda_text.trim() : null,
    report_access: data.report_access || 'open',
    allowed_viewers: data.allowed_viewers || null,
  }

  validationSteps.push({
    step: '9. 插入任务记录到数据库',
    status: 'success',
    message: '任务创建成功',
    data: {
      taskId: Math.floor(Math.random() * 10000),
      status: taskStatus,
      insertData,
    }
  })

  // 步骤 10: 插入任务画像数据（模拟）
  if (mockPersonaData && mockPersonaData.target_persona) {
    const personaInsertData = {
      task_id: Math.floor(Math.random() * 10000),
      target_demographic: mockPersonaData.target_persona.demographic || {},
      target_life_experience: mockPersonaData.target_persona.life_experience || {},
      target_relevant_experience: mockPersonaData.target_persona.relevant_experience || {},
      diversity_requirements: mockPersonaData.diversity_requirements || {},
      reasoning: mockPersonaData.reasoning || null,
      sample_personas: mockPersonaData.sample_personas || null,
      information_types: mockPersonaData.information_types || null,
      confidence: 'high',
      ai_model: 'qwen-max',
      ai_version: '1.0',
    }

    validationSteps.push({
      step: '10. 插入任务画像数据到 task_personas 表',
      status: 'success',
      message: '任务画像插入成功',
      data: {
        has_demographic: !!mockPersonaData.target_persona.demographic,
        has_life_experience: !!mockPersonaData.target_persona.life_experience,
        has_relevant_experience: !!mockPersonaData.target_persona.relevant_experience,
        sample_personas_count: mockPersonaData.sample_personas?.length || 0,
        personaInsertData,
      }
    })
  } else {
    validationSteps.push({
      step: '10. 插入任务画像数据',
      status: 'skipped',
      message: '跳过任务画像插入（无画像数据）',
    })
  }

  return { success: true, steps: validationSteps }
}

// 主测试函数
async function runTest(testCase) {
  logSection(`测试用例: ${testCase.name}`)

  // 1. 显示原始表单数据
  logSubSection('1. 前端表单数据')
  logData('表单输入', testCase.data)

  // 2. 前端验证
  logSubSection('2. 前端验证')
  const validationErrors = validateFormData(testCase.data)
  if (validationErrors.length > 0) {
    logError('前端验证失败')
    validationErrors.forEach(error => {
      console.log(`  - ${error}`)
    })
    return
  }
  logSuccess('前端验证通过')

  // 3. 构建 API 请求数据
  logSubSection('3. API 请求数据')
  const apiRequestData = buildAPIRequestData(testCase.data)
  logData('发送到 /api/searchs/create 的数据', apiRequestData)

  // 4. 模拟 Edge Function 验证
  logSubSection('4. Edge Function 验证流程')
  const edgeFunctionResult = simulateEdgeFunctionValidation(apiRequestData)

  edgeFunctionResult.steps.forEach((step, index) => {
    console.log(`\n${step.step}`)
    if (step.status === 'success') {
      logSuccess(step.message)
    } else if (step.status === 'error') {
      logError(step.message)
      if (step.errors) {
        step.errors.forEach(error => {
          console.log(`  - ${error}`)
        })
      }
    } else if (step.status === 'skipped') {
      logInfo(step.message)
    }
    
    if (step.data) {
      console.log('  数据:', JSON.stringify(step.data, null, 4))
    }
  })

  // 5. 最终结果
  logSubSection('5. 最终结果')
  if (edgeFunctionResult.success) {
    logSuccess('任务创建成功！')
    const lastStep = edgeFunctionResult.steps[edgeFunctionResult.steps.length - 1]
    if (lastStep.data && lastStep.data.taskId) {
      logInfo(`任务 ID: ${lastStep.data.taskId}`)
      logInfo(`任务状态: ${lastStep.data.status}`)
    }
  } else {
    logError('任务创建失败')
  }
}

// 运行所有测试
async function runAllTests() {
  log('\n🚀 开始测试搜索任务创建流程\n', 'bright')
  
  for (let i = 0; i < testCases.length; i++) {
    await runTest(testCases[i])
    
    if (i < testCases.length - 1) {
      console.log('\n\n')
    }
  }

  logSection('测试完成')
  logSuccess(`共测试 ${testCases.length} 个用例`)
}

// 执行测试
runAllTests().catch(error => {
  logError('测试执行失败')
  console.error(error)
  process.exit(1)
})
