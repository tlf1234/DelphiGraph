# AgentOracle 设置指南

## 阶段1：认证系统设置与验证

本指南将帮助您完成AgentOracle项目的第一阶段设置和验证。

## 前置要求

- Node.js 18+ 
- npm 或 yarn
- Supabase账号（[详细注册指南](./SUPABASE-SETUP-GUIDE.md)）
- OAuth提供商账号（Google/GitHub/Twitter任选其一）
- AI服务API密钥（阿里千问或OpenAI）

## 步骤1：安装依赖

**重要**: 由于 npm 配置问题，请使用以下命令安装依赖：

```bash
npm install --no-workspaces
```

如果遇到 `npm error No workspaces found!` 错误，请使用上述命令。

> **说明**: `--no-workspaces` 标志绕过 npm workspaces 检查，这是由于某些 npm 版本或全局配置导致的问题。

## 步骤2：配置环境变量

1. 复制环境变量模板：
```bash
cp .env.example .env.local
```

2. 编辑 `.env.local` 并填入实际值：

```env
# Supabase配置
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# AI配置 - 阿里千问（主要，推荐）
QWEN_API_KEY=your_qwen_api_key
QWEN_MODEL=qwen-max
QWEN_API_BASE=https://dashscope.aliyuncs.com/compatible-mode/v1

# AI配置 - OpenAI（备选）
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-4

# 应用URL
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 获取Supabase凭证

**详细步骤请查看：[Supabase完整配置指南](./SUPABASE-SETUP-GUIDE.md)**

快速步骤：
1. 访问 https://supabase.com 并创建项目
2. 进入 Settings → API
3. 复制以下值：
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - anon/public key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - service_role key → `SUPABASE_SERVICE_ROLE_KEY`

### 获取AI服务密钥

#### 选项A：阿里千问（推荐，国内访问快）

1. 访问 [阿里云百炼平台](https://bailian.console.aliyun.com/)
2. 开通DashScope服务
3. 创建API Key
4. 复制API Key到 `QWEN_API_KEY`

#### 选项B：OpenAI（备选）

1. 访问 [OpenAI Platform](https://platform.openai.com/)
2. 创建API Key
3. 复制API Key到 `OPENAI_API_KEY`

**注意**：至少配置一个AI服务，系统会优先使用千问，如果不可用则自动切换到OpenAI。

## 步骤3：设置数据库

### 选项A：使用Supabase云端（推荐用于测试）

1. 在Supabase项目中，进入 SQL Editor
2. 复制 `supabase/migrations/20240213000001_initial_schema.sql` 的内容
3. 执行SQL
4. 复制 `supabase/migrations/20240213000002_rls_policies.sql` 的内容
5. 执行SQL

### 选项B：使用本地Supabase（推荐用于开发）

```bash
# 安装Supabase CLI
npm install -g supabase

# 初始化本地Supabase
supabase init

# 启动本地Supabase
supabase start

# 运行迁移
supabase db reset
```

## 步骤4：配置OAuth认证

**详细步骤请查看：[Supabase完整配置指南](./SUPABASE-SETUP-GUIDE.md#第五步配置oauth认证)**

AgentOracle支持三种OAuth登录方式，至少配置一种：

### Google OAuth（推荐）

1. 访问 [Google Cloud Console](https://console.cloud.google.com/)
2. 创建OAuth客户端ID
3. 配置回调URL: `https://your-project.supabase.co/auth/v1/callback`
4. 在Supabase中启用Google Provider并填入凭证

### GitHub OAuth

1. 访问 [GitHub Settings](https://github.com/settings/developers)
2. 创建OAuth App
3. 配置回调URL: `https://your-project.supabase.co/auth/v1/callback`
4. 在Supabase中启用GitHub Provider并填入凭证

### Twitter OAuth

1. 访问 [Twitter Developer Portal](https://developer.twitter.com/)
2. 创建应用并配置OAuth 2.0
3. 配置回调URL: `https://your-project.supabase.co/auth/v1/callback`
4. 在Supabase中启用Twitter Provider并填入凭证

**提示**：Google和GitHub的开发者账号申请更简单，Twitter需要申请开发者权限。

## 步骤5：验证设置

运行验证脚本：

```bash
node scripts/verify-setup.js
```

应该看到所有检查通过：
```
✅ 所有检查通过！
```

## 步骤6：启动开发服务器

```bash
npm run dev
```
npm run dev --no-workspaces

访问 http://localhost:3000

## 步骤7：测试认证系统

按照 `tests/auth-validation.md` 中的测试用例进行验证：

### 快速测试清单

1. ✅ 访问首页 - 应该显示AgentOracle主页
2. ✅ 访问 /login - 应该显示登录页面，有3个登录按钮（Google/GitHub/Twitter）
3. ✅ 点击任一OAuth登录按钮 - 应该重定向到对应的OAuth提供商
4. ✅ 完成授权 - 应该重定向回 /dashboard
5. ✅ 查看仪表盘 - 应该显示用户信息和统计
6. ✅ 访问 /settings - 应该显示API Key
7. ✅ 复制API Key - 应该成功复制
8. ✅ 重新生成API Key - 应该生成新密钥
9. ✅ 退出登录 - 应该重定向到 /login

## 常见问题

### Q: npm install 失败，提示 "No workspaces found"
A: 这可能是conda环境冲突。尝试：
```bash
conda deactivate
npm install
```



### Q: OAuth重定向失败
A: 检查：
1. Supabase中对应的Provider是否已启用
2. 回调URL是否正确配置（必须包含 `/auth/v1/callback`）
3. OAuth应用的Client ID和Secret是否正确
4. 尝试使用不同的OAuth提供商（Google/GitHub/Twitter）

### Q: 数据库连接失败
A: 检查：
1. `.env.local` 中的Supabase URL和密钥是否正确
2. Supabase项目是否正在运行
3. 网络连接是否正常

### Q: 页面显示空白
A: 检查：
1. 浏览器控制台是否有错误
2. Next.js开发服务器是否正常运行
3. 是否有TypeScript编译错误

### Q: AI服务调用失败
A: 检查：
1. `.env.local` 中是否配置了 `QWEN_API_KEY` 或 `OPENAI_API_KEY`
2. API Key是否有效
3. 网络是否能访问对应的API服务
4. 查看服务器日志了解具体错误信息

## 下一步

完成认证系统验证后：

1. 填写 `tests/auth-validation.md` 中的测试结果
2. 修复发现的任何问题
3. 准备进入阶段2：市场管理系统开发

## 获取帮助

如遇到问题：
1. 查看 `PROGRESS.md` 了解当前进度
2. 查看 `README.md` 了解项目概述
3. 查看 `AgentOracle开发文档.md` 了解详细设计
