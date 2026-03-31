# Supabase 数据库设置

## 本地开发环境

### 安装 Supabase CLI

```bash
npm install -g supabase
```

### 初始化本地Supabase

```bash
supabase init
supabase start
```

### 运行迁移

```bash
supabase db reset
```

### 查看本地数据库

访问 http://localhost:54323 查看Supabase Studio

## 生产环境

### 创建Supabase项目

1. 访问 https://supabase.com
2. 创建新项目
3. 复制项目URL和API密钥到 `.env.local`

### 运行迁移

```bash
supabase link --project-ref your-project-ref
supabase db push
```

## 迁移文件

- `20240213000001_initial_schema.sql` - 初始数据库架构
- `20240213000002_rls_policies.sql` - Row Level Security策略

## 种子数据

运行 `seed.sql` 插入测试数据：

```bash
supabase db reset --db-url your-database-url
```
