# 路由命名优化方案

## 🎯 问题分析

当前 `markets` 这个词在不同地方有不同含义：
- `(dashboard)/markets/create` - 创建任务
- `(public)/markets/[id]` - 查看任务详情
- 但实际上我们的产品叫"搜索未来任务"或"预言任务"

## ✅ 推荐方案：统一使用 "tasks" 命名

### 新的路由结构

```
frontend/src/app/
├── (dashboard)/
│   └── tasks/              # 重命名：markets → tasks
│       └── create/         # 创建任务
├── (public)/
│   └── tasks/              # 重命名：markets → tasks
│       └── [id]/           # 任务详情
└── market-search/          # 保持：搜索任务列表
```

### URL 变化

**之前：**
- 创建任务：`/markets/create`
- 任务详情：`/markets/123`
- 搜索任务：`/market-search`

**之后：**
- 创建任务：`/tasks/create`
- 任务详情：`/tasks/123`
- 搜索任务：`/market-search` 或 `/tasks/search`

## 🤔 另一个方案：使用更具体的命名

如果你觉得 `tasks` 还是太通用，可以考虑：

### 方案 A：按功能区分

```
frontend/src/app/
├── (dashboard)/
│   └── quest/              # 发布任务（quest = 任务/探索）
│       └── create/
├── (public)/
│   └── quest/              # 任务详情
│       └── [id]/
└── search/                 # 重命名：market-search → search
```

**URL：**
- 创建：`/quest/create`
- 详情：`/quest/123`
- 搜索：`/search`

### 方案 B：使用中文拼音

```
frontend/src/app/
├── (dashboard)/
│   └── renwu/              # 任务（拼音）
│       └── create/
├── (public)/
│   └── renwu/
│       └── [id]/
└── sousuo/                 # 搜索（拼音）
```

## 💡 我的建议

**推荐方案 A（quest）**，理由：
1. **语义清晰**：quest 表示"探索任务"，符合产品定位
2. **简洁易记**：比 market 更贴切，比 task 更有特色
3. **统一命名**：
   - 数据库表：`markets` → 保持不变（避免大规模迁移）
   - 前端路由：`/quest/` → 用户友好
   - 组件目录：`components/quest/` → 代码清晰

## 📊 对比表

| 方案 | URL示例 | 优点 | 缺点 |
|------|---------|------|------|
| 保持 markets | `/markets/123` | 无需改动 | 命名不够准确 |
| 改为 tasks | `/tasks/123` | 通用、清晰 | 略显平淡 |
| 改为 quest | `/quest/123` | 有特色、语义好 | 需要适应 |
| 改为 search-detail | `/search-detail/123` | 描述准确 | 太长、不优雅 |

## 🚀 实施建议

如果采用 quest 方案，需要：
1. 重命名路由目录
2. 更新所有路由链接
3. 更新组件目录（可选）
4. 数据库表名保持不变

你觉得哪个方案更好？
