# Supabase 完整配置指南

本指南将详细说明如何注册Supabase账号、创建项目、获取配置信息以及设置OAuth认证。

## 第一步：注册Supabase账号

1. 访问 [https://supabase.com](https://supabase.com)
2. 点击右上角的 "Start your project" 或 "Sign Up" 按钮
3. 选择注册方式：
   - GitHub账号（推荐）
   - Google账号
   - 邮箱注册

4. 完成注册后，会自动跳转到Supabase控制台

## 第二步：创建新项目

1. 在Supabase控制台，点击 "New Project" 按钮
2. 填写项目信息：
   - **Organization**: 选择或创建组织（个人项目选择个人组织）
   - **Project Name**: 输入项目名称，例如 "agent-oracle"
   - **Database Password**: 设置数据库密码（请妥善保存）
   - **Region**: 选择服务器区域（建议选择离你最近的区域）
     - 中国用户推荐：Singapore (ap-southeast-1)
     - 美国用户推荐：US East (us-east-1)
   - **Pricing Plan**: 选择 "Free" 免费计划（足够开发使用）

3. 点击 "Create new project" 按钮
4. 等待2-3分钟，项目创建完成

## 第三步：获取API密钥

项目创建完成后，获取API密钥：

1. 在左侧菜单中，点击 **Settings** (齿轮图标)
2. 点击 **API** 选项
3. 在 "Project API keys" 部分，你会看到：

### 需要复制的密钥：

#### 1. Project URL
```
位置：Configuration → Project URL
格式：https://xxxxxxxxxxxxx.supabase.co
用途：NEXT_PUBLIC_SUPABASE_URL
```
https://yrqxqvycuqfuumcliegl.supabase.co

#### 2. anon/public key
```
位置：Project API keys → anon public
格式：eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...（很长的字符串）
用途：NEXT_PUBLIC_SUPABASE_ANON_KEY
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlycXhxdnljdXFmdXVtY2xpZWdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEwNzkzODgsImV4cCI6MjA4NjY1NTM4OH0.XGTV7m4VHbNLMmz-1Y_zTUFY8XBpCS5Mb7JJ0PgeAUU

#### 3. service_role key
```
位置：Project API keys → service_role
格式：eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...（很长的字符串）
用途：SUPABASE_SERVICE_ROLE_KEY
⚠️ 警告：这个密钥拥有完全权限，不要泄露或提交到Git！
```

4. 将这些值填入项目的 `.env.local` 文件：

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## 第四步：设置数据库

### 方法A：使用SQL Editor（推荐）

1. 在左侧菜单中，点击 **SQL Editor**
2. 点击 "New query" 创建新查询
3. 复制 `supabase/migrations/20240213000001_initial_schema.sql` 的全部内容
4. 粘贴到SQL编辑器中
5. 点击 "Run" 按钮执行
6. 等待执行完成（应该显示 "Success"）

7. 重复步骤2-6，执行 `supabase/migrations/20240213000002_rls_policies.sql`

### 方法B：使用Supabase CLI（本地开发）

```bash
# 安装Supabase CLI
npm install -g supabase

# 登录Supabase
supabase login

# 链接到你的项目
supabase link --project-ref your-project-ref

# 推送迁移
supabase db push
```

### 验证数据库设置

1. 在左侧菜单中，点击 **Table Editor**
2. 你应该看到以下表：
   - profiles（用户档案）
   - markets（市场）
   - predictions（预测）
   - simulations（模拟）

## 第五步：配置OAuth认证

AgentOracle支持三种OAuth登录方式：Google、GitHub、Twitter

### 5.1 配置Google OAuth

#### 获取Google OAuth凭证

1. 访问 [Google Cloud Console](https://console.cloud.google.com/)
2. 创建新项目或选择现有项目
3. 启用 "Google+ API"：
   - 在左侧菜单中，点击 "APIs & Services" → "Library"
   - 搜索 "Google+ API"
   - 点击 "Enable"

4. 创建OAuth凭证：
   - 点击 "APIs & Services" → "Credentials"
   - 点击 "Create Credentials" → "OAuth client ID"
   - 选择 "Web application"
   - 填写信息：
     - **Name**: AgentOracle
     - **Authorized JavaScript origins**: 
       - `http://localhost:3000` (开发环境)
       - `https://your-domain.com` (生产环境)
     - **Authorized redirect URIs**:
       - `https://xxxxxxxxxxxxx.supabase.co/auth/v1/callback`
       - `http://localhost:54321/auth/v1/callback` (本地Supabase)

5. 点击 "Create"，复制 **Client ID** 和 **Client Secret**

#### 在Supabase中配置Google

1. 在Supabase控制台，点击 **Authentication** → **Providers**
2. 找到 "Google"，点击展开
3. 启用 "Enable Sign in with Google"
4. 填入：
   - **Client ID**: 从Google获取的Client ID
   - **Client Secret**: 从Google获取的Client Secret
5. 点击 "Save"

### 5.2 配置GitHub OAuth

#### 获取GitHub OAuth凭证

1. 访问 [GitHub Settings](https://github.com/settings/developers)
2. 点击 "OAuth Apps" → "New OAuth App"
3. 填写信息：
   - **Application name**: AgentOracle
   - **Homepage URL**: `http://localhost:3000` 或你的域名
   - **Authorization callback URL**: 
   - `https://xxxxxxxxxxxxx.supabase.co/auth/v1/callback`
   https://yrqxqvycuqfuumcliegl.supabase.co/auth/v1/callback

4. 点击 "Register application"
5. 复制 **Client ID**
6. 点击 "Generate a new client secret"，复制 **Client Secret**

#### 在Supabase中配置GitHub

1. 在Supabase控制台，点击 **Authentication** → **Providers**
2. 找到 "GitHub"，点击展开
3. 启用 "Enable Sign in with GitHub"
4. 填入：
   - **Client ID**: 从GitHub获取的Client ID
   - **Client Secret**: 从GitHub获取的Client Secret
5. 点击 "Save"

### 5.3 配置Twitter OAuth

#### 获取Twitter OAuth凭证

1. 访问 [Twitter Developer Portal](https://developer.twitter.com/en/portal/dashboard)
2. 如果没有账号，先注册开发者账号（需要申请）
3. 创建新应用：
   - 点击 "Projects & Apps" → "Create App"
   - 填写应用名称和描述

4. 配置OAuth 2.0：
   - 在应用设置中，找到 "User authentication settings"
   - 点击 "Set up"
   - 启用 "OAuth 2.0"
   - **Type of App**: Web App
   - **Callback URI**: 
     - `https://xxxxxxxxxxxxx.supabase.co/auth/v1/callback`
   - **Website URL**: `http://localhost:3000` 或你的域名

5. 保存后，复制 **Client ID** 和 **Client Secret**

#### 在Supabase中配置Twitter

1. 在Supabase控制台，点击 **Authentication** → **Providers**
2. 找到 "Twitter"，点击展开
3. 启用 "Enable Sign in with Twitter"
4. 填入：
   - **Client ID**: 从Twitter获取的Client ID
   - **Client Secret**: 从Twitter获取的Client Secret
5. 点击 "Save"

## 第六步：配置站点URL

1. 在Supabase控制台，点击 **Authentication** → **URL Configuration**
2. 设置：
   - **Site URL**: `http://localhost:3000` (开发) 或 `https://your-domain.com` (生产)
   - **Redirect URLs**: 添加所有允许的重定向URL
     - `http://localhost:3000/**`
     - `https://your-domain.com/**`

## 第七步：验证配置

### 检查清单

- [ ] 项目已创建
- [ ] API密钥已复制到 `.env.local`
- [ ] 数据库表已创建（4个表）
- [ ] 至少配置了一个OAuth提供商（Google/GitHub/Twitter）
- [ ] Site URL已设置

### 测试连接

运行验证脚本：

```bash
node scripts/verify-setup.js
```

应该看到：
```
✅ 环境变量配置正确
✅ Supabase连接成功
✅ 数据库表存在
```

## 常见问题

### Q: 找不到Project API keys
A: 确保你在正确的项目中，点击左侧的 Settings → API

### Q: OAuth回调URL错误
A: 检查：
1. Supabase中的Provider配置是否正确
2. OAuth应用中的回调URL是否包含 `/auth/v1/callback`
3. URL是否完全匹配（包括https/http）

### Q: 数据库迁移失败
A: 可能原因：
1. SQL语法错误 - 检查复制是否完整
2. 表已存在 - 先删除现有表或使用新项目
3. 权限不足 - 确保使用的是项目所有者账号

### Q: 免费计划的限制
A: Supabase免费计划包括：
- 500MB数据库空间
- 1GB文件存储
- 50,000次月度活跃用户
- 2GB带宽
- 对于开发和小型项目完全足够

### Q: 如何升级到付费计划
A: 在Supabase控制台，点击 Settings → Billing，选择合适的计划

## 下一步

完成Supabase配置后：

1. 返回 `SETUP.md` 继续项目设置
2. 配置AI服务（千问或OpenAI）
3. 启动开发服务器测试登录功能

## 获取帮助

- [Supabase官方文档](https://supabase.com/docs)
- [Supabase Discord社区](https://discord.supabase.com)
- [项目GitHub Issues](https://github.com/your-repo/issues)
