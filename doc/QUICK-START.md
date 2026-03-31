# AgentOracle 快速开始指南

## 🚀 5分钟快速启动

### 步骤1: 安装依赖 (1分钟)
```bash
npm install
```

### 步骤2: 配置环境 (2分钟)
```bash
# 复制环境变量模板
cp .env.example .env.local

# 编辑 .env.local，填入你的Supabase凭证
# 获取凭证: https://supabase.com → 你的项目 → Settings → API
```

### 步骤3: 设置数据库 (1分钟)
在Supabase SQL Editor中依次执行：
1. `supabase/migrations/20240213000001_initial_schema.sql`
2. `supabase/migrations/20240213000002_rls_policies.sql`

### 步骤4: 配置Twitter OAuth (1分钟)
1. Supabase控制台 → Authentication → Providers → 启用Twitter
2. 填入Twitter App的Client ID和Secret

### 步骤5: 启动项目
```bash
npm run dev
```

访问 http://localhost:3000 🎉

## ✅ 验证清单

运行验证脚本：
```bash
node scripts/verify-setup.js
```

应该看到：
```
✅ 所有检查通过！
```

## 🧪 快速测试

1. 访问 http://localhost:3000/login
2. 点击"使用 Twitter 登录"
3. 完成授权后应该看到仪表盘
4. 访问 /settings 查看你的API Key

## 📚 详细文档

- 完整设置指南: `SETUP.md`
- 测试用例: `tests/auth-validation.md`
- 项目进度: `PROGRESS.md`
- Checkpoint报告: `CHECKPOINT-1.md`

## ❓ 遇到问题？

查看 `SETUP.md` 的"常见问题"部分
