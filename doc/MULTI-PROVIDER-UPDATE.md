# 多提供商支持更新说明

## 更新概述

本次更新为AgentOracle添加了多AI服务和多OAuth提供商支持，提升了系统的灵活性和可用性。

## 主要变更

### 1. 多AI服务支持

新增AI服务抽象层，支持阿里千问和OpenAI：

#### 新增文件
- `lib/ai/types.ts` - AI服务类型定义
- `lib/ai/qwen.ts` - 阿里千问服务实现
- `lib/ai/openai.ts` - OpenAI服务实现
- `lib/ai/index.ts` - 统一入口，自动选择可用服务

#### 特性
- 优先使用阿里千问（国内访问快，成本低）
- 自动降级到OpenAI（如果千问不可用）
- 统一的API接口，易于扩展新的AI服务
- 支持自定义模型和参数

#### 使用示例
```typescript
import { generateAICompletion } from '@/lib/ai'

const response = await generateAICompletion([
  { role: 'system', content: '你是一个预测分析助手' },
  { role: 'user', content: '分析这个市场...' }
])

console.log(response.content)
```

### 2. 多OAuth提供商支持

更新登录组件，支持Google、GitHub、Twitter三种OAuth方式：

#### 更新文件
- `components/auth/login-button.tsx` - 重构为多提供商支持
- `supabase/config.toml` - 添加Google和GitHub配置

#### 特性
- 三种OAuth选项，用户可选择最方便的方式
- 统一的登录流程和错误处理
- 美观的多按钮布局，每个提供商有独特的品牌颜色
- 加载状态指示

#### UI改进
- Google: 白色背景，多彩图标
- GitHub: 深色背景，白色图标
- Twitter: 天蓝色背景，白色图标

### 3. 环境配置更新

#### `.env.example` 更新
```env
# AI配置 - 阿里千问（主要）
QWEN_API_KEY=your_qwen_api_key
QWEN_MODEL=qwen-max
QWEN_API_BASE=https://dashscope.aliyuncs.com/compatible-mode/v1

# AI配置 - OpenAI（备选）
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-4
```

### 4. 文档更新

#### 新增文档
- `doc/SUPABASE-SETUP-GUIDE.md` - 详细的Supabase配置指南
  - 账号注册步骤
  - 项目创建流程
  - API密钥获取方法
  - 三种OAuth配置详解（Google/GitHub/Twitter）
  - 常见问题解答

#### 更新文档
- `doc/SETUP.md` - 更新为多提供商配置说明
  - 添加AI服务配置步骤
  - 更新OAuth配置说明
  - 引用详细配置指南

### 5. 验证脚本更新

`scripts/verify-setup.js` 增强：
- 检查AI配置（可选）
- 区分必需和可选环境变量
- 提供更详细的配置状态反馈

## 迁移指南

### 对于新项目

1. 复制 `.env.example` 到 `.env.local`
2. 配置Supabase（参考 `SUPABASE-SETUP-GUIDE.md`）
3. 配置至少一个AI服务（千问或OpenAI）
4. 配置至少一个OAuth提供商（Google/GitHub/Twitter）
5. 运行 `node scripts/verify-setup.js` 验证配置

### 对于现有项目

1. 更新 `.env.local`，添加新的AI配置：
```env
QWEN_API_KEY=your_qwen_api_key
QWEN_MODEL=qwen-max
QWEN_API_BASE=https://dashscope.aliyuncs.com/compatible-mode/v1
```

2. 在Supabase控制台启用Google和GitHub OAuth（可选）

3. 无需修改代码，登录页面会自动显示所有已启用的OAuth选项

## 配置优先级

### AI服务选择逻辑
1. 检查 `QWEN_API_KEY` → 使用千问
2. 如果千问不可用，检查 `OPENAI_API_KEY` → 使用OpenAI
3. 如果都不可用 → 抛出错误

### OAuth提供商
- 所有已在Supabase中启用的提供商都会显示在登录页面
- 用户可以选择任意一个进行登录
- 建议至少启用Google或GitHub（申请简单）

## 技术细节

### AI服务架构

```
lib/ai/
├── types.ts       # 接口定义
├── qwen.ts        # 千问实现
├── openai.ts      # OpenAI实现
└── index.ts       # 统一入口
```

优点：
- 松耦合设计，易于添加新的AI服务
- 统一的错误处理
- 自动降级机制
- 类型安全

### OAuth流程

```
用户点击登录按钮
  ↓
选择OAuth提供商（Google/GitHub/Twitter）
  ↓
重定向到OAuth提供商
  ↓
用户授权
  ↓
重定向回 /callback
  ↓
创建用户会话和档案
  ↓
重定向到 /dashboard
```

## 测试清单

- [ ] 千问API调用成功
- [ ] OpenAI API调用成功（如果配置）
- [ ] 千问不可用时自动切换到OpenAI
- [ ] Google OAuth登录成功
- [ ] GitHub OAuth登录成功
- [ ] Twitter OAuth登录成功
- [ ] 登录页面显示所有已启用的提供商
- [ ] 验证脚本正确检查AI配置

## 后续计划

1. 在预测提交功能中集成AI服务
2. 添加AI辅助的市场分析功能
3. 支持更多AI服务（Claude、Gemini等）
4. 添加AI使用统计和成本追踪

## 获取帮助

- 阿里千问文档: https://help.aliyun.com/zh/dashscope/
- OpenAI文档: https://platform.openai.com/docs
- Supabase OAuth文档: https://supabase.com/docs/guides/auth/social-login
- 项目问题: 查看 `doc/SETUP.md` 常见问题部分
