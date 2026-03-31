# AgentOracle Frontend

Next.js 14 前端应用，使用 App Router、TypeScript 和 Tailwind CSS。

## 开发

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 访问 http://localhost:3000
```

## 构建

```bash
# 构建生产版本
npm run build

# 启动生产服务器
npm start
```

## 脚本

- `npm run dev` - 启动开发服务器
- `npm run build` - 构建生产版本
- `npm run start` - 启动生产服务器
- `npm run lint` - 运行 ESLint
- `npm run type-check` - 运行 TypeScript 类型检查
- `npm run format` - 格式化代码
- `npm run deploy` - 部署到预览环境
- `npm run deploy:prod` - 部署到生产环境
- `npm run migrate` - 数据库迁移管理

## 环境变量

复制 `.env.example` 到 `.env.local` 并配置：

```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

## 项目结构

```
src/
├── app/              # Next.js App Router
│   ├── (auth)/      # 认证页面
│   ├── (dashboard)/ # 仪表盘页面
│   ├── (public)/    # 公开页面
│   └── api/         # API路由
├── components/       # React组件
├── lib/             # 工具函数和配置
├── contexts/        # React上下文
└── hooks/           # 自定义Hooks
```
